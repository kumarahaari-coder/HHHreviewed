import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * OwnerRez OAuth Callback Endpoint
 * 
 * Registered OAuth redirect URI for the OwnerRez OAuth Application:
 * https://hh-hreviewed.vercel.app/api/ownerrez/oauth/callback
 * 
 * Policy & Invariants:
 * - Established solely as the verified OAuth redirect endpoint for app registration.
 * - Does NOT replace or modify the existing OwnerRez PAT integration.
 * - Token exchange is NOT performed (PAT authentication remains active).
 * - Never logs authorization codes, tokens, credentials, or PII.
 * - Fails closed on malformed or empty requests.
 * - Causes zero financial, ledger, or database mutations.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    // 1. Handle OAuth Provider Errors
    if (error) {
      // Sanitize error string to prevent log injection or XSS
      const sanitizedError = error.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      console.warn(`[OwnerRez OAuth] Provider returned error: ${sanitizedError}`);
      return NextResponse.json(
        {
          success: false,
          error: sanitizedError || "access_denied",
          message: errorDescription
            ? errorDescription.slice(0, 128)
            : "OwnerRez OAuth authorization was cancelled or denied.",
        },
        { status: 400 }
      );
    }

    // 2. Validate Authorization Code presence (Fail-closed on empty/malformed requests)
    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "bad_request",
          message: "Missing required 'code' parameter in OAuth callback.",
        },
        { status: 400 }
      );
    }

    // 3. Privacy-safe metadata logging (NEVER log the actual code, secrets, or PII)
    console.log(
      `[OwnerRez OAuth] Callback received authorization code (length: ${code.length}, state_present: ${Boolean(state)}). Endpoint registered; token exchange disabled.`
    );

    // 4. Return successful registration confirmation (token exchange is withheld)
    return NextResponse.json(
      {
        success: true,
        endpoint: "ownerrez_oauth_callback",
        status: "REGISTERED_PASSIVE",
        message:
          "OwnerRez OAuth callback received successfully. Token exchange is currently disabled while PAT authentication remains active.",
        has_state: Boolean(state),
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[OwnerRez OAuth] Unexpected error in OAuth callback handler:", err?.message || err);
    return NextResponse.json(
      {
        success: false,
        error: "internal_error",
        message: "Failed to process OAuth callback.",
      },
      { status: 500 }
    );
  }
}
