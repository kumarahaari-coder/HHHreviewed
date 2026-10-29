/**
 * Writes Stripe-confirmed payment amounts onto Hostaway reservations.
 * Hostaway's own paidAmount/isPaid stay empty for payments taken through its Stripe-backed guest payments, so
 * the admin panel and commission realization would otherwise see every booking as UNPAID. Stripe is the
 * source of truth for money received; Hostaway's figure is never lowered below what it reports itself.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileReservationPaymentRealization } from "@/lib/commissions/ledger";
import type { PaymentStatus } from "@/lib/db/schema";
import { normalizeHostawayPaymentStatus } from "@/lib/hostaway/normalizers";
import { isHostawayCommissionAttributionEnabled } from "@/lib/config/pms-mode";
import { fetchStripeTallies, StripeTally } from "./payment-verification";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Stripe net received (succeeded minus refunds) for the reservation, or null if Stripe has no payment for it. */
export function stripeNetReceived(tally: StripeTally | undefined): number | null {
  if (!tally || tally.chargeIds.length === 0) return null;
  return round2(Math.max(0, tally.received - tally.refunded));
}

/**
 * Merges Stripe's figure with what Hostaway itself reports. Returns null when Stripe has nothing to add.
 */
export function mergeStripePayment(
  tally: StripeTally | undefined,
  gross: number,
  hostaway: { amountReceived: number; paymentStatus: string }
): { amountReceived: number; paymentStatus: PaymentStatus } | null {
  const net = stripeNetReceived(tally);
  if (net === null) return null;
  const amountReceived = round2(Math.max(net, hostaway.amountReceived));
  const paymentStatus: PaymentStatus =
    hostaway.paymentStatus === "PAID" || hostaway.paymentStatus === "DISPUTED"
      ? (hostaway.paymentStatus as PaymentStatus)
      : normalizeHostawayPaymentStatus(gross, amountReceived);
  return { amountReceived, paymentStatus };
}

export async function tryFetchStripeTallies(): Promise<Map<string, StripeTally> | undefined> {
  try {
    return await fetchStripeTallies();
  } catch (err: any) {
    console.warn("[Stripe] Payment lookup skipped:", err?.message);
    return undefined;
  }
}

export interface StripeReconcileSummary {
  checked: number;
  updated: number;
  nowPaid: number;
  realized: number;
  errors: string[];
}

export async function reconcileStripePayments(
  supabaseClient?: any,
  tallies?: Map<string, StripeTally>
): Promise<StripeReconcileSummary> {
  const supabase = supabaseClient || createAdminClient();
  const summary: StripeReconcileSummary = { checked: 0, updated: 0, nowPaid: 0, realized: 0, errors: [] };

  const stripe = tallies ?? (await fetchStripeTallies());
  const ids = [...stripe.keys()].filter((id) => stripeNetReceived(stripe.get(id)) !== null);

  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("reservations")
      .select("id, hostaway_reservation_id, gross_amount, amount_received, payment_status, reservation_status, site_id")
      .in("hostaway_reservation_id", ids.slice(i, i + 100).map(Number));
    if (error) {
      summary.errors.push(error.message);
      continue;
    }
    for (const r of data || []) {
      summary.checked++;
      const merged = mergeStripePayment(stripe.get(String(r.hostaway_reservation_id)), Number(r.gross_amount) || 0, {
        amountReceived: Number(r.amount_received) || 0,
        paymentStatus: r.payment_status,
      });
      if (!merged) continue;
      if (merged.paymentStatus === r.payment_status && merged.amountReceived === Number(r.amount_received || 0)) continue;

      const { error: upErr } = await supabase
        .from("reservations")
        .update({ payment_status: merged.paymentStatus, amount_received: merged.amountReceived, updated_at: new Date().toISOString() })
        .eq("id", r.id);
      if (upErr) {
        summary.errors.push(`${r.hostaway_reservation_id}: ${upErr.message}`);
        continue;
      }
      summary.updated++;

      if (merged.paymentStatus === "PAID" && r.payment_status !== "PAID") {
        summary.nowPaid++;
        if (r.site_id && r.reservation_status !== "CANCELLED" && isHostawayCommissionAttributionEnabled()) {
          try {
            await reconcileReservationPaymentRealization({ reservationId: r.id, sourceProvider: "hostaway", supabaseClient: supabase });
            summary.realized++;
          } catch (err: any) {
            summary.errors.push(`${r.hostaway_reservation_id}: ${err?.message}`);
          }
        }
      }
    }
  }
  return summary;
}
