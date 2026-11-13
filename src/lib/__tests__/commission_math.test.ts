import assert from "assert";
import { commissionFromAccrual, reservationCommissionView } from "../commissions/commission-math";

const hostawayAccrual = (stored: number, gross: number, pct = 10) => ({
  event_type: "INITIAL_ACCRUAL", delta_amount: 0, calculated_commission: stored,
  metadata: { ingestion_source: "hostaway_sync", rule_type: "percentage", percentage: pct, gross_amount: gross },
});
const realized = (d: number) => ({ event_type: "PAYMENT_REALIZED", delta_amount: d, calculated_commission: d });
const fees = (gross: number) => ({ gross, cleaning: 300, service: 0, taxes: 0 });

// stale accrual (booked at $4,809.54, now $803.46): expected commission follows the CURRENT total
assert.strictEqual(commissionFromAccrual(hostawayAccrual(450.95, 4809.54), fees(803.46)), 50.35);
assert.strictEqual(commissionFromAccrual(hostawayAccrual(61.82, 918.23), fees(918.23)), 61.82);
// fixed-amount and non-Hostaway accruals keep their stored amount
assert.strictEqual(commissionFromAccrual({ event_type: "INITIAL_ACCRUAL", calculated_commission: 40, metadata: { ingestion_source: "hostaway_sync", rule_type: "fixed" } }, fees(999)), 40);
assert.strictEqual(commissionFromAccrual({ event_type: "INITIAL_ACCRUAL", calculated_commission: 99, metadata: { rule_type: "percentage", percentage: 10 } }, fees(999)), 99);

// not paid yet -> "expected" (accrual only; never added to anything else)
let v = reservationCommissionView([hostawayAccrual(450.95, 4809.54)], fees(803.46));
assert.deepStrictEqual(v, { amount: 50.35, kind: "expected" });

// paid -> "earned" = realized, NOT accrual + realized (the old double count)
v = reservationCommissionView([hostawayAccrual(50.35, 803.46), realized(50.35)], fees(803.46));
assert.deepStrictEqual(v, { amount: 50.35, kind: "earned" });

// payout settlement and release events never change the figure (they used to make it negative)
v = reservationCommissionView([hostawayAccrual(100, 1250), realized(100), { event_type: "ELIGIBILITY_RELEASE", delta_amount: 0 }, { event_type: "PAYOUT_SETTLEMENT", delta_amount: -100, calculated_commission: 0 }], fees(1250));
assert.deepStrictEqual(v, { amount: 100, kind: "earned" });

// refund clawback reduces what was earned
v = reservationCommissionView([hostawayAccrual(100, 1250), realized(100), { event_type: "REFUND_CLAWBACK", delta_amount: -40 }], fees(1250));
assert.deepStrictEqual(v, { amount: 60, kind: "earned" });

// cancelled with nothing realized, or no accrual -> nothing
assert.deepStrictEqual(reservationCommissionView([hostawayAccrual(100, 1250)], fees(1250), { cancelled: true }), { amount: null, kind: "none" });
assert.deepStrictEqual(reservationCommissionView([{ event_type: "ELIGIBILITY_RELEASE" }], fees(1250)), { amount: null, kind: "none" });
assert.deepStrictEqual(reservationCommissionView([], fees(1250)), { amount: null, kind: "none" });

console.log("ALL COMMISSION MATH TESTS PASSED");
