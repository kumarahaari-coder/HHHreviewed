import { NextResponse } from "next/server";
import { getAllSites } from "@/lib/supabase/data-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const partnerId = searchParams.get("partnerId");

    const allSites = await getAllSites();
    const filtered = partnerId ? allSites.filter(s => s.partnerId === partnerId) : allSites;

    return NextResponse.json({ success: true, sites: filtered });
  } catch (err: any) {
    console.error("[API Error] GET /api/partner/sites failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
