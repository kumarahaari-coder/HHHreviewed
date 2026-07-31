import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { verifyClerkWebhookSignature } from "@/lib/auth/clerk";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const svixId = req.headers.get("svix-id") || undefined;
    const svixTimestamp = req.headers.get("svix-timestamp") || undefined;
    const svixSignature = req.headers.get("svix-signature") || undefined;

    // Verify webhook signature
    const isValid = verifyClerkWebhookSignature(rawBody, { svixId, svixTimestamp, svixSignature });
    if (!isValid) {
      return NextResponse.json({ success: false, error: "Invalid Svix signature." }, { status: 400 });
    }

    const payload = JSON.parse(rawBody || "{}");
    const eventId = payload.data?.id || svixId || `evt_${Date.now()}`;
    const eventType = payload.type || "user.created";

    // Idempotency check
    if (db.isIdempotentEvent("CLERK", eventId)) {
      return NextResponse.json({ success: true, message: "Event already processed (idempotent)." }, { status: 200 });
    }

    // Process user.created: Resolve partner/user via trusted invitation publicMetadata and store real user_... in clerkUserId
    if (eventType === "user.created") {
      const userData = payload.data || {};
      const realClerkUserId = userData.id; // Guaranteed to be user_...
      const email = userData.email_addresses?.[0]?.email_address || userData.email || "";
      const publicMetadata = userData.public_metadata || {};
      const targetPartnerId = publicMetadata.partnerId;
      const targetAppUserId = publicMetadata.applicationUserId;

      // Find user using trusted publicMetadata applicationUserId/partnerId, or exact email match
      let user = db.users.find(u => (targetAppUserId && u.id === targetAppUserId) || (targetPartnerId && u.partnerId === targetPartnerId) || (email && u.email.toLowerCase() === email.toLowerCase()));

      if (user) {
        // Store real user_... in clerkUserId (never inv_...)
        if (realClerkUserId && realClerkUserId.startsWith("user_")) {
          user.clerkUserId = realClerkUserId;
        }
        user.onboardingStatus = "COMPLETED";
      }

    // Process session.created: Change Partner status from INVITED to ACTIVE on first login & sync lastLogin
    } else if (eventType === "session.created" || eventType === "user.updated") {
      const userData = payload.data?.user || payload.data || {};
      const clerkUserId = userData.id || userData.user_id;
      const email = userData.email_addresses?.[0]?.email_address || userData.email || "";
      const lastSignInAt = userData.last_sign_in_at ? new Date(userData.last_sign_in_at).toISOString() : new Date().toISOString();

      let user = db.users.find(u => (clerkUserId && u.clerkUserId === clerkUserId) || (email && u.email.toLowerCase() === email.toLowerCase()));

      if (user) {
        if (clerkUserId && clerkUserId.startsWith("user_")) {
          user.clerkUserId = clerkUserId;
        }
        user.lastLogin = lastSignInAt;

        if (user.partnerId) {
          const partner = db.partners.find(p => p.id === user.partnerId);
          if (partner) {
            partner.lastLogin = lastSignInAt;
            // Transition status INVITED -> ACTIVE on first login / session creation
            if (partner.status === "INVITED") {
              partner.status = "ACTIVE";
              console.log(`[Status Progression] Partner ${partner.businessName} (${partner.id}) transitioned from INVITED to ACTIVE on session creation.`);
            }
          }
        }
      }

    } else if (eventType === "user.deleted") {
      const clerkUserId = payload.data?.id;
      if (clerkUserId) {
        db.users = db.users.filter(u => u.clerkUserId !== clerkUserId);
      }
    }

    db.recordIdempotency("CLERK", eventId, eventType, "PROCESSED");

    return NextResponse.json({
      success: true,
      message: `Clerk webhook ${eventType} processed successfully.`,
      eventId
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Webhook ingestion error" }, { status: 500 });
  }
}
