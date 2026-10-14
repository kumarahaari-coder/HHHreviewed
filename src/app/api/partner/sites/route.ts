import { NextResponse } from "next/server";
import { getAllSites, findPartnerById } from "@/lib/supabase/data-store";
import { getAuthSession, isAdminRole, isCreatorRole } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    // The partner is derived from the session, never from the request: a partner can only ever
    // see their own sites. Only admins may choose a partner (preview) or list every site.
    let partnerId: string | undefined;
    if (isAdminRole(session.role)) {
      partnerId = searchParams.get("partnerId") || searchParams.get("previewPartnerId") || undefined;
    } else if (isCreatorRole(session.role)) {
      if (!session.partnerId) {
        return NextResponse.json({ success: false, error: "No partner account associated with this user." }, { status: 403 });
      }
      partnerId = session.partnerId;

      const partner = await findPartnerById(partnerId);
      const pStatus = (partner?.status || "").toLowerCase();
      if (pStatus === "archived" || pStatus === "suspended") {
        return NextResponse.json(
          { success: false, error: `Partner account is ${pStatus}. Access to active tenant resources is revoked.` },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const allSites = await getAllSites();
    const sites = partnerId ? allSites.filter(s => s.partnerId === partnerId) : allSites;

    return NextResponse.json({ success: true, sites });
  } catch (err: any) {
    console.error("[API Error] GET /api/partner/sites failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
