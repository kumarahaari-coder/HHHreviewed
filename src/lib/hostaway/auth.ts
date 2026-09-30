/**
 * Hostaway Authentication & Token Manager
 * 
 * Manages OAuth 2.0 Client Credentials grant for Hostaway API v1.
 * Features:
 * - In-memory token caching with safe refresh buffer (5 minutes before expiry)
 * - Reuse valid tokens across concurrent requests
 * - Safe token invalidation on 401 Unauthorized
 * - Credential redaction in all logs and error messages
 */

export interface CachedToken {
  accessToken: string;
  tokenType: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

let cachedToken: CachedToken | null = null;
let tokenAcquisitionPromise: Promise<string> | null = null;

const DEFAULT_AUTH_URL = "https://api.hostaway.com/v1/accessTokens";
const EXPIRY_BUFFER_MS = 300 * 1000; // 5 minutes buffer

export class HostawayAuthError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    // Redact any potential tokens, keys or secrets
    const sanitized = String(message)
      .replace(/(bearer\s+[a-zA-Z0-9_\-\.]+)/gi, "bearer [REDACTED]")
      .replace(/(client_secret|client_id|apiKey|api_key|password)=[^\s&]+/gi, "$1=[REDACTED]");
    super(`Hostaway Auth Error: ${sanitized}`);
    this.name = "HostawayAuthError";
  }
}

/**
 * Checks if Hostaway server credentials are configured in the environment.
 */
export function isHostawayConfigured(): boolean {
  const accountId = process.env.HOSTAWAY_ACCOUNT_ID?.trim();
  const apiKey = process.env.HOSTAWAY_API_KEY?.trim();
  return Boolean(accountId && apiKey);
}

/**
 * Reads server-only credentials without exposing them.
 */
export function getHostawayCredentials(): { accountId: string; apiKey: string } {
  const accountId = process.env.HOSTAWAY_ACCOUNT_ID?.trim();
  const apiKey = process.env.HOSTAWAY_API_KEY?.trim();

  if (!accountId || !apiKey) {
    const missing: string[] = [];
    if (!accountId) missing.push("HOSTAWAY_ACCOUNT_ID");
    if (!apiKey) missing.push("HOSTAWAY_API_KEY");
    throw new HostawayAuthError(`Missing server configuration: ${missing.join(", ")}`);
  }

  return { accountId, apiKey };
}

/**
 * Acquires a valid Bearer token, reusing the cached token if valid.
 */
export async function getHostawayAccessToken(forceRefresh = false): Promise<string> {
  const now = Date.now();

  // If we have a cached token that is not expiring soon and no forced refresh requested, reuse it
  if (!forceRefresh && cachedToken && cachedToken.expiresAt - now > EXPIRY_BUFFER_MS) {
    return cachedToken.accessToken;
  }

  // Deduplicate concurrent token acquisitions
  if (tokenAcquisitionPromise) {
    return tokenAcquisitionPromise;
  }

  tokenAcquisitionPromise = (async () => {
    try {
      const { accountId, apiKey } = getHostawayCredentials();

      // Check for test/mock credential mode
      if (accountId.startsWith("mock_") || apiKey.startsWith("mock_")) {
        const mockToken = `mock_hostaway_token_${Date.now()}`;
        cachedToken = {
          accessToken: mockToken,
          tokenType: "Bearer",
          expiresAt: Date.now() + 86400 * 1000,
        };
        return mockToken;
      }

      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: accountId,
        client_secret: apiKey,
        scope: "general",
      });

      const response = await fetch(DEFAULT_AUTH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
        body: body.toString(),
      });

      const responseText = await response.text();
      let payload: any = null;
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = { message: responseText };
      }

      if (!response.ok) {
        const errorDesc = payload?.error_description || payload?.message || response.statusText;
        throw new HostawayAuthError(`Failed to acquire access token (${response.status}): ${errorDesc}`, response.status);
      }

      if (!payload?.access_token) {
        throw new HostawayAuthError("Hostaway auth endpoint returned 200 OK without an access_token.");
      }

      const expiresInSeconds = Number(payload.expires_in) || 86400;
      cachedToken = {
        accessToken: payload.access_token,
        tokenType: payload.token_type || "Bearer",
        expiresAt: Date.now() + expiresInSeconds * 1000,
      };

      return cachedToken.accessToken;
    } finally {
      tokenAcquisitionPromise = null;
    }
  })();

  return tokenAcquisitionPromise;
}

/**
 * Invalidates the currently cached token (e.g. after receiving a 401 Unauthorized from API).
 */
export function invalidateHostawayToken(): void {
  cachedToken = null;
}

/**
 * Diagnostic helper: returns token status without leaking the secret token.
 */
export function getHostawayTokenStatus(): {
  hasCachedToken: boolean;
  expiresInSeconds: number | null;
  isExpired: boolean;
} {
  if (!cachedToken) {
    return { hasCachedToken: false, expiresInSeconds: null, isExpired: true };
  }
  const diffMs = cachedToken.expiresAt - Date.now();
  return {
    hasCachedToken: true,
    expiresInSeconds: Math.max(0, Math.floor(diffMs / 1000)),
    isExpired: diffMs <= 0,
  };
}
