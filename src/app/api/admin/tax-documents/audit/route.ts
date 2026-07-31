import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";

export async function GET(req: NextRequest) {
  try {
    const session = getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get("documentId");
    const partnerId = searchParams.get("partnerId");

    let logs = db.taxAuditLogs;
    if (documentId) {
      logs = logs.filter((l: any) => l.documentId === documentId);
    }
    if (partnerId) {
      logs = logs.filter((l: any) => l.partnerId === partnerId);
    }

    return NextResponse.json({
      success: true,
      totalCount: logs.length,
      auditLogs: logs
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}
