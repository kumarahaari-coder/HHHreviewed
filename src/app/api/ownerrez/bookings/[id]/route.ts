import { getOwnerRezBooking, OwnerRezApiError, OwnerRezConfigurationError } from "@/lib/ownerrez/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !id.trim()) {
      return Response.json({ error: "Booking ID is required." }, { status: 400 });
    }

    const data = await getOwnerRezBooking(id);
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
