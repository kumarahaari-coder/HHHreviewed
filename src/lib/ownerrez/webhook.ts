import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncOwnerRezBookingById, SingleSyncResult } from "./sync";
import { OwnerRezApiError } from "./client";

export interface WebhookAuthResult {
  authorized: boolean;
  status: number;
  error?: string;
}

export interface WebhookEventResult {
  status: number;
  body: Record<string, any>;
}

/**
 * Perform a constant-time comparison of two strings to protect against timing attacks.
 */
function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify OwnerRez webhook authentication using supported headers:
 * 1. Dedicated custom secret header: `X-OwnerRez-Webhook-Secret` or `X-Webhook-Secret`
 * 2. `Authorization: Bearer <secret>`
 * 3. `Authorization: Basic <base64>` (username, password, or combined token)
 * 
 * Fails closed with 500 if server secret is unconfigured.
 * Fails closed with 401 on missing or mismatched credentials.
 * Never logs credentials or token contents.
 */
export function verifyOwnerRezWebhookAuth(
  headers: Headers | Record<string, string | string[] | undefined>,
  serverSecret?: string
): WebhookAuthResult {
  const secret = (serverSecret ?? process.env.OWNERREZ_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    return {
      authorized: false,
      status: 500,
      error: "Server configuration error: Webhook secret not configured.",
    };
  }

  const getHeader = (name: string): string | null => {
    if (typeof (headers as any).get === "function") {
      return (headers as Headers).get(name);
    }
    const val = (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()];
    if (Array.isArray(val)) return val[0] || null;
    return typeof val === "string" ? val : null;
  };

  // 1. Check custom secret headers
  const customSecret = getHeader("x-ownerrez-webhook-secret") || getHeader("x-webhook-secret");
  if (customSecret && timingSafeCompare(customSecret.trim(), secret)) {
    return { authorized: true, status: 200 };
  }

  // 2. Check Authorization header
  const authHeader = getHeader("authorization");
  if (authHeader) {
    const trimmed = authHeader.trim();

    // Bearer token
    if (/^Bearer\s+/i.test(trimmed)) {
      const token = trimmed.replace(/^Bearer\s+/i, "").trim();
      if (timingSafeCompare(token, secret)) {
        return { authorized: true, status: 200 };
      }
    }

    // Basic auth
    if (/^Basic\s+/i.test(trimmed)) {
      const b64 = trimmed.replace(/^Basic\s+/i, "").trim();
      try {
        const decoded = Buffer.from(b64, "base64").toString("utf8");
        const parts = decoded.split(":");
        const username = parts[0] || "";
        const password = parts.slice(1).join(":");

        if (
          (password && timingSafeCompare(password, secret)) ||
          (username && timingSafeCompare(username, secret)) ||
          timingSafeCompare(decoded, secret)
        ) {
          return { authorized: true, status: 200 };
        }
      } catch {
        // Base64 decoding failed; fall through to 401
      }
    }
  }

  return {
    authorized: false,
    status: 401,
    error: "Unauthorized: Invalid or missing webhook authentication credentials.",
  };
}

/**
 * Processes an OwnerRez webhook event payload.
 * 
 * Invariants strictly enforced:
 * - Never log secrets or raw guest PII (payload.entity is excluded from logs).
 * - For entity_create / entity_update: delegate only to syncOwnerRezBookingById(entity_id).
 * - For entity_delete: re-fetch from OwnerRez to let sync engine determine authoritative status.
 *   If 404 (purged from OwnerRez), fail closed and flag review-required without inventing financial state.
 * - For webhook_test: return 200 immediately.
 * - For non-booking entity types: return 200 with ignored=true to prevent delivery errors.
 */
export async function handleOwnerRezWebhookEvent(
  payload: any,
  options?: {
    supabaseClient?: any;
    syncFn?: (bookingId: number) => Promise<SingleSyncResult>;
  }
): Promise<WebhookEventResult> {
  // Validate basic payload shape
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      status: 400,
      body: { success: false, error: "Malformed request payload: JSON object required." },
    };
  }

  const { action, entity_type, entity_id } = payload;

  if (!action || typeof action !== "string") {
    return {
      status: 400,
      body: { success: false, error: "Missing or invalid action field in webhook payload." },
    };
  }

  // 1. Webhook test event
  if (action === "webhook_test") {
    console.log("[OwnerRez Webhook] Webhook test event received and verified.");
    return {
      status: 200,
      body: { success: true, message: "Webhook test event verified successfully." },
    };
  }

  // 2. Filter unsupported entity types
  if (entity_type && entity_type !== "booking") {
    console.log(`[OwnerRez Webhook] Ignored event for non-booking entity_type: ${entity_type}`);
    return {
      status: 200,
      body: {
        success: true,
        ignored: true,
        message: `Ignored event for unsupported entity_type: ${entity_type}`,
      },
    };
  }

  // 3. Validate entity_id
  const numericEntityId = Number(entity_id);
  if (!Number.isInteger(numericEntityId) || numericEntityId <= 0) {
    return {
      status: 400,
      body: { success: false, error: "Missing or invalid entity_id: must be a positive integer." },
    };
  }

  // Privacy-safe metadata logging (no secret, no raw guest PII)
  console.log(`[OwnerRez Webhook] Received ${action} for entity_type=booking entity_id=${numericEntityId}`);

  const sync = options?.syncFn || syncOwnerRezBookingById;
  const getSupabase = () => options?.supabaseClient || createAdminClient();

  // 4. Booking create & update: Delegate directly to existing syncOwnerRezBookingById
  if (action === "entity_create" || action === "entity_update") {
    try {
      const syncResult = await sync(numericEntityId);
      return {
        status: 200,
        body: {
          success: syncResult.failed === 0,
          action,
          entityId: numericEntityId,
          result: {
            bookingId: syncResult.bookingId,
            inserted: syncResult.inserted,
            updated: syncResult.updated,
            unchanged: syncResult.unchanged,
            failed: syncResult.failed,
            attributionTier: syncResult.attributionTier,
            initialAccrual: syncResult.initialAccrual,
            reconciliation: syncResult.reconciliation,
          },
        },
      };
    } catch (syncErr: any) {
      console.error(
        `[OwnerRez Webhook] Sync error for booking ${numericEntityId}:`,
        syncErr?.message || syncErr
      );
      return {
        status: 500,
        body: {
          success: false,
          action,
          entityId: numericEntityId,
          error: "Failed to synchronize OwnerRez booking.",
        },
      };
    }
  }

  // 5. Booking delete: Attempt targeted re-fetch first.
  // If 404 (not fetchable), fail closed and flag review-required without mutating financial state.
  if (action === "entity_delete") {
    try {
      const syncResult = await sync(numericEntityId);
      return {
        status: 200,
        body: {
          success: syncResult.failed === 0,
          action,
          entityId: numericEntityId,
          result: {
            bookingId: syncResult.bookingId,
            inserted: syncResult.inserted,
            updated: syncResult.updated,
            unchanged: syncResult.unchanged,
            failed: syncResult.failed,
            attributionTier: syncResult.attributionTier,
            reconciliation: syncResult.reconciliation,
          },
        },
      };
    } catch (err: any) {
      const isNotFound =
        (err instanceof OwnerRezApiError && err.status === 404) ||
        (err && typeof err === "object" && (err.status === 404 || err.statusCode === 404)) ||
        (err?.message && /404|not found/i.test(err.message));

      if (isNotFound) {
        console.warn(
          `[OwnerRez Webhook] Booking ${numericEntityId} no longer fetchable from OwnerRez (404). Failing closed: logging review-required condition.`
        );

        const supabase = getSupabase();
        const { data: existingReservation } = await supabase
          .from("reservations")
          .select("id, confirmation_code, attribution_status, reservation_status, payment_status")
          .eq("ownerrez_booking_id", numericEntityId)
          .maybeSingle();

        if (existingReservation) {
          // Flag attribution_status as pending for admin review; do not invent financial mutations
          await supabase
            .from("reservations")
            .update({
              attribution_status: "pending",
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingReservation.id);

          return {
            status: 200,
            body: {
              success: true,
              action,
              entityId: numericEntityId,
              reviewRequired: true,
              message: `Booking ${numericEntityId} no longer fetchable from OwnerRez (404); local reservation ${existingReservation.confirmation_code} flagged for manual review.`,
            },
          };
        }

        return {
          status: 200,
          body: {
            success: true,
            action,
            entityId: numericEntityId,
            reviewRequired: false,
            message: `Booking ${numericEntityId} deleted in OwnerRez and not found in local reservations.`,
          },
        };
      }

      console.error(
        `[OwnerRez Webhook] Error during entity_delete re-fetch for booking ${numericEntityId}:`,
        err?.message || err
      );
      return {
        status: 500,
        body: {
          success: false,
          action,
          entityId: numericEntityId,
          error: "Failed to process entity_delete event.",
        },
      };
    }
  }

  // 6. Unhandled action fallback
  return {
    status: 200,
    body: {
      success: true,
      ignored: true,
      message: `Ignored unhandled action: ${action}`,
    },
  };
}
