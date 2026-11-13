import assert from "assert";
import { lookupPaymentForBooking, prefetchPaymentLookups, PAYMENT_LOOKUP_CONCURRENCY } from "../hostaway/payment-lookup";

const booking = (id: number, updatedOn = "2026-11-01 10:00:00", channelName = "bookingengine") =>
  ({ id, updatedOn, channelName, status: "confirmed", totalPrice: 100 } as any);

let inFlight = 0;
let maxInFlight = 0;
let chargeCalls = 0;

async function main() {
  process.env.STRIPE_SECRET_KEY = "rk_test_x";
  process.env.HOSTAWAY_ACCOUNT_ID = "1";
  process.env.HOSTAWAY_API_KEY = "k";
  delete process.env.PAYMENT_MATCH_MODE;
  let hostawayDown = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    if (u.includes("accessTokens")) return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "t", token_type: "Bearer", expires_in: 3600 }) };
    if (u.includes("guestPayments/charges")) {
      chargeCalls++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      if (hostawayDown) return { ok: false, status: 500, headers: { get: () => null }, text: async () => "down" };
      const body = { status: "success", result: [{ id: 1, status: "paid", amount: 10, paymentProvider: "offline", paymentMethod: "cash", paymentProviderChargeId: null }] };
      return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
    }
    throw new Error("unexpected fetch " + u);
  }) as any;

  // unchanged updatedOn -> skipped, no API call
  let r = await lookupPaymentForBooking({ booking: booking(1), prior: { updatedOn: "2026-11-01 10:00:00" } });
  assert.strictEqual(r.kind, "unchanged");
  assert.strictEqual(chargeCalls, 0);

  // changed, no prior, or forced -> looked up
  r = await lookupPaymentForBooking({ booking: booking(1, "2026-11-02 09:00:00"), prior: { updatedOn: "2026-11-01 10:00:00" } });
  assert.strictEqual(r.kind, "details");
  r = await lookupPaymentForBooking({ booking: booking(1), prior: null });
  assert.strictEqual(r.kind, "details");
  r = await lookupPaymentForBooking({ booking: booking(1), prior: { updatedOn: "2026-11-01 10:00:00" }, force: true });
  assert.strictEqual(r.kind, "details");
  assert.strictEqual(chargeCalls, 3);
  if (r.kind === "details") assert.strictEqual(r.offlineCharges.length, 1, "offline charge surfaced");

  // channel-paid booking: no Hostaway charge call, not a failure
  const before = chargeCalls;
  const a = await lookupPaymentForBooking({ booking: booking(2, "x", "airbnbOfficial"), prior: null });
  assert.strictEqual(chargeCalls, before);
  assert.ok(a.kind === "details" && !a.failed && a.tally === undefined);

  // failed lookup is flagged so stored amounts are kept and the booking is retried next sync
  hostawayDown = true;
  const f = await lookupPaymentForBooking({ booking: booking(3, "y"), prior: null });
  assert.ok(f.kind === "details" && f.failed === true);
  hostawayDown = false;

  // prefetch: unchanged ones skipped, the rest run in parallel but never above the concurrency limit
  const fakeDb = {
    from: () => ({ select: () => ({ in: async (_c: string, ids: number[]) => ({ data: ids.filter((i) => i === 100).map((i) => ({ hostaway_reservation_id: i, prior_updated_on: "2026-11-01 10:00:00" })), error: null }) }) }),
  };
  chargeCalls = 0; maxInFlight = 0;
  const batch = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109].map((id) => booking(id));
  const res = await prefetchPaymentLookups(fakeDb, batch);
  assert.strictEqual(res.get(100)!.kind, "unchanged");
  assert.strictEqual(chargeCalls, 9, "only changed bookings are looked up");
  assert.ok(maxInFlight > 1 && maxInFlight <= PAYMENT_LOOKUP_CONCURRENCY, `parallel but bounded (saw ${maxInFlight})`);

  // legacy revert mode keeps the old behaviour (no per-booking skip)
  process.env.PAYMENT_MATCH_MODE = "description";
  const legacy = await lookupPaymentForBooking({ booking: booking(1), prior: { updatedOn: "2026-11-01 10:00:00" } });
  assert.strictEqual(legacy.kind, "details");

  globalThis.fetch = realFetch;
  console.log("ALL PAYMENT LOOKUP TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
