import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createClerkPartnerInvitation } from "@/lib/auth/clerk-admin";
import { createPartnerWithUser, updateClerkInvitation, findUserByEmail } from "@/lib/supabase/data-store";

export async function GET(req: NextRequest) {
  try {
    const session = getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const { getPartnerDashboardData } = await import("@/lib/supabase/data-store");
    // Return partner list
    return NextResponse.json({
      success: true,
      message: "Admin partner endpoint"
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to list partners" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const {
      contactName,
      businessName,
      email,
      phone,
      website,
      taxDocumentCategory,
      commissionRate,
      notes,
      paymentMethod = "BANK_TRANSFER",
      payoutFrequency = "MONTHLY"
    } = body;

    if (!contactName || !businessName || !email) {
      return NextResponse.json({ success: false, error: "Missing required fields: Partner Name, Business Name, and Email are required." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check duplicate email in DataStore
    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return NextResponse.json({ success: false, error: `A partner account with email ${email} already exists.` }, { status: 409 });
    }

    const partnerId = `partner-${Date.now().toString(36)}`;
    const userId = `user-partner-${partnerId}`;

    // STEP 1 & 2: Create Partner & User in DataStore via Atomic PostgreSQL Transaction RPC (Status = INVITED, Onboarding = PENDING)
    console.log(`[Admin Partner Create] Creating Partner & User in DataStore for ${normalizedEmail}...`);
    const { partner, user } = await createPartnerWithUser(
      {
        id: partnerId,
        businessName,
        contactName,
        email: normalizedEmail,
        phone: phone || "555-0100",
        paymentMethod,
        currency: "USD",
        payoutFrequency,
        notes: notes || `Created by ${session.email}`,
        website,
        commissionRate: Number(commissionRate) || 10,
        taxDocumentCategory
      },
      {
        id: userId
      }
    );

    // STEP 3: Issue Clerk Invitation via Clerk Backend API
    console.log(`[Admin Partner Create] Issuing Clerk Invitation for ${normalizedEmail}...`);
    const clerkResult = await createClerkPartnerInvitation(normalizedEmail, partner.id, user.id, "CREATOR");

    if (!clerkResult.success || !clerkResult.invitationId) {
      console.error(`[Admin Partner Create Failure] Clerk invitation failed: ${clerkResult.error}`);
      return NextResponse.json({
        success: false,
        error: `Failed to create Clerk invitation for ${email}: ${clerkResult.error}`
      }, { status: 502 });
    }

    // STEP 4: Store inv_... in clerkInvitationId & set onboardingStatus = INVITED
    await updateClerkInvitation(user.id, clerkResult.invitationId);

    return NextResponse.json({
      success: true,
      message: `Partner "${businessName}" created successfully. Status set to INVITED. Clerk invitation sent.`,
      partner,
      user,
      clerkInvitationId: clerkResult.invitationId
    });

  } catch (error: any) {
    console.error("[Admin Partner Create Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to create partner" }, { status: 500 });
  }
}
