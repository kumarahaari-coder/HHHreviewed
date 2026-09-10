import { createAdminClient } from "@/lib/supabase/admin";
import {
  CommissionLedgerEvent,
  CommissionLedgerEventType,
} from "./types";

export interface AppendLedgerEventParams {
  partnerId: string;
  siteId?: string | null;
  reservationId: string;
  commissionRuleId?: string | null;
  sourceProvider: "ownerrez" | "hospitable";
  bookingChannel: string;
  providerBookingId: string;
  ownerrezBookingId?: number | null;
  eventType: CommissionLedgerEventType;
  deltaAmount: number;
  calculatedCommission?: number;
  adjustmentReason?: string | null;
  createdBy?: string | null;
  approvedBy?: string | null;
  payoutBatchId?: string | null;
  payoutItemId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

/**
 * Validates maker-checker constraints for MANUAL_ADJUSTMENT.
 */
export function validateManualAdjustmentParams(params: {
  eventType: CommissionLedgerEventType;
  adjustmentReason?: string | null;
  createdBy?: string | null;
  approvedBy?: string | null;
}): void {
  if (params.eventType === "MANUAL_ADJUSTMENT") {
    if (!params.adjustmentReason || params.adjustmentReason.trim() === "") {
      throw new Error("MANUAL_ADJUSTMENT requires a non-empty adjustmentReason.");
    }
    if (!params.createdBy) {
      throw new Error("MANUAL_ADJUSTMENT requires createdBy admin user ID.");
    }
    if (!params.approvedBy) {
      throw new Error("MANUAL_ADJUSTMENT requires approvedBy super admin user ID.");
    }
    if (params.createdBy === params.approvedBy) {
      throw new Error("MANUAL_ADJUSTMENT maker-checker violation: approvedBy cannot be the same as createdBy.");
    }
  }
}

/**
 * Validates payout settlement exclusivity.
 */
export function validatePayoutSettlementParams(params: {
  eventType: CommissionLedgerEventType;
  payoutItemId?: string | null;
}): void {
  if (params.eventType === "PAYOUT_SETTLEMENT" && !params.payoutItemId) {
    throw new Error("PAYOUT_SETTLEMENT requires a valid payoutItemId.");
  }
  if (params.eventType !== "PAYOUT_SETTLEMENT" && params.payoutItemId) {
    throw new Error("Non-PAYOUT_SETTLEMENT events must not specify payoutItemId.");
  }
}

/**
 * Appends a verified event to public.commission_ledger_events.
 * Returns the created event or null if the event was already recorded (idempotent no-op).
 */
export async function appendCommissionLedgerEvent(
  params: AppendLedgerEventParams
): Promise<CommissionLedgerEvent | null> {
  validateManualAdjustmentParams(params);
  validatePayoutSettlementParams(params);

  const supabase = createAdminClient();

  const insertPayload = {
    partner_id: params.partnerId,
    site_id: params.siteId || null,
    reservation_id: params.reservationId,
    commission_rule_id: params.commissionRuleId || null,
    source_provider: params.sourceProvider,
    booking_channel: params.bookingChannel,
    provider_booking_id: params.providerBookingId,
    ownerrez_booking_id: params.ownerrezBookingId || null,
    event_type: params.eventType,
    delta_amount: Math.round(params.deltaAmount * 100) / 100,
    calculated_commission: Math.round((params.calculatedCommission ?? 0) * 100) / 100,
    adjustment_reason: params.adjustmentReason || null,
    created_by: params.createdBy || null,
    approved_by: params.approvedBy || null,
    payout_batch_id: params.payoutBatchId || null,
    payout_item_id: params.payoutItemId || null,
    currency: "USD",
    idempotency_key: params.idempotencyKey,
    metadata: params.metadata || {},
  };

  const { data, error } = await supabase
    .from("commission_ledger_events")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    // Check for unique key collision on idempotency_key or uq_ledger_payout_settlement_item
    if (error.code === "23505") {
      // Idempotent duplicate: fetch existing event
      const { data: existing } = await supabase
        .from("commission_ledger_events")
        .select("*")
        .eq("idempotency_key", params.idempotencyKey)
        .maybeSingle();

      return (existing as CommissionLedgerEvent) || null;
    }
    throw new Error(`Failed to append commission ledger event: ${error.message}`);
  }

  return data as CommissionLedgerEvent;
}

/**
 * Creates an INITIAL_ACCRUAL event (non-financial forecast, delta = 0.00).
 */
export async function createInitialAccrual(params: {
  partnerId: string;
  siteId?: string | null;
  reservationId: string;
  commissionRuleId?: string | null;
  sourceProvider: "ownerrez" | "hospitable";
  bookingChannel: string;
  providerBookingId: string;
  ownerrezBookingId?: number | null;
  calculatedCommission: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}): Promise<CommissionLedgerEvent | null> {
  const defaultKey = params.commissionRuleId
    ? `evt_accrual_${params.reservationId}_${params.commissionRuleId}`
    : `evt_accrual_${params.reservationId}`;

  return appendCommissionLedgerEvent({
    partnerId: params.partnerId,
    siteId: params.siteId,
    reservationId: params.reservationId,
    commissionRuleId: params.commissionRuleId,
    sourceProvider: params.sourceProvider,
    bookingChannel: params.bookingChannel,
    providerBookingId: params.providerBookingId,
    ownerrezBookingId: params.ownerrezBookingId,
    eventType: "INITIAL_ACCRUAL",
    deltaAmount: 0.00, // Strictly non-financial
    calculatedCommission: params.calculatedCommission,
    idempotencyKey: params.idempotencyKey ?? defaultKey,
    metadata: params.metadata,
  });
}

/**
 * Creates a conservative PAYMENT_REALIZED event when booking is 100% collected.
 * (Partial payments produce $0.00 realized and do not call this).
 */
export async function createPaymentRealized(params: {
  partnerId: string;
  siteId?: string | null;
  reservationId: string;
  commissionRuleId?: string | null;
  sourceProvider: "ownerrez" | "hospitable";
  bookingChannel: string;
  providerBookingId: string;
  ownerrezBookingId?: number | null;
  commissionAmount: number;
  metadata?: Record<string, unknown>;
}): Promise<CommissionLedgerEvent | null> {
  if (params.commissionAmount <= 0) {
    throw new Error("Payment realization amount must be greater than zero.");
  }
  return appendCommissionLedgerEvent({
    partnerId: params.partnerId,
    siteId: params.siteId,
    reservationId: params.reservationId,
    commissionRuleId: params.commissionRuleId,
    sourceProvider: params.sourceProvider,
    bookingChannel: params.bookingChannel,
    providerBookingId: params.providerBookingId,
    ownerrezBookingId: params.ownerrezBookingId,
    eventType: "PAYMENT_REALIZED",
    deltaAmount: params.commissionAmount,
    calculatedCommission: params.commissionAmount,
    idempotencyKey: `evt_realized_${params.reservationId}_full`,
    metadata: params.metadata,
  });
}

/**
 * Creates a REFUND_CLAWBACK event (negative delta).
 */
export async function createRefundClawback(params: {
  partnerId: string;
  siteId?: string | null;
  reservationId: string;
  commissionRuleId?: string | null;
  sourceProvider: "ownerrez" | "hospitable";
  bookingChannel: string;
  providerBookingId: string;
  ownerrezBookingId?: number | null;
  clawbackAmount: number; // positive number, converted to negative delta
  refundReferenceId: string;
  metadata?: Record<string, unknown>;
}): Promise<CommissionLedgerEvent | null> {
  const positiveAmount = Math.abs(params.clawbackAmount);
  if (positiveAmount <= 0) {
    throw new Error("Clawback amount must be greater than zero.");
  }
  return appendCommissionLedgerEvent({
    partnerId: params.partnerId,
    siteId: params.siteId,
    reservationId: params.reservationId,
    commissionRuleId: params.commissionRuleId,
    sourceProvider: params.sourceProvider,
    bookingChannel: params.bookingChannel,
    providerBookingId: params.providerBookingId,
    ownerrezBookingId: params.ownerrezBookingId,
    eventType: "REFUND_CLAWBACK",
    deltaAmount: -positiveAmount,
    calculatedCommission: 0.00,
    idempotencyKey: `evt_clawback_${params.reservationId}_${params.refundReferenceId}`,
    metadata: params.metadata,
  });
}

/**
 * Creates an ELIGIBILITY_RELEASE event once the stay is completed and hold buffer elapsed.
 */
export async function createEligibilityRelease(params: {
  partnerId: string;
  siteId?: string | null;
  reservationId: string;
  sourceProvider: "ownerrez" | "hospitable";
  bookingChannel: string;
  providerBookingId: string;
  ownerrezBookingId?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<CommissionLedgerEvent | null> {
  return appendCommissionLedgerEvent({
    partnerId: params.partnerId,
    siteId: params.siteId,
    reservationId: params.reservationId,
    sourceProvider: params.sourceProvider,
    bookingChannel: params.bookingChannel,
    providerBookingId: params.providerBookingId,
    ownerrezBookingId: params.ownerrezBookingId,
    eventType: "ELIGIBILITY_RELEASE",
    deltaAmount: 0.00,
    calculatedCommission: 0.00,
    idempotencyKey: `evt_release_${params.reservationId}`,
    metadata: params.metadata,
  });
}

/**
 * Creates a DISPUTE_HOLD event (blocks payout eligibility without altering balance).
 */
export async function createDisputeHold(params: {
  partnerId: string;
  siteId?: string | null;
  reservationId: string;
  sourceProvider: "ownerrez" | "hospitable";
  bookingChannel: string;
  providerBookingId: string;
  disputeId: string;
  reason: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}): Promise<CommissionLedgerEvent | null> {
  return appendCommissionLedgerEvent({
    partnerId: params.partnerId,
    siteId: params.siteId,
    reservationId: params.reservationId,
    sourceProvider: params.sourceProvider,
    bookingChannel: params.bookingChannel,
    providerBookingId: params.providerBookingId,
    eventType: "DISPUTE_HOLD",
    deltaAmount: 0.00,
    calculatedCommission: 0.00,
    adjustmentReason: params.reason,
    createdBy: params.createdBy,
    idempotencyKey: `evt_dispute_hold_${params.reservationId}_${params.disputeId}`,
    metadata: { ...params.metadata, disputeId: params.disputeId },
  });
}

/**
 * Creates a DISPUTE_RELEASE event (restores eligibility once dispute is cleared).
 */
export async function createDisputeRelease(params: {
  partnerId: string;
  siteId?: string | null;
  reservationId: string;
  sourceProvider: "ownerrez" | "hospitable";
  bookingChannel: string;
  providerBookingId: string;
  disputeId: string;
  reason: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}): Promise<CommissionLedgerEvent | null> {
  return appendCommissionLedgerEvent({
    partnerId: params.partnerId,
    siteId: params.siteId,
    reservationId: params.reservationId,
    sourceProvider: params.sourceProvider,
    bookingChannel: params.bookingChannel,
    providerBookingId: params.providerBookingId,
    eventType: "DISPUTE_RELEASE",
    deltaAmount: 0.00,
    calculatedCommission: 0.00,
    adjustmentReason: params.reason,
    createdBy: params.createdBy,
    idempotencyKey: `evt_dispute_release_${params.reservationId}_${params.disputeId}`,
    metadata: { ...params.metadata, disputeId: params.disputeId },
  });
}

/**
 * Reconciles the payment realization ledger state for a reservation against its live payment status.
 *
 * Conservative Rules:
 * 1. If unpaid (amount_received <= 0 or payment_status == 'UNPAID'): zero PAYMENT_REALIZED events created.
 * 2. If partial payment: zero PAYMENT_REALIZED events created (unallocated).
 * 3. If 100% collected: appends idempotent PAYMENT_REALIZED event via createPaymentRealized.
 * 4. Never mutates existing INITIAL_ACCRUAL event.
 */
export async function reconcileReservationPaymentRealization(params: {
  reservationId: string;
  sourceProvider?: "ownerrez" | "hospitable";
  overrideCommissionAmount?: number;
}): Promise<{
  reconciled: boolean;
  status: "UNPAID_PENDING_PAYMENT" | "PARTIAL_PAYMENT_UNALLOCATED" | "REALIZED";
  rowsCreated: number;
  realizedAmount: number;
  reason: string;
  event: CommissionLedgerEvent | null;
}> {
  const supabase = createAdminClient();

  // 1. Fetch reservation from database
  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", params.reservationId)
    .single();

  if (resErr || !reservation) {
    throw new Error(`Reservation ${params.reservationId} not found: ${resErr?.message}`);
  }

  const grossAmount = Number(reservation.gross_amount || 0);
  const amountReceived = Number(reservation.amount_received || 0);
  const paymentStatus = reservation.payment_status || "UNPAID";

  // Check payment readiness
  if (paymentStatus === "UNPAID" || amountReceived <= 0) {
    return {
      reconciled: true,
      status: "UNPAID_PENDING_PAYMENT",
      rowsCreated: 0,
      realizedAmount: 0.0,
      reason: `Booking is unpaid (amount_received = $${amountReceived.toFixed(2)}, payment_status = ${paymentStatus}). Realized commission remains $0.00.`,
      event: null,
    };
  }

  if (amountReceived < grossAmount) {
    return {
      reconciled: true,
      status: "PARTIAL_PAYMENT_UNALLOCATED",
      rowsCreated: 0,
      realizedAmount: 0.0,
      reason: `Partial payment received ($${amountReceived.toFixed(2)} of $${grossAmount.toFixed(2)}). Realized commission held at $0.00.`,
      event: null,
    };
  }

  // 100% collected: determine commission amount
  let commissionAmount = params.overrideCommissionAmount;
  let commissionRuleId: string | null = null;

  if (commissionAmount === undefined) {
    const { data: rules } = await supabase
      .from("commission_rules")
      .select("*")
      .eq("partner_id", reservation.partner_id)
      .eq("status", "active");

    const rule = rules && rules.length > 0 ? rules[0] : null;
    commissionRuleId = rule?.id || null;
    const rate = rule && rule.percentage ? rule.percentage / 100 : 0.1;
    commissionAmount = Math.round(grossAmount * rate * 100) / 100;
  }

  // Check if PAYMENT_REALIZED already exists
  const idempotencyKey = `evt_realized_${reservation.id}_full`;
  const { data: existing } = await supabase
    .from("commission_ledger_events")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    return {
      reconciled: true,
      status: "REALIZED",
      rowsCreated: 0,
      realizedAmount: Number(existing.delta_amount),
      reason: "PAYMENT_REALIZED event already exists (idempotent no-op).",
      event: existing as CommissionLedgerEvent,
    };
  }

  // Create payment realization
  const event = await createPaymentRealized({
    partnerId: reservation.partner_id,
    siteId: reservation.site_id,
    reservationId: reservation.id,
    commissionRuleId,
    sourceProvider: params.sourceProvider || "ownerrez",
    bookingChannel: reservation.platform || "direct",
    providerBookingId: String(reservation.ownerrez_booking_id || reservation.hospitable_reservation_id),
    ownerrezBookingId: reservation.ownerrez_booking_id || null,
    commissionAmount: commissionAmount,
    metadata: {
      reconciliationSource: "payment_readiness_gate",
      grossAmount,
      amountReceived,
    },
  });

  return {
    reconciled: true,
    status: "REALIZED",
    rowsCreated: event ? 1 : 0,
    realizedAmount: commissionAmount,
    reason: "PAYMENT_REALIZED event created successfully.",
    event,
  };
}

