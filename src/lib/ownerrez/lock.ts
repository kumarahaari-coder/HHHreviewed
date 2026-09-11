import { createAdminClient } from "@/lib/supabase/admin";

export interface OwnerRezSyncLease {
  lockName: string;
  lockToken: string;
  acquiredAt: string;
  expiresAt: string;
  logId?: string | null;
  renewalTimer?: NodeJS.Timeout;
}

const activeProcessLocks = new Map<string, OwnerRezSyncLease>();

/**
 * Attempts to acquire an atomic database lease for OwnerRez synchronization.
 * Prevents concurrent execution across multiple serverless / worker instances.
 */
export async function acquireOwnerRezSyncLease(
  lockName = "OWNERREZ_SCHEDULED_SYNC",
  acquiredBy = "system",
  leaseSeconds = 420,
  supabaseClient?: any
): Promise<OwnerRezSyncLease | null> {
  const lockToken = crypto.randomUUID();
  const supabase = supabaseClient || createAdminClient();

  // 1. In-process check first
  const existingProcessLock = activeProcessLocks.get(lockName);
  if (existingProcessLock) {
    const now = new Date().toISOString();
    if (existingProcessLock.expiresAt > now) {
      return null;
    }
    activeProcessLocks.delete(lockName);
  }

  try {
    // 2. Database-backed distributed table lock via hospitable_sync_logs
    const now = new Date();
    const cutoff = new Date(now.getTime() - leaseSeconds * 1000).toISOString();

    // 2a. Pre-check: Reject if an active unexpired RUNNING sync already exists
    const { data: runningLogs, error: checkError } = await supabase
      .from("hospitable_sync_logs")
      .select("id, started_at")
      .eq("sync_type", lockName)
      .eq("status", "RUNNING")
      .gte("started_at", cutoff)
      .order("started_at", { ascending: true });

    if (!checkError && runningLogs && runningLogs.length > 0) {
      return null;
    }

    // 2b. Insert candidate lease log
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    const { data: inserted, error: insertError } = await supabase
      .from("hospitable_sync_logs")
      .insert({
        sync_type: lockName,
        status: "RUNNING",
        started_at: nowIso,
        metadata: {
          lockToken,
          acquiredBy,
          leaseSeconds,
          expiresAt,
        },
      })
      .select("id, started_at")
      .single();

    if (insertError || !inserted) {
      console.warn("[OwnerRez Lock] Failed to insert candidate lease log:", insertError?.message);
      return null;
    }

    // 2c. Leader Election: Query all RUNNING logs to resolve simultaneous race conditions
    const { data: electionRows, error: electionError } = await supabase
      .from("hospitable_sync_logs")
      .select("id, started_at")
      .eq("sync_type", lockName)
      .eq("status", "RUNNING")
      .gte("started_at", cutoff)
      .order("started_at", { ascending: true });

    if (electionError || !electionRows || electionRows.length === 0) {
      await supabase
        .from("hospitable_sync_logs")
        .update({ status: "FAILED", completed_at: new Date().toISOString() })
        .eq("id", inserted.id);
      return null;
    }

    // Earliest started_at row wins the lease
    const winner = electionRows[0];
    if (winner.id !== inserted.id) {
      // Another concurrent process won the lease
      await supabase
        .from("hospitable_sync_logs")
        .update({
          status: "FAILED",
          completed_at: new Date().toISOString(),
          error_message: "Lock acquisition superseded by concurrent process",
        })
        .eq("id", inserted.id);
      return null;
    }

    const lease: OwnerRezSyncLease = {
      lockName,
      lockToken,
      acquiredAt: nowIso,
      expiresAt,
      logId: inserted.id,
    };

    activeProcessLocks.set(lockName, lease);
    setupAutoRenewal(lease, leaseSeconds, supabase);
    return lease;
  } catch (error) {
    console.warn("[OwnerRez Lock] Lease acquisition encountered error:", error);
    return null;
  }
}

/**
 * Renews an existing lease before it expires.
 */
export async function renewOwnerRezSyncLease(
  lease: OwnerRezSyncLease,
  leaseSeconds = 420,
  supabaseClient?: any
): Promise<boolean> {
  const supabase = supabaseClient || createAdminClient();

  try {
    if (lease.logId) {
      const now = new Date();
      const newExpiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
      const { error: logErr } = await supabase
        .from("hospitable_sync_logs")
        .update({
          started_at: now.toISOString(),
          metadata: {
            lockToken: lease.lockToken,
            leaseSeconds,
            expiresAt: newExpiresAt,
            renewedAt: now.toISOString(),
          },
        })
        .eq("id", lease.logId)
        .eq("status", "RUNNING");

      if (!logErr) {
        lease.expiresAt = newExpiresAt;
        activeProcessLocks.set(lease.lockName, lease);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.warn("[OwnerRez Lock] Lease renewal failed:", error);
    return false;
  }
}

/**
 * Releases an acquired sync lease.
 */
export async function releaseOwnerRezSyncLease(
  lease: OwnerRezSyncLease | null,
  supabaseClient?: any
): Promise<boolean> {
  if (!lease) return true;

  if (lease.renewalTimer) {
    clearInterval(lease.renewalTimer);
    lease.renewalTimer = undefined;
  }

  const currentProcessLock = activeProcessLocks.get(lease.lockName);
  if (currentProcessLock?.lockToken === lease.lockToken) {
    activeProcessLocks.delete(lease.lockName);
  }

  const supabase = supabaseClient || createAdminClient();

  try {
    if (lease.logId) {
      await supabase
        .from("hospitable_sync_logs")
        .update({
          status: "SUCCESS",
          completed_at: new Date().toISOString(),
        })
        .eq("id", lease.logId)
        .eq("status", "RUNNING");
    }

    return true;
  } catch (error) {
    console.warn("[OwnerRez Lock] Lease release warning:", error);
    return false;
  }
}

/**
 * Sets up periodic lease renewal at 70% of lease duration.
 */
function setupAutoRenewal(
  lease: OwnerRezSyncLease,
  leaseSeconds: number,
  supabase: any
) {
  const renewalIntervalMs = Math.floor(leaseSeconds * 1000 * 0.7);
  if (renewalIntervalMs < 1000) return;

  lease.renewalTimer = setInterval(() => {
    renewOwnerRezSyncLease(lease, leaseSeconds, supabase).catch((err) => {
      console.warn("[OwnerRez Lock] Auto-renewal background error:", err);
    });
  }, renewalIntervalMs);
  lease.renewalTimer.unref();
}
