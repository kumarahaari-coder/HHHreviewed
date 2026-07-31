import { getHospitableBaseUrl, isHospitableConfigured } from "@/lib/hospitable/client";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    configured: isHospitableConfigured(),
    baseUrl: getHospitableBaseUrl(),
    tokenLocation: "server_environment_only",
    publicPropertySeed: true
  });
}
