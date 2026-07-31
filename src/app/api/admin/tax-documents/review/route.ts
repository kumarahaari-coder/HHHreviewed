import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { sendTransactionalEmail } from "@/lib/email/brevo";

export async function POST(req: NextRequest) {
  try {
    const session = getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { documentId, status, adminNote, internalNote } = body;

    if (!documentId || !status) {
      return NextResponse.json({ success: false, error: "Missing documentId or status." }, { status: 400 });
    }

    const validStatuses = ["APPROVED", "REJECTED", "REPLACEMENT_REQUIRED", "UNDER_REVIEW"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid review status." }, { status: 400 });
    }

    const updatedDoc = db.updateTaxReviewStatus(documentId, status, adminNote, internalNote);
    const partner = db.partners.find(p => p.id === updatedDoc.partnerId);

    // Send corresponding Brevo email notification
    let eventType: "TAX_DOC_APPROVED" | "TAX_DOC_REJECTED" | "TAX_DOC_REPLACEMENT_REQUESTED" | null = null;
    if (status === "APPROVED") eventType = "TAX_DOC_APPROVED";
    if (status === "REJECTED") eventType = "TAX_DOC_REJECTED";
    if (status === "REPLACEMENT_REQUIRED") eventType = "TAX_DOC_REPLACEMENT_REQUESTED";

    if (eventType && partner) {
      await sendTransactionalEmail({
        eventType,
        recipientEmail: partner.email,
        recipientName: partner.contactName,
        params: {
          adminNote: adminNote || "No note provided.",
          partnerId: partner.id
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: `Tax document review updated to ${status}.`,
      document: updatedDoc
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}
