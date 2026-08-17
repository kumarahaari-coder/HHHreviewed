import { NextRequest, NextResponse } from "next/server";
import { updateReservationAttributionStatus } from "@/lib/supabase/data-store";
import { ReconciliationStatus } from "@/lib/db/schema";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body = await request.json();
    const { status, reviewedBy } = body as { status: ReconciliationStatus; reviewedBy?: string };

    if (!status || !["ATTRIBUTED", "REVIEW_REQUIRED", "UNATTRIBUTED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Invalid attribution status." }, { status: 400 });
    }

    const updated = await updateReservationAttributionStatus(
      id,
      status,
      reviewedBy || session.email || "Admin"
    );

    return NextResponse.json({ success: true, attribution: updated });
  } catch (err: any) {
    console.error("[API Attribution Review Error]:", err);
    return NextResponse.json({ error: err.message || "Failed to update attribution status" }, { status: 500 });
  }
}
