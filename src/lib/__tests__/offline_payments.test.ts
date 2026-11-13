import assert from "assert";
import { recordOfflinePayments } from "../payments/offline-payments";

// Minimal in-memory stand-in for the Supabase query builder used by the recorder.
function fakeSupabase(seed: any[] = [], failWith?: string) {
  const rows = [...seed];
  const api: any = {
    rows,
    from() {
      let filter: any = null;
      const q: any = {
        select: () => q,
        eq: (_c: string, v: any) => ((filter = v), q),
        maybeSingle: async () => (failWith ? { data: null, error: { message: failWith } } : { data: (() => { const f = rows.find((r) => r.hostaway_charge_id === filter); return f ? { ...f } : null; })(), error: null }),
        insert: async (r: any) => (rows.push({ id: `row${rows.length}`, status: "PENDING_CONFIRMATION", ...r }), { error: null }),
        update: (patch: any) => ({ eq: async (_c: string, id: string) => (Object.assign(rows.find((r) => r.id === id), patch), { error: null }) }),
      };
      return q;
    },
  };
  return api;
}

const charge = (id: number, over: any = {}) => ({ id, status: "paid", amount: 500, paymentProvider: "offline", paymentMethod: "cash", paymentProviderChargeId: null, ...over });

async function main() {
  const sb = fakeSupabase();
  let r = await recordOfflinePayments({ supabase: sb, reservationId: "res1", hostawayReservationId: 1, charges: [charge(10), charge(11, { status: "cancelled" })] });
  assert.deepStrictEqual(r, { recorded: 1, updated: 0 }, "only paid offline charges are recorded");
  assert.strictEqual(sb.rows[0].status, "PENDING_CONFIRMATION", "never counted automatically");

  r = await recordOfflinePayments({ supabase: sb, reservationId: "res1", hostawayReservationId: 1, charges: [charge(10)] });
  assert.strictEqual(sb.rows.length, 1, "idempotent: no duplicate row");

  await recordOfflinePayments({ supabase: sb, reservationId: "res1", hostawayReservationId: 1, charges: [charge(10, { status: "cancelled" })] });
  assert.strictEqual(sb.rows[0].status, "WITHDRAWN", "unconfirmed charge withdrawn when Hostaway stops showing it paid");

  const approved = fakeSupabase([{ id: "a", hostaway_charge_id: 20, status: "APPROVED", hostaway_status: "paid" }]);
  r = await recordOfflinePayments({ supabase: approved, reservationId: "res1", hostawayReservationId: 1, charges: [charge(20, { status: "cancelled" })] });
  assert.strictEqual(approved.rows[0].status, "APPROVED", "approved rows are not silently changed");
  assert.strictEqual(approved.rows[0].hostaway_status, "cancelled", "but the Hostaway change is visible");
  assert.strictEqual(r.updated, 1);

  const broken = fakeSupabase([], "relation does not exist");
  r = await recordOfflinePayments({ supabase: broken, reservationId: "res1", hostawayReservationId: 1, charges: [charge(30)] });
  assert.deepStrictEqual(r, { recorded: 0, updated: 0 }, "database errors never throw into the sync");
  console.log("ALL OFFLINE PAYMENT RECORDER TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
