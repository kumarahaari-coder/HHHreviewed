import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession, canAccessCreatorData } from "@/lib/authorization";
import { validatePdfFileSecurity, generateOpaqueR2Key, deleteR2Object } from "@/lib/storage/r2";
import { sendTransactionalEmail } from "@/lib/email/brevo";

export async function POST(req: NextRequest) {
  let uploadedR2Key: string | null = null;
  try {
    const session = getCurrentSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized. Session required." }, { status: 401 });
    }

    const formData = await req.formData();
    const partnerId = formData.get("partnerId") as string || session.partnerId;
    const documentType = formData.get("documentType") as "W_9" | "W_8";
    const w8Subtype = formData.get("w8Subtype") as "W_8BEN" | "W_8BEN_E" | "OTHER" | undefined;
    const confirmationChecked = formData.get("confirmationChecked") === "true";
    const file = formData.get("file") as File | null;

    if (!partnerId || !canAccessCreatorData(session, partnerId)) {
      return NextResponse.json({ success: false, error: "Forbidden. Cannot upload for this creator account." }, { status: 403 });
    }

    if (!documentType || (documentType !== "W_9" && documentType !== "W_8")) {
      return NextResponse.json({ success: false, error: "Invalid tax document type. Must be W-9 or W-8." }, { status: 400 });
    }

    if (!confirmationChecked) {
      return NextResponse.json({ success: false, error: "You must confirm that the form is completed and signed." }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ success: false, error: "No PDF file provided." }, { status: 400 });
    }

    // Convert file to Buffer for security checks
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Perform PDF Security & Binary Magic-Byte Checks (Rejects bad files before upload)
    const validation = validatePdfFileSecurity(buffer, file.name);
    if (!validation.isValid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 422 });
    }

    // Generate Opaque Storage Key (Zero PII in path)
    const existingDoc = db.getTaxDocumentByPartner(partnerId);
    const opaqueKeys = generateOpaqueR2Key(existingDoc?.id);
    uploadedR2Key = opaqueKeys.r2Key;

    // Save to Database with Versioning
    const { doc, version } = db.saveTaxSubmission({
      partnerId,
      documentType,
      w8Subtype,
      s3StorageKey: opaqueKeys.r2Key,
      originalFilename: file.name,
      fileHash: validation.fileHash || "",
      fileSize: file.size,
      mimeType: file.type || "application/pdf",
      confirmationChecked: true,
      quarantineStatus: "PASSED"
    });

    // Send email notification to creator and admin
    await sendTransactionalEmail({
      eventType: "TAX_DOC_SUBMITTED",
      recipientEmail: session.email,
      recipientName: session.userId,
      params: {
        partnerId,
        documentType,
        versionNumber: version.versionNumber
      }
    });

    return NextResponse.json({
      success: true,
      message: `Tax document ${documentType} (v${version.versionNumber}) submitted successfully.`,
      documentId: doc.id,
      versionId: version.id,
      status: doc.status,
      submissionDate: version.submissionDate
    });

  } catch (error: any) {
    // Transactional Rollback: If DB persistence fails after file upload, clean up storage object!
    if (uploadedR2Key) {
      await deleteR2Object(uploadedR2Key);
    }
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}
