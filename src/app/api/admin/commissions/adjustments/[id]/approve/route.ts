import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { approveAdjustmentRequest } from "@/lib/commissions/adjustments";

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

    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Super Admin role required to approve manual adjustments." },
        { status: 403 }
      );
    }

    const { id } = await params;

    const result = await approveAdjustmentRequest({
      requestId: id,
      approverUserId: session.userId,
      approverRole: session.role,
    });

    return NextResponse.json({
      success: true,
      request: result.request,
      ledgerEventId: result.ledgerEventId,
    });
  } catch (err: any) {
    console.error("[API Error] /api/admin/commissions/adjustments/[id]/approve POST:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
