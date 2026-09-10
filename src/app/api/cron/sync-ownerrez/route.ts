import { NextResponse } from "next/server";
import { syncAllOwnerRezBookings } from "@/lib/ownerrez/sync";
import { acquireOwnerRezSyncLease, releaseOwnerRezSyncLease } from "@/lib/ownerrez/lock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  // 1. Enforce Server-Only Cron Authorization (fail-closed)
  const rawCronSecret = process.env.CRON_SECRET || process.env.HOSPITABLE_CRON_TOKEN;
  const cronSecret = rawCronSecret?.trim();

  if (!cronSecret) {
    console.error("[OWNERREZ CRON AUTH] Server CRON_SECRET is not configured.");
    return NextResponse.json(
      {
        success: false,
        error: "Server CRON_SECRET is not configured.",
      },
      { status: 500 }
    );
  }

  const authHeader =
    request.headers.get("authorization") || request.headers.get("Authorization");
  const startsWithBearer = authHeader ? /^Bearer /i.test(authHeader.trim()) : false;
  let receivedToken = "";
  if (startsWithBearer && authHeader) {
    receivedToken = authHeader.trim().replace(/^Bearer /i, "").trim();
  }

  if (!receivedToken || receivedToken !== cronSecret) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized scheduled sync request.",
      },
      { status: 401 }
    );
  }

  // 2. Distributed Overlap / Concurrency Protection (Database-backed lease lock)
  const lease = await acquireOwnerRezSyncLease("OWNERREZ_SCHEDULED_SYNC", "cron", 420);
  if (!lease) {
    console.warn("[OWNERREZ CRON] Overlapping scheduled sync skipped; another instance holds active lease.");
    return NextResponse.json(
      {
        success: true,
        skipped: true,
        reason: "CONCURRENT_SYNC_IN_PROGRESS",
        message: "An active OwnerRez synchronization is currently in progress. Skipped to prevent overlap.",
      },
      { status: 200 }
    );
  }

  try {
    // 3. Execute authoritative bulk synchronization & reconciliation
    const batchResult = await syncAllOwnerRezBookings();

    return NextResponse.json({
      success: batchResult.failed === 0,
      trigger: "cron",
      result: batchResult,
      completedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[OWNERREZ CRON ERROR]:", error?.message || error);
    return NextResponse.json(
      {
        success: false,
        trigger: "cron",
        error: error?.message || "Scheduled OwnerRez sync execution failed.",
      },
      { status: 500 }
    );
  } finally {
    await releaseOwnerRezSyncLease(lease);
  }
}
