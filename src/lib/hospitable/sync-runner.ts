import type { Reservation } from "@/lib/db/schema";
import {
  buildCollectionPath,
  fetchHospitableCollection,
  HospitableApiError,
  HospitableConfigurationError,
  HospitableMaxPagesExceededError,
} from "@/lib/hospitable/client";

import {
  normalizeHospitableProperty,
  normalizeHospitableReservation,
} from "@/lib/hospitable/normalize";

import {
  upsertHospitableProperties,
  upsertHospitableReservations,
} from "@/lib/supabase/hospitable-sync";

import {
  completeHospitableSyncLog,
  createHospitableSyncLog,
  failHospitableSyncLog,
} from "@/lib/supabase/hospitable-sync-log";

import {
  summarizeValidationWarnings,
  validateHospitableProperties,
  validateNormalizedReservations,
  validateRawHospitableReservations,
  type ValidationWarning,
} from "@/lib/hospitable/validation";

import { getHospitableConfig } from "@/lib/hospitable/config";
import { acquireSyncLease, releaseSyncLease, type SyncLease } from "@/lib/hospitable/lock";

export type SyncTrigger = "manual" | "cron";
export type SyncMode = "full" | "incremental";

export type SyncOptions = {
  trigger: SyncTrigger;
  syncMode?: SyncMode;
  lookbackDays?: number;
  lookaheadDays?: number;
  startDate?: string;
  endDate?: string;
  dryRun?: boolean;
};

export type FullSyncResult = {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  syncedAt?: string;
  syncLogId?: string | null;
  source?: string;
  scope?: string;
  persisted?: boolean;
  dryRun?: boolean;
  syncMode?: SyncMode;
  filterType?: string;
  lookbackDays?: number;
  lookaheadDays?: number;
  windowStart?: string;
  windowEnd?: string;
  observability?: {
    lockAcquisitionMs: number;
    propertyFetchMs: number;
    reservationFetchMs: number;
    validationMs: number;
    normalizationMs: number;
    upsertMs: number;
    totalRuntimeMs: number;
    pagesFetched: number;
  };
  database?: {
    propertiesUpserted: number;
    reservationsUpserted: number;
    reservationsSkipped: number;
  };
  summary?: {
    hospitablePropertyCount: number;
    approvedPropertyCount: number;
    propertyCount: number;
    requestedPropertyCount: number;
    missingPropertyCount: number;
    reservationCount: number;
    financialCoveragePercent: number;
  };
  validation?: {
    warningCount: number;
    skippedReservationCount: number;
    warnings: ValidationWarning[];
  };
  propertyIds?: string[];
  missingPropertyIds?: string[];
  reservations?: Reservation[];
  error?: string;
  status?: number;
  details?: unknown;
};

const POC_PROPERTY_IDS = new Set([
  "058aed01-470f-4ca7-a191-37c597e7f377", // Uptown St. Augustine
  "5da25edc-88ac-43c4-876a-f7b626c88ecd", // Downtown St. Augustine / Lincoln
  "abe5540b-8cbc-4bc2-b561-b25f7d4d35b0", // Maine
  "e5552f35-6f5a-4afc-afd1-d0a676e98dc4", // Beech Mountain / Cricket Way
]);

function validIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  );
}

export function getUtcDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function calculateRollingWindow(
  lookbackDays = 30,
  lookaheadDays = 365
): { windowStart: string; windowEnd: string } {
  const now = new Date();
  const windowStart = getUtcDateString(
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - lookbackDays
      )
    )
  );
  const windowEnd = getUtcDateString(
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + lookaheadDays
      )
    )
  );
  return { windowStart, windowEnd };
}

export async function runHospitableSync(
  options: SyncOptions
): Promise<FullSyncResult> {
  const totalStart = performance.now();
  const config = getHospitableConfig();

  // Concurrency Lock Check via Database Lease
  const lockStart = performance.now();
  const lease: SyncLease | null = await acquireSyncLease(
    "HOSPITABLE_RESERVATION_SYNC",
    options.trigger
  );
  const lockAcquisitionMs = Math.round(performance.now() - lockStart);

  if (!lease) {
    return {
      success: true,
      skipped: true,
      reason: "SYNC_ALREADY_RUNNING",
    };
  }

  let syncLogId: string | null = null;
  const syncTimestamp = new Date().toISOString();
  const allWarnings: ValidationWarning[] = [];

  // Determine Sync Mode & Effective Date Window
  const syncMode: SyncMode =
    options.syncMode ?? (options.trigger === "cron" ? "incremental" : "full");

  let lookbackDays: number | undefined;
  let lookaheadDays: number | undefined;
  let windowStart: string | undefined;
  let windowEnd: string | undefined;

  let effectiveStartDate = options.startDate;
  let effectiveEndDate = options.endDate;
  let filterType = "all_records";

  if (syncMode === "incremental") {
    lookbackDays = options.lookbackDays ?? config.lookbackDays;
    lookaheadDays = options.lookaheadDays ?? config.lookaheadDays;
    const window = calculateRollingWindow(lookbackDays, lookaheadDays);
    windowStart = window.windowStart;
    windowEnd = window.windowEnd;

    effectiveStartDate = options.startDate || windowStart;
    effectiveEndDate = options.endDate || windowEnd;
    filterType = "arrival_date_window";
  } else if (options.startDate || options.endDate) {
    filterType = "explicit_date_range";
  }

  try {
    syncLogId =
      lease.fallbackLogId ||
      (await createHospitableSyncLog("RESERVATION_SYNC", {
        trigger: options.trigger,
        syncMode,
        filterType,
        dryRun: Boolean(options.dryRun),
        ...(lookbackDays !== undefined ? { lookbackDays } : {}),
        ...(lookaheadDays !== undefined ? { lookaheadDays } : {}),
        ...(windowStart ? { windowStart } : {}),
        ...(windowEnd ? { windowEnd } : {}),
        approvedPropertyCount: POC_PROPERTY_IDS.size,
        startDateFilter: effectiveStartDate || null,
        endDateFilter: effectiveEndDate || null,
      }));

    // Step 1: Fetch properties
    const propFetchStart = performance.now();
    const propertyPage = await fetchHospitableCollection(
      buildCollectionPath("properties", `page=1&per_page=${config.pageSize}`)
    );
    const propertyFetchMs = Math.round(performance.now() - propFetchStart);

    // Step 2: Validate raw properties and restrict to HHH POC
    const validationStart = performance.now();
    const propertyValidation = validateHospitableProperties(
      propertyPage.data,
      POC_PROPERTY_IDS
    );
    allWarnings.push(...propertyValidation.warnings);
    const pocPropertyData = propertyValidation.approvedProperties;

    // Step 3: Normalize selected POC properties
    const normStart = performance.now();
    const properties = pocPropertyData.map(normalizeHospitableProperty);
    const normalizationMs = Math.round(performance.now() - normStart);

    // Step 4: Persist selected POC properties (or skip if dryRun)
    const upsertStart = performance.now();
    const propertyPersistence = options.dryRun
      ? { upserted: 0, propertyIdMap: new Map<string, string>() }
      : await upsertHospitableProperties(properties);

    // Step 5: Extract approved property IDs
    const propertyIds = properties
      .map((property) => property.hospitablePropertyId)
      .filter((id): id is string => Boolean(id) && POC_PROPERTY_IDS.has(id));

    const missingPropertyIds = propertyValidation.missingPropertyIds;

    if (propertyIds.length === 0) {
      const errorMessage =
        "None of the approved Proof of Concept properties were found in Hospitable.";

      await failHospitableSyncLog(syncLogId, errorMessage, {
        trigger: options.trigger,
        syncMode,
        filterType,
        dryRun: Boolean(options.dryRun),
        hospitablePropertyCount: propertyPage.data.length,
      });

      return {
        success: false,
        syncLogId,
        error: errorMessage,
        status: 400,
      };
    }

    // Step 6: Build reservations query for POC properties
    const query = new URLSearchParams();
    propertyIds.forEach((propertyId) => {
      query.append("properties[]", propertyId);
    });

    if (validIsoDate(effectiveStartDate)) {
      query.set("start_date", effectiveStartDate);
    }
    if (validIsoDate(effectiveEndDate)) {
      query.set("end_date", effectiveEndDate);
    }

    query.set("page", "1");
    query.set("per_page", String(config.pageSize));

    // Step 7: Fetch raw reservations for POC properties
    const resFetchStart = performance.now();
    const reservationPage = await fetchHospitableCollection(
      buildCollectionPath("reservations", query.toString())
    );
    const reservationFetchMs = Math.round(performance.now() - resFetchStart);

    // Step 8: Validate raw reservations BEFORE normalization
    const rawResValidation = validateRawHospitableReservations(
      reservationPage.data
    );
    allWarnings.push(...rawResValidation.warnings);

    // Step 9: Normalize safe raw reservations
    const normalizedReservations = rawResValidation.safeRawReservations.map(
      normalizeHospitableReservation
    );

    // Step 10: Validate normalized reservations
    const postNormResValidation = validateNormalizedReservations(
      normalizedReservations,
      POC_PROPERTY_IDS
    );
    allWarnings.push(...postNormResValidation.warnings);
    const validReservations = postNormResValidation.validReservations;
    const validationMs = Math.round(performance.now() - validationStart);

    // Step 11: Persist valid POC reservations (or skip if dryRun)
    const reservationPersistence = options.dryRun
      ? {
          upserted: 0,
          skipped: 0,
          cancelledReservationsSeen: validReservations.filter((r) => r.reservationStatus === "CANCELLED").length,
          reservationsMarkedCancelled: 0,
        }
      : await upsertHospitableReservations(
          validReservations,
          propertyPersistence.propertyIdMap,
          syncTimestamp
        );

    const upsertMs = Math.round(performance.now() - upsertStart);

    // Step 12: Calculate skipped totals & metrics
    const validationSkippedCount =
      rawResValidation.validationSkippedCount +
      postNormResValidation.validationSkippedCount;
    const persistenceSkippedCount = reservationPersistence.skipped;
    const totalSkippedCount = validationSkippedCount + persistenceSkippedCount;

    // Step 13: Calculate financial coverage
    const financialCoverage =
      validReservations.length === 0
        ? 0
        : Math.round(
            (validReservations.filter(
              (reservation) => reservation.financialDataAvailable
            ).length /
              validReservations.length) *
              100
          );

    const validationSummary = summarizeValidationWarnings(allWarnings);
    const totalRuntimeMs = Math.round(performance.now() - totalStart);

    const observability = {
      lockAcquisitionMs,
      propertyFetchMs,
      reservationFetchMs,
      validationMs,
      normalizationMs,
      upsertMs,
      totalRuntimeMs,
      pagesFetched: propertyPage.pagesFetched + reservationPage.pagesFetched,
    };

    await completeHospitableSyncLog(
      syncLogId,
      {
        propertiesFetched: propertyPage.data.length,
        propertiesProcessed: properties.length,
        reservationsFetched: reservationPage.data.length,
        reservationsProcessed: validReservations.length,
        reservationsSkipped: totalSkippedCount,
        financialCoveragePercent: financialCoverage,
      },
      {
        trigger: options.trigger,
        syncMode,
        filterType,
        dryRun: Boolean(options.dryRun),
        persistenceMode: options.dryRun ? "preview" : "upsert",
        propertiesWouldUpsert: properties.length,
        reservationsWouldUpsert: validReservations.length,
        reservationsActuallyUpserted: reservationPersistence.upserted,
        ...(lookbackDays !== undefined ? { lookbackDays } : {}),
        ...(lookaheadDays !== undefined ? { lookaheadDays } : {}),
        ...(windowStart ? { windowStart } : {}),
        ...(windowEnd ? { windowEnd } : {}),
        observability,
        approvedPropertyCount: POC_PROPERTY_IDS.size,
        requestedPropertyCount: propertyIds.length,
        missingPropertyCount: missingPropertyIds.length,
        missingPropertyIds,
        propertiesUpserted: propertyPersistence.upserted,
        reservationsUpserted: reservationPersistence.upserted,
        validationWarningCount: validationSummary.warningCount,
        validationWarningsByCode: validationSummary.warningsByCode,
        validationSkippedCount,
        persistenceSkippedCount,
        cancelledReservationsSeen:
          reservationPersistence.cancelledReservationsSeen,
        reservationsMarkedCancelled:
          reservationPersistence.reservationsMarkedCancelled,
        historicalRecordsDeleted: 0,
      }
    );

    return {
      success: true,
      syncedAt: syncTimestamp,
      syncLogId,
      source: "Hospitable Public API v2",
      scope: "HHH_PROOF_OF_CONCEPT",
      persisted: !options.dryRun,
      dryRun: Boolean(options.dryRun),
      syncMode,
      filterType,
      ...(lookbackDays !== undefined ? { lookbackDays } : {}),
      ...(lookaheadDays !== undefined ? { lookaheadDays } : {}),
      ...(windowStart ? { windowStart } : {}),
      ...(windowEnd ? { windowEnd } : {}),
      observability,

      database: {
        propertiesUpserted: propertyPersistence.upserted,
        reservationsUpserted: reservationPersistence.upserted,
        reservationsSkipped: persistenceSkippedCount,
      },

      summary: {
        hospitablePropertyCount: propertyPage.data.length,
        approvedPropertyCount: POC_PROPERTY_IDS.size,
        propertyCount: properties.length,
        requestedPropertyCount: propertyIds.length,
        missingPropertyCount: missingPropertyIds.length,
        reservationCount: validReservations.length,
        financialCoveragePercent: financialCoverage,
      },

      validation: {
        warningCount: validationSummary.warningCount,
        skippedReservationCount: validationSkippedCount,
        warnings: validationSummary.cappedWarnings,
      },

      propertyIds,
      missingPropertyIds,
      reservations: validReservations,
    };
  } catch (error) {
    console.error("Hospitable reservation sync failed:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown Hospitable reservation sync error";

    const errorStatus =
      error instanceof HospitableConfigurationError
        ? 503
        : error instanceof HospitableMaxPagesExceededError
        ? 422
        : error instanceof HospitableApiError
        ? error.status
        : 500;

    await failHospitableSyncLog(syncLogId, errorMessage, {
      trigger: options.trigger,
      syncMode,
      filterType,
      dryRun: Boolean(options.dryRun),
      errorType:
        error instanceof HospitableConfigurationError
          ? "HospitableConfigurationError"
          : error instanceof HospitableMaxPagesExceededError
          ? "HospitableMaxPagesExceededError"
          : error instanceof HospitableApiError
          ? "HospitableApiError"
          : "GenericError",
      ...(error instanceof HospitableMaxPagesExceededError
        ? { maxPages: error.maxPages, partialResultDiscarded: true }
        : {}),
      ...(error instanceof HospitableApiError
        ? { apiStatus: error.status }
        : {}),
    });

    return {
      success: false,
      syncLogId,
      error: errorMessage,
      status: errorStatus,
      ...(error instanceof HospitableApiError
        ? { details: error.responseBody }
        : {}),
    };
  } finally {
    await releaseSyncLease(lease);
  }
}
