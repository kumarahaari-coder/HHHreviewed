import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, isAdminRole, isCreatorRole } from "@/lib/authorization";
import { getPartnerDashboardData, getAllPartners } from "@/lib/supabase/data-store";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPartnerFinancialProjection } from "@/lib/commissions/projections";

// Partner-safe view of the Phase 6 ledger: totals plus payout batches that have actually been approved.
async function getPhase6Summary(partnerId: string) {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("commission_ledger_events")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId);
    if (!count) return { active: false, availableNow: 0, paidOut: 0, inFlight: 0, history: [] as any[] };

    const projection = await getPartnerFinancialProjection(partnerId, supabase);
    const { data: batches } = await supabase
      .from("payout_batches")
      .select("batch_number, status, total_amount, payout_rail, approved_at, updated_at, metadata")
      .eq("partner_id", partnerId)
      .in("status", ["APPROVED", "AWAITING_MANUAL_CONFIRMATION", "PROCESSING", "REQUIRES_RECONCILIATION", "SETTLED"])
      .order("created_at", { ascending: false });

    let paidOut = 0;
    let inFlight = 0;
    const history = (batches || []).map((b: any) => {
      const amount = Number(b.total_amount);
      const paid = b.status === "SETTLED";
      if (paid) paidOut += amount;
      else inFlight += amount;
      return {
        reference: b.batch_number,
        amount,
        status: paid ? "PAID" : "PROCESSING",
        date: (paid ? b.metadata?.settledAt : b.approved_at) || b.updated_at,
        transactionReference: paid ? b.metadata?.transactionReference || null : null,
      };
    });
    return {
      active: true,
      availableNow: Math.round(projection.partnerPayoutAvailable * 100) / 100,
      paidOut: Math.round(paidOut * 100) / 100,
      inFlight: Math.round(inFlight * 100) / 100,
      history,
    };
  } catch (err: any) {
    console.error("[Partner Dashboard] phase6 summary failed:", err?.message);
    return { active: false, availableNow: 0, paidOut: 0, inFlight: 0, history: [] as any[] };
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();

    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedPreviewPartnerId = searchParams.get("previewPartnerId");

    let effectivePartnerId: string | undefined = undefined;
    let isPreviewMode = false;

    // Check if requesting user is an admin requesting an explicit preview
    if (isAdminRole(session.role)) {
      if (requestedPreviewPartnerId) {
        effectivePartnerId = requestedPreviewPartnerId;
        isPreviewMode = true;
      } else {
        const partners = await getAllPartners();
        const firstPartner = partners.find(p => p.status === "ACTIVE" || p.status === "INVITED" || (p.status as string) === "active") || partners[0];
        if (firstPartner) {
          effectivePartnerId = firstPartner.id;
          isPreviewMode = true;
        } else {
          return NextResponse.json({
            success: true,
            isAdminWithoutPartner: true,
            message: "Select a partner from Admin Partners directory to preview."
          });
        }
      }
    } else if (isCreatorRole(session.role)) {
      if (!session.partnerId) {
        return NextResponse.json({ success: false, error: "No partner account associated with this user." }, { status: 403 });
      }
      effectivePartnerId = session.partnerId;
    }

    if (!effectivePartnerId) {
      return NextResponse.json({ success: false, error: "No partner account associated with this user." }, { status: 404 });
    }

    const dashboardData = await getPartnerDashboardData(effectivePartnerId);

    if (!dashboardData || !dashboardData.partner) {
      return NextResponse.json({ success: false, error: `Partner record not found for ID: ${effectivePartnerId}` }, { status: 404 });
    }

    if (!isAdminRole(session.role)) {
      const pStatus = (dashboardData.partner.status || "").toLowerCase();
      if (pStatus === "archived" || pStatus === "suspended") {
        return NextResponse.json(
          { success: false, error: `Partner account is ${pStatus}. Access to active tenant resources is revoked.` },
          { status: 403 }
        );
      }
    }

    const phase6 = await getPhase6Summary(effectivePartnerId);

    return NextResponse.json({
      success: true,
      isPreviewMode,
      ...dashboardData,
      phase6
    });

  } catch (error: any) {
    console.error("[Partner Dashboard API Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch partner dashboard" }, { status: 500 });
  }
}
