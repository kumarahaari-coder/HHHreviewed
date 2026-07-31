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

    // Process user event
    if (eventType === "user.created" || eventType === "user.updated") {
      const userData = payload.data || {};
      const clerkUserId = userData.id;
      const email = userData.email_addresses?.[0]?.email_address || userData.email || "user@example.com";
      const name = `${userData.first_name || ""} ${userData.last_name || ""}`.trim() || email.split("@")[0];

      // Safe 1-time migration mapping by email
      const existingUser = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existingUser) {
        existingUser.clerkUserId = clerkUserId;
        existingUser.onboardingStatus = "COMPLETED";
      } else {
        const publicMetadata = userData.public_metadata || {};
        const metaRole = publicMetadata.role as string | undefined;
        // Default strictly to CREATOR. Admin roles require explicit assignment by an administrator.
        const assignedRole = (metaRole === "SUPER_ADMIN" || metaRole === "FINANCE_ADMIN" || metaRole === "ADMIN") ? metaRole : "CREATOR";
        const partner = db.partners.find(p => p.email.toLowerCase() === email.toLowerCase());

        db.users.push({
          id: `user-${Date.now()}`,
          name,
          email,
          role: assignedRole,
          partnerId: partner?.id || "partner-001",
          status: "ACTIVE",
          clerkUserId,
          onboardingStatus: "COMPLETED",
          createdAt: new Date().toISOString()
        });
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
      message: `Clerk webhook ${eventType} synced successfully.`,
      eventId
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Webhook ingestion error" }, { status: 500 });
  }
}
