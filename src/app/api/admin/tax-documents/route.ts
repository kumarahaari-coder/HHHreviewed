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
    const statusFilter = searchParams.get("status");
    const docTypeFilter = searchParams.get("docType");

    const partners = db.partners;
    const allTaxDocs = partners.map(partner => {
      const docData = db.getTaxDocumentByPartner(partner.id);
      return {
        partnerId: partner.id,
        businessName: partner.businessName,
        contactName: partner.contactName,
        email: partner.email,
        taxDocument: docData
          ? {
              id: docData.id,
              status: docData.status,
              adminNote: docData.adminNote,
              internalNote: docData.internalNote,
              currentVersion: docData.currentVersion,
              totalVersions: docData.versions?.length || 0,
              updatedAt: docData.updatedAt
            }
          : {
              status: "NOT_SUBMITTED"
            }
      };
    });

    // Apply filters
    let filtered = allTaxDocs;
    if (statusFilter) {
      filtered = filtered.filter(item => item.taxDocument.status === statusFilter);
    }
    if (docTypeFilter) {
      filtered = filtered.filter(item => item.taxDocument.currentVersion?.documentType === docTypeFilter);
    }

    return NextResponse.json({
      success: true,
      totalCreators: partners.length,
      filteredCount: filtered.length,
      creators: filtered
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}
