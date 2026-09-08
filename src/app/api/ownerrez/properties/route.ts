import { getOwnerRezProperties, OwnerRezApiError, OwnerRezConfigurationError } from "@/lib/ownerrez/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await getOwnerRezProperties();
    return Response.json(data, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OwnerRezConfigurationError) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      );
    }
    if (error instanceof OwnerRezApiError) {
      return Response.json(
        {
          error: error.message,
          status: error.status,
          details: error.responseBody,
        },
        { status: error.status }
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
