import { getOwnerRezBookings, OwnerRezApiError, OwnerRezConfigurationError } from "@/lib/ownerrez/client";
import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queryObj: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      queryObj[key] = val;
    });

    const data = await getOwnerRezBookings(queryObj);
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
