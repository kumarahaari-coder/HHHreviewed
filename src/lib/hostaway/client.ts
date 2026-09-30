/**
 * Hostaway API Client Module (Production-Safe)
 * 
 * Provides resilient, authenticated access to Hostaway API v1.
 * Features:
 * - Automatic Bearer token attachment via Token Manager
 * - Transparent retry on 401 Unauthorized via token invalidation & re-acquisition
 * - Exponential backoff with jitter on rate limits (429) and transient errors (5xx)
 * - Strict credential and token redaction from errors, URLs, and logs
 * - Fail-closed error handling
 */

import { getHostawayAccessToken, invalidateHostawayToken, isHostawayConfigured } from "./auth";

const DEFAULT_API_BASE = "https://api.hostaway.com/v1";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 500;

export class HostawayApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly responseBody?: unknown
  ) {
    super(`Hostaway API error (${status}) at [${HostawayApiError.sanitizeUrl(endpoint)}]: ${message}`);
    this.name = "HostawayApiError";
  }

  static sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url, "https://api.hostaway.com");
      for (const key of Array.from(parsed.searchParams.keys())) {
        if (/token|key|secret|password|auth/i.test(key)) {
          parsed.searchParams.set(key, "[REDACTED]");
        }
      }
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return url.split("?")[0] || url;
    }
  }
}

export class HostawayTimeoutError extends Error {
  constructor(endpoint: string, timeoutMs: number) {
    super(`Hostaway request to [${HostawayApiError.sanitizeUrl(endpoint)}] timed out after ${timeoutMs}ms.`);
    this.name = "HostawayTimeoutError";
  }
}

function resolveApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    try {
      const parsed = new URL(pathOrUrl);
      if (parsed.protocol !== "https:" || !parsed.hostname.endsWith("hostaway.com")) {
        throw new Error(`Untrusted host '${parsed.hostname}'. Only https://api.hostaway.com is permitted.`);
      }
      return pathOrUrl;
    } catch (err: any) {
      throw new Error(`Invalid Hostaway API URL: ${pathOrUrl}`);
    }
  }

  const cleanPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  // Prevent duplicate /v1 prefix
  const finalPath = cleanPath.startsWith("/v1/") ? cleanPath.substring(3) : cleanPath;
  return `${DEFAULT_API_BASE}${finalPath}`;
}

function isRetryable(error: unknown, status?: number): boolean {
  if (status && [429, 500, 502, 503, 504].includes(status)) {
    return true;
  }
  if (error instanceof HostawayTimeoutError) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      error.name === "AbortError" ||
      msg.includes("timeout") ||
      msg.includes("fetch failed") ||
      msg.includes("econnreset") ||
      msg.includes("connection reset")
    );
  }
  return false;
}

function isTokenExpiredOrRevoked(payload: unknown): boolean {
  if (!payload) return false;
  const str = typeof payload === "string" ? payload : JSON.stringify(payload);
  return /token.*expired|expired.*token|invalid.*token|token.*invalid|invalid_token|unauthorized|revoked|token.*revoked/i.test(str);
}

function computeRateLimitDelayMs(response: Response, attempt: number): number {
  const xRateLimitRetryAfter = response.headers.get("x-ratelimit-retry-after");
  const xRateLimitReset = response.headers.get("x-ratelimit-reset");
  const standardRetryAfter = response.headers.get("retry-after");

  const nowMs = Date.now();
  let delayMs: number | null = null;

  // 1. Hostaway documents X-RateLimit-Retry-After specifically as a Unix epoch timestamp in seconds.
  // Treat as epoch timestamp directly without heuristic relative-seconds interpretation.
  if (xRateLimitRetryAfter) {
    const epochSeconds = Number(xRateLimitRetryAfter.trim());
    if (!isNaN(epochSeconds) && epochSeconds > 0) {
      delayMs = Math.max(0, epochSeconds * 1000 - nowMs);
    }
  }

  // 2. X-RateLimit-Reset: Unix epoch timestamp in seconds
  if (delayMs === null && xRateLimitReset) {
    const resetEpochSeconds = Number(xRateLimitReset.trim());
    if (!isNaN(resetEpochSeconds) && resetEpochSeconds > 0) {
      delayMs = Math.max(0, resetEpochSeconds * 1000 - nowMs);
    }
  }

  // 3. Standard RFC 7231 Retry-After: can be relative seconds or HTTP-date
  if (delayMs === null && standardRetryAfter) {
    const parsedSeconds = Number(standardRetryAfter.trim());
    if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
      delayMs = parsedSeconds * 1000;
    } else {
      const dateMs = Date.parse(standardRetryAfter.trim());
      if (!isNaN(dateMs) && dateMs > nowMs) {
        delayMs = dateMs - nowMs;
      }
    }
  }

  // 4. Fallback to exponential backoff
  if (delayMs === null || delayMs <= 0) {
    delayMs = DEFAULT_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  }

  // Safety clamp: minimum 200ms, maximum 60,000ms (1 minute) to avoid hangs
  return Math.min(Math.max(delayMs, 200), 60000);
}

/**
 * Core authenticated HTTP client for Hostaway.
 */
export async function hostawayRequest<T = unknown>(
  pathOrUrl: string,
  init?: RequestInit,
  options?: { timeoutMs?: number; maxRetries?: number }
): Promise<T> {
  const targetUrl = resolveApiUrl(pathOrUrl);
  const timeoutMs = options?.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

  let attempt = 0;
  let lastError: unknown = null;
  let tokenRefreshedAfterAuthFailure = false;

  while (attempt <= maxRetries) {
    attempt += 1;
    const controller = new AbortController();
    let isTimedOut = false;

    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const token = await getHostawayAccessToken();

      const response = await fetch(targetUrl, {
        ...init,
        method: init?.method || "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(init?.headers || {}),
        },
      });

      clearTimeout(timeoutId);

      const rawText = await response.text();
      let parsedPayload: any = null;
      if (rawText) {
        try {
          parsedPayload = JSON.parse(rawText);
        } catch {
          parsedPayload = rawText;
        }
      }

      // Handle token expiration/revocation: HTTP 401 or token-failure 403
      // Distinguish an authentication-token failure from a permission/business-rule failure.
      const isAuthFailure =
        response.status === 401 ||
        (response.status === 403 && isTokenExpiredOrRevoked(parsedPayload));

      if (isAuthFailure && !tokenRefreshedAfterAuthFailure) {
        tokenRefreshedAfterAuthFailure = true;
        invalidateHostawayToken();
        // Force refresh token once
        await getHostawayAccessToken(true);
        continue;
      }

      if (!response.ok) {
        const errorMsg =
          typeof parsedPayload === "object" && parsedPayload !== null && "message" in parsedPayload
            ? String(parsedPayload.message)
            : `HTTP status ${response.status} ${response.statusText}`;

        const apiError = new HostawayApiError(errorMsg, response.status, pathOrUrl, parsedPayload);

        if (attempt <= maxRetries && isRetryable(apiError, response.status)) {
          lastError = apiError;
          const delay = computeRateLimitDelayMs(response, attempt);
          const jitter = Math.floor(Math.random() * 200);
          await new Promise((res) => setTimeout(res, delay + jitter));
          continue;
        }

        throw apiError;
      }

      return parsedPayload as T;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      let classifiedError = err;
      if (isTimedOut || (err instanceof Error && err.name === "AbortError")) {
        classifiedError = new HostawayTimeoutError(pathOrUrl, timeoutMs);
      }

      lastError = classifiedError;

      const status = classifiedError instanceof HostawayApiError ? classifiedError.status : undefined;
      if (attempt <= maxRetries && isRetryable(classifiedError, status)) {
        const delay = DEFAULT_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 200);
        await new Promise((res) => setTimeout(res, delay + jitter));
        continue;
      }

      throw classifiedError;
    }
  }

  throw lastError;
}

/**
 * Health check for Hostaway API.
 * Performs a lightweight authenticated request (`GET /v1/listings?limit=1`).
 */
export async function checkHostawayHealth(): Promise<{
  configured: boolean;
  status: "healthy" | "unhealthy" | "unconfigured";
  statusCode?: number;
  latencyMs: number;
  error?: string;
  details?: unknown;
}> {
  if (!isHostawayConfigured()) {
    return {
      configured: false,
      status: "unconfigured",
      latencyMs: 0,
      error: "HOSTAWAY_ACCOUNT_ID or HOSTAWAY_API_KEY is not set.",
    };
  }

  const startTime = Date.now();
  try {
    const data = await hostawayRequest<unknown>("/listings?limit=1");
    const latencyMs = Date.now() - startTime;
    return {
      configured: true,
      status: "healthy",
      statusCode: 200,
      latencyMs,
      details: data,
    };
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;
    if (error instanceof HostawayApiError) {
      return {
        configured: true,
        status: "unhealthy",
        statusCode: error.status,
        latencyMs,
        error: error.message,
        details: error.responseBody,
      };
    }
    return {
      configured: true,
      status: "unhealthy",
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
