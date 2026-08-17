import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createClerkPartnerInvitation } from "@/lib/auth/clerk-admin";
import { createPartner, deletePartner, createCreatorInvitation, updateClerkInvitation, findUserByEmail, getAllPartners } from "@/lib/supabase/data-store";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const partners = await getAllPartners();

    return NextResponse.json({
      success: true,
      partners
    });
  } catch (error: any) {
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
      partnerCode: customPartnerCode
    } = body;

    if (!contactName || !businessName || !email) {
      return NextResponse.json({ success: false, error: "Missing required fields: Partner Name, Business Name, and Email are required." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // STEP 1: Duplicate Email Pre-Check
    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return NextResponse.json({ success: false, error: `A partner account with email ${email} already exists.` }, { status: 409 });
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

    // STEP 4: Issue Clerk Invitation
    const clerkResult = await createClerkPartnerInvitation(
      normalizedEmail,
      createdPartner.id,
      user.id,
      "PARTNER_OWNER"
    );

    if (!clerkResult.success || !clerkResult.invitationId) {
      console.error("[Admin Partner Create] Clerk invitation failed for user:", user.id, clerkResult.error);
      return NextResponse.json({
        success: false,
        error: `Partner "${businessName}" was created, but failed to send Clerk invitation: ${clerkResult.error}. You can resend the invitation from the partner menu.`,
        partner: createdPartner,
        user
      }, { status: 502 });
    }

    // STEP 5: Store Clerk Invitation ID
    await updateClerkInvitation(user.id, clerkResult.invitationId);

    return NextResponse.json({
      success: true,
      message: `Partner "${businessName}" created successfully. Status set to INVITED. Clerk invitation sent.`,
      partner: createdPartner,
      user,
      clerkInvitationId: clerkResult.invitationId
    });

  } catch (error: any) {
    console.error("[Admin Partner Create Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to create partner" }, { status: 500 });
  }
}
