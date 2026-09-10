import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { rejectAdjustmentRequest } from "@/lib/commissions/adjustments";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Unauthorized. Admin session required." }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { rejectionReason, reason } = body;

    const effectiveReason = rejectionReason || reason || "Rejected by admin";

    const updated = await rejectAdjustmentRequest({
      requestId: id,
      rejecterUserId: session.userId,
      rejecterRole: session.role,
      rejectionReason: effectiveReason,
    });

    return NextResponse.json({ success: true, request: updated });
  } catch (err: any) {
    console.error("[API Error] /api/admin/commissions/adjustments/[id]/reject POST:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
