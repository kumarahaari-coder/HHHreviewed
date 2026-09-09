import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { getOwnerRezCommissionPreviews } from "@/lib/ownerrez/commission-preview";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Admin session required." },
        { status: 403 }
      );
    }

    const previewData = await getOwnerRezCommissionPreviews();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...previewData,
    });
  } catch (error: any) {
    console.error("[API Error] /api/admin/commissions/preview:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to generate commission previews" },
      { status: 500 }
    );
  }
}
