import assert from "assert";
import { verifyHostawayPayments } from "../stripe/payment-verification";

const ch = (id: string, res: number, amount: number, over: any = {}) => ({
  id, description: `Charge Id: 1, Reservation Id: ${res}`, amount: amount * 100, amount_refunded: 0,
  status: "succeeded", paid: true, captured: true, disputed: false, ...over,
});

async function main() {
  process.env.STRIPE_SECRET_KEY = "rk_test_x";
  const charges = [
    ch("a1", 100, 500), ch("a2", 100, 500),                       // 100: two halves = 1000 -> full
    ch("b1", 200, 500),                                           // 200: half -> partial
    ch("c1", 300, 800), ch("c2", 300, 800, { status: "failed", paid: false, captured: false }), // failed ignored
    ch("d1", 400, 600, { disputed: true }),                       // disputed
    ch("e1", 500, 700, { amount_refunded: 20000 }),               // refund reduces net below total
  ];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ data: charges, has_more: false }) })) as any;
  const r = await verifyHostawayPayments([
    { hostawayReservationId: "100", expectedTotal: 1000 },
    { hostawayReservationId: "200", expectedTotal: 1000 },
    { hostawayReservationId: "300", expectedTotal: 800 },
    { hostawayReservationId: "400", expectedTotal: 600 },
    { hostawayReservationId: "500", expectedTotal: 700 },
    { hostawayReservationId: "600", expectedTotal: 100 },
  ]);
  assert.strictEqual(r.get("100")!.verdict, "FULLY_RECEIVED");
  assert.strictEqual(r.get("200")!.verdict, "PARTIAL");
  assert.strictEqual(r.get("300")!.verdict, "FULLY_RECEIVED");
  assert.strictEqual(r.get("400")!.verdict, "DISPUTED");
  assert.strictEqual(r.get("500")!.verdict, "PARTIAL");
  assert.strictEqual(r.get("600")!.verdict, "NO_STRIPE_PAYMENT");

  globalThis.fetch = (async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) })) as any;
  const f = await verifyHostawayPayments([{ hostawayReservationId: "100", expectedTotal: 1000 }]);
  assert.strictEqual(f.get("100")!.verdict, "UNVERIFIABLE");

  delete process.env.STRIPE_SECRET_KEY;
  const k = await verifyHostawayPayments([{ hostawayReservationId: "100", expectedTotal: 1000 }]);
  assert.strictEqual(k.get("100")!.verdict, "UNVERIFIABLE");
  globalThis.fetch = realFetch;
  console.log("ALL STRIPE PAYMENT VERIFICATION TESTS PASSED");
}
main();
