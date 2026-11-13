/**
 * Offline ("marked paid in Hostaway") payment queue.
 *
 * Sync only RECORDS offline charges here. Recording never counts as received money: a row starts as
 * PENDING_CONFIRMATION and only an admin confirmation plus a different admin's approval can release it (Phase 3).
 * Failures are non-fatal so a missing table or a database error can never break the Hostaway sync.
 */
import type { HostawayCharge } from "@/lib/stripe/charge-id-payments";

export async function recordOfflinePayments(params: {
  supabase: any;
  reservationId: string;
  hostawayReservationId: number;
  charges: HostawayCharge[];
}): Promise<{ recorded: number; updated: number }> {
  const result = { recorded: 0, updated: 0 };
  try {
    const now = new Date().toISOString();
    for (const c of params.charges) {
      const { data: existing, error } = await params.supabase
        .from("reservation_offline_payments")
        .select("id, status, hostaway_status")
        .eq("hostaway_charge_id", c.id)
        .maybeSingle();
      if (error) throw new Error(error.message);

      if (!existing) {
        // Only charges Hostaway currently reports as paid are worth a person's attention.
        if (c.status !== "paid" || c.amount <= 0) continue;
        const { error: insErr } = await params.supabase.from("reservation_offline_payments").insert({
          reservation_id: params.reservationId,
          hostaway_reservation_id: params.hostawayReservationId,
          hostaway_charge_id: c.id,
          amount: c.amount,
          payment_method: c.paymentMethod,
          hostaway_status: c.status,
        });
        if (insErr) throw new Error(insErr.message);
        result.recorded++;
        continue;
      }

      // Known charge: keep Hostaway's latest status visible. A charge that stops being paid before anyone
      // confirmed it is withdrawn; an already confirmed/approved one keeps its state and shows the change.
      const patch: Record<string, unknown> = { hostaway_status: c.status, last_seen_at: now, updated_at: now };
      if (c.status !== "paid" && existing.status === "PENDING_CONFIRMATION") patch.status = "WITHDRAWN";
      const { error: upErr } = await params.supabase
        .from("reservation_offline_payments")
        .update(patch)
        .eq("id", existing.id);
      if (upErr) throw new Error(upErr.message);
      if (existing.hostaway_status !== c.status) result.updated++;
    }
  } catch (err: any) {
    console.warn("[OfflinePayments] Recording skipped:", err?.message);
  }
  return result;
}

/** Total of offline payments that were confirmed and approved and that Hostaway still shows as paid. */
export async function getApprovedOfflineTotal(supabase: any, reservationId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("reservation_offline_payments")
      .select("amount")
      .eq("reservation_id", reservationId)
      .eq("status", "APPROVED")
      .eq("hostaway_status", "paid");
    if (error) return 0;
    return Math.round((data || []).reduce((a: number, r: any) => a + Number(r.amount || 0), 0) * 100) / 100;
  } catch {
    return 0;
  }
}

/**
 * Optional extra wait before an approved offline payment can be paid out. Default 0: once an offline payment is
 * approved and counted as received it follows the same rules as any other paid booking. Set
 * OFFLINE_PAYMENT_HOLD_HOURS (e.g. 168 for 7 days) to add a longer hold again.
 */
export const DEFAULT_OFFLINE_HOLD_HOURS = 0;
export function getOfflineHoldHours(): number {
  const raw = process.env.OFFLINE_PAYMENT_HOLD_HOURS?.trim();
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : DEFAULT_OFFLINE_HOLD_HOURS;
}

export interface ApprovedOfflineSummary {
  total: number;
  latestApprovedAt: string | null;
}

/** Approved, still-paid-in-Hostaway offline payments per reservation. */
export async function loadApprovedOfflineSummaries(supabase: any, reservationIds: string[]): Promise<Map<string, ApprovedOfflineSummary>> {
  const out = new Map<string, ApprovedOfflineSummary>();
  if (reservationIds.length === 0) return out;
  const { data, error } = await supabase
    .from("reservation_offline_payments")
    .select("reservation_id, amount, approved_at")
    .in("reservation_id", reservationIds)
    .eq("status", "APPROVED")
    .eq("hostaway_status", "paid");
  if (error) throw new Error(`Failed to load approved offline payments: ${error.message}`);
  for (const r of data || []) {
    const cur = out.get(r.reservation_id) || { total: 0, latestApprovedAt: null };
    cur.total = Math.round((cur.total + Number(r.amount || 0)) * 100) / 100;
    if (r.approved_at && (!cur.latestApprovedAt || r.approved_at > cur.latestApprovedAt)) cur.latestApprovedAt = r.approved_at;
    out.set(r.reservation_id, cur);
  }
  return out;
}

/**
 * The hold counts from the later of check-out and the approval date, so approving an offline payment long after the
 * stay still gets the full hold. Both are calendar dates (YYYY-MM-DD).
 */
export function offlineHoldAnchor(checkOutDate: string, latestApprovedAt: string | null): string {
  const approvedDate = latestApprovedAt ? latestApprovedAt.slice(0, 10) : null;
  return approvedDate && approvedDate > checkOutDate ? approvedDate : checkOutDate;
}
