import { createAdminClient } from "@/lib/supabase/admin";

export type SyncLogMetrics = {
  propertiesFetched?: number;
  propertiesProcessed?: number;
  reservationsFetched?: number;
  reservationsProcessed?: number;
  reservationsSkipped?: number;
  financialCoveragePercent?: number;
};

export async function createHospitableSyncLog(
  syncType: string,
  initialMetadata: Record<string, unknown> = {}
): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("hospitable_sync_logs")
      .insert({
        sync_type: syncType,
        status: "RUNNING",
        started_at: now,
        metadata: initialMetadata,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create hospitable sync log:", error.message);
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    console.error(
      "Unexpected error creating hospitable sync log:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export async function completeHospitableSyncLog(
  logId: string | null,
  metrics: SyncLogMetrics,
  additionalMetadata: Record<string, unknown> = {}
): Promise<void> {
  if (!logId) return;

  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data: existingLog } = await supabase
      .from("hospitable_sync_logs")
      .select("metadata")
      .eq("id", logId)
      .single();

    const currentMetadata =
      existingLog?.metadata && typeof existingLog.metadata === "object"
        ? (existingLog.metadata as Record<string, unknown>)
        : {};

    const mergedMetadata = {
      ...currentMetadata,
      ...additionalMetadata,
    };

    const { error } = await supabase
      .from("hospitable_sync_logs")
      .update({
        status: "SUCCESS",
        completed_at: now,
        properties_fetched: metrics.propertiesFetched ?? null,
        properties_processed: metrics.propertiesProcessed ?? null,
        reservations_fetched: metrics.reservationsFetched ?? null,
        reservations_processed: metrics.reservationsProcessed ?? null,
        reservations_skipped: metrics.reservationsSkipped ?? null,
        financial_coverage_percent: metrics.financialCoveragePercent ?? null,
        metadata: mergedMetadata,
      })
      .eq("id", logId);

    if (error) {
      console.error("Failed to complete hospitable sync log:", error.message);
    }
  } catch (error) {
    console.error(
      "Unexpected error completing hospitable sync log:",
      error instanceof Error ? error.message : error
    );
  }
}

export async function failHospitableSyncLog(
  logId: string | null,
  errorMessage: string,
  additionalMetadata: Record<string, unknown> = {}
): Promise<void> {
  if (!logId) return;

  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data: existingLog } = await supabase
      .from("hospitable_sync_logs")
      .select("metadata")
      .eq("id", logId)
      .single();

    const currentMetadata =
      existingLog?.metadata && typeof existingLog.metadata === "object"
        ? (existingLog.metadata as Record<string, unknown>)
        : {};

    const mergedMetadata = {
      ...currentMetadata,
      ...additionalMetadata,
    };

    const { error } = await supabase
      .from("hospitable_sync_logs")
      .update({
        status: "FAILED",
        completed_at: now,
        error_message: errorMessage,
        metadata: mergedMetadata,
      })
      .eq("id", logId);

    if (error) {
      console.error("Failed to fail hospitable sync log:", error.message);
    }
  } catch (error) {
    console.error(
      "Unexpected error failing hospitable sync log:",
      error instanceof Error ? error.message : error
    );
  }
}
