import assert from "assert";
import { verifyHostawayPayments } from "../stripe/payment-verification";
import { resolvePaymentTally, getPaymentMatchMode, isOfflineCharge } from "../stripe/charge-id-payments";

const hw = (id: number, over: any = {}) => ({
  id, status: "paid", amount: 500, paymentProvider: "stripe", paymentMethod: "credit_card_online",
  paymentProviderChargeId: `ch_${id}`, ...over,
});
const sc = (id: string, amount: number, over: any = {}) => ({
  id, amount: amount * 100, amount_refunded: 0, status: "succeeded", paid: true, captured: true, disputed: false, ...over,
});

async function main() {
  process.env.STRIPE_SECRET_KEY = "rk_test_x";
  process.env.HOSTAWAY_ACCOUNT_ID = "1";
  process.env.HOSTAWAY_API_KEY = "k";
  delete process.env.PAYMENT_MATCH_MODE;
  assert.strictEqual(getPaymentMatchMode(), "charge_id");

  // Hostaway charges per reservation
  const hostaway: Record<string, any[]> = {
    "100": [hw(1), hw(2)],                                              // two Stripe halves = 1000
    "200": [hw(3)],                                                     // one half -> partial
    "300": [hw(4, { paymentProvider: "offline", paymentMethod: "cash", paymentProviderChargeId: null, amount: 1000 })], // cash never counts
    "400": [hw(5)],                                                     // disputed in Stripe
    "500": [hw(6)],                                                     // refunded in Stripe
    "600": [hw(7, { status: "cancelled" })],                            // cancelled charge ignored
    "700": [hw(8, { paymentProviderChargeId: null })],                  // Stripe charge without id ignored
    "800": [hw(9)],                                                     // Stripe says charge does not exist
  };
  const stripe: Record<string, any> = {
    ch_1: sc("ch_1", 500), ch_2: sc("ch_2", 500), ch_3: sc("ch_3", 500),
    ch_5: sc("ch_5", 600, { disputed: true }),
    ch_6: sc("ch_6", 700, { amount_refunded: 20000 }),
  };

  // Offline classification: cash/bank entries queue for confirmation; OTA-channel payments and Stripe charges do not
  const mk = (over: any) => ({ id: 1, status: "paid", amount: 1, paymentProvider: "offline", paymentMethod: "cash", paymentProviderChargeId: null, ...over });
  assert.strictEqual(isOfflineCharge(mk({}) as any), true);
  assert.strictEqual(isOfflineCharge(mk({ paymentMethod: "ota" }) as any), false, "OTA channel payments are not offline guest payments");
  assert.strictEqual(isOfflineCharge(mk({ paymentMethod: "OTA" }) as any), false);
  assert.strictEqual(isOfflineCharge(mk({ paymentProvider: "stripe", paymentProviderChargeId: "ch_1" }) as any), false);

  const realFetch = globalThis.fetch;
  let hostawayDown = false;
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    if (u.includes("accessTokens")) return { ok: true, status: 200, json: async () => ({ access_token: "t", token_type: "Bearer", expires_in: 3600 }), text: async () => JSON.stringify({ access_token: "t", token_type: "Bearer", expires_in: 3600 }) };
    if (u.includes("guestPayments/charges")) {
      if (hostawayDown) return { ok: false, status: 500, json: async () => ({}), text: async () => "down" };
      const rid = new URL(u).searchParams.get("reservationId")!;
      const body = { status: "success", result: hostaway[rid] || [] };
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
    }
    if (u.includes("api.stripe.com/v1/charges/")) {
      const id = decodeURIComponent(u.split("/charges/")[1]);
      return stripe[id]
        ? { ok: true, status: 200, json: async () => stripe[id] }
        : { ok: false, status: 404, json: async () => ({ error: { code: "resource_missing", message: "No such charge" } }) };
    }
    throw new Error("unexpected fetch " + u);
  }) as any;

  const ids = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];
  const r = await verifyHostawayPayments(ids.map((id) => ({ hostawayReservationId: id, expectedTotal: id === "400" ? 600 : id === "500" ? 700 : 1000 })));
  assert.strictEqual(r.get("100")!.verdict, "FULLY_RECEIVED", String(r.get("100")!.reason));
  assert.deepStrictEqual(r.get("100")!.chargeIds, ["ch_1", "ch_2"]);
  assert.strictEqual(r.get("200")!.verdict, "PARTIAL");
  assert.strictEqual(r.get("300")!.verdict, "NO_STRIPE_PAYMENT", "offline cash must never count");
  assert.strictEqual(r.get("400")!.verdict, "DISPUTED");
  assert.strictEqual(r.get("500")!.verdict, "PARTIAL", "refund reduces net");
  assert.strictEqual(r.get("600")!.verdict, "NO_STRIPE_PAYMENT");
  assert.strictEqual(r.get("700")!.verdict, "NO_STRIPE_PAYMENT");
  assert.strictEqual(r.get("800")!.verdict, "NO_STRIPE_PAYMENT");
  assert.strictEqual(r.get("900")!.verdict, "NO_STRIPE_PAYMENT");

  // Fail closed when Hostaway cannot be queried
  hostawayDown = true;
  const down = await verifyHostawayPayments([{ hostawayReservationId: "100", expectedTotal: 1000 }]);
  assert.strictEqual(down.get("100")!.verdict, "UNVERIFIABLE");
  hostawayDown = false;

  // Fail closed without a Stripe key
  delete process.env.STRIPE_SECRET_KEY;
  const nokey = await verifyHostawayPayments([{ hostawayReservationId: "100", expectedTotal: 1000 }]);
  assert.strictEqual(nokey.get("100")!.verdict, "UNVERIFIABLE");
  process.env.STRIPE_SECRET_KEY = "rk_test_x";

  // Sync-time helper: channel-paid bookings are skipped, lookup failure returns undefined (never throws)
  assert.strictEqual(await resolvePaymentTally("100", "airbnb"), undefined);
  assert.strictEqual((await resolvePaymentTally("100", "direct"))!.received, 1000);
  hostawayDown = true;
  assert.strictEqual(await resolvePaymentTally("100", "direct"), undefined);
  hostawayDown = false;

  // Revert switch: description mode uses the legacy tallies handed in
  process.env.PAYMENT_MATCH_MODE = "description";
  const legacy = new Map([["100", { received: 5, refunded: 0, disputed: false, chargeIds: ["x"] }]]);
  assert.strictEqual((await resolvePaymentTally("100", "direct", legacy))!.received, 5);

  globalThis.fetch = realFetch;
  console.log("ALL CHARGE-ID PAYMENT TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
