import type { Reservation } from "@/lib/db/schema";

export type ValidationSeverity = "WARNING" | "ERROR";

export type ValidationWarningCode =
  | "MISSING_RESERVATION_ID"
  | "UNAPPROVED_PROPERTY"
  | "DUPLICATE_RESERVATION_ID"
  | "MISSING_FINANCIAL_DATA"
  | "APPROVED_PROPERTY_MISSING"
  | "UNKNOWN_PROPERTY_RETURNED";

export type ValidationWarning = {
  code: ValidationWarningCode;
  message: string;
  severity: ValidationSeverity;
  propertyId?: string;
  reservationId?: string;
};

export type PropertyValidationResult = {
  approvedProperties: unknown[];
  fetchedCount: number;
  processedCount: number;
  warnings: ValidationWarning[];
  missingPropertyIds: string[];
};

export type RawReservationValidationResult = {
  safeRawReservations: unknown[];
  warnings: ValidationWarning[];
  validationSkippedCount: number;
};

export type PostNormReservationValidationResult = {
  validReservations: Reservation[];
  warnings: ValidationWarning[];
  validationSkippedCount: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(...values: unknown[]): string {
  for (const val of values) {
    if (val !== undefined && val !== null && val !== "") {
      return String(val);
    }
  }
  return "";
}

function getHospitablePropertyId(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const attributes =
    record.attributes &&
    typeof record.attributes === "object" &&
    !Array.isArray(record.attributes)
      ? (record.attributes as Record<string, unknown>)
      : {};

  const id = record.id ?? attributes.id;
  return typeof id === "string" ? id : "";
}

/**
 * Validates raw Hospitable property responses against approved property whitelist.
 * Emits an aggregated warning for non-whitelisted properties and checks for missing approved properties.
 */
export function validateHospitableProperties(
  rawProperties: unknown[],
  approvedPropertyIdsSet: Set<string>
): PropertyValidationResult {
  const warnings: ValidationWarning[] = [];
  const fetchedPropertyIdsSet = new Set<string>();

  const approvedProperties = rawProperties.filter((property) => {
    const propId = getHospitablePropertyId(property);
    if (propId) {
      fetchedPropertyIdsSet.add(propId);
    }
    return propId ? approvedPropertyIdsSet.has(propId) : false;
  });

  const ignoredCount = rawProperties.length - approvedProperties.length;
  if (ignoredCount > 0) {
    warnings.push({
      code: "UNKNOWN_PROPERTY_RETURNED",
      message: `${ignoredCount} non-whitelisted Hospitable property ID(s) returned and ignored by scope.`,
      severity: "WARNING",
    });
  }

  const missingPropertyIds: string[] = [];
  approvedPropertyIdsSet.forEach((approvedId) => {
    if (!fetchedPropertyIdsSet.has(approvedId)) {
      missingPropertyIds.push(approvedId);
      warnings.push({
        code: "APPROVED_PROPERTY_MISSING",
        message: `Approved Proof of Concept property missing from Hospitable response: ${approvedId}`,
        severity: "WARNING",
        propertyId: approvedId,
      });
    }
  });

  return {
    approvedProperties,
    fetchedCount: rawProperties.length,
    processedCount: approvedProperties.length,
    warnings,
    missingPropertyIds,
  };
}

/**
 * Validates raw reservation records prior to normalization.
 * Checks for missing Hospitable reservation IDs and duplicate reservation IDs.
 */
export function validateRawHospitableReservations(
  rawReservations: unknown[]
): RawReservationValidationResult {
  const warnings: ValidationWarning[] = [];
  const safeRawReservations: unknown[] = [];
  const seenReservationIds = new Set<string>();
  let validationSkippedCount = 0;

  for (const item of rawReservations) {
    const record = asRecord(item);
    const attributes = asRecord(record.attributes);
    const rawId = stringValue(record.id, attributes.id, record.reservation_id);

    if (!rawId) {
      warnings.push({
        code: "MISSING_RESERVATION_ID",
        message: "Raw reservation record missing Hospitable reservation ID.",
        severity: "ERROR",
      });
      validationSkippedCount += 1;
      continue;
    }

    if (seenReservationIds.has(rawId)) {
      warnings.push({
        code: "DUPLICATE_RESERVATION_ID",
        message: `Duplicate Hospitable reservation ID skipped: ${rawId}`,
        severity: "ERROR",
        reservationId: rawId,
      });
      validationSkippedCount += 1;
      continue;
    }

    seenReservationIds.add(rawId);
    safeRawReservations.push(item);
  }

  return {
    safeRawReservations,
    warnings,
    validationSkippedCount,
  };
}

/**
 * Validates normalized reservation objects.
 * Checks for approved property scope and missing financial data.
 */
export function validateNormalizedReservations(
  reservations: Reservation[],
  approvedPropertyIdsSet: Set<string>
): PostNormReservationValidationResult {
  const warnings: ValidationWarning[] = [];
  const validReservations: Reservation[] = [];
  let validationSkippedCount = 0;

  for (const reservation of reservations) {
    const hospPropId = reservation.propertyId.replace(/^hosp-/, "");

    if (!approvedPropertyIdsSet.has(hospPropId)) {
      warnings.push({
        code: "UNAPPROVED_PROPERTY",
        message: `Reservation linked to unapproved property ID: ${hospPropId}`,
        severity: "ERROR",
        propertyId: hospPropId,
        reservationId: reservation.hospitableReservationId,
      });
      validationSkippedCount += 1;
      continue;
    }

    if (!reservation.financialDataAvailable) {
      warnings.push({
        code: "MISSING_FINANCIAL_DATA",
        message: `Financial details unavailable for reservation: ${reservation.hospitableReservationId}`,
        severity: "WARNING",
        reservationId: reservation.hospitableReservationId,
      });
    }

    validReservations.push(reservation);
  }

  return {
    validReservations,
    warnings,
    validationSkippedCount,
  };
}

/**
 * Summarizes warnings for safe sync log metadata storage and caps output array size.
 */
export function summarizeValidationWarnings(warnings: ValidationWarning[]) {
  const warningsByCode: Record<string, number> = {};

  for (const w of warnings) {
    warningsByCode[w.code] = (warningsByCode[w.code] || 0) + 1;
  }

  return {
    warningCount: warnings.length,
    warningsByCode,
    cappedWarnings: warnings.slice(0, 50),
  };
}
