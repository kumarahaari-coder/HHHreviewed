import { NextRequest, NextResponse } from "next/server";
import { getTaxAuditLogs } from "@/lib/supabase/tax-documents";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get("documentId");
    const partnerId = searchParams.get("partnerId");

    const logs = await getTaxAuditLogs({ documentId, partnerId });

    return NextResponse.json({
      success: true,
      totalCount: logs.length,
      auditLogs: logs
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}
