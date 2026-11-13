/**
 * Charge-ID payment matching (PAYMENT_MATCH_MODE=charge_id, the default).
 *
 * Hostaway lists every guest charge for a reservation (GET /guestPayments/charges?reservationId=). A charge that
 * Hostaway collected through Stripe carries the Stripe charge id (paymentProviderChargeId, "ch_..."). We count a
 * charge only when:
 *   1. Hostaway lists it as status "paid" with paymentProvider "stripe" and a charge id, AND
 *   2. Stripe confirms that exact charge as succeeded + paid + captured.
 * Refunds and disputes are read from the Stripe charge itself. Offline/manual Hostaway charges (cash etc.) have no
 * Stripe charge and are therefore never counted as received money here.
 *
 * The result is a StripeTally, the same shape the legacy matcher produces, so mergeStripePayment and
 * verifyHostawayPayments work unchanged.
 *
 * REVERT: set PAYMENT_MATCH_MODE=description to use the legacy matcher (Stripe charge list matched by the
 * "Reservation Id: N" text in the charge description). That code is still in payment-verification.ts.
 */
import { hostawayRequest } from "@/lib/hostaway/client";
import type { StripeTally } from "./payment-verification";

export type PaymentMatchMode = "charge_id" | "description";

export function getPaymentMatchMode(): PaymentMatchMode {
  return process.env.PAYMENT_MATCH_MODE?.trim().toLowerCase() === "description" ? "description" : "charge_id";
}

/** Channels that pay the host directly; they never have a Hostaway/Stripe guest charge, so skip the lookup. */
const CHANNEL_PAID_PLATFORMS = new Set(["airbnb", "vrbo", "booking.com", "expedia", "tripadvisor"]);

export interface HostawayCharge {
  id: number;
  status: string;
  amount: number;
  paymentProvider: string | null;
  paymentMethod: string | null;
  paymentProviderChargeId: string | null;
}

export async function fetchHostawayCharges(hostawayReservationId: string): Promise<HostawayCharge[]> {
  const res = await hostawayRequest<{ result?: any[] }>(
    `/guestPayments/charges?reservationId=${encodeURIComponent(hostawayReservationId)}&limit=100`,
    undefined,
    { maxRetries: 1 }
  );
  return (res?.result || []).map((c) => ({
    id: Number(c.id),
    status: String(c.status || ""),
    amount: Number(c.amount || 0),
    paymentProvider: c.paymentProvider ?? null,
    paymentMethod: c.paymentMethod ?? null,
    paymentProviderChargeId: c.paymentProviderChargeId ?? null,
  }));
}

/** Returns the Stripe charge, or null when Stripe says it does not exist. Any other failure throws. */
async function fetchStripeCharge(chargeId: string): Promise<any | null> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  const res = await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(chargeId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json: any = await res.json();
  if (res.status === 404 || json?.error?.code === "resource_missing") return null;
  if (!res.ok) throw new Error(json?.error?.message || `Stripe API ${res.status}`);
  return json;
}

/** Hostaway charges for a reservation plus the tally of Stripe-confirmed money. Throws if either cannot be queried. */
export async function lookupReservationPayments(
  hostawayReservationId: string
): Promise<{ tally: StripeTally; charges: HostawayCharge[] }> {
  const tally: StripeTally = { received: 0, refunded: 0, disputed: false, chargeIds: [] };
  const charges = await fetchHostawayCharges(hostawayReservationId);
  const seen = new Set<string>();
  for (const c of charges) {
    if (c.status !== "paid" || c.paymentProvider !== "stripe" || !c.paymentProviderChargeId) continue;
    if (seen.has(c.paymentProviderChargeId)) continue;
    seen.add(c.paymentProviderChargeId);

    const sc = await fetchStripeCharge(c.paymentProviderChargeId);
    if (!sc) continue;
    if (sc.status === "succeeded" && sc.paid && sc.captured) {
      tally.received += sc.amount / 100;
      tally.refunded += sc.amount_refunded / 100;
      tally.chargeIds.push(sc.id);
    }
    if (sc.disputed) tally.disputed = true;
  }
  return { tally, charges };
}

/** Tally of Stripe-confirmed money for one Hostaway reservation. Throws if Hostaway or Stripe cannot be queried. */
export async function tallyForReservation(hostawayReservationId: string): Promise<StripeTally> {
  return (await lookupReservationPayments(hostawayReservationId)).tally;
}

/**
 * Hostaway payment methods that mean "an OTA / booking channel pays the host", not a guest paying us offline.
 * Such charges (e.g. method "ota" on bookings entered under Hostaway's "direct" channel) are not for the
 * offline-payment confirmation queue.
 */
export const CHANNEL_PAID_METHODS = new Set(["ota"]);

/** Charges Hostaway lists that were NOT taken through Stripe (cash, bank transfer, manual). Unverifiable by design. */
export function isOfflineCharge(c: HostawayCharge): boolean {
  if (CHANNEL_PAID_METHODS.has(String(c.paymentMethod || "").toLowerCase())) return false;
  return c.paymentProvider !== "stripe" && !c.paymentProviderChargeId;
}

/** Tallies for many reservations. A reservation that cannot be checked is reported in `errors`, never guessed. */
export async function tallyForReservations(
  hostawayReservationIds: string[]
): Promise<{ tallies: Map<string, StripeTally>; errors: Map<string, string> }> {
  const tallies = new Map<string, StripeTally>();
  const errors = new Map<string, string>();
  for (const id of hostawayReservationIds) {
    try {
      tallies.set(id, await tallyForReservation(id));
    } catch (err: any) {
      errors.set(id, String(err?.message || err));
    }
  }
  return { tallies, errors };
}

/**
 * Sync-time lookup for one reservation. Returns undefined when nothing can be said (channel-paid booking, or a
 * lookup failure), in which case Hostaway's own figures are left as they are.
 */
export async function resolvePaymentTally(
  hostawayReservationId: string,
  platform: string,
  legacyTallies?: Map<string, StripeTally>
): Promise<StripeTally | undefined> {
  if (getPaymentMatchMode() === "description") return legacyTallies?.get(hostawayReservationId);
  if (CHANNEL_PAID_PLATFORMS.has((platform || "").toLowerCase())) return undefined;
  try {
    return await tallyForReservation(hostawayReservationId);
  } catch (err: any) {
    console.warn(`[Payments] Charge lookup skipped for Hostaway reservation ${hostawayReservationId}:`, err?.message);
    return undefined;
  }
}

/**
 * Sync-time lookup that also returns Hostaway's offline charges (for the offline-payment confirmation queue).
 * Same failure behaviour as resolvePaymentTally: undefined tally and no charges when nothing can be said.
 */
export async function resolvePaymentDetails(
  hostawayReservationId: string,
  platform: string,
  legacyTallies?: Map<string, StripeTally>
): Promise<{ tally: StripeTally | undefined; offlineCharges: HostawayCharge[]; failed: boolean }> {
  if (getPaymentMatchMode() === "description") {
    return { tally: legacyTallies?.get(hostawayReservationId), offlineCharges: [], failed: false };
  }
  if (CHANNEL_PAID_PLATFORMS.has((platform || "").toLowerCase())) return { tally: undefined, offlineCharges: [], failed: false };
  try {
    const { tally, charges } = await lookupReservationPayments(hostawayReservationId);
    return { tally, offlineCharges: charges.filter(isOfflineCharge), failed: false };
  } catch (err: any) {
    console.warn(`[Payments] Charge lookup skipped for Hostaway reservation ${hostawayReservationId}:`, err?.message);
    return { tally: undefined, offlineCharges: [], failed: true };
  }
}
