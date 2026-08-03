import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createClerkPartnerInvitation } from "@/lib/auth/clerk-admin";
import { createPartner, deletePartner, createCreatorInvitation, updateClerkInvitation, findUserByEmail } from "@/lib/supabase/data-store";

export async function GET(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      message: "Admin partner endpoint"
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to list partners" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let createdPartnerId: string | null = null;
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
      partnerCode
    } = body;

    if (!contactName || !businessName || !email) {
      return NextResponse.json({ success: false, error: "Missing required fields: Partner Name, Business Name, and Email are required." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return NextResponse.json({ success: false, error: `A partner account with email ${email} already exists.` }, { status: 409 });
    }

    // STEP 1: Insert Partner Record into public.partners
    const partner = await createPartner({
      businessName,
      contactName,
      contactEmail: normalizedEmail,
      partnerCode
    });
    createdPartnerId = partner.id;

    const internalUserId = `user-partner-${Date.now().toString(36)}`;

    // STEP 2: Create Application User with PARTNER_OWNER role and captured partner UUID
    let user;
    try {
      user = await createCreatorInvitation({
        internalUserId,
        name: contactName,
        email: normalizedEmail,
        role: "PARTNER_OWNER",
        partnerId: partner.id,
        performedByUserId: session.userId,
        source: "ADMIN_CONSOLE"
      });
    } catch (userErr: any) {
      // ROLLBACK: If user creation fails, clean up the orphaned partner record
      if (createdPartnerId) {
        await deletePartner(createdPartnerId).catch(delErr => 
          console.error("[Rollback Error] Failed to delete orphaned partner:", delErr)
        );
      }
      throw new Error(`Failed to create application user for partner: ${userErr.message}`);
    }

    // STEP 3: Issue Clerk Invitation
    const clerkResult = await createClerkPartnerInvitation(normalizedEmail, partner.id, user.id, "PARTNER_OWNER");

    if (!clerkResult.success || !clerkResult.invitationId) {
      // Partial Success Warning: Database records exist, Clerk invitation requires resend
      return NextResponse.json({
        success: false,
        partnerCreated: true,
        userCreated: true,
        partner,
        user,
        error: `Partner and User records created successfully, but Clerk invitation failed for ${email}: ${clerkResult.error}. Use RESEND_INVITE to retry.`
      }, { status: 502 });
    }

    // STEP 4: Store invitation ID
    await updateClerkInvitation(user.id, clerkResult.invitationId);

    return NextResponse.json({
      success: true,
      message: `Partner "${businessName}" created successfully. Role set to PARTNER_OWNER. Clerk invitation sent.`,
      partner,
      user,
      clerkInvitationId: clerkResult.invitationId
    });

  } catch (error: any) {
    console.error("[Admin Partner Create Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to create partner" }, { status: 500 });
  }
}
