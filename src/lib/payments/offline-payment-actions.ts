/**
 * Confirm / approve / reject offline ("marked paid in Hostaway") payments.
 *
 * Two-person rule: one admin CONFIRMS with a written reason, a DIFFERENT admin APPROVES. Only approval counts the
 * amount as received on the booking (and, when an INITIAL_ACCRUAL exists, creates PAYMENT_REALIZED). Every step is
 * written to application_audit_logs. The database also enforces both rules (see the migration's CHECK constraints).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileReservationPaymentRealization } from "@/lib/commissions/ledger";
import { isHostawayCommissionAttributionEnabled } from "@/lib/config/pms-mode";
import { normalizeHostawayPaymentStatus } from "@/lib/hostaway/normalizers";

export const MIN_REASON_LENGTH = 5;
const round2 = (n: number) => Math.round(n * 100) / 100;

export class OfflinePaymentError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
    this.name = "OfflinePaymentError";
  }
}

async function loadRow(supabase: any, id: string) {
  const { data, error } = await supabase.from("reservation_offline_payments").select("*").eq("id", id).maybeSingle();
  if (error) throw new OfflinePaymentError(error.message, 500);
  if (!data) throw new OfflinePaymentError("Offline payment not found.", 404);
  return data;
}

async function audit(supabase: any, action: string, adminUserId: string, row: any, partnerId: string | null, details: Record<string, unknown>) {
  await supabase.from("application_audit_logs").insert({
    action,
    performed_by_user_id: adminUserId,
    partner_id: partnerId,
    source: "admin_portal",
    details: { offlinePaymentId: row.id, reservationId: row.reservation_id, hostawayChargeId: row.hostaway_charge_id, amount: row.amount, ...details },
  });
}

/** Step 1: an admin confirms the money really arrived, with a written reason (bank reference, receipt note...). */
export async function confirmOfflinePayment(params: { id: string; adminUserId: string; reason: string; supabaseClient?: any }) {
  const supabase = params.supabaseClient || createAdminClient();
  const reason = String(params.reason || "").trim();
  if (reason.length < MIN_REASON_LENGTH) throw new OfflinePaymentError(`A reason of at least ${MIN_REASON_LENGTH} characters is required (e.g. the bank transfer reference).`);

  const row = await loadRow(supabase, params.id);
  if (row.status !== "PENDING_CONFIRMATION") throw new OfflinePaymentError(`Only pending payments can be confirmed (current: ${row.status}).`, 409);
  if (row.hostaway_status !== "paid") throw new OfflinePaymentError(`Hostaway no longer shows this charge as paid (status: ${row.hostaway_status}).`, 409);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("reservation_offline_payments")
    .update({ status: "CONFIRMED", confirmed_by: params.adminUserId, confirmed_at: now, confirmation_reason: reason, updated_at: now })
    .eq("id", row.id)
    .eq("status", "PENDING_CONFIRMATION") // guards against two admins acting at once
    .select("*")
    .maybeSingle();
  if (error) throw new OfflinePaymentError(error.message, 500);
  if (!data) throw new OfflinePaymentError("This payment was changed by someone else. Refresh and try again.", 409);

  await audit(supabase, "CONFIRM_OFFLINE_PAYMENT", params.adminUserId, row, null, { reason });
  return data;
}

/** Step 2: a different admin approves. Counts the amount as received and realizes the commission when possible. */
export async function approveOfflinePayment(params: { id: string; adminUserId: string; supabaseClient?: any }) {
  const supabase = params.supabaseClient || createAdminClient();
  const row = await loadRow(supabase, params.id);

  if (row.status !== "CONFIRMED") throw new OfflinePaymentError(`Only confirmed payments can be approved (current: ${row.status}).`, 409);
  if (row.confirmed_by === params.adminUserId) throw new OfflinePaymentError("Maker-checker violation: the admin who confirmed this payment cannot approve it.", 403);
  if (row.hostaway_status !== "paid") throw new OfflinePaymentError(`Hostaway no longer shows this charge as paid (status: ${row.hostaway_status}). Reject it instead.`, 409);

  const { data: reservation, error: rErr } = await supabase
    .from("reservations")
    .select("id, partner_id, site_id, reservation_status, gross_amount, amount_received, payment_status")
    .eq("id", row.reservation_id)
    .single();
  if (rErr || !reservation) throw new OfflinePaymentError("Reservation not found.", 404);
  if (reservation.reservation_status === "CANCELLED") throw new OfflinePaymentError("The booking is cancelled; reject this payment instead.", 409);

  const now = new Date().toISOString();
  const { data: approved, error } = await supabase
    .from("reservation_offline_payments")
    .update({ status: "APPROVED", approved_by: params.adminUserId, approved_at: now, updated_at: now })
    .eq("id", row.id)
    .eq("status", "CONFIRMED")
    .select("*")
    .maybeSingle();
  if (error) throw new OfflinePaymentError(error.message, 500);
  if (!approved) throw new OfflinePaymentError("This payment was changed by someone else. Refresh and try again.", 409);

  // Count it as received on the booking (Stripe-verified money already in amount_received is kept).
  const gross = Number(reservation.gross_amount || 0);
  const received = round2(Number(reservation.amount_received || 0) + Number(row.amount));
  const paymentStatus = normalizeHostawayPaymentStatus(gross, received);
  const { error: upErr } = await supabase
    .from("reservations")
    .update({ amount_received: received, payment_status: paymentStatus, updated_at: now })
    .eq("id", reservation.id);
  if (upErr) {
    // Roll the approval back so the row and the booking never disagree.
    await supabase.from("reservation_offline_payments").update({ status: "CONFIRMED", approved_by: null, approved_at: null, updated_at: now }).eq("id", row.id);
    throw new OfflinePaymentError(`Could not update the booking: ${upErr.message}`, 500);
  }

  let realization: { status: string; reason: string } | { status: "NOT_ATTEMPTED"; reason: string } = {
    status: "NOT_ATTEMPTED",
    reason: "Booking has no partner/site attribution, is not fully paid, or commission attribution is disabled.",
  };
  if (paymentStatus === "PAID" && reservation.site_id && reservation.partner_id && isHostawayCommissionAttributionEnabled()) {
    try {
      const r = await reconcileReservationPaymentRealization({
        reservationId: reservation.id,
        sourceProvider: "hostaway",
        supabaseClient: supabase,
        extraMetadata: {
          offlinePayment: {
            id: row.id,
            hostawayChargeId: row.hostaway_charge_id,
            amount: Number(row.amount),
            method: row.payment_method,
            confirmedBy: row.confirmed_by,
            confirmationReason: row.confirmation_reason,
            approvedBy: params.adminUserId,
          },
        },
      });
      realization = { status: r.status, reason: r.reason };
    } catch (err: any) {
      realization = { status: "ERROR", reason: String(err?.message || err) };
    }
  }

  await audit(supabase, "APPROVE_OFFLINE_PAYMENT", params.adminUserId, row, reservation.partner_id || null, {
    confirmedBy: row.confirmed_by,
    confirmationReason: row.confirmation_reason,
    amountReceivedAfter: received,
    paymentStatusAfter: paymentStatus,
    realization,
  });
  return { payment: approved, amountReceived: received, paymentStatus, realization };
}

/** Rejects a pending or confirmed payment (the money did not arrive, or the entry is wrong). */
export async function rejectOfflinePayment(params: { id: string; adminUserId: string; reason: string; supabaseClient?: any }) {
  const supabase = params.supabaseClient || createAdminClient();
  const reason = String(params.reason || "").trim();
  if (reason.length < MIN_REASON_LENGTH) throw new OfflinePaymentError(`A reason of at least ${MIN_REASON_LENGTH} characters is required.`);

  const row = await loadRow(supabase, params.id);
  if (row.status !== "PENDING_CONFIRMATION" && row.status !== "CONFIRMED") {
    throw new OfflinePaymentError(`Only pending or confirmed payments can be rejected (current: ${row.status}).`, 409);
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("reservation_offline_payments")
    .update({ status: "REJECTED", rejected_by: params.adminUserId, rejected_at: now, rejection_reason: reason, updated_at: now })
    .eq("id", row.id)
    .eq("status", row.status)
    .select("*")
    .maybeSingle();
  if (error) throw new OfflinePaymentError(error.message, 500);
  if (!data) throw new OfflinePaymentError("This payment was changed by someone else. Refresh and try again.", 409);

  await audit(supabase, "REJECT_OFFLINE_PAYMENT", params.adminUserId, row, null, { reason });
  return data;
}
