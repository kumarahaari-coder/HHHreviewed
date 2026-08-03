import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { headers } from "next/headers";
import { mapClerkUser, findUserByClerkUserId, findUserById, findUserByEmail, isSupabaseEnabled } from "@/lib/supabase/data-store";
import { createAdminClient } from "@/lib/supabase/admin";

interface ClerkEmailAddress {
  id: string;
  email_address?: string;
  verification?: {
    status?: string;
  };
}

interface ClerkUserPayload {
  id: string;
  primary_email_address_id?: string;
  email_addresses?: ClerkEmailAddress[];
  public_metadata?: {
    applicationUserId?: string;
  };
  email?: string;
  user_id?: string;
}

export async function POST(req: NextRequest) {
  let eventId = "";
  let claimToken: string | null = null;
  const provider = "CLERK";

  try {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
    if (!WEBHOOK_SECRET) {
      console.error("[Clerk Webhook Error] CLERK_WEBHOOK_SECRET environment variable missing.");
      return NextResponse.json({ error: "Webhook secret missing" }, { status: 500 });
    }

    const headerPayload = await headers();
    const svix_id = headerPayload.get("svix-id");
    const svix_timestamp = headerPayload.get("svix-timestamp");
    const svix_signature = headerPayload.get("svix-signature");

    if (!svix_id || !svix_timestamp || !svix_signature) {
      return NextResponse.json({ error: "Missing Svix headers" }, { status: 400 });
    }

    const payload = await req.json();
    const body = JSON.stringify(payload);

    // Item 14: Svix signature verification MUST happen BEFORE any database claim
    const wh = new Webhook(WEBHOOK_SECRET);
    let evt: { type: string; data: ClerkUserPayload };

    try {
      evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      }) as { type: string; data: ClerkUserPayload };
    } catch (err: any) {
      console.error("[Clerk Webhook Signature Failure]", err?.message);
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    eventId = svix_id;
    const eventType = evt.type;

    // STEP 1: Webhook Claim with Claim Token Generation
    if (isSupabaseEnabled()) {
      const supabase = createAdminClient();
      const { data: claimData, error: claimErr } = await supabase.rpc("claim_webhook_event_tx", {
        p_provider: provider,
        p_event_id: eventId,
        p_event_type: eventType,
        p_stale_seconds: 300
      });

      if (claimErr || !claimData) {
        console.error("[Clerk Webhook Error] claim_webhook_event_tx failed:", claimErr);
        return NextResponse.json({ error: "Idempotency claim error" }, { status: 500 });
      }

      if (!claimData.claimed) {
        console.log(`[Clerk Webhook Duplicate] Event ${eventId} (${eventType}) already processed or claimed. Status: ${claimData.status}, Outcome: ${claimData.outcome}.`);
        return NextResponse.json({ success: true, message: "Duplicate event ignored idempotently" });
      }

      claimToken = claimData.claimToken;
    }

    // STEP 2: Process user.created / user.updated using strictly verified Clerk Primary Email
    if (eventType === "user.created" || eventType === "user.updated") {
      const userData = evt.data || {};
      const realClerkUserId = userData.id; // Guaranteed user_...
      const emailAddresses = userData.email_addresses || [];
      const primaryEmailId = userData.primary_email_address_id;

      // Strictly resolve Clerk's designated primary email object (NO fallback to emailAddresses[0])
      const primaryEmailObj = emailAddresses.find(
        (email: ClerkEmailAddress) => email.id === primaryEmailId
      );

      if (!primaryEmailId || !primaryEmailObj) {
        console.warn(`[Clerk Webhook Ignored] Primary email could not be resolved for Clerk user ${realClerkUserId}`);
        if (isSupabaseEnabled() && claimToken) {
          const supabase = createAdminClient();
          const { error: completeErr } = await supabase.rpc("complete_webhook_event_tx", {
            p_provider: provider,
            p_event_id: eventId,
            p_claim_token: claimToken,
            p_outcome: "IGNORED_UNKNOWN_USER"
          });
          if (completeErr) {
            throw new Error(`complete_webhook_event_tx (IGNORED_UNKNOWN_USER) failed: ${completeErr.message}`);
          }
        }
        return NextResponse.json({ success: true, message: "Ignored missing primary email" });
      }

      const primaryEmailStr = primaryEmailObj.email_address?.trim().toLowerCase();
      const isVerified = primaryEmailObj.verification?.status === "verified";

      if (!primaryEmailStr || !isVerified) {
        console.warn(`[Clerk Webhook Ignored] Primary email is missing or unverified for Clerk user ${realClerkUserId}`);
        if (isSupabaseEnabled() && claimToken) {
          const supabase = createAdminClient();
          const { error: completeErr } = await supabase.rpc("complete_webhook_event_tx", {
            p_provider: provider,
            p_event_id: eventId,
            p_claim_token: claimToken,
            p_outcome: "IGNORED_UNVERIFIED_EMAIL"
          });
          if (completeErr) {
            throw new Error(`complete_webhook_event_tx (IGNORED_UNVERIFIED_EMAIL) failed: ${completeErr.message}`);
          }
        }
        return NextResponse.json({ success: true, message: "Ignored unverified primary email" });
      }

      const publicMetadata = userData.public_metadata || {};
      const targetAppUserId = publicMetadata.applicationUserId;

      let user = null;
      if (targetAppUserId) {
        user = await findUserById(targetAppUserId);
      }
      if (!user && primaryEmailStr) {
        user = await findUserByEmail(primaryEmailStr);
      }

      if (user && realClerkUserId && realClerkUserId.startsWith("user_")) {
        console.log(`[Clerk Webhook] Mapping verified primary email ${primaryEmailStr} (${realClerkUserId}) to app user ${user.id}...`);
        await mapClerkUser({
          internalUserId: user.id,
          email: primaryEmailStr,
          clerkUserId: realClerkUserId,
          operation: "MAP",
          source: "CLERK_WEBHOOK"
        });

        if (isSupabaseEnabled() && claimToken) {
          const supabase = createAdminClient();
          const { error: completeErr } = await supabase.rpc("complete_webhook_event_tx", {
            p_provider: provider,
            p_event_id: eventId,
            p_claim_token: claimToken,
            p_outcome: "MAPPED"
          });
          if (completeErr) {
            throw new Error(`complete_webhook_event_tx (MAPPED) failed: ${completeErr.message}`);
          }
        }
      } else {
        console.log(`[Clerk Webhook Pending] No application user found matching email ${primaryEmailStr}. Remaining pending.`);
        if (isSupabaseEnabled() && claimToken) {
          const supabase = createAdminClient();
          const { error: completeErr } = await supabase.rpc("complete_webhook_event_tx", {
            p_provider: provider,
            p_event_id: eventId,
            p_claim_token: claimToken,
            p_outcome: "IGNORED_UNKNOWN_USER"
          });
          if (completeErr) {
            throw new Error(`complete_webhook_event_tx (IGNORED_UNKNOWN_USER) failed: ${completeErr.message}`);
          }
        }
      }
    }

    return NextResponse.json({ success: true, message: `Processed ${eventType}` });

  } catch (error: any) {
    console.error("[Clerk Webhook Failure]", error);

    if (isSupabaseEnabled() && eventId && claimToken) {
      try {
        const supabase = createAdminClient();
        const { error: failErr } = await supabase.rpc("fail_webhook_event_tx", {
          p_provider: provider,
          p_event_id: eventId,
          p_claim_token: claimToken,
          p_error_message: error?.message || "Webhook handler exception"
        });
        if (failErr) {
          console.error("[Clerk Webhook Fail Logging Error] fail_webhook_event_tx failed:", failErr.message);
        }
      } catch (failErr) {
        console.error("[Clerk Webhook Fail Logging Error]", failErr);
      }
    }

    return NextResponse.json({ error: error?.message || "Webhook handler error" }, { status: 500 });
  }
}
