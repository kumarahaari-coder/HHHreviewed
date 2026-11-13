import assert from "assert";
import { approveOfflinePayment, confirmOfflinePayment, rejectOfflinePayment, OfflinePaymentError } from "../payments/offline-payment-actions";

// Small in-memory Supabase stand-in: tables are arrays; supports select/eq/maybeSingle/single, update().eq().eq().select().maybeSingle(), insert().
function fakeDb(tables: Record<string, any[]>) {
  const from = (name: string) => {
    const filters: Array<[string, any]> = [];
    let patch: any = null;
    let inserting: any = null;
    const match = () => tables[name].filter((r) => filters.every(([c, v]) => r[c] === v));
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => (filters.push([c, v]), q),
      maybeSingle: async () => {
        if (patch) { const rows = match(); if (!rows.length) return { data: null, error: null }; Object.assign(rows[0], patch); return { data: { ...rows[0] }, error: null }; }
        const r = match()[0]; return { data: r ? { ...r } : null, error: null };
      },
      single: async () => { const r = match()[0]; return r ? { data: { ...r }, error: null } : { data: null, error: { message: "not found" } }; },
      update: (p: any) => { patch = p; return q; },
      insert: async (row: any) => { tables[name].push(row); return { error: null }; },
      then: undefined,
    };
    // awaiting an update chain without select/maybeSingle (reservation update, rollback)
    q.eq = (c: string, v: any) => { filters.push([c, v]); return Object.assign(Promise.resolve().then(() => { if (patch && !inserting) { match().forEach((r) => Object.assign(r, patch)); } return { error: null }; }), q); };
    return q;
  };
  return { from, tables };
}

const base = () => ({
  reservation_offline_payments: [{ id: "op1", reservation_id: "r1", hostaway_reservation_id: 1, hostaway_charge_id: 9, amount: 826.41, payment_method: "cash", hostaway_status: "paid", status: "PENDING_CONFIRMATION", confirmed_by: null, confirmation_reason: null }],
  reservations: [{ id: "r1", partner_id: null, site_id: null, reservation_status: "CONFIRMED", gross_amount: 826.41, amount_received: 0, payment_status: "UNPAID" }],
  application_audit_logs: [] as any[],
});

async function rejects(p: Promise<any>, status: number, msg: RegExp) {
  try { await p; } catch (e: any) { assert.ok(e instanceof OfflinePaymentError, String(e)); assert.strictEqual(e.status, status); assert.match(e.message, msg); return; }
  assert.fail("expected rejection " + msg);
}

async function main() {
  // confirm needs a real reason
  let db = fakeDb(base());
  await rejects(confirmOfflinePayment({ id: "op1", adminUserId: "adminA", reason: "ok", supabaseClient: db }), 400, /reason/);
  const confirmed = await confirmOfflinePayment({ id: "op1", adminUserId: "adminA", reason: "Bank transfer ref 8841", supabaseClient: db });
  assert.strictEqual(confirmed.status, "CONFIRMED");
  assert.strictEqual(db.tables.reservations[0].amount_received, 0, "confirming alone never counts money");
  assert.strictEqual(db.tables.application_audit_logs[0].action, "CONFIRM_OFFLINE_PAYMENT");
  await rejects(confirmOfflinePayment({ id: "op1", adminUserId: "adminB", reason: "Bank transfer ref 8841", supabaseClient: db }), 409, /pending/);

  // same admin cannot approve
  await rejects(approveOfflinePayment({ id: "op1", adminUserId: "adminA", supabaseClient: db }), 403, /Maker-checker/);
  assert.strictEqual(db.tables.reservation_offline_payments[0].status, "CONFIRMED");
  assert.strictEqual(db.tables.reservations[0].amount_received, 0);

  // a different admin approves: money counted, booking marked paid, audit written
  const out = await approveOfflinePayment({ id: "op1", adminUserId: "adminB", supabaseClient: db });
  assert.strictEqual(out.payment.status, "APPROVED");
  assert.strictEqual(db.tables.reservations[0].amount_received, 826.41);
  assert.strictEqual(db.tables.reservations[0].payment_status, "PAID");
  assert.strictEqual(out.realization.status, "NOT_ATTEMPTED", "no partner attribution -> no commission event");
  const log = db.tables.application_audit_logs.find((l: any) => l.action === "APPROVE_OFFLINE_PAYMENT");
  assert.strictEqual(log.details.confirmedBy, "adminA");
  assert.strictEqual(log.performed_by_user_id, "adminB");
  await rejects(approveOfflinePayment({ id: "op1", adminUserId: "adminC", supabaseClient: db }), 409, /confirmed/);

  // cannot approve when Hostaway no longer shows paid, or the booking is cancelled
  db = fakeDb(base());
  await confirmOfflinePayment({ id: "op1", adminUserId: "adminA", reason: "Receipt 55 on file", supabaseClient: db });
  db.tables.reservation_offline_payments[0].hostaway_status = "cancelled";
  await rejects(approveOfflinePayment({ id: "op1", adminUserId: "adminB", supabaseClient: db }), 409, /no longer shows/);
  db.tables.reservation_offline_payments[0].hostaway_status = "paid";
  db.tables.reservations[0].reservation_status = "CANCELLED";
  await rejects(approveOfflinePayment({ id: "op1", adminUserId: "adminB", supabaseClient: db }), 409, /cancelled/);

  // reject needs a reason, works from pending, and approved payments cannot be rejected
  db = fakeDb(base());
  await rejects(rejectOfflinePayment({ id: "op1", adminUserId: "adminA", reason: "", supabaseClient: db }), 400, /reason/);
  const rej = await rejectOfflinePayment({ id: "op1", adminUserId: "adminA", reason: "No money received", supabaseClient: db });
  assert.strictEqual(rej.status, "REJECTED");
  assert.strictEqual(db.tables.reservations[0].amount_received, 0);
  db = fakeDb(base());
  db.tables.reservation_offline_payments[0].status = "APPROVED";
  await rejects(rejectOfflinePayment({ id: "op1", adminUserId: "adminA", reason: "changed my mind", supabaseClient: db }), 409, /pending or confirmed/);

  // unknown id
  await rejects(confirmOfflinePayment({ id: "nope", adminUserId: "a", reason: "long enough", supabaseClient: fakeDb(base()) }), 404, /not found/);

  console.log("ALL OFFLINE PAYMENT ACTION TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
