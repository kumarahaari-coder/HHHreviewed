import {
  validateHospitableProperties,
  validateNormalizedReservations,
  validateRawHospitableReservations,
  type ValidationWarning,
} from "../validation";
import { normalizeHospitableReservation } from "../normalize";

const POC_PROPERTY_IDS = new Set([
  "058aed01-470f-4ca7-a191-37c597e7f377",
  "5da25edc-88ac-43c4-876a-f7b626c88ecd",
  "abe5540b-8cbc-4bc2-b561-b25f7d4d35b0",
  "e5552f35-6f5a-4afc-afd1-d0a676e98dc4",
]);

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runValidationFixtureTests() {
  console.log("Starting Phase 2 validation fixture tests...");

  // Test 1: Property Validation (Aggregated UNKNOWN_PROPERTY_RETURNED & APPROVED_PROPERTY_MISSING)
  {
    const rawPropertiesFixture = [
      { id: "058aed01-470f-4ca7-a191-37c597e7f377", name: "Uptown St. Augustine" },
      { id: "5da25edc-88ac-43c4-876a-f7b626c88ecd", name: "Downtown St. Augustine" },
      { id: "non-poc-prop-1", name: "Pink Palms 1" },
      { id: "non-poc-prop-2", name: "Pink Palms 2" },
      { id: "non-poc-prop-3", name: "Pink Palms 3" },
      { id: "non-poc-prop-4", name: "Pink Palms 4" },
      { id: "non-poc-prop-5", name: "Pink Palms 5" },
    ];

    const result = validateHospitableProperties(rawPropertiesFixture, POC_PROPERTY_IDS);
    assert(result.fetchedCount === 7, "Expected 7 fetched properties");
    assert(result.processedCount === 2, "Expected 2 approved properties");
    assert(result.missingPropertyIds.length === 2, "Expected 2 missing approved properties (Maine & Beech)");

    const unknownPropWarning = result.warnings.find((w) => w.code === "UNKNOWN_PROPERTY_RETURNED");
    assert(Boolean(unknownPropWarning), "Expected UNKNOWN_PROPERTY_RETURNED warning");
    assert(unknownPropWarning?.severity === "WARNING", "Expected WARNING severity for unknown property");
    assert(
      Boolean(unknownPropWarning?.message.includes("5 non-whitelisted")),
      "Expected message to mention 5 non-whitelisted properties"
    );

    const missingWarnings = result.warnings.filter((w) => w.code === "APPROVED_PROPERTY_MISSING");
    assert(missingWarnings.length === 2, "Expected 2 APPROVED_PROPERTY_MISSING warnings");
    console.log("✓ Test 1 Passed: Property validation (aggregated unknown + missing approved)");
  }

  // Test 2: Raw Reservation Validation (Missing ID & Duplicate ID detection)
  {
    const rawReservationsFixture = [
      { id: "res-valid-1", code: "CONF1", property_id: "058aed01-470f-4ca7-a191-37c597e7f377" },
      { code: "NO_ID", property_id: "058aed01-470f-4ca7-a191-37c597e7f377" }, // missing ID
      { id: "res-valid-1", code: "CONF1_DUP", property_id: "058aed01-470f-4ca7-a191-37c597e7f377" }, // duplicate ID
      { id: "res-valid-2", code: "CONF2", property_id: "5da25edc-88ac-43c4-876a-f7b626c88ecd" },
    ];

    const result = validateRawHospitableReservations(rawReservationsFixture);
    assert(result.safeRawReservations.length === 2, "Expected 2 safe raw reservations");
    assert(result.validationSkippedCount === 2, "Expected 2 raw reservations skipped");

    const missingIdWarning = result.warnings.find((w) => w.code === "MISSING_RESERVATION_ID");
    assert(Boolean(missingIdWarning), "Expected MISSING_RESERVATION_ID warning");
    assert(missingIdWarning?.severity === "ERROR", "Expected ERROR severity for missing ID");

    const dupIdWarning = result.warnings.find((w) => w.code === "DUPLICATE_RESERVATION_ID");
    assert(Boolean(dupIdWarning), "Expected DUPLICATE_RESERVATION_ID warning");
    assert(dupIdWarning?.severity === "ERROR", "Expected ERROR severity for duplicate ID");
    assert(dupIdWarning?.reservationId === "res-valid-1", "Expected reservationId in duplicate warning");
    console.log("✓ Test 2 Passed: Raw reservation validation (missing ID + duplicate ID)");
  }

  // Test 3: Post-Normalization Validation (Unapproved Property & Missing Financial Data)
  {
    const rawUnapprovedPropertyRes = {
      id: "res-unapproved-prop",
      code: "UNAPP",
      property_id: "unapproved-prop-id-999",
      financials: { guest: { total_price: { amount: 50000 } } },
    };

    const rawMissingFinancialsRes = {
      id: "res-missing-financials",
      code: "NOFIN",
      property_id: "058aed01-470f-4ca7-a191-37c597e7f377",
      financials: {},
    };

    const normalized1 = normalizeHospitableReservation(rawUnapprovedPropertyRes);
    const normalized2 = normalizeHospitableReservation(rawMissingFinancialsRes);

    const result = validateNormalizedReservations([normalized1, normalized2], POC_PROPERTY_IDS);
    assert(result.validReservations.length === 1, "Expected 1 valid reservation (missing financials kept, unapproved skipped)");
    assert(result.validationSkippedCount === 1, "Expected 1 reservation skipped for unapproved property");
    assert(result.validReservations[0].hospitableReservationId === "res-missing-financials", "Expected res-missing-financials to be retained");

    const unapprovedWarning = result.warnings.find((w) => w.code === "UNAPPROVED_PROPERTY");
    assert(Boolean(unapprovedWarning), "Expected UNAPPROVED_PROPERTY warning");
    assert(unapprovedWarning?.severity === "ERROR", "Expected ERROR severity for unapproved property");

    const missingFinWarning = result.warnings.find((w) => w.code === "MISSING_FINANCIAL_DATA");
    assert(Boolean(missingFinWarning), "Expected MISSING_FINANCIAL_DATA warning");
    assert(missingFinWarning?.severity === "WARNING", "Expected WARNING severity for missing financials");
    assert(missingFinWarning?.reservationId === "res-missing-financials", "Expected reservationId in missing financials warning");
    console.log("✓ Test 3 Passed: Post-normalization validation (unapproved prop skipped, missing financials kept)");
  }

  console.log("All Phase 2 validation fixture tests completed successfully!");
  return true;
}

if (require.main === module) {
  runValidationFixtureTests();
}
