import { NextRequest, NextResponse } from "next/server";
import { handleStripeEvent, verifyStripeSignature } from "@/lib/stripe/webhook";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook: disputes and refunds -> commission ledger.
 * Stripe retries anything that is not a 2xx, so: bad signature -> 400, unhandled/unmatched events -> 200,
 * real processing failures -> 500 (Stripe will redeliver; the ledger writes are idempotent).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured; refusing to process events.");
    return NextResponse.json({ success: false, error: "Webhook not configured" }, { status: 500 });
  }

  // The signature covers the exact raw body, so read it as text before any parsing.
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) {
    console.warn("[Stripe Webhook] rejected: invalid or expired signature", {
      signatureHeaderPresent: Boolean(req.headers.get("stripe-signature")),
      bodyBytes: raw.length,
    });
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 400 });
  }

  try {
    const event = JSON.parse(raw);
    const outcome = await handleStripeEvent(event);
    console.log("[Stripe Webhook]", event?.type, event?.id, outcome.action, outcome.detail || "");
    return NextResponse.json({ success: true, ...outcome });
  } catch (err: any) {
    console.error("[Stripe Webhook] processing failed:", err);
    return NextResponse.json({ success: false, error: "Processing failed" }, { status: 500 });
  }
}
