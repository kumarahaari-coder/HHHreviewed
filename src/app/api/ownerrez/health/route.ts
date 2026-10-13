import { checkOwnerRezHealth } from "@/lib/ownerrez/client";
import { requireAdminApi } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const result = await checkOwnerRezHealth();
  const statusCode = result.status === "healthy" ? 200 : result.status === "unconfigured" ? 500 : (result.statusCode || 502);

  return Response.json(result, { status: statusCode });
}
