import { createAdminClient } from "@/lib/supabase/admin";
import { appendCommissionLedgerEvent } from "./ledger";
import {
  CommissionAdjustmentRequestRecord,
  CommissionAdjustmentRequestStatus,
} from "./types";

export interface CreateAdjustmentRequestParams {
  partnerId: string;
  reservationId: string;
  deltaAmount: number;
  reason: string;
  createdBy: string;
  arbitraryApprovedByAttempt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ApproveAdjustmentRequestParams {
  requestId: string;
  approverUserId: string;
  approverRole: string;
}

export interface RejectAdjustmentRequestParams {
  requestId: string;
  rejecterUserId: string;
  rejecterRole: string;
  rejectionReason: string;
}

/**
 * Creates a PENDING_APPROVAL commission adjustment request.
 * 
 * Strict Maker-Checker Guard:
 * - Supplying an approved_by UUID in the creation request is strictly forbidden.
 * - An adjustment can NEVER be auto-approved or committed to the ledger on creation.
 */
export async function createAdjustmentRequest(
  params: CreateAdjustmentRequestParams
): Promise<CommissionAdjustmentRequestRecord> {
  // Guard against injection of arbitrary approved_by
  if (params.arbitraryApprovedByAttempt) {
    throw new Error(
      "Security violation: Supplying approved_by in adjustment request creation is forbidden. Adjustments require distinct Super Admin approval."
    );
  }

  if (!params.reason || params.reason.trim() === "") {
    throw new Error("Adjustment reason is required and cannot be blank.");
  }

  if (params.deltaAmount === 0) {
    throw new Error("Adjustment delta amount cannot be zero.");
  }

  const supabase = createAdminClient();

  const { data: request, error } = await supabase
    .from("commission_adjustment_requests")
    .insert({
      partner_id: params.partnerId,
      reservation_id: params.reservationId,
      delta_amount: params.deltaAmount,
      currency: "USD",
      reason: params.reason.trim(),
      status: "PENDING_APPROVAL" as CommissionAdjustmentRequestStatus,
      created_by: params.createdBy,
      approved_by: null,
      approved_at: null,
      metadata: params.metadata || {},
    })
    .select("*")
    .single();

  if (error || !request) {
    throw new Error(`Failed to create adjustment request: ${error?.message}`);
  }

  // Audit log
  await supabase.from("application_audit_logs").insert({
    action: "CREATE_ADJUSTMENT_REQUEST",
    target_user_id: null,
    partner_id: params.partnerId,
    performed_by_user_id: params.createdBy,
    source: "admin_portal",
    details: {
      requestId: request.id,
      reservationId: params.reservationId,
      deltaAmount: params.deltaAmount,
      reason: params.reason.trim(),
    },
  });

  return request as CommissionAdjustmentRequestRecord;
}

/**
 * Approves an adjustment request, creating exactly ONE immutable MANUAL_ADJUSTMENT ledger event.
 * 
 * Invariants:
 * 1. Approver MUST hold SUPER_ADMIN role.
 * 2. Approver MUST NOT be the maker (creator != approver).
 * 3. Request MUST be in PENDING_APPROVAL status.
 * 4. Repeating approval MUST fail (zero duplicate ledger events).
 * 5. application_audit_logs MUST record both actors.
 */
export async function approveAdjustmentRequest(
  params: ApproveAdjustmentRequestParams
): Promise<{ request: CommissionAdjustmentRequestRecord; ledgerEventId: string }> {
  if (params.approverRole !== "SUPER_ADMIN") {
    throw new Error("Unauthorized. Only a distinct Super Admin can approve manual adjustments.");
  }

  const supabase = createAdminClient();

  // 1. Fetch request
  const { data: request, error: rErr } = await supabase
    .from("commission_adjustment_requests")
    .select("*")
    .eq("id", params.requestId)
    .single();

  if (rErr || !request) {
    throw new Error(`Adjustment request not found: ${params.requestId}`);
  }

  // 2. Maker-Checker check: Maker cannot self-approve
  if (request.created_by === params.approverUserId) {
    throw new Error("Maker-checker violation: Maker cannot approve their own adjustment request.");
  }

  // 3. Status check: Only PENDING_APPROVAL can be approved
  if (request.status !== "PENDING_APPROVAL") {
    throw new Error(
      `Adjustment request cannot be approved from status '${request.status}'. Must be 'PENDING_APPROVAL'.`
    );
  }

  // 4. Fetch reservation info for provider metadata
  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("id, source_provider, platform, confirmation_code, ownerrez_booking_id, site_id")
    .eq("id", request.reservation_id)
    .single();

  if (resErr || !reservation) {
    throw new Error(`Reservation not found for adjustment: ${request.reservation_id}`);
  }

  const provider = (reservation.source_provider as "ownerrez" | "hospitable") || "ownerrez";
  const channel = reservation.platform || "direct";
  const providerBookingId = String(
    reservation.ownerrez_booking_id || reservation.confirmation_code || reservation.id
  );

  // 5. Append immutable MANUAL_ADJUSTMENT event to commission ledger
  // Note: idempotency key binds to request ID so repeat execution is rejected
  const ledgerEvent = await appendCommissionLedgerEvent({
    partnerId: request.partner_id,
    siteId: reservation.site_id || undefined,
    reservationId: request.reservation_id,
    sourceProvider: provider,
    bookingChannel: channel,
    providerBookingId,
    ownerrezBookingId: reservation.ownerrez_booking_id ? Number(reservation.ownerrez_booking_id) : undefined,
    eventType: "MANUAL_ADJUSTMENT",
    deltaAmount: Number(request.delta_amount),
    adjustmentReason: request.reason,
    createdBy: request.created_by,
    approvedBy: params.approverUserId,
    idempotencyKey: `MANUAL_ADJUSTMENT:REQ:${request.id}`,
    metadata: {
      adjustmentRequestId: request.id,
      approvedAt: new Date().toISOString(),
    },
  });

  if (!ledgerEvent) {
    throw new Error("Failed to insert immutable MANUAL_ADJUSTMENT ledger event.");
  }

  // 6. Update request record to APPROVED with approver and ledger_event_id
  const { data: updatedRequest, error: uErr } = await supabase
    .from("commission_adjustment_requests")
    .update({
      status: "APPROVED",
      approved_by: params.approverUserId,
      approved_at: new Date().toISOString(),
      ledger_event_id: ledgerEvent.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .select("*")
    .single();

  if (uErr || !updatedRequest) {
    throw new Error(`Failed to update adjustment request status: ${uErr?.message}`);
  }

  // 7. Insert audit log recording both maker and approver
  await supabase.from("application_audit_logs").insert({
    action: "APPROVE_MANUAL_ADJUSTMENT",
    target_user_id: request.created_by,
    partner_id: request.partner_id,
    performed_by_user_id: params.approverUserId,
    source: "admin_portal",
    details: {
      requestId: request.id,
      ledgerEventId: ledgerEvent.id,
      makerId: request.created_by,
      approverId: params.approverUserId,
      deltaAmount: request.delta_amount,
      reason: request.reason,
    },
  });

  return {
    request: updatedRequest as CommissionAdjustmentRequestRecord,
    ledgerEventId: ledgerEvent.id,
  };
}

/**
 * Rejects an adjustment request.
 */
export async function rejectAdjustmentRequest(
  params: RejectAdjustmentRequestParams
): Promise<CommissionAdjustmentRequestRecord> {
  const supabase = createAdminClient();

  const { data: request, error: rErr } = await supabase
    .from("commission_adjustment_requests")
    .select("*")
    .eq("id", params.requestId)
    .single();

  if (rErr || !request) {
    throw new Error(`Adjustment request not found: ${params.requestId}`);
  }

  if (request.status !== "PENDING_APPROVAL") {
    throw new Error(`Cannot reject adjustment request in status '${request.status}'.`);
  }

  const { data: updated, error: uErr } = await supabase
    .from("commission_adjustment_requests")
    .update({
      status: "REJECTED",
      rejection_reason: params.rejectionReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .select("*")
    .single();

  if (uErr || !updated) {
    throw new Error(`Failed to update request status: ${uErr?.message}`);
  }

  await supabase.from("application_audit_logs").insert({
    action: "REJECT_MANUAL_ADJUSTMENT",
    target_user_id: request.created_by,
    partner_id: request.partner_id,
    performed_by_user_id: params.rejecterUserId,
    source: "admin_portal",
    details: {
      requestId: request.id,
      reason: params.rejectionReason,
    },
  });

  return updated as CommissionAdjustmentRequestRecord;
}
