import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canAccessCreatorData } from "@/lib/authorization";
import { getTaxDocumentById } from "@/lib/supabase/tax-documents";

export const dynamic = "force-dynamic";

/**
 * Returns an authenticated link to a tax document version. The link points at
 * /api/tax-documents/file, which re-checks the session on every request and streams the real
 * PDF from R2 (no token to guess or leak).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get("documentId");
    const versionId = searchParams.get("versionId");
    if (!documentId) {
      return NextResponse.json({ success: false, error: "Missing documentId" }, { status: 400 });
    }

    const doc = await getTaxDocumentById(documentId);
    if (!doc) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }
    if (!canAccessCreatorData(session, doc.partnerId)) {
      return NextResponse.json({ success: false, error: "Forbidden. Cross-account access denied." }, { status: 403 });
    }

    const version = versionId ? doc.versions.find(v => v.id === versionId) : doc.currentVersion;
    if (!version) {
      return NextResponse.json({ success: false, error: "Version not found" }, { status: 404 });
    }

    const base = `/api/tax-documents/file?documentId=${encodeURIComponent(doc.id)}&versionId=${encodeURIComponent(version.id)}`;
    return NextResponse.json({
      success: true,
      signedUrl: `${base}&download=1`,
      previewUrl: base,
      version: {
        versionNumber: version.versionNumber,
        originalFilename: version.originalFilename,
        submissionDate: version.submissionDate,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
