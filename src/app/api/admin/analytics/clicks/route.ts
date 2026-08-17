import { NextResponse } from "next/server";
import { getClickAnalyticsSummary } from "@/lib/supabase/data-store";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const summary = await getClickAnalyticsSummary();
    return NextResponse.json(summary);
  } catch (err: any) {
    console.error("[API Analytics Error]:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch click analytics" }, { status: 500 });
  }
}
