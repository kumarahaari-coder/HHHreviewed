import { NextRequest, NextResponse } from "next/server";
import { getClerkAuthSession, isAdminRole, isCreatorRole } from "@/lib/authorization";
import { db } from "@/lib/db/mockDb";

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
        // Admin visiting /partner without specifying a partner -> Return prompt to select a partner
        return NextResponse.json({
          success: true,
          isAdminWithoutPartner: true,
          message: "Select a partner from Admin Partners directory to preview."
        });
      }
    } else if (isCreatorRole(session.role)) {
      // Creators MUST use their own assigned partnerId. Reject any attempt to query another partner.
      if (requestedPreviewPartnerId && requestedPreviewPartnerId !== session.partnerId) {
        return NextResponse.json({ success: false, error: "Forbidden. Creators cannot preview other partners." }, { status: 403 });
      }
      effectivePartnerId = session.partnerId;
    }

    if (!effectivePartnerId) {
      return NextResponse.json({ success: false, error: "No partner account associated with this user." }, { status: 404 });
    }

    const partner = db.partners.find(p => p.id === effectivePartnerId);

    if (!partner) {
      return NextResponse.json({ success: false, error: `Partner record not found for ID: ${effectivePartnerId}` }, { status: 404 });
    }

    // Strictly filter tenant data for effectivePartnerId
    const sites = db.sites.filter(s => s.partnerId === effectivePartnerId);
    const reservations = db.reservations.filter(r => r.partnerId === effectivePartnerId);
    const payouts = db.payouts.filter(p => p.partnerId === effectivePartnerId);
    const statements = db.payouts.filter(p => p.partnerId === effectivePartnerId && p.status === "PAID");
    const taxDocument = db.getTaxDocumentByPartner(effectivePartnerId);

    return NextResponse.json({
      success: true,
      isPreviewMode,
      partner,
      sites,
      reservations,
      payouts,
      statements,
      taxDocument
    });

  } catch (error: any) {
    console.error("[Partner Dashboard API Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch partner dashboard" }, { status: 500 });
  }
}
