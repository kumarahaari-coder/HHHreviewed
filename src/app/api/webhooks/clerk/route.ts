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

    // Process user & session events
    if (eventType === "user.created" || eventType === "user.updated" || eventType === "session.created") {
      const userData = payload.data?.user || payload.data || {};
      const clerkUserId = userData.id || userData.user_id;
      const email = userData.email_addresses?.[0]?.email_address || userData.email || "";
      const lastSignInAt = userData.last_sign_in_at ? new Date(userData.last_sign_in_at).toISOString() : new Date().toISOString();

      // Find database user by clerkUserId or email
      let user = db.users.find(u => u.clerkUserId === clerkUserId || (email && u.email.toLowerCase() === email.toLowerCase()));

      if (user) {
        user.clerkUserId = clerkUserId;
        user.onboardingStatus = "COMPLETED";
        user.lastLogin = lastSignInAt;

        // AUTOMATIC STATUS PROGRESSION: INVITED -> ACTIVE on first login
        if (user.partnerId) {
          const partner = db.partners.find(p => p.id === user.partnerId);
          if (partner) {
            partner.lastLogin = lastSignInAt;
            if (partner.status === "INVITED") {
              partner.status = "ACTIVE";
              console.log(`[Status Progression] Partner ${partner.businessName} (${partner.id}) transitioned from INVITED to ACTIVE upon first successful sign in.`);
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
