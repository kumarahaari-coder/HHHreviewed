import { createAdminClient } from "@/lib/supabase/admin";
import { getHospitableConfig } from "@/lib/hospitable/config";
import { createHospitableSyncLog } from "@/lib/supabase/hospitable-sync-log";

export interface SyncLease {
  lockName: string;
  lockToken: string;
  acquiredAt: string;
  expiresAt: string;
  renewalTimer?: NodeJS.Timeout;
  fallbackLogId?: string | null;
}

export class LockAcquisitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockAcquisitionError";
  }
}

const activeProcessLocks = new Map<string, SyncLease>();

/**
 * Attempts to acquire an atomic database lease for synchronization.
 */
export async function acquireSyncLease(
  lockName = "HOSPITABLE_RESERVATION_SYNC",
  acquiredBy = "system",
  customLeaseSeconds?: number
): Promise<SyncLease | null> {
  const config = getHospitableConfig();
  const leaseSeconds = customLeaseSeconds ?? config.leaseSeconds;
  const lockToken = crypto.randomUUID();
  const supabase = createAdminClient();

  // Check process-level lock state first
  const existingProcessLock = activeProcessLocks.get(lockName);
  if (existingProcessLock) {
    const now = new Date().toISOString();
    if (existingProcessLock.expiresAt > now) {
      return null;
    }
    activeProcessLocks.delete(lockName);
  }

  try {
    // 1. Try atomic RPC acquisition
    const { data: rpcSuccess, error: rpcError } = await supabase.rpc(
      "try_acquire_hospitable_sync_lock",
      {
        p_lock_name: lockName,
        p_lock_token: lockToken,
        p_lease_seconds: leaseSeconds,
        p_acquired_by: acquiredBy,
      }
    );

    if (!rpcError && typeof rpcSuccess === "boolean") {
      if (!rpcSuccess) {
        return null;
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();

      const lease: SyncLease = {
        lockName,
        lockToken,
        acquiredAt: now.toISOString(),
        expiresAt,
      };

      activeProcessLocks.set(lockName, lease);
      setupAutoRenewal(lease, leaseSeconds);
      return lease;
    }

    // 2. Table Fallback: Check hospitable_sync_logs for active RUNNING rows
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: runningData } = await supabase
      .from("hospitable_sync_logs")
      .select("id")
      .eq("status", "RUNNING")
      .gte("started_at", tenMinutesAgo)
      .limit(1);

    if ((runningData?.length ?? 0) > 0) {
      return null;
    }

    // Lock acquisition creates RUNNING log immediately to block concurrent calls
    const fallbackLogId = await createHospitableSyncLog("RESERVATION_SYNC", {
      trigger: acquiredBy,
      lockToken,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();

    const lease: SyncLease = {
      lockName,
      lockToken,
      acquiredAt: now.toISOString(),
      expiresAt,
      fallbackLogId,
    };

    activeProcessLocks.set(lockName, lease);
    return lease;
  } catch (error) {
    console.warn("Unexpected sync lease acquisition error:", error);
    return null;
  }
}

/**
 * Renews an existing lease if token matches.
 */
export async function renewSyncLease(
  lease: SyncLease,
  customLeaseSeconds?: number
): Promise<boolean> {
  const config = getHospitableConfig();
  const leaseSeconds = customLeaseSeconds ?? config.leaseSeconds;
  const supabase = createAdminClient();

  try {
    const { data: rpcSuccess, error } = await supabase.rpc(
      "renew_hospitable_sync_lock",
      {
        p_lock_name: lease.lockName,
        p_lock_token: lease.lockToken,
        p_lease_seconds: leaseSeconds,
      }
    );

    if (!error && typeof rpcSuccess === "boolean") {
      if (rpcSuccess) {
        const now = new Date();
        lease.expiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
        activeProcessLocks.set(lease.lockName, lease);
      }
      return rpcSuccess;
    }

    const now = new Date();
    lease.expiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    activeProcessLocks.set(lease.lockName, lease);
    return true;
  } catch (error) {
    console.warn("Sync lease renewal error:", error);
    return false;
  }
}

/**
 * Releases an acquired sync lease if token matches.
 */
export async function releaseSyncLease(lease: SyncLease | null): Promise<boolean> {
  if (!lease) {
    return true;
  }

  if (lease.renewalTimer) {
    clearInterval(lease.renewalTimer);
    lease.renewalTimer = undefined;
  }

  const currentProcessLock = activeProcessLocks.get(lease.lockName);
  if (currentProcessLock?.lockToken === lease.lockToken) {
    activeProcessLocks.delete(lease.lockName);
  }

  const supabase = createAdminClient();

  try {
    const { data: rpcSuccess, error } = await supabase.rpc(
      "release_hospitable_sync_lock",
      {
        p_lock_name: lease.lockName,
        p_lock_token: lease.lockToken,
      }
    );

    if (!error && typeof rpcSuccess === "boolean") {
      return rpcSuccess;
    }

    return true;
  } catch (error) {
    console.warn("Sync lease release error:", error);
    return false;
  }
}

/**
 * Sets up periodic lease renewal at 80% of lease duration.
 */
function setupAutoRenewal(lease: SyncLease, leaseSeconds: number) {
  const renewalIntervalMs = Math.floor(leaseSeconds * 1000 * 0.8);
  if (renewalIntervalMs < 1000) {
    return;
  }

  lease.renewalTimer = setInterval(() => {
    renewSyncLease(lease, leaseSeconds).catch((err) => {
      console.warn("Auto renewal failed:", err);
    });
  }, renewalIntervalMs);
}
