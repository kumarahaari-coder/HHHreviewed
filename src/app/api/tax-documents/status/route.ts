import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession, canAccessCreatorData } from "@/lib/authorization";

export async function GET(req: NextRequest) {
  try {
    const session = getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const partnerId = searchParams.get("partnerId") || session.partnerId;

    if (!partnerId || !canAccessCreatorData(session, partnerId)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const doc = db.getTaxDocumentByPartner(partnerId);
    if (!doc) {
      return NextResponse.json({
        success: true,
        status: "NOT_SUBMITTED",
        document: null
      });
    }

    // Sanitize output for creator (hide internal notes)
    return NextResponse.json({
      success: true,
      status: doc.status,
      document: {
        id: doc.id,
        partnerId: doc.partnerId,
        status: doc.status,
        adminNote: doc.adminNote, // creator-visible review note
        submissionDate: doc.currentVersion?.submissionDate,
        documentType: doc.currentVersion?.documentType,
        w8Subtype: doc.currentVersion?.w8Subtype,
        originalFilename: doc.currentVersion?.originalFilename,
        versionNumber: doc.currentVersion?.versionNumber,
        totalVersions: doc.versions?.length || 0
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}
