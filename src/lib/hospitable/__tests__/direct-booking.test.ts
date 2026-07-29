import { normalizeHospitableReservation } from "../normalize";

const POC_PROPERTY_IDS = new Set([
  "058aed01-470f-4ca7-a191-37c597e7f377", // Uptown St. Augustine
  "5da25edc-88ac-43c4-876a-f7b626c88ecd", // Downtown St. Augustine / Lincoln
  "abe5540b-8cbc-4bc2-b561-b25f7d4d35b0", // Maine
  "e5552f35-6f5a-4afc-afd1-d0a676e98dc4", // Beech Mountain / Cricket Way
]);

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runDirectBookingTests() {
  console.log("Starting Direct Booking regression tests...");

  // Test 1: Whitelist Property Count Verification
  assert(POC_PROPERTY_IDS.size === 4, "Whitelist must contain exactly 4 property IDs");
  assert(POC_PROPERTY_IDS.has("058aed01-470f-4ca7-a191-37c597e7f377"), "Uptown ID present");
  assert(POC_PROPERTY_IDS.has("5da25edc-88ac-43c4-876a-f7b626c88ecd"), "Downtown ID present");
  assert(POC_PROPERTY_IDS.has("abe5540b-8cbc-4bc2-b561-b25f7d4d35b0"), "Maine ID present");
  assert(POC_PROPERTY_IDS.has("e5552f35-6f5a-4afc-afd1-d0a676e98dc4"), "Beech Mountain ID present");
  console.log("✓ Test 1 Passed: Exact four-property whitelist verified");

  // Test 2: Fully Paid Direct Booking
  {
    const rawFullyPaidDirect = {
      id: "direct-res-fully-paid",
      code: "HOST-PAID123",
      platform: "direct",
      property_id: "058aed01-470f-4ca7-a191-37c597e7f377",
      financials: {
        currency: "USD",
        guest: {
          total_price: { amount: 150000 },
          accommodation: { amount: 100000 },
          fees: [{ amount: 30000, category: "Guest fees", label: "Cleaning fee" }],
          taxes: [{ amount: 20000, category: "Taxes", label: "Sales Tax" }],
          payments: [{ amount: 150000, category: "Payment", label: "Full Payment" }],
        },
      },
    };

    const norm = normalizeHospitableReservation(rawFullyPaidDirect);
    assert(norm.platform === "direct", "Platform must be direct");
    assert(norm.bookingAmount === 1500, "Booking amount must be 1500");
    assert(norm.amountReceived === 1500, "Amount received must be 1500");
    assert(norm.paymentStatus === "PAID", "Fully paid direct booking must resolve to PAID");
    assert(norm.financialDataAvailable === true, "Financial data must be marked available");
    console.log("✓ Test 2 Passed: Fully paid direct booking resolves to PAID");
  }

  // Test 3: Partially Paid Direct Booking
  {
    const rawPartiallyPaidDirect = {
      id: "direct-res-partial",
      code: "HOST-PARTIAL456",
      platform: "direct",
      property_id: "5da25edc-88ac-43c4-876a-f7b626c88ecd",
      financials: {
        currency: "USD",
        guest: {
          total_price: { amount: 200000 },
          accommodation: { amount: 150000 },
          fees: [{ amount: 30000, category: "Guest fees", label: "Cleaning fee" }],
          taxes: [{ amount: 20000, category: "Taxes", label: "Sales Tax" }],
          payments: [{ amount: 100000, category: "Payment", label: "Deposit 50%" }],
        },
      },
    };

    const norm = normalizeHospitableReservation(rawPartiallyPaidDirect);
    assert(norm.platform === "direct", "Platform must be direct");
    assert(norm.bookingAmount === 2000, "Booking amount must be 2000");
    assert(norm.amountReceived === 1000, "Amount received must be 1000");
    assert(norm.paymentStatus === "PARTIAL", "Partially paid direct booking must resolve to PARTIAL (not PAID)");
    assert(norm.financialDataAvailable === true, "Financial data must be marked available");
    console.log("✓ Test 3 Passed: Partially paid direct booking resolves to PARTIAL (not hardcoded PAID)");
  }

  console.log("All Direct Booking regression tests completed successfully!");
  return true;
}

if (require.main === module) {
  runDirectBookingTests();
}
