import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDraftPayoutBatch, checkPartnerTaxClearance } from "@/lib/commissions/payout-generator";
import { PayoutRail } from "@/lib/commissions/types";
import { getWiseConfig } from "@/lib/wise/client";
import { getActivePayoutAccount } from "@/lib/wise/payout-account";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Unauthorized. Admin session required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const partnerId = searchParams.get("partnerId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const supabase = createAdminClient();
    let query = supabase
      .from("payout_batches")
      .select("*, partners(business_name, contact_name, contact_email, payout_currency)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (partnerId) query = query.eq("partner_id", partnerId);
    if (status) query = query.eq("status", status);

    const { data: batches, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Attach the latest Wise attempt so the admin can see funding errors and the transfer id.
    const ids = (batches || []).map((b: any) => b.id);
    const attemptByBatch = new Map<string, any>();
    if (ids.length > 0) {
      const { data: attempts } = await supabase
        .from("payout_payment_attempts")
        .select("payout_batch_id, status, provider_transfer_id, last_error, created_at")
        .in("payout_batch_id", ids)
        .eq("payment_provider", "WISE")
        .order("created_at", { ascending: true });
      for (const a of attempts || []) attemptByBatch.set(a.payout_batch_id, a); // last one wins
    }
    const withAttempts = (batches || []).map((b: any) => ({ ...b, wise_attempt: attemptByBatch.get(b.id) || null }));

    return NextResponse.json({ success: true, batches: withAttempts });
  } catch (err: any) {
    console.error("[API Error] /api/admin/commissions/payout-batches GET:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Unauthorized. Admin session required." }, { status: 403 });
    }

    const body = await req.json();
    const { partnerId, payoutRail } = body;

    if (!partnerId || !payoutRail) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: partnerId and payoutRail." },
        { status: 400 }
      );
    }

    const validRails: PayoutRail[] = ["MANUAL_ACH", "BANK_WIRE", "CHECK", "STRIPE_CONNECT", "WISE"];
    if (!validRails.includes(payoutRail)) {
      return NextResponse.json(
        { success: false, error: `Invalid payoutRail. Must be one of: ${validRails.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fail early for Wise so the admin does not approve a batch that can never be paid.
    if (payoutRail === "WISE") {
      if (!getWiseConfig().isConfigured) {
        return NextResponse.json({ success: false, error: "Wise is not configured on the server." }, { status: 422 });
      }
      const account = await getActivePayoutAccount(partnerId, supabase);
      if (!account) {
        return NextResponse.json({ success: false, error: "This partner has no payout account. Ask them to add one on their Profile page." }, { status: 422 });
      }
      if (!account.verified_at) {
        return NextResponse.json({ success: false, error: "Verify the partner's payout account before drafting a Wise batch." }, { status: 422 });
      }
    }

    // Fail-closed tax compliance pre-flight check
    const clearance = await checkPartnerTaxClearance(partnerId, supabase);
    if (!clearance.cleared) {
      return NextResponse.json(
        {
          success: false,
          error: `Tax compliance hold: Partner is not cleared for payout (${clearance.reason}). Operational prerequisite: creator tax document review status must be APPROVED.`,
        },
        { status: 422 }
      );
    }

    const result = await generateDraftPayoutBatch({
      partnerId,
      payoutRail,
      createdBy: session.userId,
    });

    if (!result) {
      return NextResponse.json(
        { success: false, error: "Zero payout available or batch generation failed." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      batch: result.batch,
      items: result.items,
    });
  } catch (err: any) {
    console.error("[API Error] /api/admin/commissions/payout-batches POST:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
