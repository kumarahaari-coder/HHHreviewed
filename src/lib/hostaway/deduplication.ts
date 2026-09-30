/**
 * Hostaway Cross-Provider Deduplication & Shadow Reconciliation Engine
 * 
 * Rules:
 * - Providers coexist: Hostaway (Candidate Primary), OwnerRez (Legacy), Hospitable (Legacy/Fallback)
 * - NEVER merge based solely on guest name.
 * - Authoritative matching: external confirmation codes, exact property + arrival + departure + gross amount.
 * - Detects multi-feed reservations: SAME_BOOKING_CONFIRMED, HOSTAWAY_ONLY, LEGACY_ONLY, CONFLICT.
 * - Preserves historical OwnerRez/Hospitable provider provenance immutably.
 */

import { NormalizedHostawayReservation } from "./normalizers";
import { Reservation } from "@/lib/db/schema";
import { DeduplicationMatchResult, CrossProviderDeduplicationStatus } from "./types";

export interface ShadowReconciliationReport {
  timestamp: string;
  hostawayCount: number;
  legacyCount: number;
  sameBookingConfirmed: number;
  potentialMatchReviewRequired: number;
  hostawayOnly: number;
  legacyOnly: number;
  conflictCount: number;
  conflicts: Array<{
    hostawayId: number;
    legacyId: string;
    reason: string;
  }>;
  grossRevenueDelta: number; // Hostaway total vs Legacy total
  status: "IN_TOLERANCE" | "REQUIRES_REVIEW" | "BLOCKED";
}

/**
 * Evaluates a Hostaway reservation against existing database reservations
 * to detect existing legacy PMS bookings without duplicating records or accruals.
 */
export function matchHostawayReservationToExisting(
  hostawayRes: NormalizedHostawayReservation,
  hhhPropertyId: string,
  existingReservations: Reservation[]
): DeduplicationMatchResult {
  // 1. Direct Hostaway identity check
  const directMatch = existingReservations.find(
    (r: any) =>
      r.hostaway_reservation_id === hostawayRes.hostawayReservationId ||
      r.hostawayReservationId === hostawayRes.hostawayReservationId
  );
  if (directMatch) {
    return {
      status: "SAME_BOOKING_CONFIRMED",
      matchedReservationId: directMatch.id,
      existingProvider: directMatch.sourceProvider as any,
      existingConfirmationCode: directMatch.confirmationCode,
      reason: `Direct Hostaway ID match: ${hostawayRes.hostawayReservationId}`,
    };
  }

  // 2. Filter existing reservations for the same canonical property
  const samePropertyReservations = existingReservations.filter(
    (r) => r.propertyId === hhhPropertyId
  );

  for (const existing of samePropertyReservations) {
    const existingIn = (existing.checkInDate || "").slice(0, 10);
    const existingOut = (existing.checkOutDate || "").slice(0, 10);
    const hostawayIn = hostawayRes.checkInDate.slice(0, 10);
    const hostawayOut = hostawayRes.checkOutDate.slice(0, 10);

    const datesMatch = existingIn === hostawayIn && existingOut === hostawayOut;
    const sameConfirmationCode =
      existing.confirmationCode &&
      hostawayRes.confirmationCode &&
      existing.confirmationCode.toLowerCase() === hostawayRes.confirmationCode.toLowerCase();

    // External platform code match (e.g. Airbnb reservation code HM...)
    if (sameConfirmationCode && datesMatch) {
      return {
        status: "SAME_BOOKING_CONFIRMED",
        matchedReservationId: existing.id,
        existingProvider: existing.sourceProvider as any,
        existingConfirmationCode: existing.confirmationCode,
        reason: `Exact confirmation code and stay dates match (${existing.confirmationCode})`,
      };
    }

    // Overlapping or exact dates on same property
    if (datesMatch) {
      const grossDiff = Math.abs(Number(existing.grossAmount || 0) - hostawayRes.grossAmount);
      const isGrossWithinTolerance = grossDiff < 0.05; // 5 cents tolerance for rounding

      if (isGrossWithinTolerance) {
        // Tightened deduplication: Property + dates + gross amount alone is NOT sufficient
        // for automatic SAME_BOOKING_CONFIRMED. Reclassify as POTENTIAL_MATCH_REVIEW_REQUIRED.
        return {
          status: "POTENTIAL_MATCH_REVIEW_REQUIRED",
          matchedReservationId: existing.id,
          existingProvider: existing.sourceProvider as any,
          existingConfirmationCode: existing.confirmationCode,
          reason: `Exact property, dates (${hostawayIn} to ${hostawayOut}), and gross amount ($${hostawayRes.grossAmount}) match without an immutable cross-provider identifier. Manual review required.`,
        };
      } else {
        // Same property and exact dates but different gross amount -> Conflict
        return {
          status: "CONFLICT",
          matchedReservationId: existing.id,
          existingProvider: existing.sourceProvider as any,
          existingConfirmationCode: existing.confirmationCode,
          reason: `Date collision on property ${hhhPropertyId} with financial discrepancy: Legacy gross $${existing.grossAmount} vs Hostaway gross $${hostawayRes.grossAmount}`,
        };
      }
    }
  }

  // No matching existing booking found -> Genuinely new Hostaway booking
  return {
    status: "HOSTAWAY_ONLY",
    reason: "No overlapping legacy reservations found for this property and date range.",
  };
}

/**
 * Runs a shadow reconciliation audit comparing a full Hostaway feed against existing HHH reservations.
 */
export function performShadowReconciliation(
  hostawayReservations: NormalizedHostawayReservation[],
  propertyMappingMap: Map<number, string>, // listingMapId -> propertyId
  existingReservations: Reservation[]
): ShadowReconciliationReport {
  let sameBookingConfirmed = 0;
  let potentialMatchReviewRequired = 0;
  let hostawayOnly = 0;
  let conflictCount = 0;
  const matchedExistingIds = new Set<string>();
  const conflicts: Array<{ hostawayId: number; legacyId: string; reason: string }> = [];

  let hostawayGrossTotal = 0;
  let legacyGrossTotal = 0;

  for (const h of hostawayReservations) {
    hostawayGrossTotal += h.grossAmount;
    const propertyId = propertyMappingMap.get(h.listingMapId);
    if (!propertyId) {
      conflictCount += 1;
      conflicts.push({
        hostawayId: h.hostawayReservationId,
        legacyId: "NONE",
        reason: `Unmapped Hostaway listingMapId: ${h.listingMapId}`,
      });
      continue;
    }

    const match = matchHostawayReservationToExisting(h, propertyId, existingReservations);
    if (match.status === "SAME_BOOKING_CONFIRMED" && match.matchedReservationId) {
      sameBookingConfirmed += 1;
      matchedExistingIds.add(match.matchedReservationId);
    } else if (match.status === "POTENTIAL_MATCH_REVIEW_REQUIRED") {
      potentialMatchReviewRequired += 1;
    } else if (match.status === "CONFLICT") {
      conflictCount += 1;
      conflicts.push({
        hostawayId: h.hostawayReservationId,
        legacyId: match.matchedReservationId || "UNKNOWN",
        reason: match.reason,
      });
    } else if (match.status === "HOSTAWAY_ONLY") {
      hostawayOnly += 1;
    }
  }

  for (const r of existingReservations) {
    legacyGrossTotal += Number(r.grossAmount || 0);
  }

  const legacyOnly = Math.max(0, existingReservations.length - matchedExistingIds.size);
  const grossRevenueDelta = Math.round((hostawayGrossTotal - legacyGrossTotal) * 100) / 100;

  let status: ShadowReconciliationReport["status"] = "IN_TOLERANCE";
  if (conflictCount > 0) {
    status = "BLOCKED";
  } else if (potentialMatchReviewRequired > 0 || (legacyOnly > 0 && sameBookingConfirmed === 0)) {
    status = "REQUIRES_REVIEW";
  }

  return {
    timestamp: new Date().toISOString(),
    hostawayCount: hostawayReservations.length,
    legacyCount: existingReservations.length,
    sameBookingConfirmed,
    potentialMatchReviewRequired,
    hostawayOnly,
    legacyOnly,
    conflictCount,
    conflicts,
    grossRevenueDelta,
    status,
  };
}
