import { getHospitableConfig } from "@/lib/hospitable/config";

const DEFAULT_BASE_URL = "https://public.api.hospitable.com/v2";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function nested(value: unknown, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) current = asRecord(current)[key];
  return current;
}

export class HospitableConfigurationError extends Error {}
export class HospitableMaxPagesExceededError extends Error {
  constructor(public readonly maxPages: number) {
    super(`Hospitable API pagination exceeded maximum allowed limit of ${maxPages} pages.`);
    this.name = "HospitableMaxPagesExceededError";
  }
}

export class HospitableApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = "HospitableApiError";
  }
}

export interface HospitablePage {
  data: unknown[];
  included: unknown[];
  raw: unknown;
  nextUrl?: string;
  pagesFetched: number;
}

export function isHospitableConfigured(): boolean {
  return Boolean(process.env.HOSPITABLE_PAT?.trim());
}

export function getHospitableBaseUrl(): string {
  return (process.env.HOSPITABLE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function getToken(): string {
  const token = process.env.HOSPITABLE_PAT?.trim();
  if (!token) {
    throw new HospitableConfigurationError(
      "HOSPITABLE_PAT is not configured. Add a newly generated token to .env.local or the hosting provider's server environment."
    );
  }
  return token;
}

function absoluteApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${getHospitableBaseUrl()}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

function extractNextUrl(payload: unknown): string | undefined {
  const next =
    nested(payload, "links", "next") ??
    nested(payload, "meta", "next_page_url") ??
    nested(payload, "pagination", "next");
  if (typeof next === "string" && next.trim()) return absoluteApiUrl(next);

  const current = Number(
    nested(payload, "meta", "current_page") ?? nested(payload, "pagination", "current_page")
  );
  const last = Number(
    nested(payload, "meta", "last_page") ?? nested(payload, "pagination", "last_page")
  );
  if (Number.isFinite(current) && Number.isFinite(last) && current < last) {
    const self = nested(payload, "meta", "path") ?? nested(payload, "links", "self");
    const url = new URL(typeof self === "string" ? self : "", getHospitableBaseUrl());
    url.searchParams.set("page", String(current + 1));
    return url.toString();
  }
  return undefined;
}

function isRetryableError(error: unknown, status?: number): boolean {
  if (status && [429, 500, 502, 503, 504].includes(status)) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      error.name === "AbortError" ||
      msg.includes("timeout") ||
      msg.includes("fetch failed") ||
      msg.includes("connection reset")
    );
  }
  return false;
}

export async function hospitableRequest(
  pathOrUrl: string,
  init?: RequestInit
): Promise<unknown> {
  const config = getHospitableConfig();
  const maxRetries = config.maxRetries;
  const initialDelay = config.initialRetryDelayMs;
  const timeoutMs = config.apiTimeoutMs;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= maxRetries) {
    attempt += 1;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(absoluteApiUrl(pathOrUrl), {
        ...init,
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${getToken()}`,
          ...(init?.headers || {}),
        },
      });

      clearTimeout(timeoutId);

      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
      }

      if (!response.ok) {
        const error = new HospitableApiError(
          `Hospitable API request failed with status ${response.status}.`,
          response.status,
          payload
        );

        if (attempt <= maxRetries && isRetryableError(error, response.status)) {
          lastError = error;
          const retryAfterHeader = response.headers.get("retry-after");
          let delayMs = initialDelay * Math.pow(2, attempt - 1);
          if (retryAfterHeader) {
            const parsedSeconds = Number(retryAfterHeader);
            if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
              delayMs = parsedSeconds * 1000;
            }
          }
          const jitter = Math.floor(Math.random() * 200);
          await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));
          continue;
        }

        throw error;
      }

      return payload;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      if (
        attempt <= maxRetries &&
        isRetryableError(error, error instanceof HospitableApiError ? error.status : undefined)
      ) {
        const delayMs = initialDelay * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 200);
        await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export async function fetchHospitableCollection(path: string): Promise<HospitablePage> {
  const config = getHospitableConfig();
  const maxPages = config.maxPages;

  let nextUrl: string | undefined = absoluteApiUrl(path);
  const data: unknown[] = [];
  const included: unknown[] = [];
  const pages: unknown[] = [];
  let pageCount = 0;

  while (nextUrl) {
    if (pageCount >= maxPages) {
      throw new HospitableMaxPagesExceededError(maxPages);
    }

    const payload = await hospitableRequest(nextUrl);
    const record = asRecord(payload);
    pages.push(payload);

    if (Array.isArray(record.data)) data.push(...record.data);
    else if (record.data) data.push(record.data);
    else if (Array.isArray(payload)) data.push(...payload);

    if (Array.isArray(record.included)) included.push(...record.included);

    nextUrl = extractNextUrl(payload);
    pageCount += 1;
  }

  return { data, included, raw: pages, nextUrl, pagesFetched: pageCount };
}

export function buildCollectionPath(
  resource: "properties" | "reservations",
  query?: string
): string {
  const configuredPath =
    resource === "properties"
      ? process.env.HOSPITABLE_PROPERTIES_PATH
      : process.env.HOSPITABLE_RESERVATIONS_PATH;
  const configuredQuery =
    resource === "properties"
      ? process.env.HOSPITABLE_PROPERTIES_QUERY
      : process.env.HOSPITABLE_RESERVATIONS_QUERY;

  const path = configuredPath || `/${resource}`;
  const params = new URLSearchParams(configuredQuery || "");
  if (query) {
    const extra = new URLSearchParams(query);
    extra.forEach((value, key) => params.set(key, value));
  }

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}
