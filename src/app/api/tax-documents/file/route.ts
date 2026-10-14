import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canAccessCreatorData } from "@/lib/authorization";
import { getObjectFromR2 } from "@/lib/storage/r2";
import { getTaxDocumentById, getTaxDocumentByPartner, logTaxAudit } from "@/lib/supabase/tax-documents";

export const dynamic = "force-dynamic";

/**
 * Streams a tax document PDF from the private R2 bucket after checking the caller's session.
 * Partners can only read their own document; admins can read any. Nothing here is a public link.
 *
 *   GET /api/tax-documents/file?documentId=<id>&versionId=<id>[&download=1]
 * `documentId` may be omitted by a partner to mean "my document".
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized. Session required." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get("documentId");
    const versionId = searchParams.get("versionId");
    const asDownload = searchParams.get("download") === "1";

    let doc = null;
    if (documentId) {
      doc = await getTaxDocumentById(documentId);
    } else if (session.partnerId) {
      doc = await getTaxDocumentByPartner(session.partnerId);
    }
    if (!doc) {
      return NextResponse.json({ success: false, error: "Tax document not found." }, { status: 404 });
    }

    if (!canAccessCreatorData(session, doc.partnerId)) {
      return NextResponse.json({ success: false, error: "Forbidden. Cross-account access denied." }, { status: 403 });
    }

    const version = versionId ? doc.versions.find(v => v.id === versionId) : doc.currentVersion;
    if (!version) {
      return NextResponse.json({ success: false, error: "Version not found." }, { status: 404 });
    }

    const { body } = await getObjectFromR2(version.s3StorageKey);

    await logTaxAudit({
      documentId: doc.id,
      versionId: version.id,
      partnerId: doc.partnerId,
      action: asDownload ? "DOWNLOAD" : "VIEW",
      performedByUserId: session.userId,
      performedByUserRole: session.role,
      details: `${asDownload ? "Downloaded" : "Viewed"} version ${version.versionNumber}.`,
    });

    const safeName = (version.originalFilename || `tax-document-v${version.versionNumber}.pdf`).replace(/[^a-zA-Z0-9_.-]/g, "_");
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="${safeName}"`,
        "Content-Length": String(body.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: any) {
    console.error("[Tax Document File Error]", err);
    return NextResponse.json({ success: false, error: err?.message || "Failed to load tax document." }, { status: 502 });
  }
}
