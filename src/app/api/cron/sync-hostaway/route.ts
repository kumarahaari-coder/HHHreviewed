/**
 * Scheduled Hostaway Reservation Synchronization Cron
 * 
 * Endpoint: POST /api/cron/sync-hostaway
 */

import { NextRequest, NextResponse } from "next/server";
import { syncHostawayReservationsBatch } from "@/lib/hostaway/sync";
import { processCompletedStaysEligibility } from "@/lib/commissions/eligibility";
import { reconcileStripePayments } from "@/lib/stripe/reconcile-payments";
import { isHostawayPrimary } from "@/lib/config/pms-mode";
import { getPaymentMatchMode } from "@/lib/stripe/charge-id-payments";

export async function POST(req: NextRequest) {
  // Verify cron authorization secret if configured
  const cronSecret = process.env.CRON_SECRET || process.env.HOSPITABLE_CRON_TOKEN;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (!auth || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized cron request." }, { status: 401 });
    }
  }

  try {
    const isPrimary = isHostawayPrimary();
    const summary = await syncHostawayReservationsBatch({
      maxPages: 10,
      limitPerPage: 50,
    });

    // LEGACY (PAYMENT_MATCH_MODE=description): pull payments straight from Stripe, matched by the "Reservation Id: N"
    // text. In the default charge_id mode the sync above already confirms every booking's Hostaway charges against
    // Stripe by charge id, and this older matcher could count Stripe charges Hostaway does not list, so it is skipped.
    let stripePayments: Awaited<ReturnType<typeof reconcileStripePayments>> | { error: string } | { skipped: string };
    if (getPaymentMatchMode() === "description") {
      try {
        stripePayments = await reconcileStripePayments();
      } catch (err: any) {
        stripePayments = { error: err?.message || "Stripe payment reconciliation failed." };
      }
    } else {
      stripePayments = { skipped: "charge_id mode: payments are confirmed per booking during the sync." };
    }

    // Release commission for paid stays that have checked out (the OwnerRez cron stops doing this once
    // Hostaway is primary).
    let eligibility: Awaited<ReturnType<typeof processCompletedStaysEligibility>> | { error: string };
    try {
      eligibility = await processCompletedStaysEligibility();
    } catch (err: any) {
      eligibility = { error: err?.message || "Eligibility release scan failed." };
    }

    return NextResponse.json({
      success: true,
      role: isPrimary ? "PRIMARY_SYNC" : "SHADOW_SYNC",
      summary,
      stripePayments,
      eligibility,
    });
  } catch (error: any) {
    console.error("[Hostaway Cron Error]:", error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || "Cron execution failed." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
