import assert from "assert";
import { reconcileReservationPaymentRealization } from "../commissions/ledger";

// In-memory Supabase stand-in (select/eq/maybeSingle/single/insert/then).
function fakeDb(reservations: any[], ledger: any[]) {
  const tables: Record<string, any[]> = { reservations, commission_ledger_events: ledger };
  const from = (name: string) => {
    const filters: Array<[string, any]> = [];
    let insertRow: any = null;
    const rows = () => tables[name].filter((r) => filters.every(([c, v]) => r[c] === v));
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => (filters.push([c, v]), q),
      maybeSingle: async () => ({ data: rows()[0] ? { ...rows()[0] } : null, error: null }),
      single: async () => {
        if (insertRow) {
          if (tables[name].some((r) => r.idempotency_key === insertRow.idempotency_key)) return { data: null, error: { code: "23505", message: "dup" } };
          const row = { id: `ev${tables[name].length}`, ...insertRow }; tables[name].push(row); return { data: row, error: null };
        }
        return rows()[0] ? { data: { ...rows()[0] }, error: null } : { data: null, error: { message: "not found" } };
      },
      insert: (row: any) => ((insertRow = row), q),
      then: (resolve: any) => resolve({ data: rows().map((r) => ({ ...r })), error: null }),
    };
    return q;
  };
  return { from, tables };
}

const reservation = (over: any = {}) => ({
  id: "r1", partner_id: "p1", site_id: "s1", platform: "direct", reservation_status: "CONFIRMED", payment_status: "PAID",
  gross_amount: 803.46, amount_received: 803.46, refund_amount: 0, cleaning_fee: 300, service_fee: 0, taxes_amount: 0, ...over,
});
const accrual = (commission: number, meta: any) => ({
  id: "a1", reservation_id: "r1", partner_id: "p1", site_id: "s1", event_type: "INITIAL_ACCRUAL", delta_amount: 0,
  calculated_commission: commission, source_provider: "hostaway", booking_channel: "direct", provider_booking_id: "1", metadata: meta, idempotency_key: "evt_accrual_r1",
});
const hostawayMeta = (gross: number, pct = 10) => ({ ingestion_source: "hostaway_sync", rule_type: "percentage", percentage: pct, gross_amount: gross, contracted_base: gross - 300 });

async function main() {
  // The reported case: accrued when the total was $4,809.54 ($450.95), booking later changed to $803.46
  let db: any = fakeDb([reservation()], [accrual(450.95, hostawayMeta(4809.54))]);
  let out = await reconcileReservationPaymentRealization({ reservationId: "r1", sourceProvider: "hostaway", supabaseClient: db });
  assert.strictEqual(out.status, "REALIZED");
  assert.strictEqual(out.realizedAmount, 50.35, "10% of (803.46 - 300), not the stale 450.95");
  const ev = db.tables.commission_ledger_events.find((e: any) => e.event_type === "PAYMENT_REALIZED");
  assert.strictEqual(ev.delta_amount, 50.35);
  assert.strictEqual(ev.metadata.recomputedFromCurrentTotal, true);
  assert.strictEqual(ev.metadata.accrualSnapshotCommission, 450.95, "the original snapshot is kept for audit");

  // Total unchanged: the accrual amount is used as is
  db = fakeDb([reservation({ gross_amount: 918.23, amount_received: 918.23 })], [accrual(61.82, hostawayMeta(918.23))]);
  out = await reconcileReservationPaymentRealization({ reservationId: "r1", sourceProvider: "hostaway", supabaseClient: db });
  assert.strictEqual(out.realizedAmount, 61.82);
  assert.strictEqual(db.tables.commission_ledger_events.find((e: any) => e.event_type === "PAYMENT_REALIZED").metadata.recomputedFromCurrentTotal, undefined);

  // Uses the accrual's historical percentage, never today's rule
  db = fakeDb([reservation()], [accrual(450.95, hostawayMeta(4809.54, 15))]);
  out = await reconcileReservationPaymentRealization({ reservationId: "r1", sourceProvider: "hostaway", supabaseClient: db });
  assert.strictEqual(out.realizedAmount, 75.52, "15% snapshot x 503.46");

  // Accruals from other providers (OwnerRez itemised base) and fixed-amount rules are untouched
  db = fakeDb([reservation()], [accrual(99, { rule_type: "percentage", percentage: 10, gross_amount: 5000 })]);
  out = await reconcileReservationPaymentRealization({ reservationId: "r1", sourceProvider: "ownerrez", supabaseClient: db });
  assert.strictEqual(out.realizedAmount, 99);
  db = fakeDb([reservation()], [accrual(40, { ingestion_source: "hostaway_sync", rule_type: "fixed", gross_amount: 5000 })]);
  out = await reconcileReservationPaymentRealization({ reservationId: "r1", sourceProvider: "hostaway", supabaseClient: db });
  assert.strictEqual(out.realizedAmount, 40);

  // Total dropped to fees only: nothing to realize, fails closed
  db = fakeDb([reservation({ gross_amount: 300, amount_received: 300 })], [accrual(450.95, hostawayMeta(4809.54))]);
  out = await reconcileReservationPaymentRealization({ reservationId: "r1", sourceProvider: "hostaway", supabaseClient: db });
  assert.strictEqual(out.status, "MISSING_ACCRUAL_REVIEW_REQUIRED");
  assert.strictEqual(db.tables.commission_ledger_events.some((e: any) => e.event_type === "PAYMENT_REALIZED"), false);

  console.log("ALL COMMISSION RECOMPUTE TESTS PASSED");
}
main().catch((e) => { console.error(e); process.exit(1); });
