import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDraftPayoutBatch } from "@/lib/commissions/payout-generator";
import { PayoutRail } from "@/lib/commissions/types";

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

    return NextResponse.json({ success: true, batches: batches || [] });
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

    const validRails: PayoutRail[] = ["MANUAL_ACH", "BANK_WIRE", "CHECK", "STRIPE_CONNECT"];
    if (!validRails.includes(payoutRail)) {
      return NextResponse.json(
        { success: false, error: `Invalid payoutRail. Must be one of: ${validRails.join(", ")}` },
        { status: 400 }
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
