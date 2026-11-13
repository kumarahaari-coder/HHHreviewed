/**
 * One definition of "what commission does this booking have", shared by the ledger, the admin screens and the
 * partner portal, so they can never disagree again.
 *
 *  - earned   : commission that has been REALIZED (guest paid in full), net of clawbacks/adjustments.
 *  - expected : not paid yet; the accrual's rule applied to the booking's CURRENT total.
 *  - none     : no accrual (no rate set / not attributed) or a cancelled booking that never realized anything.
 *
 * INITIAL_ACCRUAL is an immutable snapshot of the total at the time, so its stored amount can be stale when the
 * booking total changes afterwards. For Hostaway accruals (a percentage rule over gross minus cleaning, service fee
 * and taxes) the amount is recomputed from the snapshot's percentage on the current figures. Fixed-amount rules and
 * accruals from other systems keep their stored amount. Pure functions: safe to import from client components.
 */

export interface BookingFees {
  gross: number;
  cleaning?: number;
  service?: number;
  taxes?: number;
}

export interface LedgerEventLike {
  event_type: string;
  delta_amount?: number | string | null;
  calculated_commission?: number | string | null;
  metadata?: any;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Commission of an accrual on the booking's current total (see file header for what is recomputed). */
export function commissionFromAccrual(accrual: LedgerEventLike, fees: BookingFees): number {
  const stored = Number(accrual.calculated_commission ?? 0);
  const meta = accrual.metadata || {};
  if (meta.ingestion_source === "hostaway_sync" && meta.rule_type === "percentage" && meta.percentage != null) {
    const base = Math.max(0, Number(fees.gross || 0) - Number(fees.cleaning || 0) - Number(fees.service || 0) - Number(fees.taxes || 0));
    return round2(base * (Number(meta.percentage) / 100));
  }
  return round2(stored);
}

export interface CommissionView {
  amount: number | null;
  kind: "earned" | "expected" | "none";
}

export function reservationCommissionView(
  events: LedgerEventLike[],
  fees: BookingFees,
  options: { cancelled?: boolean } = {}
): CommissionView {
  const realized = events.filter((e) => e.event_type === "PAYMENT_REALIZED");
  if (realized.length > 0) {
    const earned = events
      .filter((e) => e.event_type === "PAYMENT_REALIZED" || e.event_type === "REFUND_CLAWBACK" || e.event_type === "MANUAL_ADJUSTMENT")
      .reduce((a, e) => a + Number(e.delta_amount || 0), 0);
    return { amount: round2(earned), kind: "earned" };
  }
  const accrual = events.find((e) => e.event_type === "INITIAL_ACCRUAL");
  if (!accrual || options.cancelled) return { amount: null, kind: "none" };
  return { amount: commissionFromAccrual(accrual, fees), kind: "expected" };
}
