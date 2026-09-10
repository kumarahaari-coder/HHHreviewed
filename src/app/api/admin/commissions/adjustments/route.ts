import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAdjustmentRequest } from "@/lib/commissions/adjustments";

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
      .from("commission_adjustment_requests")
      .select("*, partners(name, email)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (partnerId) query = query.eq("partner_id", partnerId);
    if (status) query = query.eq("status", status);

    const { data: requests, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, requests: requests || [] });
  } catch (err: any) {
    console.error("[API Error] /api/admin/commissions/adjustments GET:", err);
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
    const { partnerId, reservationId, deltaAmount, adjustmentReason, reason, approvedBy, metadata } = body;

    const effectiveReason = reason || adjustmentReason;

    if (!partnerId || !reservationId || deltaAmount == null || !effectiveReason) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: partnerId, reservationId, deltaAmount, reason." },
        { status: 400 }
      );
    }

    // Security check: maker attempting to supply approvedBy in payload is rejected
    if (approvedBy) {
      return NextResponse.json(
        {
          success: false,
          error: "Security violation: Supplying approvedBy during adjustment creation is rejected. Manual adjustments require distinct Super Admin review.",
        },
        { status: 400 }
      );
    }

    const request = await createAdjustmentRequest({
      partnerId,
      reservationId,
      deltaAmount: Number(deltaAmount),
      reason: effectiveReason,
      createdBy: session.userId,
      arbitraryApprovedByAttempt: approvedBy,
      metadata,
    });

    return NextResponse.json({ success: true, request }, { status: 201 });
  } catch (err: any) {
    console.error("[API Error] /api/admin/commissions/adjustments POST:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
