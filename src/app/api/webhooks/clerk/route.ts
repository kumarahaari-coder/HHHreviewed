import { NextRequest, NextResponse } from "next/server";
import { verifyClerkWebhookSignature } from "@/lib/auth/clerk";
import {
  isSupabaseEnabled,
  findUserByEmail,
  findUserByClerkUserId,
  mapClerkUser,
  activateUserAndPartner
} from "@/lib/supabase/data-store";
import { createAdminClient } from "@/lib/supabase/admin";

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

    // Idempotency check via Supabase RPC claim_webhook_event_tx if Supabase is enabled
    if (isSupabaseEnabled()) {
      const supabase = createAdminClient();
      const { data: claimData, error: claimErr } = await supabase.rpc("claim_webhook_event_tx", {
        p_provider: "CLERK",
        p_event_id: eventId,
        p_event_type: eventType,
        p_stale_seconds: 300
      });

      if (claimErr) {
        console.error("[Clerk Webhook] Claim RPC Error:", claimErr);
        return NextResponse.json({ success: false, error: "Idempotency claim failed" }, { status: 500 });
      }

      if (!claimData?.claimed) {
        console.log(`[Clerk Webhook Idempotency] Event ${eventId} acknowledged (Status: ${claimData?.status}). Skipping duplicate processing.`);
        return NextResponse.json({ success: true, message: `Event acknowledged (${claimData?.message}).` }, { status: 200 });
      }
    }

    // Process user.created: Resolve pending application user using invitation metadata / email & store real user_... in clerkUserId
    if (eventType === "user.created") {
      const userData = payload.data || {};
      const realClerkUserId = userData.id; // Guaranteed to be user_...
      const email = userData.email_addresses?.[0]?.email_address || userData.email || "";
      const publicMetadata = userData.public_metadata || {};
      const targetAppUserId = publicMetadata.applicationUserId;

      const normalizedEmail = email.toLowerCase().trim();

      let user = null;
      if (targetAppUserId) {
        user = await findUserByClerkUserId(targetAppUserId);
      }
      if (!user && normalizedEmail) {
        user = await findUserByEmail(normalizedEmail);
      }

      if (user && realClerkUserId && realClerkUserId.startsWith("user_")) {
        console.log(`[Clerk Webhook] Mapping real Clerk user ${realClerkUserId} to application user ${user.id} (${user.email}). Onboarding status -> MAPPED.`);
        await mapClerkUser(user.id, realClerkUserId);
      }

    // Process session.created: Change User & Partner status from INVITED -> ACTIVE on first authenticated session
    } else if (eventType === "session.created" || eventType === "user.updated") {
      const userData = payload.data?.user || payload.data || {};
      const clerkUserId = userData.id || userData.user_id;
      const email = userData.email_addresses?.[0]?.email_address || userData.email || "";

      const normalizedEmail = email.toLowerCase().trim();

      let user = null;
      if (clerkUserId) {
        user = await findUserByClerkUserId(clerkUserId);
      }
      if (!user && normalizedEmail) {
        user = await findUserByEmail(normalizedEmail);
      }

      if (user) {
        console.log(`[Clerk Webhook] Session event for user ${user.id} (${user.email}). Activating account & updating last_login.`);
        await activateUserAndPartner(user.id, user.partnerId);
      }
    }

    // Mark idempotency log as PROCESSED if Supabase enabled
    if (isSupabaseEnabled()) {
      const supabase = createAdminClient();
      await supabase
        .from("idempotency_logs")
        .update({ status: "PROCESSED", updated_at: new Date().toISOString() })
        .eq("provider", "CLERK")
        .eq("event_id", eventId);
    }

    return NextResponse.json({
      success: true,
      message: `Clerk webhook ${eventType} processed successfully.`,
      eventId
    });

  } catch (error: any) {
    console.error("[Clerk Webhook Error]", error);
    return NextResponse.json({ success: false, error: error?.message || "Webhook ingestion error" }, { status: 500 });
  }
}
