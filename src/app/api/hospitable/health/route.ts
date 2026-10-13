import { evaluateIntegrationHealth } from "@/lib/hospitable/health";
import { requireAdminApi } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const healthReport = await evaluateIntegrationHealth();
  const statusCode =
    healthReport.status === "Healthy"
      ? 200
      : healthReport.status === "Degraded"
      ? 200
      : 503;

  return Response.json(healthReport, { status: statusCode });
}
