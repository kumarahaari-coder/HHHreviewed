import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { createClerkPartnerInvitation } from "@/lib/auth/clerk-admin";
import { Partner, User } from "@/lib/db/schema";

export async function GET(req: NextRequest) {
  try {
    const session = getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      partners: db.partners,
      users: db.users
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to list partners" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let createdPartnerId: string | null = null;
  let createdUserId: string | null = null;

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

    // Check duplicate email
    const existingPartner = db.partners.find(p => p.email.toLowerCase() === email.toLowerCase());
    if (existingPartner) {
      return NextResponse.json({ success: false, error: `A partner with email ${email} already exists.` }, { status: 409 });
    }

    // STEP 1: Create Partner record in DB (Status ALWAYS defaults to INVITED)
    const newPartner: Partner = db.addPartner({
      businessName,
      contactName,
      email,
      phone: phone || "555-0100",
      paymentMethod,
      currency: "USD",
      payoutFrequency,
      status: "INVITED", // System managed status
      notes: notes || `Created by ${session.email}`,
      website,
      commissionRate: Number(commissionRate) || 10,
      taxDocumentCategory
    });
    createdPartnerId = newPartner.id;

    // STEP 2: Create User record
    const userId = `user-partner-${newPartner.id}`;
    const newUser: User = {
      id: userId,
      name: contactName,
      email: email,
      role: "CREATOR",
      partnerId: newPartner.id,
      status: "ACTIVE",
      onboardingStatus: "PENDING",
      createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    createdUserId = userId;

    // STEP 3: Issue Clerk Invitation via Clerk Backend API (ID returned by Clerk)
    console.log(`[Admin Partner Create] Issuing Clerk Invitation for ${email}...`);
    const clerkResult = await createClerkPartnerInvitation(email, newPartner.id, "CREATOR");

    if (!clerkResult.success) {
      // STEP 6: Transactional Rollback: Remove Partner & User records if Clerk invitation fails!
      console.error(`[Admin Partner Create Failure] Clerk invitation failed: ${clerkResult.error}. Rolling back DB records.`);
      if (createdPartnerId) {
        db.partners = db.partners.filter(p => p.id !== createdPartnerId);
      }
      if (createdUserId) {
        db.users = db.users.filter(u => u.id !== createdUserId);
      }
      return NextResponse.json({
        success: false,
        error: `Failed to create Clerk invitation for ${email}: ${clerkResult.error}`
      }, { status: 502 });
    }

    // STEP 4: Store authentic clerkUserId / invitationId returned by Clerk
    newUser.clerkUserId = clerkResult.clerkUserId;

    // Record system notification
    db.addNotification("SUCCESS", `Partner "${businessName}" created. Status set to INVITED. Clerk Invitation issued (ID: ${clerkResult.clerkUserId}).`);

    return NextResponse.json({
      success: true,
      message: `Partner "${businessName}" created successfully. Status set to INVITED. Clerk invitation sent.`,
      partner: newPartner,
      user: newUser,
      clerkUserId: clerkResult.clerkUserId
    });

  } catch (error: any) {
    // Transactional Rollback on unexpected error
    if (createdPartnerId) {
      db.partners = db.partners.filter(p => p.id !== createdPartnerId);
    }
    if (createdUserId) {
      db.users = db.users.filter(u => u.id !== createdUserId);
    }
    return NextResponse.json({ success: false, error: error?.message || "Failed to create partner" }, { status: 500 });
  }
}
