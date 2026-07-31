import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession } from "@/lib/authorization";
import { generateSignedDownloadUrl } from "@/lib/storage/s3";

export async function GET(req: NextRequest) {
  try {
    const session = getCurrentSession();
    if (!session || !session.partnerId) {
      return NextResponse.json({ success: false, error: "Unauthorized. Creator session required." }, { status: 401 });
    }

    // Resolve ownership server-side from session. Never trust partnerId passed from client.
    const partnerId = session.partnerId;
    const docData = db.getTaxDocumentByPartner(partnerId);

    if (!docData || !docData.currentVersion) {
      return NextResponse.json({ success: false, error: "No tax document found for your account." }, { status: 404 });
    }

    const currentVer = docData.currentVersion;

    // Log Creator Download Audit Entry
    db.logTaxAudit({
      documentId: docData.id,
      versionId: currentVer.id,
      partnerId,
      action: "DOWNLOAD",
      performedByUserId: session.userId,
      performedByUserRole: session.role || "CREATOR",
      details: `Creator requested 15-minute signed URL for current version ${currentVer.versionNumber}.`
    });

    const signedUrl = await generateSignedDownloadUrl(currentVer.s3StorageKey, 900);

    return NextResponse.json({
      success: true,
      signedUrl,
      expiresInSeconds: 900,
      document: {
        documentId: docData.id,
        versionNumber: currentVer.versionNumber,
        documentType: currentVer.documentType,
        w8Subtype: currentVer.w8Subtype,
        originalFilename: currentVer.originalFilename,
        submissionDate: currentVer.submissionDate,
        status: docData.status
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}
