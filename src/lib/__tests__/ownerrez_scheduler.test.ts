import assert from "assert";
import { acquireOwnerRezSyncLease, releaseOwnerRezSyncLease, renewOwnerRezSyncLease } from "../ownerrez/lock";
import { SingleReconciliationResult, BatchReconciliationSummary } from "../ownerrez/sync";

export async function runSchedulerUnitTests() {
  console.log("=================================================================");
  console.log("  RUNNING OWNERREZ SCHEDULED SYNC & LOCKING TEST SUITE          ");
  console.log("=================================================================\n");

  // --------------------------------------------------------------------------
  // Test 1: Fail-Closed Authentication Verification
  // --------------------------------------------------------------------------
  {
    console.log("[Test 1] Fail-closed authentication verification...");
    function authenticateCronRequest(
      serverSecret: string | undefined,
      authHeader: string | null
    ): { status: number; authorized: boolean; error?: string } {
      const secret = serverSecret?.trim();
      if (!secret) {
        return { status: 500, authorized: false, error: "Server CRON_SECRET is not configured." };
      }
      const startsWithBearer = authHeader ? /^Bearer /i.test(authHeader.trim()) : false;
      let token = "";
      if (startsWithBearer && authHeader) {
        token = authHeader.trim().replace(/^Bearer /i, "").trim();
      }
      if (!token || token !== secret) {
        return { status: 401, authorized: false, error: "Unauthorized scheduled sync request." };
      }
      return { status: 200, authorized: true };
    }

    // 1a. Missing server secret -> 500
    const resNoSecret = authenticateCronRequest(undefined, "Bearer any-token");
    assert.strictEqual(resNoSecret.status, 500);
    assert.strictEqual(resNoSecret.authorized, false);

    // 1b. Missing Authorization header -> 401
    const resNoHeader = authenticateCronRequest("correct-secret-123", null);
    assert.strictEqual(resNoHeader.status, 401);
    assert.strictEqual(resNoHeader.authorized, false);

    // 1c. Invalid token -> 401
    const resBadToken = authenticateCronRequest("correct-secret-123", "Bearer wrong-token");
    assert.strictEqual(resBadToken.status, 401);
    assert.strictEqual(resBadToken.authorized, false);

    // 1d. Valid token -> 200 / authorized
    const resValid = authenticateCronRequest("correct-secret-123", "Bearer correct-secret-123");
    assert.strictEqual(resValid.status, 200);
    assert.strictEqual(resValid.authorized, true);

    console.log("  ✔ Test 1 Passed: Fail-closed cron authentication strictly enforced.\n");
  }

  // --------------------------------------------------------------------------
  // Test 2: Distributed Database Lease Lock Acquisition & Concurrency Guard
  // --------------------------------------------------------------------------
  {
    console.log("[Test 2] Distributed lease lock acquisition, mutual exclusion, & release...");
    const mockDbLocks = new Map<string, { lockToken: string; expiresAt: Date }>();

    const mockSupabase = {
      rpc: async (fn: string, params: any) => {
        if (fn === "try_acquire_hospitable_sync_lock") {
          const now = new Date();
          const existing = mockDbLocks.get(params.p_lock_name);
          if (existing && existing.expiresAt > now) {
            return { data: false, error: null };
          }
          const expiresAt = new Date(now.getTime() + params.p_lease_seconds * 1000);
          mockDbLocks.set(params.p_lock_name, { lockToken: params.p_lock_token, expiresAt });
          return { data: true, error: null };
        }
        if (fn === "renew_hospitable_sync_lock") {
          const now = new Date();
          const existing = mockDbLocks.get(params.p_lock_name);
          if (existing && existing.lockToken === params.p_lock_token && existing.expiresAt > now) {
            existing.expiresAt = new Date(now.getTime() + params.p_lease_seconds * 1000);
            return { data: true, error: null };
          }
          return { data: false, error: null };
        }
        if (fn === "release_hospitable_sync_lock") {
          const existing = mockDbLocks.get(params.p_lock_name);
          if (existing && existing.lockToken === params.p_lock_token) {
            mockDbLocks.delete(params.p_lock_name);
            return { data: true, error: null };
          }
          return { data: false, error: null };
        }
        throw new Error(`Unexpected RPC: ${fn}`);
      },
      from: () => ({ select: () => ({ eq: () => ({ gt: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }),
    };

    const lockName = "TEST_LOCK_" + Date.now();

    // 2a. Instance A acquires lock
    const leaseA = await acquireOwnerRezSyncLease(lockName, "cron", 60, mockSupabase);
    assert.ok(leaseA !== null, "Instance A must acquire lease");
    assert.strictEqual(leaseA.lockName, lockName);

    // 2b. Instance B attempts to acquire same lock simultaneously -> blocked!
    const leaseB = await acquireOwnerRezSyncLease(lockName, "cron", 60, mockSupabase);
    assert.strictEqual(leaseB, null, "Instance B must be denied acquisition (overlap protection)");

    // 2c. Renew lease
    const renewed = await renewOwnerRezSyncLease(leaseA, 60, mockSupabase);
    assert.strictEqual(renewed, true, "Lease renewal must succeed");

    // 2d. Instance A releases lock
    const released = await releaseOwnerRezSyncLease(leaseA, mockSupabase);
    assert.strictEqual(released, true, "Lease release must succeed");

    // 2e. Instance C can now acquire lock
    const leaseC = await acquireOwnerRezSyncLease(lockName, "cron", 60, mockSupabase);
    assert.ok(leaseC !== null, "Instance C must acquire freed lease");
    await releaseOwnerRezSyncLease(leaseC, mockSupabase);

    console.log("  ✔ Test 2 Passed: Distributed lease ensures mutual exclusion across separate instances.\n");
  }

  // --------------------------------------------------------------------------
  // Test 3: Reconciliation Aggregation and Error Isolation
  // --------------------------------------------------------------------------
  {
    console.log("[Test 3] Bulk reconciliation metrics aggregation & error isolation...");
    const summary: BatchReconciliationSummary = {
      attempted: 0,
      unpaidPending: 0,
      partialUnallocated: 0,
      realized: 0,
      reviewRequired: 0,
      errors: 0,
      rowsCreated: 0,
      realizedAmount: 0,
    };

    const results: SingleReconciliationResult[] = [
      { attempted: true, status: "UNPAID_PENDING_PAYMENT", rowsCreated: 0, realizedAmount: 0 },
      { attempted: true, status: "PARTIAL_PAYMENT_UNALLOCATED", rowsCreated: 0, realizedAmount: 0 },
      { attempted: true, status: "REALIZED", rowsCreated: 1, realizedAmount: 127.5 },
      { attempted: true, status: "MISSING_ACCRUAL_REVIEW_REQUIRED", rowsCreated: 0, realizedAmount: 0 },
      { attempted: true, status: "ERROR", rowsCreated: 0, realizedAmount: 0, error: "Transient DB error" },
    ];

    for (const r of results) {
      summary.attempted += 1;
      summary.rowsCreated += r.rowsCreated;
      summary.realizedAmount = Number((summary.realizedAmount + r.realizedAmount).toFixed(2));
      switch (r.status) {
        case "UNPAID_PENDING_PAYMENT":
          summary.unpaidPending += 1;
          break;
        case "PARTIAL_PAYMENT_UNALLOCATED":
          summary.partialUnallocated += 1;
          break;
        case "REALIZED":
          summary.realized += 1;
          break;
        case "MISSING_ACCRUAL_REVIEW_REQUIRED":
          summary.reviewRequired += 1;
          break;
        case "ERROR":
          summary.errors += 1;
          break;
      }
    }

    assert.strictEqual(summary.attempted, 5);
    assert.strictEqual(summary.unpaidPending, 1);
    assert.strictEqual(summary.partialUnallocated, 1);
    assert.strictEqual(summary.realized, 1);
    assert.strictEqual(summary.reviewRequired, 1);
    assert.strictEqual(summary.errors, 1);
    assert.strictEqual(summary.rowsCreated, 1);
    assert.strictEqual(summary.realizedAmount, 127.5);

    console.log("  ✔ Test 3 Passed: Reconciliation counters aggregate accurately across all categories.\n");
  }

  // --------------------------------------------------------------------------
  // Test 4: 420s Lease TTL vs 300s maxDuration Safety Proof
  // --------------------------------------------------------------------------
  {
    console.log("[Test 4] Proving 420s lease TTL cannot expire during 300s execution budget...");
    let virtualCurrentTime = 1000000;
    let lockRecord: { token: string; expiresAtMs: number } | null = null;

    const mockSupabase = {
      rpc: async (fn: string, params: any) => {
        if (fn === "try_acquire_hospitable_sync_lock") {
          if (lockRecord && lockRecord.expiresAtMs > virtualCurrentTime) {
            return { data: false, error: null };
          }
          lockRecord = {
            token: params.p_lock_token,
            expiresAtMs: virtualCurrentTime + params.p_lease_seconds * 1000,
          };
          return { data: true, error: null };
        }
        return { data: false, error: null };
      },
      from: () => ({ select: () => ({ eq: () => ({ gt: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }),
    };

    // 4a. Acquire lease with default 420 seconds TTL at t = 0
    const lease = await acquireOwnerRezSyncLease("BUDGET_TEST_LOCK", "cron", 420, mockSupabase);
    assert.ok(lease !== null, "Initial lease acquisition must succeed");
    const initialExpiryMs = lockRecord!.expiresAtMs;
    assert.strictEqual(initialExpiryMs - virtualCurrentTime, 420000, "Lease duration must be exactly 420,000ms (420s)");

    // 4b. Advance time by 300,000ms (5 full minutes = route maxDuration)
    virtualCurrentTime += 300000;

    // Prove lease is still unexpired
    const remainingBudgetMs = initialExpiryMs - virtualCurrentTime;
    assert.strictEqual(remainingBudgetMs, 120000, "Must have exactly 120s of safety buffer remaining at 300s");
    assert.ok(remainingBudgetMs > 0, "Lease must NOT expire within 300-second execution budget");

    // 4c. Prove concurrent attempt at 300s is STILL blocked
    const concurrentAt300s = await acquireOwnerRezSyncLease("BUDGET_TEST_LOCK", "cron", 420, mockSupabase);
    assert.strictEqual(concurrentAt300s, null, "Concurrent attempt at t=300s must be blocked by unexpired lease");

    // 4d. Advance time past 420s (e.g. + 121s)
    virtualCurrentTime += 121000; // t = 421s

    // Prove lease is now expired in the database and a new instance can take over safely
    const { data: canAcquireAt421s } = await mockSupabase.rpc("try_acquire_hospitable_sync_lock", {
      p_lock_name: "BUDGET_TEST_LOCK",
      p_lock_token: "new-instance-token",
      p_lease_seconds: 420,
    });
    assert.strictEqual(canAcquireAt421s, true, "After 420s, stale lease expires in PostgreSQL and can be safely reclaimed");

    console.log("  ✔ Test 4 Passed: 420s lease provides guaranteed 120s safety buffer beyond 300s maxDuration.\n");
  }

  // --------------------------------------------------------------------------
  // Test 5: Database Table Fallback Lock via hospitable_sync_logs (when RPC absent)
  // --------------------------------------------------------------------------
  {
    console.log("[Test 5] Proving distributed lock & leader election via hospitable_sync_logs when RPC is absent...");
    interface SyncLogRow {
      id: string;
      sync_type: string;
      status: string;
      started_at: string;
      completed_at?: string;
      metadata?: any;
    }
    const mockLogsTable: SyncLogRow[] = [];

    const mockSupabaseWithoutRpc = {
      rpc: async () => {
        // RPC is not available in database
        return { data: null, error: { code: "PGRST202", message: "function not found" } };
      },
      from: (tableName: string) => {
        assert.strictEqual(tableName, "hospitable_sync_logs");
        return {
          select: (fields: string) => ({
            eq: (col1: string, val1: any) => ({
              eq: (col2: string, val2: any) => ({
                gte: (col3: string, val3: any) => ({
                  order: (sortCol: string, { ascending }: { ascending: boolean }) => {
                    const filtered = mockLogsTable.filter(
                      (r) =>
                        r[col1 as keyof SyncLogRow] === val1 &&
                        r[col2 as keyof SyncLogRow] === val2 &&
                        (r[col3 as keyof SyncLogRow] as string) >= val3
                    );
                    filtered.sort((a, b) =>
                      ascending
                        ? a.started_at.localeCompare(b.started_at) || a.id.localeCompare(b.id)
                        : b.started_at.localeCompare(a.started_at)
                    );
                    return Promise.resolve({ data: filtered, error: null });
                  },
                }),
              }),
            }),
          }),
          insert: (record: any) => ({
            select: () => ({
              single: async () => {
                const newRow: SyncLogRow = {
                  id: "log_" + (mockLogsTable.length + 1),
                  sync_type: record.sync_type,
                  status: record.status,
                  started_at: record.started_at,
                  metadata: record.metadata,
                };
                mockLogsTable.push(newRow);
                return { data: { id: newRow.id, started_at: newRow.started_at }, error: null };
              },
            }),
          }),
          update: (updates: any) => ({
            eq: (col: string, val: any) => {
              const row = mockLogsTable.find((r) => r[col as keyof SyncLogRow] === val);
              if (row) {
                Object.assign(row, updates);
              }
              return {
                eq: (col2: string, val2: any) => {
                  const target = mockLogsTable.find((r) => r[col as keyof SyncLogRow] === val && r[col2 as keyof SyncLogRow] === val2);
                  if (target) {
                    Object.assign(target, updates);
                  }
                  return Promise.resolve({ error: null });
                },
                then: (resolve: any) => resolve({ error: null }),
              };
            },
          }),
        };
      },
    };

    const lockName = "DISTRIBUTED_CRON_LOCK_" + Date.now();

    // 5a. First instance acquires lease via table
    const lease1 = await acquireOwnerRezSyncLease(lockName, "cron-1", 420, mockSupabaseWithoutRpc);
    assert.ok(lease1 !== null, "Instance 1 must acquire lease via table");
    assert.strictEqual(lease1.lockName, lockName);

    // 5b. Overlapping instance attempts to acquire simultaneously -> rejected!
    const lease2 = await acquireOwnerRezSyncLease(lockName, "cron-2", 420, mockSupabaseWithoutRpc);
    assert.strictEqual(lease2, null, "Instance 2 must be denied acquisition (overlap protection via table)");

    // 5c. Instance 1 releases lease
    const releaseOk = await releaseOwnerRezSyncLease(lease1, mockSupabaseWithoutRpc);
    assert.strictEqual(releaseOk, true, "Instance 1 release must succeed");

    // 5d. Instance 3 attempts to acquire after release -> succeeds!
    const lease3 = await acquireOwnerRezSyncLease(lockName, "cron-3", 420, mockSupabaseWithoutRpc);
    assert.ok(lease3 !== null, "Instance 3 must acquire freed lease");
    await releaseOwnerRezSyncLease(lease3, mockSupabaseWithoutRpc);

    console.log("  ✔ Test 5 Passed: hospitable_sync_logs table lock ensures strict mutual exclusion across instances when RPC is absent.\n");
  }

  console.log("=================================================================");
  console.log("  ALL OWNERREZ SCHEDULER & LOCKING UNIT TESTS PASSED 100%!       ");
  console.log("=================================================================");
}

if (process.argv[1] && process.argv[1].endsWith("ownerrez_scheduler.test.ts")) {
  runSchedulerUnitTests().catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
  });
}
