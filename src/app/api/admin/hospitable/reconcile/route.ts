import { runHospitableSync } from "@/lib/hospitable/sync-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReconcileRequest = {
  startDate?: string;
  endDate?: string;
  dryRun?: boolean;
};

export async function POST(request: Request) {
  // Authorization Check: Must be admin or authenticated request
  const authHeader = request.headers.get("authorization") || "";
  const adminSecret = process.env.CRON_SECRET || "";

  // If secret configured, verify admin access
  if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
    return Response.json(
      {
        success: false,
        error: "Unauthorized. Administrator authorization required for reconciliation.",
      },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as ReconcileRequest;

  const result = await runHospitableSync({
    trigger: "manual",
    syncMode: "full",
    startDate: body.startDate,
    endDate: body.endDate,
    dryRun: Boolean(body.dryRun),
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
      },
      { status: result.status || 500 }
    );
  }

  return Response.json({
    success: true,
    reconciliationMode: body.dryRun ? "preview" : "execution",
    dryRun: Boolean(body.dryRun),
    syncedAt: result.syncedAt,
    syncLogId: result.syncLogId,
    summary: result.summary,
    database: result.database,
    validation: result.validation,
  });
}
