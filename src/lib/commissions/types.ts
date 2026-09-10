/**
 * Phase 6 Commission Ledger & Payout Engine Types
 * 
 * Strict typing for append-only commission ledger, payout batches, payout items,
 * and working capital projections.
 */

export type CommissionLedgerEventType =
  | "INITIAL_ACCRUAL"
  | "PAYMENT_REALIZED"
  | "REFUND_CLAWBACK"
  | "MANUAL_ADJUSTMENT"
  | "ELIGIBILITY_RELEASE"
  | "DISPUTE_HOLD"
  | "DISPUTE_RELEASE"
  | "PAYOUT_SETTLEMENT";

export type PayoutBatchStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "AWAITING_MANUAL_CONFIRMATION"
  | "PROCESSING"
  | "SETTLED"
  | "FAILED"
  | "CANCELLED"
  | "REQUIRES_RECONCILIATION";

export type PayoutRail = "MANUAL_ACH" | "BANK_WIRE" | "CHECK" | "STRIPE_CONNECT";

export type PayoutItemStatus = "PENDING" | "SETTLED" | "FAILED" | "CANCELLED";

export type PayoutPaymentAttemptStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";

export interface CommissionLedgerEvent {
  id: string;
  partner_id: string;
  site_id?: string | null;
  reservation_id: string;
  commission_rule_id?: string | null;
  payout_batch_id?: string | null;
  payout_item_id?: string | null;
  source_provider: "ownerrez" | "hospitable";
  booking_channel: string;
  provider_booking_id: string;
  ownerrez_booking_id?: number | null;
  event_type: CommissionLedgerEventType;
  delta_amount: number;
  calculated_commission: number;
  snapshot_balance_after?: number | null;
  adjustment_reason?: string | null;
  created_by?: string | null;
  approved_by?: string | null;
  currency: string;
  idempotency_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PayoutBatchRecord {
  id: string;
  batch_number: string;
  partner_id: string;
  payout_rail: PayoutRail;
  total_gross_amount: number;
  total_netting_deduction: number;
  total_amount: number;
  currency: string;
  status: PayoutBatchStatus;
  created_by: string;
  submitted_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PayoutItemRecord {
  id: string;
  payout_batch_id: string;
  qualifying_ledger_event_id: string;
  reservation_id: string;
  partner_id: string;
  gross_amount: number;
  netting_deduction: number;
  disbursed_amount: number;
  status: PayoutItemStatus;
  created_at: string;
  updated_at: string;
}

export interface PayoutPaymentAttemptRecord {
  id: string;
  payout_batch_id: string;
  idempotency_key: string;
  payment_provider: string;
  provider_idempotency_key: string;
  provider_transfer_id?: string | null;
  requested_amount: number;
  status: PayoutPaymentAttemptStatus;
  attempt_count: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Reservation-level working capital summary
 */
export interface ReservationFinancialSummary {
  reservation_id: string;
  partner_id: string;
  site_id?: string | null;
  check_in_date: string;
  check_out_date?: string | null;
  net_realized: number;
  settled_amount: number;
  locked_amount: number;
  outstanding_amount: number;
  has_eligibility_release: boolean;
  is_dispute_free: boolean;
  is_stay_eligible: boolean;
  qualifying_ledger_event_id?: string | null;
}

/**
 * Partner-level financial projection separating accounting liability from payout availability
 */
export interface PartnerFinancialProjection {
  partner_id: string;
  
  // Total Accounting Liability across all partner reservations (including future paid stays)
  partnerAccountingOutstanding: number;
  
  // Sum of positive eligible reservations (completed, dispute-free stays not locked)
  eligiblePositive: number;
  
  // Total negative carry-forward from past clawbacks across the partner
  negativeCarryForward: number;
  
  // Max available cash payout: MAX(0, eligiblePositive - negativeCarryForward)
  partnerPayoutAvailable: number;
  
  // Detailed breakdown per reservation
  reservations: ReservationFinancialSummary[];
}

export type CommissionAdjustmentRequestStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

export interface CommissionAdjustmentRequestRecord {
  id: string;
  partner_id: string;
  reservation_id: string;
  delta_amount: number;
  currency: string;
  reason: string;
  status: CommissionAdjustmentRequestStatus;
  created_by: string;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  ledger_event_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
