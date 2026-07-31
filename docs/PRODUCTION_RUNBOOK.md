# Hidden Honey Homes (HHH) — Hospitable Integration Production Runbook

**Document Version**: `1.1.0`  
**Last Reviewed**: `2026-07-29`  
**Target Platform**: Vercel (Next.js 16 App Router) + External Scheduler (`cron-job.org`) + Supabase PostgreSQL  

---

## 1. External Scheduler: cron-job.org

To support more frequent synchronizations than Vercel Hobby's once-daily limit, reservation synchronization is scheduled via **cron-job.org**.

### Recommended Configuration Setup

- **Job Name**: `Hidden Honey Hospitable Sync`
- **Method**: `GET`
- **URL**: `https://<PRODUCTION_DOMAIN>/api/cron/sync-reservations`
- **Request Header**: `Authorization: Bearer <CRON_SECRET>`
- **Frequency**: Every 30 minutes
- **Cron Schedule**: `*/30 * * * *`
- **Expected HTTP Status**: `200`

### Valid Outcome Responses

1. **Successful Execution**:
   ```json
   {
     "success": true,
     "syncLogId": "...",
     "syncType": "RESERVATION_SYNC",
     "trigger": "cron",
     "syncMode": "incremental",
     "filterType": "arrival_date_window",
     "lookbackDays": 30,
     "lookaheadDays": 365,
     "windowStart": "YYYY-MM-DD",
     "windowEnd": "YYYY-MM-DD",
     "summary": { ... },
     "database": { ... },
     "validation": { ... },
     "completedAt": "..."
   }
   ```
2. **Safe Overlap Skip (`SYNC_ALREADY_RUNNING`)**:
   ```json
   {
     "success": true,
     "skipped": true,
     "reason": "SYNC_ALREADY_RUNNING"
   }
   ```

### Critical Operational Rules & Safeguards

- **Vercel Cron Disabled**: Vercel cron scheduling in `vercel.json` is disabled to prevent duplicate concurrent triggers.
- **Atomic Concurrency Protection**: Database lease locking (`public.hospitable_sync_locks`) protects against accidental overlaps. If an active sync is running, any concurrent cron request safely skips with HTTP 200.
- **Source of Truth**: `public.hospitable_sync_logs` remains the authoritative source of truth for sync completions, run durations, and validation summaries.
- **Monitoring & Alerts**: Enable failure and recovery notifications in `cron-job.org`. Cross-check any cron-job.org timeout or network errors against `/admin/integrations` and `/api/hospitable/health`.

---

## 2. System Architecture & Component Diagram

```
                       +-----------------------------------+
                       |    cron-job.org (*/30 * * * *)    |
                       +-----------------------------------+
                                         |
                                         | HTTP GET (Authorization: Bearer <CRON_SECRET>)
                                         v
+-----------------------+     +-----------------------------------+
|  Admin / User UI      | --> |  /api/cron/sync-reservations      |
|  (/admin/integrations)|     |  /api/hospitable/sync-reservations|
+-----------------------+     |  /api/admin/hospitable/reconcile  |
                              +-----------------------------------+
                                         |
                                         v
                              +-----------------------------------+
                              |    src/lib/hospitable/sync-runner |
                              +-----------------------------------+
                                   /       |       \
                                  /        |        \
            +--------------------+   +-----+------+  +---------------------+
            | Database Lease Lock|   | Hospitable |  | Supabase Persistence|
            | (lock.ts / SQL)    |   | Public v2  |  | (hospitable-sync)   |
            +--------------------+   +------------+  +---------------------+
```

---

## 3. Synchronization Execution Flow

```
[Trigger (Cron / Manual)]
        │
        ▼
[Acquire DB Lease Lock (hospitable_sync_locks)]
        │
        ├─► [Lock Active] ──► Return HTTP 200 { success: true, skipped: true, reason: "SYNC_ALREADY_RUNNING" }
        │
        ▼ [Lock Acquired]
[Create RUNNING Sync Log (public.hospitable_sync_logs)]
        │
        ▼
[Fetch Properties (Max 50 Pages, Retries on 429/5xx)]
        │
        ▼
[Filter Approved POC Properties (058aed01..., 5da25edc..., abe5540b..., e5552f35...)]
        │
        ▼
[Fetch Raw Reservations (Rolling Window: -30d to +365d UTC)]
        │
        ▼
[Validate Raw Data ──► Normalize ──► Validate Post-Normalization]
        │
        ▼
[Upsert Properties & Reservations to Supabase]  (Skipped if dryRun = true)
        │
        ▼
[Complete Sync Log with Stage Timings & Metadata]
        │
        ▼
[Release DB Lease Lock in finally block]
```

---

## 4. Concurrency Protection & Lease Lock Lifecycle

- **Lock Mechanism**: Database table `public.hospitable_sync_locks` with atomic RPC functions `try_acquire_hospitable_sync_lock`, `renew_hospitable_sync_lock`, and `release_hospitable_sync_lock`.
- **Token Matching**: Every lease generates a unique UUID `lock_token`. Renewal and release RPC calls verify the token so one process can never release another's lease.
- **Auto-Renewal**: Long-running syncs automatically renew the lease when **80% of lease duration** has elapsed.
- **Stale Lease Recovery**: Expired leases (`now() >= expires_at`) are automatically overwritten on the next acquisition attempt.

---

## 5. Configuration Management & Environment Variables

All settings are managed via `src/lib/hospitable/config.ts` and validated on startup:

| Environment Variable | Default | Allowed Range | Description |
| :--- | :---: | :---: | :--- |
| `HOSPITABLE_PAT` | *(Required)* | String | Hospitable Public API v2 Personal Access Token |
| `CRON_SECRET` | *(Required)* | Min 16 chars | Shared secret for production cron authorization (`Authorization: Bearer <CRON_SECRET>`) |
| `HOSPITABLE_LOOKBACK_DAYS` | `30` | `1` to `365` | Historical arrival date lookback window (days) |
| `HOSPITABLE_LOOKAHEAD_DAYS` | `365` | `1` to `730` | Future arrival date lookahead window (days) |
| `HOSPITABLE_LOCK_LEASE_SECONDS` | `600` | `60` to `3600` | Synchronization lease lock duration (seconds) |
| `HOSPITABLE_MAX_RETRIES` | `3` | `0` to `10` | Maximum HTTP 429/5xx transient retries |
| `HOSPITABLE_INITIAL_RETRY_DELAY_MS` | `1000` | `100` to `10000` | Initial exponential backoff delay (ms) |
| `HOSPITABLE_API_TIMEOUT_MS` | `15000` | `1000` to `60000` | Request timeout per API call (ms) |
| `HOSPITABLE_MAX_PAGES` | `50` | `1` to `200` | Maximum pagination limit before failure |
| `HOSPITABLE_PAGE_SIZE` | `100` | `1` to `100` | Number of items requested per API page |

---

## 6. Health Status Engine & Deterministic Rules

The health endpoint (`GET /api/hospitable/health`) outputs deterministic status codes:

- **`Healthy`** (`ALL_SYSTEMS_OPERATIONAL`): Recent scheduled sync succeeded, all 4 approved properties present, 0 stale leases, 0 historical deletions.
- **`Degraded`**:
  - `VALIDATION_WARNINGS_PRESENT`: Operational warnings exist (e.g. non-whitelisted listings ignored).
  - `FINANCIAL_COVERAGE_LOW`: Financial coverage percentage falls below 80%.
- **`Unhealthy`**:
  - `RECENT_SYNC_FAILED`: Latest sync run failed.
  - `NO_RECENT_SUCCESSFUL_SYNC`: No successful sync recorded within 28 hours.
  - `MISSING_APPROVED_PROPERTIES`: Fewer than 4 approved POC properties returned.
  - `PERSISTENCE_SKIPPED_RECORDS`: Persistence skipped valid records.
  - `STALE_LEASE_ACTIVE`: Lease lock remains active beyond expected duration.
  - `HISTORICAL_DELETION_DETECTED`: Historical records deleted.

---

## 7. Alerting System & Deduplication

- **Alert Dispatcher**: `src/lib/hospitable/alerting.ts`
- **Suppression Window**: Identical alerts sharing the same key are suppressed for **45 minutes** to prevent alert fatigue.
- **Alert Conditions**: Triggered on `Unhealthy` health states, persistent HTTP failures, or missing approved properties.

---

## 8. Administrative Reconciliation & Dry-Run Mode

- **Endpoint**: `POST /api/admin/hospitable/reconcile`
- **Authorization**: Requires `Authorization: Bearer <CRON_SECRET>` or admin role session.
- **Dry-Run Preview (`dryRun: true`)**:
  - Fetches, validates, and normalizes Hospitable data.
  - Logs operational record in `hospitable_sync_logs` with `dryRun: true`.
  - **Guarantees zero business-data mutations** to `properties` or `reservations` tables.

---

## 9. Common Failure Scenarios & Recovery Runbook

### Scenario A: `SYNC_ALREADY_RUNNING` (Stale Lease)
1. Check `/api/hospitable/health` details for `staleLeaseActive`.
2. Expired leases automatically recover after `leaseSeconds` (10 min).
3. To force release manually, clear past logs or invoke `release_hospitable_sync_lock` via Supabase SQL editor.

### Scenario B: Hospitable API Rate Limit (HTTP 429)
1. Client automatically respects `Retry-After` header and retries up to 3 times with exponential backoff and random jitter.
2. If persistent, increase `HOSPITABLE_INITIAL_RETRY_DELAY_MS` in environment settings.

### Scenario C: Pagination Limit Exceeded (`HOSPITABLE_MAX_PAGES_EXCEEDED`)
1. Indicates a massive response exceeding 50 pages (5,000 items).
2. The sync engine discards partial data (`partialResultDiscarded: true`) to prevent database corruption.
3. Solution: Increase `HOSPITABLE_MAX_PAGES` or scope date bounds.

---

## 10. Secret Rotation Procedure

1. Generate a new high-entropy string for `CRON_SECRET`.
2. Update `CRON_SECRET` in Vercel Production Environment Variables.
3. Update the `Authorization: Bearer <CRON_SECRET>` header setting in **cron-job.org**.

---

## 11. Pre-Deployment Verification Checklist

- [x] All automated test runner suites pass cleanly (`npm run tsx ...`).
- [x] `npm run typecheck` passes with 0 errors.
- [x] Targeted `npx eslint` passes with 0 errors/warnings.
- [x] Database migration applied to live Supabase database (`20260729000001_add_hospitable_sync_lock.sql`).
- [x] Next.js production build (`npm run build`) completes successfully.
- [x] Vercel Cron schedule removed from `vercel.json`.
- [x] Cron endpoint (`GET /api/cron/sync-reservations`) enforces `Authorization: Bearer <CRON_SECRET>` and returns safe operational summary.
