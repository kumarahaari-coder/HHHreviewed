/**
 * Decides, per Hostaway booking, whether the (slow) payment lookup is needed, and runs the needed ones in parallel.
 *
 * A lookup costs one Hostaway call plus one Stripe call per charge. It is skipped when Hostaway reports the same
 * `updatedOn` we stored last time: any charge change in Hostaway (new, paid, cancelled) updates the reservation, and
 * refunds/disputes are re-checked against Stripe at payout time anyway. A skipped or failed lookup NEVER overwrites
 * the stored amount_received / payment_status (see keepStoredPayment in sync.ts).
 *
 * Set forcePaymentRefresh (route body { forcePaymentRefresh: true }) to re-check every booking.
 */
import { HostawayReservation } from "./types";
import { normalizeHostawayReservation } from "./normalizers";
import { HostawayCharge, getPaymentMatchMode, resolvePaymentDetails } from "@/lib/stripe/charge-id-payments";
import type { StripeTally } from "@/lib/stripe/payment-verification";

export type PaymentLookup =
  | { kind: "unchanged" }
  | { kind: "details"; tally: StripeTally | undefined; offlineCharges: HostawayCharge[]; failed: boolean };

export interface PriorPaymentState {
  updatedOn: string | null;
}

/** Lookups running at once. Hostaway allows ~15 requests / 10s per IP and the client backs off on 429. */
export const PAYMENT_LOOKUP_CONCURRENCY = 4;

export async function lookupPaymentForBooking(params: {
  booking: HostawayReservation;
  prior?: PriorPaymentState | null;
  force?: boolean;
  legacyTallies?: Map<string, StripeTally>;
}): Promise<PaymentLookup> {
  const { booking, prior, force, legacyTallies } = params;
  const current = String(booking.updatedOn || "");
  if (!force && getPaymentMatchMode() === "charge_id" && prior?.updatedOn && current && prior.updatedOn === current) {
    return { kind: "unchanged" };
  }
  const normalized = normalizeHostawayReservation(booking);
  const d = await resolvePaymentDetails(String(booking.id), normalized.platform, legacyTallies);
  return { kind: "details", ...d };
}

/** Stored `updatedOn` for each Hostaway reservation id (one query per 100 ids). */
export async function loadPriorPaymentStates(supabase: any, ids: number[]): Promise<Map<number, PriorPaymentState>> {
  const out = new Map<number, PriorPaymentState>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("reservations")
      .select("hostaway_reservation_id, prior_updated_on:raw_hostaway_data->>updatedOn")
      .in("hostaway_reservation_id", ids.slice(i, i + 100));
    if (error) continue; // no prior info: every booking is simply looked up
    for (const r of data || []) out.set(Number(r.hostaway_reservation_id), { updatedOn: r.prior_updated_on ?? null });
  }
  return out;
}

/** Runs the lookups a page needs, a few at a time. Result is keyed by Hostaway reservation id. */
export async function prefetchPaymentLookups(
  supabase: any,
  bookings: HostawayReservation[],
  options: { force?: boolean; legacyTallies?: Map<string, StripeTally>; concurrency?: number } = {}
): Promise<Map<number, PaymentLookup>> {
  const priors = await loadPriorPaymentStates(supabase, bookings.map((b) => b.id));
  const results = new Map<number, PaymentLookup>();
  const queue = [...bookings];
  const workers = Array.from({ length: Math.max(1, options.concurrency ?? PAYMENT_LOOKUP_CONCURRENCY) }, async () => {
    for (let b = queue.shift(); b; b = queue.shift()) {
      results.set(b.id, await lookupPaymentForBooking({ booking: b, prior: priors.get(b.id), force: options.force, legacyTallies: options.legacyTallies }));
    }
  });
  await Promise.all(workers);
  return results;
}
