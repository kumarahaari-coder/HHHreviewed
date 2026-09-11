import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeEligibilityReleaseTimestamp,
  DEFAULT_POST_STAY_HOLD_HOURS,
  DEFAULT_PROPERTY_TIMEZONE,
  isStayEligibleForRelease,
} from "./timezone";
import { createEligibilityRelease } from "./ledger";
import { CommissionLedgerEvent } from "./types";

export type EligibilityReconciliationStatus =
  | "ELIGIBLE_RELEASED"
  | "ALREADY_RELEASED"
  | "STAY_NOT_COMPLETED"
  | "UNPAID_INELIGIBLE"
  | "CANCELLED_INELIGIBLE"
  | "DISPUTED_INELIGIBLE"
  | "ZERO_NET_REALIZED_INELIGIBLE"
  | "RESERVATION_NOT_FOUND"
  | "ERROR";

export interface EligibilityReconciliationResult {
  reconciled: boolean;
  status: EligibilityReconciliationStatus;
  rowsCreated: number;
  reason: string;
  releaseTimeUtc?: string;
  event: CommissionLedgerEvent | null;
  error?: string;
}

export interface BatchEligibilityResult {
  totalScanned: number;
  eligibleReleased: number;
  alreadyReleased: number;
  skippedUnpaid: number;
  skippedFuture: number;
  skippedCancelled: number;
  skippedDisputed: number;
  errors: number;
  results: Array<{
    reservationId: string;
    confirmationCode?: string;
    status: EligibilityReconciliationStatus;
    rowsCreated: number;
    reason: string;
  }>;
}

/**
 * Reconciles automatic ELIGIBILITY_RELEASE creation for a single reservation.
 *
 * Requirements:
 * 1. Stay must be completed: property-local checkout time (11:00 AM) + hold buffer (default: 24h) must have elapsed.
 * 2. Idempotent: exactly one release event per reservation (idempotency key: evt_release_<reservationId>).
 * 3. Ineligible cases (never released):
 *    - Unpaid (payment_status == 'UNPAID', amount_received <= 0, or zero PAYMENT_REALIZED events).
 *    - Cancelled (reservation_status == 'CANCELLED').
 *    - Refunded / clawed-back (net realized commission <= 0).
 *    - Disputed (active DISPUTE_HOLD without subsequent DISPUTE_RELEASE).
 */
export async function reconcileReservationEligibilityRelease(params: {
  reservationId: string;
  holdHours?: number;
  now?: Date;
  supabaseClient?: any;
}): Promise<EligibilityReconciliationResult> {
  const supabase = params.supabaseClient || createAdminClient();
  const holdHours = params.holdHours ?? DEFAULT_POST_STAY_HOLD_HOURS;
  const now = params.now ?? new Date();

  try {
    // 1. Fetch reservation
    const { data: reservation, error: resErr } = await supabase
      .from("reservations")
      .select(
        "id, confirmation_code, property_id, partner_id, site_id, reservation_status, payment_status, gross_amount, amount_received, refund_amount, check_in_date, check_out_date, ownerrez_booking_id, platform"
      )
      .eq("id", params.reservationId)
      .single();

    if (resErr || !reservation) {
      return {
        reconciled: false,
        status: "RESERVATION_NOT_FOUND",
        rowsCreated: 0,
        reason: `Reservation ${params.reservationId} not found.`,
        event: null,
      };
    }

    // 2. Cancelled reservation check
    if (reservation.reservation_status === "CANCELLED") {
      return {
        reconciled: true,
        status: "CANCELLED_INELIGIBLE",
        rowsCreated: 0,
        reason: `Reservation ${params.reservationId} is cancelled (${reservation.confirmationCode || reservation.confirmation_code}). Ineligible for release.`,
        event: null,
      };
    }

    // 3. Payment status check (unpaid cannot be released)
    const amountReceived = Number(reservation.amount_received || 0);
    const paymentStatus = (reservation.payment_status || "").toUpperCase();
    if (paymentStatus === "UNPAID" || amountReceived <= 0) {
      return {
        reconciled: true,
        status: "UNPAID_INELIGIBLE",
        rowsCreated: 0,
        reason: `Reservation ${params.reservationId} is unpaid (status: ${paymentStatus}, received: $${amountReceived.toFixed(2)}). Ineligible for release.`,
        event: null,
      };
    }

    // 4. Query ledger events to verify payment realization, check existing release, and check disputes
    const { data: ledgerEvents, error: ledErr } = await supabase
      .from("commission_ledger_events")
      .select("*")
      .eq("reservation_id", params.reservationId)
      .order("created_at", { ascending: true });

    if (ledErr) {
      throw new Error(`Failed to query commission ledger: ${ledErr.message}`);
    }

    const events = (ledgerEvents || []) as CommissionLedgerEvent[];

    // Idempotency: check if ELIGIBILITY_RELEASE already exists
    const existingRelease = events.find((e) => e.event_type === "ELIGIBILITY_RELEASE");
    if (existingRelease) {
      return {
        reconciled: true,
        status: "ALREADY_RELEASED",
        rowsCreated: 0,
        reason: `Reservation ${params.reservationId} already has an ELIGIBILITY_RELEASE event (${existingRelease.id}).`,
        event: existingRelease,
      };
    }

    // Check payment realization & net realized commission
    let netRealized = 0;
    let hasPaymentRealized = false;
    let latestDisputeHoldTime: string | null = null;
    let latestDisputeReleaseTime: string | null = null;

    for (const ev of events) {
      const delta = Number(ev.delta_amount || 0);
      if (ev.event_type === "PAYMENT_REALIZED") {
        hasPaymentRealized = true;
        netRealized += delta;
      } else if (ev.event_type === "REFUND_CLAWBACK" || ev.event_type === "MANUAL_ADJUSTMENT") {
        netRealized += delta;
      } else if (ev.event_type === "DISPUTE_HOLD") {
        if (!latestDisputeHoldTime || ev.created_at > latestDisputeHoldTime) {
          latestDisputeHoldTime = ev.created_at;
        }
      } else if (ev.event_type === "DISPUTE_RELEASE") {
        if (!latestDisputeReleaseTime || ev.created_at > latestDisputeReleaseTime) {
          latestDisputeReleaseTime = ev.created_at;
        }
      }
    }

    netRealized = Math.round(netRealized * 100) / 100;

    if (!hasPaymentRealized || netRealized <= 0) {
      return {
        reconciled: true,
        status: "ZERO_NET_REALIZED_INELIGIBLE",
        rowsCreated: 0,
        reason: `Reservation ${params.reservationId} has zero or negative net realized commission ($${netRealized.toFixed(2)}). Ineligible for release.`,
        event: null,
      };
    }

    // Check active disputes
    const isDisputed = Boolean(
      latestDisputeHoldTime &&
        (!latestDisputeReleaseTime || latestDisputeReleaseTime <= latestDisputeHoldTime)
    );
    if (isDisputed) {
      return {
        reconciled: true,
        status: "DISPUTED_INELIGIBLE",
        rowsCreated: 0,
        reason: `Reservation ${params.reservationId} has an active dispute hold. Ineligible for release.`,
        event: null,
      };
    }

    // 5. Query property timezone
    let propertyTimezone = DEFAULT_PROPERTY_TIMEZONE;
    if (reservation.property_id) {
      const { data: prop } = await supabase
        .from("properties")
        .select("timezone")
        .eq("id", reservation.property_id)
        .single();
      if (prop?.timezone) {
        propertyTimezone = prop.timezone;
      }
    }

    // 6. Checkout + Hold Buffer verification
    const checkOutStr = reservation.check_out_date
      ? reservation.check_out_date.split("T")[0]
      : null;

    if (!checkOutStr) {
      return {
        reconciled: false,
        status: "STAY_NOT_COMPLETED",
        rowsCreated: 0,
        reason: `Reservation ${params.reservationId} missing check_out_date.`,
        event: null,
      };
    }

    const releaseTimestamp = computeEligibilityReleaseTimestamp(
      checkOutStr,
      propertyTimezone,
      holdHours
    );

    const isEligibleNow = isStayEligibleForRelease(
      checkOutStr,
      propertyTimezone,
      holdHours,
      now
    );

    if (!isEligibleNow) {
      return {
        reconciled: true,
        status: "STAY_NOT_COMPLETED",
        rowsCreated: 0,
        reason: `Stay checkout + ${holdHours}h hold buffer has not elapsed. Release scheduled for ${releaseTimestamp.toISOString()} (current evaluation: ${now.toISOString()}).`,
        releaseTimeUtc: releaseTimestamp.toISOString(),
        event: null,
      };
    }

    // 7. All requirements met -> create ELIGIBILITY_RELEASE event
    const sourceProvider: "ownerrez" | "hospitable" =
      reservation.platform === "ownerrez" || reservation.ownerrez_booking_id
        ? "ownerrez"
        : "hospitable";

    const createdEvent = await createEligibilityRelease({
      partnerId: reservation.partner_id,
      siteId: reservation.site_id,
      reservationId: reservation.id,
      sourceProvider,
      bookingChannel: reservation.platform || "DIRECT",
      providerBookingId:
        reservation.ownerrez_booking_id?.toString() ||
        reservation.confirmation_code ||
        reservation.id,
      ownerrezBookingId: reservation.ownerrez_booking_id || null,
      metadata: {
        reconciledAt: now.toISOString(),
        releaseTimeUtc: releaseTimestamp.toISOString(),
        propertyTimezone,
        holdHours,
        checkOutDate: checkOutStr,
        netRealizedCommission: netRealized,
      },
      supabaseClient: supabase,
    });

    if (!createdEvent) {
      // Idempotency race: another concurrent process created it
      return {
        reconciled: true,
        status: "ALREADY_RELEASED",
        rowsCreated: 0,
        reason: `Concurrent idempotency conflict: ELIGIBILITY_RELEASE already registered for ${params.reservationId}.`,
        event: null,
      };
    }

    return {
      reconciled: true,
      status: "ELIGIBLE_RELEASED",
      rowsCreated: 1,
      reason: `Stay completed and ${holdHours}h hold elapsed. Created ELIGIBILITY_RELEASE event.`,
      releaseTimeUtc: releaseTimestamp.toISOString(),
      event: createdEvent,
    };
  } catch (err: any) {
    return {
      reconciled: false,
      status: "ERROR",
      rowsCreated: 0,
      reason: "Unexpected exception during eligibility reconciliation.",
      error: err?.message || String(err),
      event: null,
    };
  }
}

/**
 * Scans candidate completed stays and automatically reconciles ELIGIBILITY_RELEASE events.
 */
export async function processCompletedStaysEligibility(options?: {
  partnerId?: string;
  holdHours?: number;
  now?: Date;
  limit?: number;
  supabaseClient?: any;
}): Promise<BatchEligibilityResult> {
  const supabase = options?.supabaseClient || createAdminClient();
  const holdHours = options?.holdHours ?? DEFAULT_POST_STAY_HOLD_HOURS;
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 200;

  // Query reservations that could potentially be eligible
  let query = supabase
    .from("reservations")
    .select("id, confirmation_code, reservation_status, payment_status")
    .neq("reservation_status", "CANCELLED");

  if (options?.partnerId) {
    query = query.eq("partner_id", options.partnerId);
  }

  const { data: candidates, error: cErr } = await query
    .order("check_out_date", { ascending: true })
    .limit(limit);
  if (cErr) {
    throw new Error(`Failed to query reservations for eligibility scan: ${cErr.message}`);
  }

  const result: BatchEligibilityResult = {
    totalScanned: (candidates || []).length,
    eligibleReleased: 0,
    alreadyReleased: 0,
    skippedUnpaid: 0,
    skippedFuture: 0,
    skippedCancelled: 0,
    skippedDisputed: 0,
    errors: 0,
    results: [],
  };

  for (const c of candidates || []) {
    const outcome = await reconcileReservationEligibilityRelease({
      reservationId: c.id,
      holdHours,
      now,
      supabaseClient: supabase,
    });

    result.results.push({
      reservationId: c.id,
      confirmationCode: c.confirmation_code,
      status: outcome.status,
      rowsCreated: outcome.rowsCreated,
      reason: outcome.reason,
    });

    switch (outcome.status) {
      case "ELIGIBLE_RELEASED":
        result.eligibleReleased += 1;
        break;
      case "ALREADY_RELEASED":
        result.alreadyReleased += 1;
        break;
      case "UNPAID_INELIGIBLE":
      case "ZERO_NET_REALIZED_INELIGIBLE":
        result.skippedUnpaid += 1;
        break;
      case "STAY_NOT_COMPLETED":
        result.skippedFuture += 1;
        break;
      case "CANCELLED_INELIGIBLE":
        result.skippedCancelled += 1;
        break;
      case "DISPUTED_INELIGIBLE":
        result.skippedDisputed += 1;
        break;
      case "ERROR":
        result.errors += 1;
        break;
    }
  }

  return result;
}
