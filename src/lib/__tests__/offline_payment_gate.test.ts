import assert from "assert";
import { applyStripePaymentGate } from "../commissions/payout-generator";
import { offlineHoldAnchor, getOfflineHoldHours, DEFAULT_OFFLINE_HOLD_HOURS } from "../payments/offline-payments";

const reservations = [
  { id: "full-stripe", hostaway_reservation_id: 1, gross_amount: 1000, booking_date: null },
  { id: "offline-only", hostaway_reservation_id: 2, gross_amount: 800, booking_date: null },
  { id: "stripe-plus-offline", hostaway_reservation_id: 3, gross_amount: 1000, booking_date: null },
  { id: "offline-short", hostaway_reservation_id: 4, gross_amount: 800, booking_date: null },
  { id: "offline-not-approved", hostaway_reservation_id: 5, gross_amount: 800, booking_date: null },
  { id: "disputed-with-offline", hostaway_reservation_id: 6, gross_amount: 800, booking_date: null },
  { id: "no-money", hostaway_reservation_id: 7, gross_amount: 800, booking_date: null },
  { id: "airbnb-no-hostaway-id", hostaway_reservation_id: null, gross_amount: 800, booking_date: null },
];

const hostawayCharges: Record<string, any[]> = {
  "1": [{ id: 11, status: "paid", amount: 1000, paymentProvider: "stripe", paymentMethod: "credit_card_online", paymentProviderChargeId: "ch_1" }],
  "3": [{ id: 31, status: "paid", amount: 600, paymentProvider: "stripe", paymentMethod: "credit_card_online", paymentProviderChargeId: "ch_3" }],
  "6": [{ id: 61, status: "paid", amount: 500, paymentProvider: "stripe", paymentMethod: "credit_card_online", paymentProviderChargeId: "ch_6" }],
};
const stripeCharges: Record<string, any> = {
  ch_1: { id: "ch_1", amount: 100000, amount_refunded: 0, status: "succeeded", paid: true, captured: true, disputed: false },
  ch_3: { id: "ch_3", amount: 60000, amount_refunded: 0, status: "succeeded", paid: true, captured: true, disputed: false },
  ch_6: { id: "ch_6", amount: 50000, amount_refunded: 0, status: "succeeded", paid: true, captured: true, disputed: true },
};
// Approved offline payments (status APPROVED and still paid in Hostaway); "offline-not-approved" has none.
const approvedOffline = [
  { reservation_id: "offline-only", amount: 800, approved_at: "2026-11-10T10:00:00Z" },
  { reservation_id: "stripe-plus-offline", amount: 400, approved_at: "2026-11-10T10:00:00Z" },
  { reservation_id: "offline-short", amount: 300, approved_at: "2026-11-10T10:00:00Z" },
  { reservation_id: "disputed-with-offline", amount: 300, approved_at: "2026-11-10T10:00:00Z" },
];

async function main() {
  process.env.STRIPE_SECRET_KEY = "rk_test_x";
  process.env.HOSTAWAY_ACCOUNT_ID = "1";
  process.env.HOSTAWAY_API_KEY = "k";
  delete process.env.PAYMENT_MATCH_MODE;
  delete process.env.PAYOUT_REQUIRE_STRIPE_VERIFICATION;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    if (u.includes("accessTokens")) return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "t", token_type: "Bearer", expires_in: 3600 }) };
    if (u.includes("guestPayments/charges")) {
      const rid = new URL(u).searchParams.get("reservationId")!;
      const body = { status: "success", result: hostawayCharges[rid] || [] };
      return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
    }
    if (u.includes("api.stripe.com/v1/charges/")) {
      const c = stripeCharges[decodeURIComponent(u.split("/charges/")[1])];
      return c ? { ok: true, status: 200, json: async () => c } : { ok: false, status: 404, json: async () => ({ error: { code: "resource_missing" } }) };
    }
    throw new Error("unexpected fetch " + u);
  }) as any;

  const db: any = { from: () => ({ select: () => ({ in: () => ({ eq: () => ({ eq: async () => ({ data: approvedOffline, error: null }) }) }) }) }) };
  const gate = await applyStripePaymentGate(reservations.map((r) => ({ reservation_id: r.id })), async () => reservations, db);

  const kept = gate.kept.map((r) => r.reservation_id).sort();
  assert.deepStrictEqual(kept, ["airbnb-no-hostaway-id", "full-stripe", "offline-only", "stripe-plus-offline"].sort());
  assert.deepStrictEqual([...gate.offlinePaid].sort(), ["offline-only", "stripe-plus-offline"], "offline-backed bookings are labelled");
  assert.strictEqual(gate.verification["stripe-plus-offline"].verdict, "FULLY_RECEIVED_INCL_OFFLINE");
  assert.strictEqual(gate.verification["full-stripe"].verdict, "FULLY_RECEIVED");
  assert.ok(!kept.includes("offline-short"), "approved offline that does not cover the total is excluded");
  assert.ok(!kept.includes("offline-not-approved"), "unapproved offline never counts");
  assert.ok(!kept.includes("disputed-with-offline"), "a Stripe dispute is never overridden by offline money");
  assert.ok(!kept.includes("no-money"));

  // Hold anchor (only used when an extra offline hold is configured); default is no extra hold
  assert.strictEqual(offlineHoldAnchor("2026-09-15", "2026-11-10T10:00:00Z"), "2026-11-10");
  assert.strictEqual(offlineHoldAnchor("2026-12-20", "2026-11-10T10:00:00Z"), "2026-12-20");
  assert.strictEqual(offlineHoldAnchor("2026-09-15", null), "2026-09-15");
  delete process.env.OFFLINE_PAYMENT_HOLD_HOURS;
  assert.strictEqual(getOfflineHoldHours(), DEFAULT_OFFLINE_HOLD_HOURS);
  assert.strictEqual(DEFAULT_OFFLINE_HOLD_HOURS, 0, "no extra wait for offline payments by default");
  process.env.OFFLINE_PAYMENT_HOLD_HOURS = "168";
  assert.strictEqual(getOfflineHoldHours(), 168, "an extra hold can still be configured");
  process.env.OFFLINE_PAYMENT_HOLD_HOURS = "not-a-number";
  assert.strictEqual(getOfflineHoldHours(), 0);
  delete process.env.OFFLINE_PAYMENT_HOLD_HOURS;

  globalThis.fetch = realFetch;
  console.log("ALL OFFLINE PAYMENT GATE TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
