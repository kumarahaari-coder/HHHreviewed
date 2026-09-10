import { createAdminClient } from "@/lib/supabase/admin";

export interface OwnerRezSyncLease {
  lockName: string;
  lockToken: string;
  acquiredAt: string;
  expiresAt: string;
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
    // 2. Database-backed atomic lease acquisition via PostgreSQL RPC
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

      const lease: OwnerRezSyncLease = {
        lockName,
        lockToken,
        acquiredAt: now.toISOString(),
        expiresAt,
      };

      activeProcessLocks.set(lockName, lease);
      setupAutoRenewal(lease, leaseSeconds, supabase);
      return lease;
    }

    // 3. Fallback table query if RPC is temporarily unavailable
    const nowIso = new Date().toISOString();
    const { data: activeLocks, error: tableErr } = await supabase
      .from("hospitable_sync_locks")
      .select("lock_name, expires_at")
      .eq("lock_name", lockName)
      .gt("expires_at", nowIso)
      .limit(1);

    if (!tableErr && activeLocks && activeLocks.length > 0) {
      return null;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    const lease: OwnerRezSyncLease = {
      lockName,
      lockToken,
      acquiredAt: now.toISOString(),
      expiresAt,
    };
    activeProcessLocks.set(lockName, lease);
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
    const { data: rpcSuccess, error } = await supabase.rpc(
      "renew_hospitable_sync_lock",
      {
        p_lock_name: lease.lockName,
        p_lock_token: lease.lockToken,
        p_lease_seconds: leaseSeconds,
      }
    );

    if (!error && typeof rpcSuccess === "boolean" && rpcSuccess) {
      const now = new Date();
      lease.expiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
      activeProcessLocks.set(lease.lockName, lease);
      return true;
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
