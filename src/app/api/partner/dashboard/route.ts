import { NextRequest, NextResponse } from "next/server";
import { getClerkAuthSession, isAdminRole, isCreatorRole } from "@/lib/authorization";
import { getPartnerDashboardData, getAllPartners } from "@/lib/supabase/data-store";

export async function GET(req: NextRequest) {
  try {
    const session = await getClerkAuthSession();

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
      effectivePartnerId = session.partnerId || requestedPreviewPartnerId || undefined;
    }

    if (!effectivePartnerId) {
      return NextResponse.json({ success: false, error: "No partner account associated with this user." }, { status: 404 });
    }

    const dashboardData = await getPartnerDashboardData(effectivePartnerId);

    if (!dashboardData || !dashboardData.partner) {
      return NextResponse.json({ success: false, error: `Partner record not found for ID: ${effectivePartnerId}` }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      isPreviewMode,
      ...dashboardData
    });

  } catch (error: any) {
    console.error("[Partner Dashboard API Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch partner dashboard" }, { status: 500 });
  }
}
