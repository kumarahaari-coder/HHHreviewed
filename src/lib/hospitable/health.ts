import { createAdminClient } from "@/lib/supabase/admin";
import { getHospitableConfig, type HospitableConfig } from "@/lib/hospitable/config";

export type HealthStatus = "Healthy" | "Degraded" | "Unhealthy";

export type HealthReason =
  | "ALL_SYSTEMS_OPERATIONAL"
  | "RECENT_SYNC_FAILED"
  | "NO_RECENT_SUCCESSFUL_SYNC"
  | "MISSING_APPROVED_PROPERTIES"
  | "PERSISTENCE_SKIPPED_RECORDS"
  | "HISTORICAL_DELETION_DETECTED"
  | "FINANCIAL_COVERAGE_LOW"
  | "VALIDATION_WARNINGS_PRESENT"
  | "STALE_LEASE_ACTIVE";

export interface IntegrationHealthReport {
  status: HealthStatus;
  reason: HealthReason;
  details: {
    lastSuccessfulSync: string | null;
    lastFailedSync: string | null;
    successRate7DaysPercent: number;
    successRate30DaysPercent: number;
    approvedPropertyCount: number;
    financialCoveragePercent: number;
    validationWarningCount: number;
    staleLeaseActive: boolean;
  };
  configuration: HospitableConfig;
}

export async function evaluateIntegrationHealth(): Promise<IntegrationHealthReport> {
  const config = getHospitableConfig();
  const supabase = createAdminClient();

  const now = new Date();
  const twentyEightHoursAgo = new Date(now.getTime() - 28 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Query logs for status metrics
  const { data: latestLogs } = await supabase
    .from("hospitable_sync_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: logs7Days } = await supabase
    .from("hospitable_sync_logs")
    .select("status")
    .gte("created_at", sevenDaysAgo);

  const { data: logs30Days } = await supabase
    .from("hospitable_sync_logs")
    .select("status")
    .gte("created_at", thirtyDaysAgo);

  // Check active lock status
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const { data: runningLocks } = await supabase
    .from("hospitable_sync_logs")
    .select("id, started_at")
    .eq("status", "RUNNING");

  const staleLeaseActive = (runningLocks || []).some(
    (lock) => new Date(lock.started_at).toISOString() < tenMinutesAgo
  );

  const lastSuccess = latestLogs?.find((log) => log.status === "SUCCESS");
  const lastFailure = latestLogs?.find((log) => log.status === "FAILED");
  const latestLog = latestLogs?.[0];

  const countSuccess7 = (logs7Days || []).filter((l) => l.status === "SUCCESS").length;
  const total7 = logs7Days?.length || 0;
  const successRate7DaysPercent = total7 > 0 ? Math.round((countSuccess7 / total7) * 100) : 100;

  const countSuccess30 = (logs30Days || []).filter((l) => l.status === "SUCCESS").length;
  const total30 = logs30Days?.length || 0;
  const successRate30DaysPercent = total30 > 0 ? Math.round((countSuccess30 / total30) * 100) : 100;

  const approvedPropertyCount = lastSuccess?.properties_processed ?? 4;
  const financialCoveragePercent = lastSuccess?.financial_coverage_percent ?? 100;
  const validationWarningCount =
    (lastSuccess?.metadata as Record<string, unknown> | undefined)
      ?.validationWarningCount as number ?? 0;
  const persistenceSkipped = lastSuccess?.reservations_skipped ?? 0;
  const historicalDeleted =
    (lastSuccess?.metadata as Record<string, unknown> | undefined)
      ?.historicalRecordsDeleted as number ?? 0;

  let status: HealthStatus = "Healthy";
  let reason: HealthReason = "ALL_SYSTEMS_OPERATIONAL";

  // Evaluate Unhealthy rules
  if (latestLog?.status === "FAILED") {
    status = "Unhealthy";
    reason = "RECENT_SYNC_FAILED";
  } else if (!lastSuccess || lastSuccess.completed_at! < twentyEightHoursAgo) {
    status = "Unhealthy";
    reason = "NO_RECENT_SUCCESSFUL_SYNC";
  } else if (approvedPropertyCount < 4) {
    status = "Unhealthy";
    reason = "MISSING_APPROVED_PROPERTIES";
  } else if (persistenceSkipped > 0) {
    status = "Unhealthy";
    reason = "PERSISTENCE_SKIPPED_RECORDS";
  } else if (historicalDeleted > 0) {
    status = "Unhealthy";
    reason = "HISTORICAL_DELETION_DETECTED";
  } else if (staleLeaseActive) {
    status = "Unhealthy";
    reason = "STALE_LEASE_ACTIVE";
  }
  // Evaluate Degraded rules
  else if (financialCoveragePercent < 80) {
    status = "Degraded";
    reason = "FINANCIAL_COVERAGE_LOW";
  } else if (validationWarningCount > 0) {
    status = "Degraded";
    reason = "VALIDATION_WARNINGS_PRESENT";
  }

  return {
    status,
    reason,
    details: {
      lastSuccessfulSync: lastSuccess?.completed_at ?? null,
      lastFailedSync: lastFailure?.completed_at ?? null,
      successRate7DaysPercent,
      successRate30DaysPercent,
      approvedPropertyCount,
      financialCoveragePercent,
      validationWarningCount,
      staleLeaseActive,
    },
    configuration: config,
  };
}
