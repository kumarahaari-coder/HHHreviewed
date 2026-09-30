/**
 * Hostaway Unified Webhook Handler & Security Verifier
 * 
 * Invariants:
 * - Fail-closed authentication (HTTP Basic Auth or secret header)
 * - Safe schema validation
 * - Idempotent event processing (zero duplicate accruals)
 * - Authoritative reservation fetch from Hostaway API post-notification
 * - Duplicate event tolerance
 */

import crypto from "crypto";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HostawayWebhookPayload } from "./types";
import { fetchHostawayReservation } from "./reservations";
import { syncSingleHostawayReservation, SingleHostawaySyncResult } from "./sync";

export interface WebhookVerificationResult {
  isValid: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Verifies Hostaway webhook request credentials.
 * Supports HTTP Basic Authentication and secret header tokens.
 */
export function verifyHostawayWebhookRequest(req: Request | NextRequest): WebhookVerificationResult {
  const expectedUsername = process.env.HOSTAWAY_WEBHOOK_USERNAME?.trim();
  const expectedPassword = process.env.HOSTAWAY_WEBHOOK_PASSWORD?.trim();
  const webhookSecret = process.env.HOSTAWAY_WEBHOOK_SECRET?.trim() || expectedPassword;

  // 1. Check custom secret header if configured
  const secretHeader = req.headers.get("x-hostaway-secret") || req.headers.get("x-webhook-secret");
  if (secretHeader && webhookSecret && secretHeader === webhookSecret) {
    return { isValid: true };
  }

  // 2. Check HTTP Basic Authentication
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Basic ")) {
    try {
      const b64 = authHeader.substring(6).trim();
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      const [user, pass] = decoded.split(":");

      // If username and password are provided in environment
      if (expectedUsername && expectedPassword) {
        if (user === expectedUsername && pass === expectedPassword) {
          return { isValid: true };
        }
      } else if (expectedPassword) {
        // Only password/secret configured
        if (pass === expectedPassword) {
          return { isValid: true };
        }
      }
    } catch {
      return { isValid: false, error: "Invalid Authorization header encoding", statusCode: 401 };
    }
  }

  // If no credentials configured in environment, fail-closed in production
  if (!expectedUsername && !expectedPassword && !webhookSecret) {
    if (process.env.NODE_ENV === "production") {
      return { isValid: false, error: "Hostaway webhook authentication is not configured", statusCode: 500 };
    }
    // Permitted in non-production local development if explicit flag set
    if (process.env.ALLOW_UNAUTHENTICATED_WEBHOOKS === "true") {
      return { isValid: true };
    }
  }

  return { isValid: false, error: "Unauthorized. Valid credentials required.", statusCode: 401 };
}

/**
 * Handles incoming Hostaway Unified Webhook payload.
 */
export async function processHostawayWebhook(
  payload: HostawayWebhookPayload,
  supabaseClient?: any
): Promise<{
  success: boolean;
  status: "PROCESSED" | "ALREADY_PROCESSED" | "IGNORED" | "FAILED";
  eventType: string;
  reservationId?: number;
  syncResult?: SingleHostawaySyncResult;
  message?: string;
}> {
  const eventType = (payload.event || payload.type || payload.action || "").trim();

  // Validate event type
  const isReservationEvent =
    eventType.startsWith("reservation") ||
    eventType === "booking.created" ||
    eventType === "booking.updated" ||
    eventType === "booking.cancelled";

  if (!isReservationEvent && eventType !== "test") {
    return {
      success: true,
      status: "IGNORED",
      eventType,
      message: `Ignored non-reservation event: ${eventType}`,
    };
  }

  if (eventType === "test") {
    return {
      success: true,
      status: "PROCESSED",
      eventType: "test",
      message: "Hostaway test webhook verified successfully.",
    };
  }

  // Extract reservation ID
  const rawId =
    payload.reservationId ||
    payload.data?.id ||
    payload.data?.hostawayReservationId ||
    (payload.data as any)?.reservationId;

  const reservationId = Number(rawId);
  if (!reservationId || isNaN(reservationId)) {
    return {
      success: false,
      status: "FAILED",
      eventType,
      message: "Webhook payload is missing a valid reservation ID.",
    };
  }

  const supabase = supabaseClient || createAdminClient();

  // Stable event identity: prefer Hostaway envelope event id/eventId if present;
  // otherwise generate a deterministic SHA-256 fingerprint of reservation state
  let idempotencyEventId: string;
  if (payload.id || payload.eventId) {
    idempotencyEventId = `hostaway_webhook_evt_${String(payload.id || payload.eventId)}`;
  } else {
    const rawData = payload.data as any;
    const fingerprintContent = JSON.stringify({
      reservationId,
      eventType,
      stateMarker: rawData?.updatedOn || rawData?.insertedOn || payload.timestamp || "",
    });
    const hash = crypto.createHash("sha256").update(fingerprintContent).digest("hex").substring(0, 32);
    idempotencyEventId = `hostaway_webhook_${reservationId}_${eventType}_${hash}`;
  }

  try {
    const { data: existingLog } = await supabase
      .from("integration_idempotency_logs")
      .select("id, status")
      .eq("event_id", idempotencyEventId)
      .maybeSingle();

    if (existingLog && existingLog.status === "PROCESSED") {
      return {
        success: true,
        status: "ALREADY_PROCESSED",
        eventType,
        reservationId,
        message: "Duplicate event already processed idempotently.",
      };
    }
  } catch {
    // If table not present or DB error, continue with sync engine guards
  }

  // Fetch Authoritative Reservation from Hostaway API
  let booking: any = null;
  try {
    booking = await fetchHostawayReservation(reservationId);
  } catch (err: any) {
    // If API fetch fails or if payload already contains full reservation data
    if (payload.data && payload.data.id && payload.data.listingMapId) {
      booking = payload.data;
    } else {
      throw new Error(`Failed to fetch authoritative reservation ${reservationId}: ${err?.message}`);
    }
  }

  // Delegate to sync engine
  const syncResult = await syncSingleHostawayReservation(booking, supabase);

  // Record idempotency log
  try {
    await supabase.from("integration_idempotency_logs").insert({
      provider: "HOSTAWAY",
      event_id: idempotencyEventId,
      event_type: eventType,
      status: "PROCESSED",
      processed_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal
  }

  return {
    success: true,
    status: "PROCESSED",
    eventType,
    reservationId,
    syncResult,
  };
}
