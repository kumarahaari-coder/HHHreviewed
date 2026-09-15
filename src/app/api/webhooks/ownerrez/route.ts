import { NextResponse } from "next/server";
import { verifyOwnerRezWebhookAuth, handleOwnerRezWebhookEvent } from "@/lib/ownerrez/webhook";

export const dynamic = "force-dynamic";

/**
 * OwnerRez Webhook Receiver Endpoint
 * 
 * Security:
 * - Fail-closed authentication via X-OwnerRez-Webhook-Secret or Authorization header.
 * - Never logs raw secrets or guest PII.
 * - Idempotent, deterministic processing delegating exclusively to syncOwnerRezBookingById.
 */
export async function POST(req: Request) {
  try {
    // 1. Verify authentication (fail closed)
    const authCheck = verifyOwnerRezWebhookAuth(req.headers);
    if (!authCheck.authorized) {
      return NextResponse.json(
        { success: false, error: authCheck.error || "Unauthorized" },
        { status: authCheck.status }
      );
    }

    // 2. Parse payload safely
    const payload = await req.json().catch(() => null);

    // 3. Process webhook event
    const outcome = await handleOwnerRezWebhookEvent(payload);

    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (err: any) {
    console.error("[OwnerRez Webhook Route Error]:", err?.message || err);
    return NextResponse.json(
      { success: false, error: "Internal server error processing OwnerRez webhook." },
      { status: 500 }
    );
  }
}
