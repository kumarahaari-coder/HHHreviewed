/**
 * Verifies that guest money for a Hostaway reservation has really landed in Stripe.
 * Hostaway writes "Reservation Id: N" into each Stripe charge description and splits a booking into several
 * charges (deposit/balance, retries), so we sum succeeded+captured charges minus refunds per reservation.
 * Uses a read-only restricted key (STRIPE_SECRET_KEY). Fails closed: no key, API error, dispute or a short
 * balance all mean "not verified".
 */

export type StripePaymentVerdict = "FULLY_RECEIVED" | "PARTIAL" | "NO_STRIPE_PAYMENT" | "DISPUTED" | "UNVERIFIABLE";

export interface StripePaymentVerification {
  hostawayReservationId: string;
  verdict: StripePaymentVerdict;
  expectedTotal: number;
  netReceived: number;
  refunded: number;
  chargeIds: string[];
  reason?: string;
}

const TOLERANCE = 0.01;
const MAX_PAGES = 50;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function isStripePaymentGateEnabled(): boolean {
  return process.env.PAYOUT_REQUIRE_STRIPE_VERIFICATION !== "false";
}

export interface StripeTally {
  received: number;
  refunded: number;
  disputed: boolean;
  chargeIds: string[];
}

export async function fetchStripeTallies(sinceUnix?: number): Promise<Map<string, StripeTally>> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");

  const tallies = new Map<string, StripeTally>();
  let after = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const since = sinceUnix ? `&created[gte]=${sinceUnix}` : "";
    const res = await fetch(`https://api.stripe.com/v1/charges?limit=100${since}${after}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json: any = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `Stripe API ${res.status}`);

    for (const c of json.data as any[]) {
      const id = /Reservation Id:\s*(\d+)/i.exec(String(c.description || ""))?.[1];
      if (!id) continue;
      const t: StripeTally = tallies.get(id) || { received: 0, refunded: 0, disputed: false, chargeIds: [] };
      if (c.status === "succeeded" && c.paid && c.captured) {
        t.received += c.amount / 100;
        t.refunded += c.amount_refunded / 100;
        t.chargeIds.push(c.id);
      }
      if (c.disputed) t.disputed = true;
      tallies.set(id, t);
    }
    if (!json.has_more) return tallies;
    after = `&starting_after=${json.data[json.data.length - 1].id}`;
  }
  throw new Error("Stripe charge list exceeded page limit");
}

/**
 * @param reservations Hostaway reservation ids with the full booking total each must reach.
 * @param sinceUnix    Optional lower bound (unix seconds) on charge creation to keep the Stripe listing small.
 */
export async function verifyHostawayPayments(
  reservations: Array<{ hostawayReservationId: string; expectedTotal: number }>,
  sinceUnix?: number
): Promise<Map<string, StripePaymentVerification>> {
  const out = new Map<string, StripePaymentVerification>();
  if (reservations.length === 0) return out;

  let tallies: Map<string, StripeTally>;
  try {
    tallies = await fetchStripeTallies(sinceUnix);
  } catch (err: any) {
    for (const r of reservations) {
      out.set(r.hostawayReservationId, {
        hostawayReservationId: r.hostawayReservationId,
        verdict: "UNVERIFIABLE",
        expectedTotal: r.expectedTotal,
        netReceived: 0,
        refunded: 0,
        chargeIds: [],
        reason: String(err?.message || err),
      });
    }
    return out;
  }

  for (const r of reservations) {
    const t = tallies.get(r.hostawayReservationId);
    const net = t ? round2(t.received - t.refunded) : 0;
    let verdict: StripePaymentVerdict;
    if (!t || t.chargeIds.length === 0) verdict = "NO_STRIPE_PAYMENT";
    else if (t.disputed) verdict = "DISPUTED";
    else if (r.expectedTotal > 0 && net + TOLERANCE >= r.expectedTotal) verdict = "FULLY_RECEIVED";
    else verdict = "PARTIAL";

    out.set(r.hostawayReservationId, {
      hostawayReservationId: r.hostawayReservationId,
      verdict,
      expectedTotal: r.expectedTotal,
      netReceived: net,
      refunded: round2(t?.refunded || 0),
      chargeIds: t?.chargeIds || [],
    });
  }
  return out;
}
