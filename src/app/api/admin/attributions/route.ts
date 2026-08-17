import { NextResponse } from "next/server";
import { getReservationAttributions } from "@/lib/supabase/data-store";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const attributions = await getReservationAttributions();
    return NextResponse.json({ attributions });
  } catch (err: any) {
    console.error("[API Attributions Error]:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch attributions" }, { status: 500 });
  }
}
