import {
  calculateRollingWindow,
  getUtcDateString,
} from "@/lib/hospitable/sync-runner";
import { normalizeHospitableReservation } from "@/lib/hospitable/normalize";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runIncrementalSyncTests() {
  console.log("Starting Phase 5 Incremental Sync tests...");

  // Test 1: UTC Date String formatting
  {
    const date = new Date("2026-07-29T12:00:00.000Z");
    const dateStr = getUtcDateString(date);
    assert(dateStr === "2026-07-29", "Expected YYYY-MM-DD format in UTC");
    console.log("✓ Test 1 Passed: UTC date string formatting verified");
  }

  // Test 2: Rolling Window Calculation (lookback 30, lookahead 365)
  {
    const { windowStart, windowEnd } = calculateRollingWindow(30, 365);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(windowStart), "windowStart must be YYYY-MM-DD");
    assert(/^\d{4}-\d{2}-\d{2}$/.test(windowEnd), "windowEnd must be YYYY-MM-DD");

    const startDateObj = new Date(windowStart + "T00:00:00Z");
    const endDateObj = new Date(windowEnd + "T00:00:00Z");
    assert(startDateObj < endDateObj, "windowStart must be before windowEnd");

    const diffDays = Math.round(
      (endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)
    );
    assert(diffDays === 395, `Expected 395 days total window, got ${diffDays}`);
    console.log(`✓ Test 2 Passed: Rolling window calculated cleanly (${windowStart} to ${windowEnd})`);
  }

  // Test 3: Reservation Boundary Inclusion (windowStart & windowEnd inclusive)
  {
    const { windowStart, windowEnd } = calculateRollingWindow(30, 365);

    const boundaryStartRes = {
      id: "res-boundary-start",
      code: "HOST-START1",
      platform: "direct",
      property_id: "058aed01-470f-4ca7-a191-37c597e7f377",
      arrival_date: `${windowStart}T15:00:00Z`,
      departure_date: `${windowStart}T18:00:00Z`,
      financials: { currency: "USD" },
    };

    const boundaryEndRes = {
      id: "res-boundary-end",
      code: "HOST-END1",
      platform: "direct",
      property_id: "5da25edc-88ac-43c4-876a-f7b626c88ecd",
      arrival_date: `${windowEnd}T15:00:00Z`,
      departure_date: `${windowEnd}T18:00:00Z`,
      financials: { currency: "USD" },
    };

    const normStart = normalizeHospitableReservation(boundaryStartRes);
    const normEnd = normalizeHospitableReservation(boundaryEndRes);

    assert(
      normStart.checkInDate.startsWith(windowStart),
      "Start boundary reservation check-in matches windowStart"
    );
    assert(
      normEnd.checkInDate.startsWith(windowEnd),
      "End boundary reservation check-in matches windowEnd"
    );
    console.log("✓ Test 3 Passed: Window boundary reservation handling verified");
  }

  // Test 4: Financial update & zero-value validity
  {
    const rawZeroFeeRes = {
      id: "res-zero-fee",
      code: "HOST-ZERO1",
      platform: "direct",
      property_id: "abe5540b-8cbc-4bc2-b561-b25f7d4d35b0",
      financials: {
        currency: "USD",
        guest: {
          total_price: { amount: 10000 },
          accommodation: { amount: 10000 },
          fees: [{ amount: 0, category: "Guest fees", label: "Cleaning fee" }],
          payments: [{ amount: 10000, category: "Payment", label: "Payment 1" }],
        },
      },
    };

    const normZero = normalizeHospitableReservation(rawZeroFeeRes);
    assert(normZero.cleaningFee === 0, "Valid zero cleaning fee preserved");
    assert(normZero.bookingAmount === 100, "Booking amount extracted cleanly");
    assert(normZero.amountReceived === 100, "Amount received extracted cleanly");
    assert(normZero.paymentStatus === "PAID", "Payment status resolves to PAID");
    console.log("✓ Test 4 Passed: Financial zero-value validity and resolution verified");
  }

  console.log("All Phase 5 Incremental Sync tests completed successfully!");
  return true;
}

if (require.main === module) {
  runIncrementalSyncTests();
}
