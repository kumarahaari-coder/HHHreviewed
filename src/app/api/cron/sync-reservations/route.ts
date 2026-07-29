import { runHospitableSync } from "@/lib/hospitable/sync-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const rawCronSecret = process.env.CRON_SECRET;
  const cronSecret = rawCronSecret?.trim();

  if (!cronSecret) {
    console.warn("[CRON AUTH DIAGNOSTIC] Server CRON_SECRET is not configured.");
    return Response.json(
      {
        success: false,
        error: "Server CRON_SECRET is not configured.",
      },
      { status: 500 }
    );
  }

  const authHeader =
    request.headers.get("authorization") || request.headers.get("Authorization");
  const hasAuthHeader = Boolean(authHeader);
  const headerPrefix10 = authHeader ? authHeader.slice(0, 10) + "..." : "none";
  const startsWithBearer = authHeader ? /^Bearer /i.test(authHeader.trim()) : false;

  let receivedToken = "";
  if (startsWithBearer && authHeader) {
    receivedToken = authHeader.trim().replace(/^Bearer /i, "").trim();
  }

  const isMatch = Boolean(receivedToken && receivedToken === cronSecret);

  // Temporary Authentication Diagnostics Log
  console.log("[CRON AUTH DIAGNOSTIC]", {
    hasAuthHeader,
    headerPrefix10,
    startsWithBearer,
    receivedTokenLength: receivedToken.length,
    configuredSecretLength: cronSecret.length,
    isMatch,
  });

  if (!isMatch) {
    return Response.json(
      {
        success: false,
        error: "Unauthorized scheduled sync request.",
      },
      { status: 401 }
    );
  }

  const result = await runHospitableSync({
    trigger: "cron",
    syncMode: "incremental",
    lookbackDays: 30,
    lookaheadDays: 365,
  });

  if (result.skipped) {
    return Response.json({
      success: true,
      skipped: true,
      reason: result.reason,
      syncLogId: null,
      syncType: "RESERVATION_SYNC",
      trigger: "cron",
      syncMode: "incremental",
      completedAt: new Date().toISOString(),
    });
  }

  if (!result.success) {
    return Response.json(
      {
        success: false,
        syncLogId: result.syncLogId || null,
        syncType: "RESERVATION_SYNC",
        trigger: "cron",
        syncMode: "incremental",
        error: result.error || "Scheduled sync execution failed.",
      },
      { status: result.status || 500 }
    );
  }

  return Response.json({
    success: true,
    syncLogId: result.syncLogId || null,
    syncType: "RESERVATION_SYNC",
    trigger: "cron",
    syncMode: result.syncMode,
    filterType: result.filterType,
    lookbackDays: result.lookbackDays,
    lookaheadDays: result.lookaheadDays,
    windowStart: result.windowStart,
    windowEnd: result.windowEnd,
    summary: result.summary,
    database: result.database,
    validation: {
      warningCount: result.validation?.warningCount ?? 0,
      skippedReservationCount: result.validation?.skippedReservationCount ?? 0,
    },
    completedAt: new Date().toISOString(),
  });
}
