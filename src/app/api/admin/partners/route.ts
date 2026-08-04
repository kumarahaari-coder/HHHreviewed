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
      partnerId,
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

    const internalUserId = `user-partner-${Date.now().toString(36)}`;

    // STEP 1: Create Creator User Invitation via DataStore RPC
    const user = await createCreatorInvitation({
      internalUserId,
      name: contactName,
      email: normalizedEmail,
      partnerId,
      partnerCode,
      performedByUserId: session.userId,
      source: "ADMIN_CONSOLE"
    });

    // STEP 2: Issue Clerk Invitation
    const clerkResult = await createClerkPartnerInvitation(normalizedEmail, user.partnerId || "", user.id, "CREATOR");

    if (!clerkResult.success || !clerkResult.invitationId) {
      return NextResponse.json({
        success: false,
        error: `Failed to create Clerk invitation for ${email}: ${clerkResult.error}`
      }, { status: 502 });
    }

    // STEP 3: Store invitation ID
    await updateClerkInvitation(user.id, clerkResult.invitationId);

    return NextResponse.json({
      success: true,
      message: `Partner "${businessName}" created successfully. Status set to INVITED. Clerk invitation sent.`,
      user,
      clerkInvitationId: clerkResult.invitationId
    });

  } catch (error: any) {
    console.error("[Admin Partner Create Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to create partner" }, { status: 500 });
  }
}
