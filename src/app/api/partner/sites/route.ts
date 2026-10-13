import { NextResponse } from "next/server";
import { getAllSites, findPartnerById } from "@/lib/supabase/data-store";
import { getClerkAuthSession, isAdminRole } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const partnerId = searchParams.get("partnerId");

    if (partnerId) {
      const partner = await findPartnerById(partnerId);
      if (partner) {
        const pStatus = (partner.status || "").toLowerCase();
        if (pStatus === "archived" || pStatus === "suspended") {
          const session = await getClerkAuthSession();
          if (!session || !isAdminRole(session.role)) {
            return NextResponse.json(
              { success: false, error: `Partner account is ${pStatus}. Access to active tenant resources is revoked.` },
              { status: 403 }
            );
          }
        }
      }
    }

    const allSites = await getAllSites();
    const filtered = partnerId ? allSites.filter(s => s.partnerId === partnerId) : allSites;

    return NextResponse.json({ success: true, sites: filtered });
  } catch (err: any) {
    console.error("[API Error] GET /api/partner/sites failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
