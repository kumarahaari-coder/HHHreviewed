import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession, canAccessCreatorData } from "@/lib/authorization";
import { generateSignedDownloadUrl } from "@/lib/storage/s3";

export async function GET(req: NextRequest) {
  try {
    const session = getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get("documentId");
    const versionId = searchParams.get("versionId");
    const key = searchParams.get("key");
    const token = searchParams.get("token");
    const expires = searchParams.get("expires");

    // If downloading via signed token link:
    if (key && token && expires) {
      const now = Date.now();
      if (now > parseInt(expires, 10)) {
        return NextResponse.json({ success: false, error: "Download link expired. Please request a new link." }, { status: 410 });
      }

      // Stream PDF header
      const mockPdfContent = Buffer.from(
        `%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Title (HHH Tax Document) /Creator (Hidden Honey Homes) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`
      );

      return new NextResponse(mockPdfContent, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="tax-document-${Date.now()}.pdf"`,
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          "Prisma-Header": "no-store"
        }
      });
    }

    // Otherwise generate signed download link for authorized user
    if (!documentId) {
      return NextResponse.json({ success: false, error: "Missing documentId" }, { status: 400 });
    }

    const doc = db.taxDocuments.find((d: any) => d.id === documentId);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    if (!canAccessCreatorData(session, doc.partnerId)) {
      return NextResponse.json({ success: false, error: "Forbidden. Cross-account access denied." }, { status: 403 });
    }

    const versions = db.taxVersions.filter((v: any) => v.documentId === documentId);
    const targetVersion = versionId ? versions.find((v: any) => v.id === versionId) : (versions.find((v: any) => v.id === doc.currentVersionId) || versions[0]);

    if (!targetVersion) {
      return NextResponse.json({ success: false, error: "Version not found" }, { status: 404 });
    }

    // Log Download Audit Entry
    db.logTaxAudit({
      documentId: doc.id,
      versionId: targetVersion.id,
      partnerId: doc.partnerId,
      action: "DOWNLOAD",
      performedByUserId: session.userId,
      performedByUserRole: session.role,
      details: `Generated 15-minute signed URL for version ${targetVersion.versionNumber}.`
    });

    const signedUrl = await generateSignedDownloadUrl(targetVersion.s3StorageKey, 900);

    return NextResponse.json({
      success: true,
      signedUrl,
      expiresInSeconds: 900,
      version: {
        versionNumber: targetVersion.versionNumber,
        originalFilename: targetVersion.originalFilename,
        submissionDate: targetVersion.submissionDate
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}
