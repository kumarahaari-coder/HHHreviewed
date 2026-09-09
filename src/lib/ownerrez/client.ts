/**
 * OwnerRez API v2 Client Module (Read-Only)
 * 
 * Provides authenticated, production-safe read access to the OwnerRez API v2.
 * Uses HTTP Basic Authentication with OWNERREZ_EMAIL and OWNERREZ_PAT.
 * All credentials remain server-side and are strictly redacted from errors and logs.
 */

const DEFAULT_API_BASE = "https://api.ownerrez.com/v2";
const DEFAULT_USER_AGENT = "HiddenHoneyHomes-Tracker/1.0 (admin@hiddenhoneyhomes.com)";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 500;

export interface OwnerRezConfig {
  email: string;
  pat: string;
  apiBase: string;
  userAgent: string;
  timeoutMs: number;
  maxRetries: number;
}

export class OwnerRezConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerRezConfigurationError";
  }
}

export class OwnerRezApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly responseBody?: unknown
  ) {
    // Ensure sensitive query parameters or authorization strings never appear in message
    super(`OwnerRez API error (${status}) at [${OwnerRezApiError.sanitizeUrl(endpoint)}]: ${message}`);
    this.name = "OwnerRezApiError";
  }

  static sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url, "https://api.ownerrez.com");
      // Remove any sensitive tokens if passed in query string
      for (const key of Array.from(parsed.searchParams.keys())) {
        if (/token|key|secret|pat|auth/i.test(key)) {
          parsed.searchParams.set(key, "[REDACTED]");
        }
      }
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return url.split("?")[0] || url;
    }
  }
}

export class OwnerRezTimeoutError extends Error {
  constructor(endpoint: string, timeoutMs: number) {
    super(`OwnerRez request to [${OwnerRezApiError.sanitizeUrl(endpoint)}] timed out after ${timeoutMs}ms.`);
    this.name = "OwnerRezTimeoutError";
  }
}

/**
 * Checks if OwnerRez credentials and configuration are present.
 */
export function isOwnerRezConfigured(): boolean {
  const email = process.env.OWNERREZ_EMAIL?.trim();
  const pat = process.env.OWNERREZ_PAT?.trim();
  return Boolean(email && pat);
}

/**
 * Retrieves validated OwnerRez configuration.
 * Throws OwnerRezConfigurationError if missing email or PAT.
 */
export function getOwnerRezConfig(): OwnerRezConfig {
  const email = process.env.OWNERREZ_EMAIL?.trim();
  const pat = process.env.OWNERREZ_PAT?.trim();
  const apiBase = (process.env.OWNERREZ_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/$/, "");
  const userAgent = process.env.OWNERREZ_USER_AGENT?.trim() || DEFAULT_USER_AGENT;

  if (!email || !pat) {
    const missing: string[] = [];
    if (!email) missing.push("OWNERREZ_EMAIL");
    if (!pat) missing.push("OWNERREZ_PAT");
    throw new OwnerRezConfigurationError(
      `Missing required OwnerRez configuration: ${missing.join(", ")}. Ensure these are configured in .env.local or server environment.`
    );
  }

  return {
    email,
    pat,
    apiBase,
    userAgent,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
  };
}

function buildBasicAuthHeader(email: string, pat: string): string {
  const token = Buffer.from(`${email}:${pat}`).toString("base64");
  return `Basic ${token}`;
}

function resolveApiUrl(pathOrUrl: string, apiBase: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    try {
      const parsed = new URL(pathOrUrl);
      if (parsed.protocol !== "https:" || parsed.hostname !== "api.ownerrez.com") {
        throw new OwnerRezConfigurationError(
          `Security violation: Untrusted URL host '${parsed.hostname}' or protocol '${parsed.protocol}'. Only https://api.ownerrez.com is permitted.`
        );
      }
      return pathOrUrl;
    } catch (err: any) {
      if (err instanceof OwnerRezConfigurationError) throw err;
      throw new OwnerRezConfigurationError(`Invalid API URL: ${pathOrUrl}`);
    }
  }

  let cleanPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  // Normalize if path begins with /v2/ (e.g. from next_page_url) to avoid /v2/v2/...
  if (cleanPath.startsWith("/v2/")) {
    cleanPath = cleanPath.substring(3);
  }
  return `${apiBase}${cleanPath}`;
}

function isRetryable(error: unknown, status?: number): boolean {
  if (status && [429, 500, 502, 503, 504].includes(status)) {
    return true;
  }
  if (error instanceof OwnerRezTimeoutError) {
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

/**
 * Reusable, authenticated request helper for OwnerRez API v2.
 * Includes timeout handling, safe retries with exponential backoff, and credential redaction.
 */
export async function ownerRezRequest<T = unknown>(
  pathOrUrl: string,
  init?: RequestInit
): Promise<T> {
  const config = getOwnerRezConfig();
  const targetUrl = resolveApiUrl(pathOrUrl, config.apiBase);
  const basicAuth = buildBasicAuthHeader(config.email, config.pat);

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= config.maxRetries) {
    attempt += 1;
    const controller = new AbortController();
    let isTimedOut = false;

    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      controller.abort();
    }, config.timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        ...init,
        method: init?.method || "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": config.userAgent,
          Authorization: basicAuth,
          ...(init?.headers || {}),
        },
      });

      clearTimeout(timeoutId);

      const rawText = await response.text();
      let parsedPayload: unknown = null;
      if (rawText) {
        try {
          parsedPayload = JSON.parse(rawText);
        } catch {
          parsedPayload = rawText;
        }
      }

      if (!response.ok) {
        const errorMsg =
          typeof parsedPayload === "object" && parsedPayload !== null && "message" in parsedPayload
            ? String((parsedPayload as Record<string, unknown>).message)
            : `HTTP status ${response.status} ${response.statusText}`;

        const apiError = new OwnerRezApiError(
          errorMsg,
          response.status,
          pathOrUrl,
          parsedPayload
        );

        if (attempt <= config.maxRetries && isRetryable(apiError, response.status)) {
          lastError = apiError;
          const retryAfter = response.headers.get("retry-after");
          let delay = DEFAULT_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          if (retryAfter) {
            const parsedSeconds = Number(retryAfter);
            if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
              delay = parsedSeconds * 1000;
            }
          }
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
        classifiedError = new OwnerRezTimeoutError(pathOrUrl, config.timeoutMs);
      }

      lastError = classifiedError;

      const status = classifiedError instanceof OwnerRezApiError ? classifiedError.status : undefined;
      if (attempt <= config.maxRetries && isRetryable(classifiedError, status)) {
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
 * Health check helper.
 * Tests connectivity and credentials against OwnerRez v2 properties endpoint.
 */
export async function checkOwnerRezHealth(): Promise<{
  configured: boolean;
  status: "healthy" | "unhealthy" | "unconfigured";
  statusCode?: number;
  latencyMs: number;
  error?: string;
  details?: unknown;
}> {
  if (!isOwnerRezConfigured()) {
    return {
      configured: false,
      status: "unconfigured",
      latencyMs: 0,
      error: "OWNERREZ_EMAIL or OWNERREZ_PAT is not set.",
    };
  }

  const startTime = Date.now();
  try {
    // In OwnerRez v2, GET /properties?limit=1 is a lightweight read call to verify auth & connectivity
    const data = await ownerRezRequest<unknown>("/properties?limit=1");
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
    if (error instanceof OwnerRezApiError) {
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

/**
 * Fetch all properties from OwnerRez.
 */
export async function getOwnerRezProperties(): Promise<unknown> {
  return ownerRezRequest("/properties");
}

/**
 * Fetch bookings from OwnerRez with optional query parameters.
 */
export async function getOwnerRezBookings(
  params?: Record<string, string | number | boolean | undefined>
): Promise<unknown> {
  let queryString = "";
  if (params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        search.set(key, String(value));
      }
    }
    queryString = search.toString();
  }
  const endpoint = queryString ? `/bookings?${queryString}` : "/bookings";
  return ownerRezRequest(endpoint);
}

/**
 * Fetch a single booking by OwnerRez booking ID.
 */
export async function getOwnerRezBooking(id: string | number): Promise<unknown> {
  const cleanId = encodeURIComponent(String(id).trim());
  return ownerRezRequest(`/bookings/${cleanId}`);
}
