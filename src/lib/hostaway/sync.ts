/**
 * Hostaway Reservation Synchronization Engine
 * 
 * Orchestrates full import and incremental sync for Hostaway reservations.
 * Financial Invariants:
 * - Historical ledger entries remain immutable.
 * - Existing OwnerRez-produced INITIAL_ACCRUAL events remain OwnerRez historical evidence.
 * - Migrated bookings already in HHH are linked safely; NEVER create a second initial accrual!
 * - New Hostaway bookings create INITIAL_ACCRUAL only when:
 *     1) exact property mapping exists,
 *     2) deterministic referral attribution exists (ATTRIBUTED),
 *     3) reservation is commission-eligible,
 *     4) no accrual already exists.
 * - Preserves existing idempotency key model (`evt_accrual_${reservationId}`).
 * - Uses afterId cursor pagination server-side.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { HostawayReservation, HostawaySyncSummary } from "./types";
import { normalizeHostawayReservation, normalizeHostawayPaymentStatus, NormalizedHostawayReservation } from "./normalizers";
import { resolveHostawayProperty } from "./properties";
import { resolveHostawayAttribution } from "./attribution";
import { applyGuestFirstTouchAttribution } from "./guest-attribution";
import { matchHostawayReservationToExisting } from "./deduplication";
import { getHostawayReservationsCursor } from "./reservations";
import { appendCommissionLedgerEvent, reconcileReservationPaymentRealization } from "@/lib/commissions/ledger";
import { resolveCommissionRule } from "@/lib/ownerrez/commission-preview";
import { Reservation } from "@/lib/db/schema";
import { mergeStripePayment, tryFetchStripeTallies } from "@/lib/stripe/reconcile-payments";
import { getPaymentMatchMode } from "@/lib/stripe/charge-id-payments";
import { PaymentLookup, loadPriorPaymentStates, lookupPaymentForBooking, prefetchPaymentLookups } from "./payment-lookup";
import { getApprovedOfflineTotal, recordOfflinePayments } from "@/lib/payments/offline-payments";
import type { StripeTally } from "@/lib/stripe/payment-verification";
import { isHostawayIngestionEnabled, isHostawayCommissionAttributionEnabled } from "@/lib/config/pms-mode";

export interface SingleHostawaySyncResult {
  hostawayReservationId: number;
  reservationId?: string;
  status: "INSERTED" | "UPDATED" | "UNCHANGED" | "LINKED_LEGACY" | "SKIPPED_UNMAPPED" | "REVIEW_REQUIRED" | "ERROR";
  attributionTier: "ATTRIBUTED" | "REVIEW_REQUIRED" | "UNATTRIBUTED";
  accrualStatus?: string;
  reconciliationStatus?: string;
  error?: string;
}

/** Commission on a Hostaway booking: contracted rent (gross minus cleaning, service fee and taxes) x the rule. */
export function computeHostawayCommission(
  amounts: { grossAmount: number; cleaningFee: number; serviceFee: number; taxesAmount: number },
  rule: { rule_type: string; percentage?: number | null; fixed_amount?: number | null }
): { contractedRent: number; calculatedCommission: number } {
  const contractedRent = Math.max(0, amounts.grossAmount - amounts.cleaningFee - amounts.serviceFee - amounts.taxesAmount);
  let calculatedCommission = 0;
  if (rule.rule_type === "percentage" && rule.percentage != null) {
    calculatedCommission = Math.round(contractedRent * (Number(rule.percentage) / 100) * 100) / 100;
  } else if (rule.rule_type === "fixed" && rule.fixed_amount != null) {
    calculatedCommission = Number(rule.fixed_amount);
  }
  return { contractedRent, calculatedCommission };
}

/**
 * Creates an INITIAL_ACCRUAL event for genuinely new Hostaway reservations.
 */
export async function executeHostawayInitialAccrual(params: {
  reservationId: string;
  hostawayBookingId: number;
  booking: HostawayReservation;
  normalized: NormalizedHostawayReservation;
  resolvedPartnerId: string;
  resolvedSiteId: string;
  bookingChannel: string;
  attributionSignals?: string[];
  supabaseClient?: any;
}): Promise<{ status: string; calculatedCommission: number }> {
  const supabase = params.supabaseClient || createAdminClient();

  // Guard: Check for existing historical accrual
  const { data: existingAccruals } = await supabase
    .from("commission_ledger_events")
    .select("id, calculated_commission, idempotency_key")
    .eq("reservation_id", params.reservationId)
    .eq("event_type", "INITIAL_ACCRUAL");

  if (existingAccruals && existingAccruals.length > 0) {
    return {
      status: "ALREADY_ACCRUED",
      calculatedCommission: Number(existingAccruals[0].calculated_commission || 0),
    };
  }

  // Resolve applicable commission rule
  const ruleRes = await resolveCommissionRule(
    params.resolvedPartnerId,
    params.resolvedSiteId,
    supabase
  );

  if (!ruleRes.rule) {
    return { status: "NO_ACTIVE_RULE", calculatedCommission: 0 };
  }

  const rule = ruleRes.rule;
  const { contractedRent, calculatedCommission } = computeHostawayCommission(params.normalized, rule);

  if (calculatedCommission <= 0) {
    return { status: "CALCULATION_ZERO", calculatedCommission: 0 };
  }

  const idempotencyKey = `evt_accrual_${params.reservationId}`;

  await appendCommissionLedgerEvent({
    partnerId: params.resolvedPartnerId,
    siteId: params.resolvedSiteId,
    reservationId: params.reservationId,
    commissionRuleId: rule.id,
    sourceProvider: "hostaway" as any,
    bookingChannel: params.bookingChannel,
    providerBookingId: String(params.hostawayBookingId),
    eventType: "INITIAL_ACCRUAL",
    deltaAmount: 0.0,
    calculatedCommission,
    idempotencyKey,
    metadata: {
      rule_id: rule.id,
      rule_type: rule.rule_type,
      percentage: rule.percentage,
      contracted_base: contractedRent,
      gross_amount: params.normalized.grossAmount,
      cleaning_fee: params.normalized.cleaningFee,
      service_fee: params.normalized.serviceFee,
      taxes_amount: params.normalized.taxesAmount,
      ingestion_source: "hostaway_sync",
      attribution_signals: params.attributionSignals ?? [],
    },
    supabaseClient: supabase,
  });

  return { status: "ACCRUAL_CREATED", calculatedCommission };
}

/** Columns the cross-provider dedup needs; selecting `*` would drag every raw provider payload along. */
const DEDUP_COLUMNS =
  "id, confirmation_code, property_id, partner_id, site_id, check_in_date, check_out_date, gross_amount, amount_received, reservation_status, payment_status, payment_confirmation_source, ownerrez_booking_id, hostaway_reservation_id";

/** Existing reservations for dedup: one property, or every property when propertyId is omitted (batch cache). */
async function loadExistingReservations(supabase: any, propertyId?: string): Promise<Reservation[]> {
  let q = supabase.from("reservations").select(DEDUP_COLUMNS);
  if (propertyId) q = q.eq("property_id", propertyId);
  const { data: rows } = await q;
  return (rows || []).map((r: any) => ({
    id: r.id,
    confirmationCode: r.confirmation_code,
    propertyId: r.property_id,
    partnerId: r.partner_id || undefined,
    siteId: r.site_id || undefined,
    checkInDate: r.check_in_date,
    checkOutDate: r.check_out_date,
    grossAmount: Number(r.gross_amount || 0),
    amountReceived: Number(r.amount_received || 0),
    reservationStatus: r.reservation_status,
    paymentStatus: r.payment_status,
    sourceProvider: r.payment_confirmation_source?.toLowerCase() || (r.ownerrez_booking_id ? "ownerrez" : "hostaway"),
    hostawayReservationId: r.hostaway_reservation_id,
  })) as Reservation[];
}

/**
 * Synchronize a single Hostaway reservation.
 */
export async function syncSingleHostawayReservation(
  booking: HostawayReservation,
  supabaseClient?: any,
  cachedReservations?: Reservation[],
  stripeTallies?: Map<string, StripeTally>,
  paymentOptions?: {
    lookup?: PaymentLookup;
    forcePaymentRefresh?: boolean;
    /** Per-run memo of listingMapId -> property resolution (avoids one DB lookup per booking). */
    propertyCache?: Map<number, Awaited<ReturnType<typeof resolveHostawayProperty>>>;
  }
): Promise<SingleHostawaySyncResult> {
  const supabase = supabaseClient || createAdminClient();
  const normalized = normalizeHostawayReservation(booking);

  // Hostaway reports Stripe-collected guest payments as unpaid; Stripe is the source of truth for money received.
  // LEGACY (PAYMENT_MATCH_MODE=description): tallies come from the Stripe charge list matched by description text.
  // Default (charge_id): Hostaway's charges are read and each Stripe charge id is confirmed (see payment-lookup.ts).
  const legacyTallies =
    getPaymentMatchMode() === "description" ? (stripeTallies ?? (await tryFetchStripeTallies())) : undefined;
  const payment: PaymentLookup =
    paymentOptions?.lookup ??
    (await lookupPaymentForBooking({
      booking,
      prior: (await loadPriorPaymentStates(supabase, [booking.id])).get(booking.id),
      force: paymentOptions?.forcePaymentRefresh,
      legacyTallies,
    }));
  // Unchanged since last sync, or the lookup failed: keep what is stored instead of overwriting it with Hostaway's
  // own (empty) paid figures.
  const keepStoredPayment = payment.kind === "unchanged" || payment.failed;
  // If the lookup failed, blank the stored updatedOn so the next sync sees "changed" and checks payments again.
  const rawForStorage =
    payment.kind === "details" && payment.failed ? { ...normalized.rawHostawayData, updatedOn: null } : normalized.rawHostawayData;
  const tally = payment.kind === "details" ? payment.tally : undefined;
  const offlineCharges = payment.kind === "details" ? payment.offlineCharges : [];
  const merged = mergeStripePayment(tally, normalized.grossAmount, {
    amountReceived: normalized.amountReceived,
    paymentStatus: normalized.paymentStatus,
  });
  if (merged) {
    normalized.amountReceived = merged.amountReceived;
    normalized.paymentStatus = merged.paymentStatus;
  }

  // 1. Resolve Property
  let propRes = paymentOptions?.propertyCache?.get(normalized.listingMapId);
  if (!propRes) {
    propRes = await resolveHostawayProperty(normalized.listingMapId, supabase);
    if (propRes.status === "EXACT_MATCH") paymentOptions?.propertyCache?.set(normalized.listingMapId, propRes);
  }
  if (propRes.status !== "EXACT_MATCH" || !propRes.propertyId) {
    return {
      hostawayReservationId: normalized.hostawayReservationId,
      status: "SKIPPED_UNMAPPED",
      attributionTier: "UNATTRIBUTED",
      error: `Listing ${normalized.listingMapId} could not be deterministically mapped to an active HHH property.`,
    };
  }

  const hhhPropertyId = propRes.propertyId;

  // 2. Resolve Attribution
  // The guest's first partner-attributed booking decides every later booking by the same email.
  const attrRes = await applyGuestFirstTouchAttribution(
    await resolveHostawayAttribution(booking, supabase),
    normalized.guestEmail,
    supabase
  );

  // 3. Fetch existing reservations if not provided in batch
  const existingReservations = cachedReservations ?? (await loadExistingReservations(supabase, hhhPropertyId));

  // 4. Cross-Provider Deduplication Check
  const matchResult = matchHostawayReservationToExisting(
    normalized,
    hhhPropertyId,
    existingReservations
  );

  const dbAttributionStatus =
    attrRes.attributionTier === "ATTRIBUTED"
      ? "automatic"
      : attrRes.attributionTier === "REVIEW_REQUIRED"
      ? "pending"
      : "unattributed";

  // CASE A1: Potential match with legacy booking without explicit confirmation code
  if (matchResult.status === "POTENTIAL_MATCH_REVIEW_REQUIRED") {
    return {
      hostawayReservationId: normalized.hostawayReservationId,
      status: "REVIEW_REQUIRED",
      attributionTier: "REVIEW_REQUIRED",
      accrualStatus: "POTENTIAL_MATCH_REVIEW_REQUIRED",
      error: `Potential match with legacy reservation ${matchResult.matchedReservationId} (${matchResult.reason}). Automatic merge prevented.`,
    };
  }

  // A row that already carries this Hostaway reservation id is a Hostaway-origin row, not a legacy one:
  // it must go through CASE B (full update) so status, payment and cancellation changes apply.
  const matchedExisting = existingReservations.find(r => r.id === matchResult.matchedReservationId);
  const isDirectHostawayRow =
    matchedExisting?.hostawayReservationId != null &&
    Number(matchedExisting.hostawayReservationId) === Number(normalized.hostawayReservationId);

  // CASE A2: Matches existing legacy booking -> LINK ONLY (NO duplicate initial accrual)
  if (matchResult.status === "SAME_BOOKING_CONFIRMED" && matchResult.matchedReservationId && !isDirectHostawayRow) {
    const existingId = matchResult.matchedReservationId;

    // Safely update Hostaway metadata on existing reservation without overwriting legacy provider ID
    await supabase
      .from("reservations")
      .update({
        hostaway_reservation_id: normalized.hostawayReservationId,
        raw_hostaway_data: normalized.rawHostawayData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingId);

    return {
      hostawayReservationId: normalized.hostawayReservationId,
      reservationId: existingId,
      status: "LINKED_LEGACY",
      attributionTier: attrRes.attributionTier,
      accrualStatus: "PRESERVED_HISTORICAL_EVIDENCE",
    };
  }

  // CASE B: Already exists by hostaway_reservation_id
  const { data: existingHostawayRow } = await supabase
    .from("reservations")
    .select("id, hostaway_reservation_id, gross_amount, amount_received, reservation_status, payment_status, site_id, partner_id")
    .eq("hostaway_reservation_id", normalized.hostawayReservationId)
    .maybeSingle();

  if (existingHostawayRow) {
    // Approved offline payments count as received on top of Stripe-verified money, so a sync never wipes them out.
    let amountReceivedForUpdate = normalized.amountReceived;
    let paymentStatusForUpdate = normalized.paymentStatus;
    if (!keepStoredPayment) {
      const approvedOffline = await getApprovedOfflineTotal(supabase, existingHostawayRow.id);
      if (approvedOffline > 0) {
        amountReceivedForUpdate = Math.round((normalized.amountReceived + approvedOffline) * 100) / 100;
        paymentStatusForUpdate = normalizeHostawayPaymentStatus(normalized.grossAmount, amountReceivedForUpdate);
      }
    }

    // Backfill attribution only when the row has none yet; never overwrite an existing attribution.
    const attributionBackfill =
      !existingHostawayRow.site_id && attrRes.attributionTier === "ATTRIBUTED" && attrRes.siteId
        ? { site_id: attrRes.siteId, partner_id: attrRes.partnerId || null, attribution_status: dbAttributionStatus }
        : {};

    // Update existing Hostaway row
    await supabase
      .from("reservations")
      .update({
        ...attributionBackfill,
        reservation_status: normalized.reservationStatus,
        ...(keepStoredPayment ? {} : { payment_status: paymentStatusForUpdate }),
        check_in_date: normalized.checkInDate,
        check_out_date: normalized.checkOutDate,
        guest_name: normalized.guestName,
        guest_email: normalized.guestEmail,
        gross_amount: normalized.grossAmount,
        ...(keepStoredPayment ? {} : { amount_received: amountReceivedForUpdate }),
        cleaning_fee: normalized.cleaningFee,
        service_fee: normalized.serviceFee,
        taxes_amount: normalized.taxesAmount,
        nights: normalized.nights,
        guests: normalized.guests,
        raw_hostaway_data: rawForStorage,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingHostawayRow.id);

    if (normalized.reservationStatus !== "CANCELLED" && payment.kind === "details") {
      await recordOfflinePayments({ supabase, reservationId: existingHostawayRow.id, hostawayReservationId: normalized.hostawayReservationId, charges: offlineCharges });
    }

    // Reconcile payment realization if CANCELLED or PAID
    let reconciliationStatus: string | undefined;
    if (!isHostawayCommissionAttributionEnabled()) {
      reconciliationStatus = "COMMISSION_ATTRIBUTION_DISABLED_PENDING_LIVE_PROOF";
    } else if (normalized.reservationStatus === "CANCELLED") {
      try {
        const recon = await reconcileReservationPaymentRealization({
          reservationId: existingHostawayRow.id,
          sourceProvider: "hostaway" as any,
          supabaseClient: supabase,
        });
        reconciliationStatus = recon.status;
      } catch (err: any) {
        reconciliationStatus = `ERROR: ${err?.message}`;
      }
    } else if ((keepStoredPayment ? existingHostawayRow.payment_status : paymentStatusForUpdate) === "PAID") {
      try {
        const recon = await reconcileReservationPaymentRealization({
          reservationId: existingHostawayRow.id,
          sourceProvider: "hostaway" as any,
          supabaseClient: supabase,
        });
        reconciliationStatus = recon.status;
      } catch (err: any) {
        reconciliationStatus = `ERROR: ${err?.message}`;
      }
    }

    return {
      hostawayReservationId: normalized.hostawayReservationId,
      reservationId: existingHostawayRow.id,
      status: "UPDATED",
      attributionTier: attrRes.attributionTier,
      reconciliationStatus,
    };
  }

  // CASE C: Genuinely new Hostaway reservation
  const insertPayload = {
    hostaway_reservation_id: normalized.hostawayReservationId,
    property_id: hhhPropertyId,
    site_id: attrRes.siteId || null,
    partner_id: attrRes.partnerId || null,
    confirmation_code: normalized.confirmationCode,
    guest_name: normalized.guestName,
    guest_email: normalized.guestEmail,
    booking_date: normalized.bookingDate,
    check_in_date: normalized.checkInDate,
    check_out_date: normalized.checkOutDate,
    nights: normalized.nights,
    guests: normalized.guests,
    reservation_status: normalized.reservationStatus,
    payment_status: normalized.paymentStatus,
    gross_amount: normalized.grossAmount,
    amount_received: normalized.amountReceived,
    cleaning_fee: normalized.cleaningFee,
    service_fee: normalized.serviceFee,
    taxes_amount: normalized.taxesAmount,
    currency: normalized.currency,
    platform: normalized.platform,
    payment_confirmation_source: "HOSTAWAY",
    attribution_status: dbAttributionStatus,
    raw_hostaway_data: rawForStorage,
    last_synced_at: new Date().toISOString(),
  };

  const { data: insertedRow, error: insErr } = await supabase
    .from("reservations")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insErr || !insertedRow) {
    throw new Error(`Failed to insert Hostaway reservation: ${insErr?.message}`);
  }

  const reservationId = insertedRow.id;

  if (normalized.reservationStatus !== "CANCELLED" && payment.kind === "details") {
    await recordOfflinePayments({ supabase, reservationId, hostawayReservationId: normalized.hostawayReservationId, charges: offlineCharges });
  }

  // Financial Accrual: Only if not cancelled AND deterministically attributed AND commission attribution is enabled
  let accrualStatus = "NOT_ATTRIBUTED";
  const isCommissionEnabled = isHostawayCommissionAttributionEnabled();

  if (normalized.reservationStatus === "CANCELLED") {
    accrualStatus = "CANCELLED_ZERO_ACCRUAL";
  } else if (!isCommissionEnabled) {
    accrualStatus = "COMMISSION_ATTRIBUTION_DISABLED_PENDING_LIVE_PROOF";
  } else if (attrRes.attributionTier === "ATTRIBUTED" && attrRes.partnerId && attrRes.siteId) {
    const accrualRes = await executeHostawayInitialAccrual({
      reservationId,
      hostawayBookingId: normalized.hostawayReservationId,
      booking,
      normalized,
      resolvedPartnerId: attrRes.partnerId,
      resolvedSiteId: attrRes.siteId,
      bookingChannel: normalized.platform,
      attributionSignals: attrRes.matchedSignals,
      supabaseClient: supabase,
    });
    accrualStatus = accrualRes.status;
  }

  // Payment Realization: Fail closed if CANCELLED; reconcile if PAID and commission enabled
  let reconciliationStatus: string | undefined;
  if (normalized.reservationStatus === "CANCELLED") {
    reconciliationStatus = "CANCELLED_REVIEW_REQUIRED";
  } else if (isCommissionEnabled && normalized.paymentStatus === "PAID" && attrRes.attributionTier === "ATTRIBUTED") {
    try {
      const recon = await reconcileReservationPaymentRealization({
        reservationId,
        sourceProvider: "hostaway" as any,
        supabaseClient: supabase,
      });
      reconciliationStatus = recon.status;
    } catch (err: any) {
      reconciliationStatus = `ERROR: ${err?.message}`;
    }
  }

  return {
    hostawayReservationId: normalized.hostawayReservationId,
    reservationId,
    status: "INSERTED",
    attributionTier: attrRes.attributionTier,
    accrualStatus,
    reconciliationStatus,
  };
}

/**
 * Executes a full or incremental cursor-based synchronization of Hostaway reservations.
 */
export interface HostawaySyncOptions {
  maxPages?: number;
  limitPerPage?: number;
  startingAfterId?: number;
  fromDate?: string;
  toDate?: string;
  maxReconciliationPasses?: number;
  skipReconciliation?: boolean;
  /** Re-check payments for every booking, even those Hostaway reports as unchanged since the last sync. */
  forcePaymentRefresh?: boolean;
}

/**
 * Executes a deterministic bounded cursor-based synchronization of Hostaway reservations:
 * 1. Verifies HOSTAWAY_INGESTION_ENABLED (fail-closed)
 * 2. Captures syncStartTime
 * 3. Performs complete cursor traversal using Hostaway supported parameters:
 *    limit=100, sortOrder=updatedOn, afterId=<last reservation id>, includeResources=1, includePayments=1
 * 4. Idempotently processes all reservation webhook events received during traversal
 * 5. Performs a second reconciliation traversal using sortOrder=updatedOn
 * 6. Compares reservation ID + authoritative updatedOn to catch any records shifted or updated during pass 1
 * 7. Repeats reconciliation if necessary until a stable pass produces no unseen/newer reservation states
 * 8. Persists the resulting synchronization checkpoint
 */
export async function syncHostawayReservationsBatch(
  options: HostawaySyncOptions = {},
  supabaseClient?: any
): Promise<HostawaySyncSummary> {
  const maxPages = options.maxPages || 20;
  const limit = options.limitPerPage || 100;

  let cursor = options.startingAfterId || 0;
  const usedCursors = new Set<number>(cursor ? [cursor] : []);
  const propertyCache = new Map<number, Awaited<ReturnType<typeof resolveHostawayProperty>>>();
  let page = 0;
  let hasMore = true;

  const summary: HostawaySyncSummary = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    duplicates: 0,
    failed: 0,
    attributed: 0,
    unattributed: 0,
    reviewRequired: 0,
    sameBookingLinked: 0,
    hostawayOnlyInserted: 0,
    cursorAfterId: cursor,
    errors: [],
    timestamp: new Date().toISOString(),
    success: true,
  };

  // Step 1: Guard on operational ingestion flag
  if (!isHostawayIngestionEnabled()) {
    summary.success = false;
    summary.errors.push("HOSTAWAY_INGESTION_DISABLED: Live Hostaway ingestion is currently disabled (HOSTAWAY_INGESTION_ENABLED=false).");
    return summary;
  }

  const supabase = supabaseClient || createAdminClient();

  // Stripe holds the real guest payments; fetch once per run and share across every reservation.
  // Only the legacy matcher needs the whole Stripe charge list up front; charge_id mode looks up per reservation.
  const stripeTallies = getPaymentMatchMode() === "description" ? await tryFetchStripeTallies() : undefined;

  // Step 2: Capture sync-start timestamp for deterministic tracking
  const syncStartTime = new Date().toISOString();

  // Map to track processed reservation states: reservationId -> authoritative updatedOn
  const processedReservationStates = new Map<number, string>();

  // Step 3: Complete cursor traversal using sortOrder=updatedOn
  while (hasMore && page < maxPages) {
    page += 1;
    const pageResult = await getHostawayReservationsCursor({
      limit,
      afterId: cursor > 0 ? cursor : undefined,
      fromDate: options.fromDate,
      toDate: options.toDate,
    });

    summary.fetched += pageResult.totalFetched;

    // Payment lookups (slow: Hostaway + Stripe calls) run a few at a time; the booking writes below stay sequential
    // because guest first-touch attribution depends on processing order.
    // Loaded once per page instead of once per booking (the per-booking `select *` was the slowest step).
    const existingCache = await loadExistingReservations(supabase);

    const paymentLookups = await prefetchPaymentLookups(supabase, pageResult.reservations, {
      force: options.forcePaymentRefresh,
      legacyTallies: stripeTallies,
    });

    for (const booking of pageResult.reservations) {
      try {
        const stateMarker = String(booking.updatedOn || booking.insertedOn || "");
        processedReservationStates.set(booking.id, stateMarker);

        const res = await syncSingleHostawayReservation(booking, supabase, existingCache, stripeTallies, {
          lookup: paymentLookups.get(booking.id),
          forcePaymentRefresh: options.forcePaymentRefresh,
          propertyCache,
        });
        if (res.status === "INSERTED") {
          summary.inserted += 1;
          summary.hostawayOnlyInserted += 1;
        } else if (res.status === "UPDATED") {
          summary.updated += 1;
        } else if (res.status === "LINKED_LEGACY") {
          summary.sameBookingLinked += 1;
        } else if (res.status === "UNCHANGED") {
          summary.unchanged += 1;
        } else if (res.status === "SKIPPED_UNMAPPED") {
          summary.failed += 1;
        }

        if (res.attributionTier === "ATTRIBUTED") {
          summary.attributed += 1;
        } else if (res.attributionTier === "REVIEW_REQUIRED") {
          summary.reviewRequired += 1;
        } else {
          summary.unattributed += 1;
        }
      } catch (err: any) {
        summary.failed += 1;
        summary.errors.push(`Booking ${booking.id}: ${err?.message}`);
      }
    }

    // Hostaway returns reservations in its own order, NOT ascending by id, so the next cursor is often lower than
    // the current one. Stop only when there is no next page, no progress, or a cursor we already used (a loop).
    if (!pageResult.hasMore || !pageResult.nextAfterId || pageResult.nextAfterId === cursor || usedCursors.has(pageResult.nextAfterId)) {
      hasMore = false;
    } else {
      cursor = pageResult.nextAfterId;
      usedCursors.add(cursor);
      summary.cursorAfterId = cursor;
    }

    // Step 4: Durable progress checkpoint after each page
    try {
      await supabase.from("integration_idempotency_logs").upsert({
        provider: "HOSTAWAY",
        event_id: `hostaway_sync_page_${page}`,
        event_type: "CHECKPOINT_PAGE",
        status: "PROCESSED",
        processed_at: new Date().toISOString(),
      }, { onConflict: "provider,event_id" });
    } catch {
      // Non-fatal
    }
  }

  // Step 5 & 6 & 7: Second Reconciliation Traversal comparing reservation ID + authoritative updatedOn
  // Repeats until convergence (stable pass produces no unseen/newer reservation states)
  let convergenceStatus: "SYNC_CONVERGED" | "SYNC_RECONCILIATION_INCOMPLETE" = "SYNC_CONVERGED";

  if (!options.skipReconciliation) {
    let reconPass = 0;
    const maxReconPasses = options.maxReconciliationPasses || 2;
    let passHasChanges = true;

    while (passHasChanges && reconPass < maxReconPasses) {
      reconPass += 1;
      passHasChanges = false;
      let reconCursor = 0;
      const reconUsedCursors = new Set<number>();
      let reconHasMore = true;
      let reconPage = 0;

      while (reconHasMore && reconPage < maxPages) {
        reconPage += 1;
        const reconResult = await getHostawayReservationsCursor({
          limit,
          afterId: reconCursor > 0 ? reconCursor : undefined,
          fromDate: options.fromDate,
          toDate: options.toDate,
        });

        for (const booking of reconResult.reservations) {
          const currentUpdatedOn = String(booking.updatedOn || booking.insertedOn || "");
          const previousUpdatedOn = processedReservationStates.get(booking.id);

          // If reservation was unseen (shifted during pass 1) or has a newer updatedOn timestamp
          if (previousUpdatedOn === undefined || currentUpdatedOn > previousUpdatedOn) {
            passHasChanges = true;
            processedReservationStates.set(booking.id, currentUpdatedOn);
            try {
              const res = await syncSingleHostawayReservation(booking, supabase, undefined, stripeTallies);
              if (res.status === "INSERTED") {
                summary.inserted += 1;
                summary.hostawayOnlyInserted += 1;
              } else if (res.status === "UPDATED") {
                summary.updated += 1;
              }
            } catch (err: any) {
              summary.errors.push(`Reconciliation booking ${booking.id}: ${err?.message}`);
            }
          }
        }

        if (!reconResult.hasMore || !reconResult.nextAfterId || reconResult.nextAfterId === reconCursor || reconUsedCursors.has(reconResult.nextAfterId)) {
          reconHasMore = false;
        } else {
          reconCursor = reconResult.nextAfterId;
          reconUsedCursors.add(reconCursor);
        }
      }
    }

    if (passHasChanges) {
      // Safety bound reached while changes remain!
      convergenceStatus = "SYNC_RECONCILIATION_INCOMPLETE";
      summary.errors.push(
        "SYNC_RECONCILIATION_INCOMPLETE: Safety limit reached while newer or unseen reservations were still appearing. Checkpoint complete prevented; reconciliation will resume on next cycle."
      );
    } else {
      convergenceStatus = "SYNC_CONVERGED";
    }
  }

  summary.convergenceStatus = convergenceStatus;

  // Step 8: Persist synchronization checkpoint only if converged
  if (convergenceStatus === "SYNC_CONVERGED") {
    try {
      await supabase.from("integration_idempotency_logs").upsert({
        provider: "HOSTAWAY",
        event_id: "hostaway_sync_cursor_checkpoint",
        event_type: "CHECKPOINT_COMPLETE",
        status: "PROCESSED",
        processed_at: new Date().toISOString(),
        payload_hash: syncStartTime,
      }, { onConflict: "provider,event_id" });
    } catch {
      // Non-fatal
    }
  } else {
    // Record partial progress checkpoint without marking complete
    try {
      await supabase.from("integration_idempotency_logs").upsert({
        provider: "HOSTAWAY",
        event_id: "hostaway_sync_cursor_checkpoint_partial",
        event_type: "CHECKPOINT_INCOMPLETE",
        status: "PENDING_RETRY",
        processed_at: new Date().toISOString(),
        payload_hash: syncStartTime,
      }, { onConflict: "provider,event_id" });
    } catch {
      // Non-fatal
    }
  }

  return summary;
}
