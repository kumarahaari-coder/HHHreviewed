import { NextResponse } from "next/server";
import { getAllSites, createSiteWithFourPropertyMappings } from "@/lib/supabase/data-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sites = await getAllSites();
    return NextResponse.json({ success: true, sites });
  } catch (err: any) {
    console.error("[API Error] GET /api/admin/sites failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { partnerId, siteName, websiteUrl, trackingCode, mappings } = body;

    if (!partnerId || !siteName || !websiteUrl || !trackingCode) {
      return NextResponse.json(
        { success: false, error: "Partner ID, Website Name, Website URL, and Tracking Code are required." },
        { status: 400 }
      );
    }

    if (!mappings || !Array.isArray(mappings) || mappings.length !== 4) {
      return NextResponse.json(
        { success: false, error: "Registration requires exactly 4 valid property widget mappings." },
        { status: 400 }
      );
    }

    const createdSite = await createSiteWithFourPropertyMappings({
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
