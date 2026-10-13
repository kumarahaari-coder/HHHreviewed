import { NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { getVerifiedHostawayBookingUrls } from "@/lib/hostaway/booking-urls";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const destinations = await getVerifiedHostawayBookingUrls();
    return NextResponse.json({ success: true, destinations });
  } catch (err: any) {
    console.error("[API Error] GET /api/admin/sites/hostaway-booking-urls failed:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
