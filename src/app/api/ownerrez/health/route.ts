import { checkOwnerRezHealth } from "@/lib/ownerrez/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await checkOwnerRezHealth();
  const statusCode = result.status === "healthy" ? 200 : result.status === "unconfigured" ? 500 : (result.statusCode || 502);

  return Response.json(result, { status: statusCode });
}
