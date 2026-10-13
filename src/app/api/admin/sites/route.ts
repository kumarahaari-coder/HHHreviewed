import { NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import {
  getAllSites,
  createReferralSite,
  updateSitePropertyMappings
} from "@/lib/supabase/data-store";
import { getVerifiedHostawayBookingUrls } from "@/lib/hostaway/booking-urls";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const includeHostaway = searchParams.get("hostawayBookingUrls") === "true";

    const sites = await getAllSites();

    if (includeHostaway) {
      const hostawayUrls = await getVerifiedHostawayBookingUrls();
      return NextResponse.json({ success: true, sites, hostawayBookingDestinations: hostawayUrls });
    }

    return NextResponse.json({ success: true, sites });
  } catch (err: any) {
    console.error("[API Error] GET /api/admin/sites failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { partnerId, siteName, websiteUrl, trackingCode, mappings } = body;

    if (!partnerId || !siteName || !websiteUrl || !trackingCode) {
      return NextResponse.json(
        { success: false, error: "Partner ID, Website Name, Website URL, and Tracking Code are required." },
        { status: 400 }
      );
    }

    if (mappings !== undefined && (!Array.isArray(mappings) || mappings.length > 4)) {
      return NextResponse.json(
        { success: false, error: "Mappings, if provided, must be an array of up to 4 property mappings." },
        { status: 400 }
      );
    }

    const createdSite = await createReferralSite({
      partnerId,
      siteName,
      websiteUrl,
      trackingCode,
      mappings
    });

    return NextResponse.json({ success: true, site: createdSite }, { status: 201 });
  } catch (err: any) {
    console.error("[API Error] POST /api/admin/sites failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { siteId, mappings } = body;

    if (!siteId || !Array.isArray(mappings)) {
      return NextResponse.json(
        { success: false, error: "siteId and mappings array are required." },
        { status: 400 }
      );
    }

    const updatedSite = await updateSitePropertyMappings(siteId, mappings);
    return NextResponse.json({ success: true, site: updatedSite });
  } catch (err: any) {
    console.error("[API Error] PUT /api/admin/sites failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
