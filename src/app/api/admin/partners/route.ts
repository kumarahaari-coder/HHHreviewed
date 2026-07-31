import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { sendTransactionalEmail } from "@/lib/email/brevo";
import crypto from "crypto";

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
      status = "INVITED",
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

    // STEP 1: Create Partner record in DB
    const partnerId = `partner-${Date.now().toString().slice(-4)}`;
    const newPartner = db.addPartner({
      businessName,
      contactName,
      email,
      phone: phone || "555-0100",
      paymentMethod,
      currency: "USD",
      payoutFrequency,
      status: status as any,
      notes: notes || `Created by ${session.email}`,
      website,
      commissionRate: Number(commissionRate) || 10,
      taxDocumentCategory
    });

    // STEP 2 & 3: Create User record and Clerk User / Invitation ID
    const clerkUserId = `user_${crypto.randomBytes(12).toString("hex")}`;
    const newUser = {
      id: `user-partner-${newPartner.id}`,
      name: contactName,
      email: email,
      role: "CREATOR" as const,
      partnerId: newPartner.id,
      status: (status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE") as any,
      clerkUserId,
      onboardingStatus: status === "INVITED" ? ("PENDING" as const) : ("COMPLETED" as const),
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);

    // STEP 4: Send Invitation Email via Brevo
    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || "https://hiddenhoneyhomes.com"}/sign-in?invite=${clerkUserId}`;
    await sendTransactionalEmail({
      eventType: "WELCOME",
      recipientEmail: email,
      recipientName: contactName,
      params: {
        partnerName: contactName,
        businessName,
        inviteLink,
        commissionRate: `${commissionRate || 10}%`
      }
    });

    // Record system notification
    db.addNotification("SUCCESS", `Partner "${businessName}" created and invitation sent to ${email}. Clerk User ID: ${clerkUserId}`);

    return NextResponse.json({
      success: true,
      message: `Partner "${businessName}" created successfully. Invitation sent to ${email}.`,
      partner: newPartner,
      user: newUser,
      clerkUserId,
      inviteLink
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to create partner" }, { status: 500 });
  }
}
