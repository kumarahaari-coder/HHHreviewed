import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { sendPartnerInvitation, revokeUserAccess } from "@/lib/auth/invitations";
import {
  createPartner,
  deletePartner,
  createCreatorInvitation,
  findUserByEmail,
  findPartnerById,
  findPartnerByEmail,
  getAllPartners,
  getAllPartnerUsers,
  updatePartner
} from "@/lib/supabase/data-store";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const [partners, users] = await Promise.all([
      getAllPartners(),
      getAllPartnerUsers()
    ]);

    return NextResponse.json({
      success: true,
      partners,
      users
    });
  } catch (error: any) {
    console.error("[Admin Partners GET Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to list partners" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const {
      contactName,
      businessName,
      email,
      phone,
      partnerCode: customPartnerCode
    } = body;

    if (!contactName || !businessName || !email) {
      return NextResponse.json({ success: false, error: "Missing required fields: Partner Name, Business Name, and Email are required." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // STEP 1: Duplicate Email Pre-Check
    const existingUser = await findUserByEmail(normalizedEmail);
    const existingPartner = await findPartnerByEmail(normalizedEmail);

    if (existingUser || existingPartner) {
      const isInvitedOnly = (existingUser?.status === "INVITED" || !existingUser) && 
        (existingPartner?.status === "INVITED" || existingPartner?.status === "ACTIVE");

      if (isInvitedOnly && existingPartner) {
        return NextResponse.json({
          success: false,
          error: `A partner account with email ${email} already exists (${existingPartner.businessName}). You can resend the invitation from the partner actions menu without creating duplicate records.`
        }, { status: 409 });
      }

      return NextResponse.json({
        success: false,
        error: `A partner account with email ${email} already exists and is active.`
      }, { status: 409 });
    }

    // STEP 2: Create Real Partner Row
    let createdPartner;
    try {
      createdPartner = await createPartner({
        businessName: businessName.trim(),
        contactName: contactName.trim(),
        contactEmail: normalizedEmail,
        partnerCode: customPartnerCode ? customPartnerCode.trim() : undefined
      });
    } catch (partnerErr: any) {
      console.error("[Admin Partner Create] Failed to create partner row:", partnerErr);
      return NextResponse.json({ success: false, error: `Failed to create partner record: ${partnerErr.message}` }, { status: 500 });
    }

    const internalUserId = `user-partner-${Date.now().toString(36)}`;

    // STEP 3: Create Partner Owner User via DataStore RPC
    let user;
    try {
      user = await createCreatorInvitation({
        internalUserId,
        name: contactName.trim(),
        email: normalizedEmail,
        partnerId: createdPartner.id,
        partnerCode: createdPartner.partnerCode,
        role: "PARTNER_OWNER",
        performedByUserId: session.userId,
        source: "ADMIN_CONSOLE"
      });
    } catch (userErr: any) {
      console.error("[Admin Partner Create] User creation failed, rolling back partner row:", userErr);
      try {
        await deletePartner(createdPartner.id);
      } catch (cleanupErr: any) {
        console.error("[Admin Partner Create] Failed to rollback partner row:", cleanupErr);
      }
      return NextResponse.json({ success: false, error: `Failed to create partner user: ${userErr.message}` }, { status: 500 });
    }

    // STEP 4: Issue invitation email (single-use set-password link)
    const inviteResult = await sendPartnerInvitation(user.id, normalizedEmail, businessName);

    if (!inviteResult.success) {
      console.error("[Admin Partner Create] Invitation failed for user:", user.id, inviteResult.error);
      return NextResponse.json({
        success: false,
        error: `Partner "${businessName}" was created in database, but the invitation email failed: ${inviteResult.error}. You can resend the invitation from the partner actions menu.`,
        partner: createdPartner,
        user
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      message: `Partner "${businessName}" created successfully. Status set to INVITED. Invitation email sent.`,
      partner: createdPartner,
      user
    });

  } catch (error: any) {
    console.error("[Admin Partner Create Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to create partner" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { partnerId, contactName, businessName, phone, status } = body;

    if (!partnerId) {
      return NextResponse.json({ success: false, error: "partnerId is required." }, { status: 400 });
    }

    const existing = await findPartnerById(partnerId);
    if (!existing) {
      return NextResponse.json({ success: false, error: `Partner with ID ${partnerId} not found.` }, { status: 404 });
    }

    const updated = await updatePartner(partnerId, {
      contactName,
      businessName,
      phone,
      status
    });

    return NextResponse.json({
      success: true,
      message: `Partner "${updated.businessName}" updated successfully.`,
      partner: updated
    });
  } catch (error: any) {
    console.error("[Admin Partner PATCH Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to update partner" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const partnerId = searchParams.get("partnerId");

    if (!partnerId) {
      return NextResponse.json({ success: false, error: "partnerId query parameter is required." }, { status: 400 });
    }

    const partner = await findPartnerById(partnerId);
    if (!partner) {
      return NextResponse.json({ success: false, error: `Partner with ID ${partnerId} not found.` }, { status: 404 });
    }

    const user = await findUserByEmail(partner.email);
    const result = await deletePartner(partnerId);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        requiresArchive: result.requiresArchive,
        details: result.details
      }, { status: 400 });
    }

    if (user) {
      await revokeUserAccess(user.id);
    }

    return NextResponse.json({
      success: true,
      message: result.message
    });
  } catch (error: any) {
    console.error("[Admin Partner DELETE Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to delete partner" }, { status: 400 });
  }
}
