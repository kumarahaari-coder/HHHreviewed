import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { appendCommissionLedgerEvent } from "@/lib/commissions/ledger";
import { getPartnerFinancialProjection } from "@/lib/commissions/projections";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Unauthorized. Admin session required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const partnerId = searchParams.get("partnerId");
    const reservationId = searchParams.get("reservationId");
    const eventType = searchParams.get("eventType");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const supabase = createAdminClient();
    let query = supabase
      .from("commission_ledger_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (partnerId) query = query.eq("partner_id", partnerId);
    if (reservationId) query = query.eq("reservation_id", reservationId);
    if (eventType) query = query.eq("event_type", eventType);

    const { data: events, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    let projection = null;
    if (partnerId) {
      projection = await getPartnerFinancialProjection(partnerId);
    }

    return NextResponse.json({
      success: true,
      events: events || [],
      projection,
    });
  } catch (err: any) {
    console.error("[API Error] /api/admin/commissions/ledger GET:", err);
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
    const { partnerId, reservationId, deltaAmount, adjustmentReason, approvedBy, metadata } = body;

    if (!partnerId || !reservationId || deltaAmount == null || !adjustmentReason) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: partnerId, reservationId, deltaAmount, adjustmentReason." },
        { status: 400 }
      );
    }

    // Hardened Security Enforcement:
    // A maker cannot create an immutable ledger event merely by supplying an approved_by UUID.
    // Adjustments must be requested via /api/admin/commissions/adjustments and approved by a distinct Super Admin.
    if (approvedBy) {
      return NextResponse.json(
        {
          success: false,
          error: "Security violation: Direct ledger creation with approved_by is forbidden. Please submit an adjustment request via /api/admin/commissions/adjustments for maker-checker review.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Direct ledger modification disabled. Submit adjustment request via POST /api/admin/commissions/adjustments for distinct Super Admin review.",
      },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[API Error] /api/admin/commissions/ledger POST:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
