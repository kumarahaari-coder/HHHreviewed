import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/authorization";
import { getTaxDocumentByPartner } from "@/lib/supabase/tax-documents";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || !session.partnerId) {
      return NextResponse.json({ success: false, error: "Unauthorized. Creator session required." }, { status: 401 });
    }

    // Ownership is resolved from the session. Never trust a partnerId passed from the client.
    const doc = await getTaxDocumentByPartner(session.partnerId);
    if (!doc || !doc.currentVersion) {
      return NextResponse.json({ success: false, error: "No tax document found for your account." }, { status: 404 });
    }

    const ver = doc.currentVersion;
    const base = `/api/tax-documents/file?documentId=${encodeURIComponent(doc.id)}&versionId=${encodeURIComponent(ver.id)}`;
    return NextResponse.json({
      success: true,
      signedUrl: `${base}&download=1`,
      previewUrl: base,
      document: {
        documentId: doc.id,
        versionNumber: ver.versionNumber,
        documentType: ver.documentType,
        w8Subtype: ver.w8Subtype,
        originalFilename: ver.originalFilename,
        submissionDate: ver.submissionDate,
        status: doc.status,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}
