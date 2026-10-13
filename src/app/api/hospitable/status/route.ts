import { getHospitableBaseUrl, isHospitableConfigured } from "@/lib/hospitable/client";
import { requireAdminApi } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  return Response.json({
    configured: isHospitableConfigured(),
    baseUrl: getHospitableBaseUrl(),
    tokenLocation: "server_environment_only",
    publicPropertySeed: true
  });
}
