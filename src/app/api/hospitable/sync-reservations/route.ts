import { runHospitableSync } from "@/lib/hospitable/sync-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SyncRequest = {
  startDate?: string;
  endDate?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SyncRequest;

  const result = await runHospitableSync({
    trigger: "manual",
    syncMode: "full",
    startDate: body.startDate,
    endDate: body.endDate,
  });

  if (result.skipped) {
    return Response.json({
      success: true,
      skipped: true,
      reason: result.reason,
    });
  }

  if (!result.success) {
    return Response.json(
      {
        success: false,
        error: result.error,
        ...(result.status ? { status: result.status } : {}),
        ...(result.details ? { details: result.details } : {}),
        ...(result.syncLogId ? { syncLogId: result.syncLogId } : {}),
      },
      { status: result.status || 500 }
    );
  }

  return Response.json({
    success: true,
    syncedAt: result.syncedAt,
    source: result.source,
    scope: result.scope,
    persisted: result.persisted,
    ...(result.syncLogId ? { syncLogId: result.syncLogId } : {}),
    database: result.database,
    summary: result.summary,
    validation: result.validation,
    propertyIds: result.propertyIds,
    missingPropertyIds: result.missingPropertyIds,
    reservations: result.reservations,
  });
}