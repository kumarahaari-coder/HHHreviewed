export interface HospitableConfig {
  lookbackDays: number;
  lookaheadDays: number;
  leaseSeconds: number;
  maxRetries: number;
  initialRetryDelayMs: number;
  apiTimeoutMs: number;
  maxPages: number;
  pageSize: number;
}

function parseEnvInt(
  envVar: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
  varName: string
): number {
  if (!envVar || !envVar.trim()) {
    return defaultValue;
  }

  const parsed = Number(envVar);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `Invalid configuration for ${varName}: "${envVar}". Must be an integer between ${min} and ${max}.`
    );
  }

  return parsed;
}

export function getHospitableConfig(): HospitableConfig {
  return {
    lookbackDays: parseEnvInt(
      process.env.HOSPITABLE_LOOKBACK_DAYS,
      30,
      1,
      365,
      "HOSPITABLE_LOOKBACK_DAYS"
    ),
    lookaheadDays: parseEnvInt(
      process.env.HOSPITABLE_LOOKAHEAD_DAYS,
      365,
      1,
      730,
      "HOSPITABLE_LOOKAHEAD_DAYS"
    ),
    leaseSeconds: parseEnvInt(
      process.env.HOSPITABLE_LOCK_LEASE_SECONDS,
      600,
      60,
      3600,
      "HOSPITABLE_LOCK_LEASE_SECONDS"
    ),
    maxRetries: parseEnvInt(
      process.env.HOSPITABLE_MAX_RETRIES,
      3,
      0,
      10,
      "HOSPITABLE_MAX_RETRIES"
    ),
    initialRetryDelayMs: parseEnvInt(
      process.env.HOSPITABLE_INITIAL_RETRY_DELAY_MS,
      1000,
      100,
      10000,
      "HOSPITABLE_INITIAL_RETRY_DELAY_MS"
    ),
    apiTimeoutMs: parseEnvInt(
      process.env.HOSPITABLE_API_TIMEOUT_MS,
      15000,
      1000,
      60000,
      "HOSPITABLE_API_TIMEOUT_MS"
    ),
    maxPages: parseEnvInt(
      process.env.HOSPITABLE_MAX_PAGES,
      50,
      1,
      200,
      "HOSPITABLE_MAX_PAGES"
    ),
    pageSize: parseEnvInt(
      process.env.HOSPITABLE_PAGE_SIZE,
      100,
      1,
      100,
      "HOSPITABLE_PAGE_SIZE"
    ),
  };
}
