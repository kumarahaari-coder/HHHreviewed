import assert from "assert";
import crypto from "crypto";
import { handleStripeEvent, verifyStripeSignature } from "../stripe/webhook";

// ---- signature ----
const secret = "whsec_test_secret";
const body = JSON.stringify({ id: "evt_1", type: "charge.refunded" });
const sign = (b: string, t: number, s = secret) => `t=${t},v1=${crypto.createHmac("sha256", s).update(`${t}.${b}`).digest("hex")}`;

// ---- in-memory Supabase ----
function fakeDb(seed: { reservations: any[]; ledger: any[] }) {
  const tables: Record<string, any[]> = { reservations: seed.reservations, commission_ledger_events: seed.ledger };
  const from = (name: string) => {
    const filters: Array<[string, any]> = [];
    let patch: any = null;
    let insertRow: any = null;
    const rows = () => tables[name].filter((r) => filters.every(([c, v]) => r[c] === v));
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => (filters.push([c, v]), q),
      maybeSingle: async () => ({ data: rows()[0] ? { ...rows()[0] } : null, error: null }),
      single: async () => {
        if (insertRow) {
          if (name === "commission_ledger_events" && tables[name].some((r) => r.idempotency_key === insertRow.idempotency_key)) {
            return { data: null, error: { code: "23505", message: "duplicate" } };
          }
          const row = { id: `ev${tables[name].length}`, ...insertRow }; tables[name].push(row); return { data: row, error: null };
        }
        return { data: rows()[0] ?? null, error: null };
      },
      insert: (row: any) => ((insertRow = row), q),
      update: (p: any) => ((patch = p), q),
      then: (resolve: any) => { if (patch) rows().forEach((r) => Object.assign(r, patch)); resolve({ data: patch ? null : rows().map((r) => ({ ...r })), error: null }); },
    };
    return q;
  };
  return { from, tables };
}

const charge = (over: any = {}) => ({ id: "ch_1", description: "Charge Id: 1, Reservation Id: 555", amount: 100000, amount_refunded: 0, ...over });
const res = (over: any = {}) => ({ id: "r1", partner_id: "p1", site_id: "s1", platform: "direct", gross_amount: 1000, refund_amount: 0, hostaway_reservation_id: 555, ...over });
const realized = (amount = 100) => [
  { reservation_id: "r1", event_type: "INITIAL_ACCRUAL", delta_amount: 0, metadata: {}, idempotency_key: "a" },
  { reservation_id: "r1", event_type: "PAYMENT_REALIZED", delta_amount: amount, metadata: {}, idempotency_key: "b" },
];
const evt = (type: string, object: any) => ({ id: `evt_${Math.random()}`, type, data: { object } });
const ledgerTypes = (db: any) => db.tables.commission_ledger_events.map((e: any) => e.event_type);

async function main() {
  const now = 1_800_000_000;
  assert.strictEqual(verifyStripeSignature(body, sign(body, now), secret, now), true);
  assert.strictEqual(verifyStripeSignature(body + " ", sign(body, now), secret, now), false, "tampered body");
  assert.strictEqual(verifyStripeSignature(body, sign(body, now, "whsec_other"), secret, now), false, "wrong secret");
  assert.strictEqual(verifyStripeSignature(body, sign(body, now - 301), secret, now), false, "expired (replay)");
  assert.strictEqual(verifyStripeSignature(body, sign(body, now + 301), secret, now), false, "from the future");
  assert.strictEqual(verifyStripeSignature(body, null, secret, now), false);
  assert.strictEqual(verifyStripeSignature(body, sign(body, now), undefined, now), false, "no secret configured fails closed");
  assert.strictEqual(verifyStripeSignature(body, `t=${now},v1=deadbeef,${sign(body, now).split(",")[1]}`, secret, now), true, "any matching v1 is enough");

  // refund: 40% refunded -> 40% of $100 realized commission clawed back; booking gets refund_amount
  let db = fakeDb({ reservations: [res()], ledger: realized(100) });
  let out = await handleStripeEvent(evt("charge.refunded", charge({ amount_refunded: 40000 })), { supabase: db });
  assert.strictEqual(out.action, "refund_clawback");
  const claw = db.tables.commission_ledger_events.find((e: any) => e.event_type === "REFUND_CLAWBACK");
  assert.strictEqual(claw.delta_amount, -40);
  assert.strictEqual(db.tables.reservations[0].refund_amount, 400);

  // same event delivered again -> idempotent, no second clawback
  const dup = await handleStripeEvent(evt("charge.refunded", charge({ amount_refunded: 40000 })), { supabase: db });
  assert.strictEqual(ledgerTypes(db).filter((t: string) => t === "REFUND_CLAWBACK").length, 1);
  assert.strictEqual(dup.action, "refund_recorded", "already clawed back: nothing more to do");

  // a later, larger refund of the same charge only claws back the difference
  out = await handleStripeEvent(evt("charge.refunded", charge({ amount_refunded: 100000 })), { supabase: db });
  const total = db.tables.commission_ledger_events.filter((e: any) => e.event_type === "REFUND_CLAWBACK").reduce((a: number, e: any) => a + e.delta_amount, 0);
  assert.strictEqual(total, -100, "full refund claws back the full realized commission, never more");

  // refund before commission was realized: booking flagged, no ledger write
  db = fakeDb({ reservations: [res()], ledger: [{ reservation_id: "r1", event_type: "INITIAL_ACCRUAL", delta_amount: 0, metadata: {} }] });
  out = await handleStripeEvent(evt("charge.refunded", charge({ amount_refunded: 100000 })), { supabase: db });
  assert.strictEqual(out.action, "refund_recorded");
  assert.strictEqual(db.tables.reservations[0].refund_amount, 1000, "future realization now fails closed");
  assert.strictEqual(ledgerTypes(db).includes("REFUND_CLAWBACK"), false);

  // unmapped charges and unattributed bookings are acknowledged and ignored
  db = fakeDb({ reservations: [res({ partner_id: null })], ledger: [] });
  out = await handleStripeEvent(evt("charge.refunded", charge({ amount_refunded: 1000 })), { supabase: db });
  assert.strictEqual(out.handled, false);
  out = await handleStripeEvent(evt("charge.refunded", charge({ description: "unrelated", amount_refunded: 1000 })), { supabase: db });
  assert.strictEqual(out.handled, false);
  out = await handleStripeEvent(evt("customer.created", { id: "cus_1" }), { supabase: db });
  assert.strictEqual(out.handled, false);

  // dispute opened -> hold; closed won -> release
  db = fakeDb({ reservations: [res()], ledger: realized(100) });
  const fetchCharge = async () => charge();
  out = await handleStripeEvent(evt("charge.dispute.created", { id: "dp_1", charge: "ch_1", reason: "fraudulent", amount: 100000, status: "needs_response" }), { supabase: db, fetchCharge });
  assert.strictEqual(out.action, "dispute_hold");
  assert.ok(ledgerTypes(db).includes("DISPUTE_HOLD"));
  await handleStripeEvent(evt("charge.dispute.created", { id: "dp_1", charge: "ch_1", reason: "fraudulent", amount: 100000, status: "needs_response" }), { supabase: db, fetchCharge });
  assert.strictEqual(ledgerTypes(db).filter((t: string) => t === "DISPUTE_HOLD").length, 1, "idempotent");
  out = await handleStripeEvent(evt("charge.dispute.closed", { id: "dp_1", charge: "ch_1", amount: 100000, status: "won" }), { supabase: db, fetchCharge });
  assert.strictEqual(out.action, "dispute_release");
  assert.ok(ledgerTypes(db).includes("DISPUTE_RELEASE"));

  // dispute lost -> clawback of the disputed share, hold stays (no release)
  db = fakeDb({ reservations: [res()], ledger: realized(100) });
  await handleStripeEvent(evt("charge.dispute.created", { id: "dp_2", charge: "ch_1", reason: "fraudulent", amount: 50000, status: "needs_response" }), { supabase: db, fetchCharge });
  out = await handleStripeEvent(evt("charge.dispute.closed", { id: "dp_2", charge: "ch_1", amount: 50000, status: "lost" }), { supabase: db, fetchCharge });
  assert.strictEqual(out.action, "dispute_lost_clawback");
  assert.strictEqual(db.tables.commission_ledger_events.find((e: any) => e.event_type === "REFUND_CLAWBACK").delta_amount, -50);
  assert.strictEqual(ledgerTypes(db).includes("DISPUTE_RELEASE"), false, "a lost dispute never releases the hold");

  // dispute on a charge we cannot map
  out = await handleStripeEvent(evt("charge.dispute.created", { id: "dp_3", charge: "ch_x", amount: 1, status: "needs_response" }), { supabase: db, fetchCharge: async () => null });
  assert.strictEqual(out.handled, false);

  console.log("ALL STRIPE WEBHOOK TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
