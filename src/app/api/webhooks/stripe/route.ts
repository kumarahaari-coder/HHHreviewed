import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { verifyStripeSignature } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const sigHeader = req.headers.get("stripe-signature") || undefined;

    if (!verifyStripeSignature(rawBody, sigHeader)) {
      return NextResponse.json({ success: false, error: "Invalid Stripe signature." }, { status: 400 });
    }

    const payload = JSON.parse(rawBody || "{}");
    const eventId = payload.id || `evt_stripe_${Date.now()}`;
    const eventType = payload.type || "account.updated";

    // Idempotency check
    if (db.isIdempotentEvent("STRIPE", eventId)) {
      return NextResponse.json({ success: true, message: "Stripe event already processed (idempotent)." }, { status: 200 });
    }

    // Process Stripe Connect Account and Payout events
    if (eventType === "account.updated") {
      const account = payload.data?.object || {};
      const accountId = account.id;
      const partner = db.partners.find(p => p.stripeConnectAccountId === accountId);
      if (partner) {
        partner.stripeOnboardingStatus = account.details_submitted ? "CONNECTED" : "PENDING";
      }
    } else if (eventType === "payout.paid") {
      const payoutObj = payload.data?.object || {};
      const txnRef = payoutObj.id;
      // Map to internal payout record if applicable
      const matchingPayout = db.payouts.find(p => p.transactionReference === txnRef);
      if (matchingPayout) {
        matchingPayout.status = "PAID";
        matchingPayout.paymentDate = new Date().toISOString();
      }
    }

    db.recordIdempotency("STRIPE", eventId, eventType, "PROCESSED");

    return NextResponse.json({
      success: true,
      message: `Stripe webhook ${eventType} processed successfully.`,
      eventId
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Stripe webhook error" }, { status: 500 });
  }
}
