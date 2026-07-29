import { normalizeHospitableReservation } from "@/lib/hospitable/normalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function webhookAuthorized(request: Request): boolean {
  const expected = process.env.HOSPITABLE_WEBHOOK_SECRET?.trim();
  if (!expected) return true; // POC only; production must configure a secret or signature validation.

  const headerSecret = request.headers.get("x-hhh-webhook-secret");
  const querySecret = new URL(request.url).searchParams.get("secret");
  return headerSecret === expected || querySecret === expected;
}

export async function POST(request: Request) {
  if (!webhookAuthorized(request)) {
    return Response.json({ success: false, error: "Unauthorized webhook request." }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const reservationPayload = payload?.data?.reservation ?? payload?.reservation ?? payload?.data ?? payload;
    const reservation = normalizeHospitableReservation(reservationPayload);

    return Response.json({
      success: true,
      accepted: true,
      event: payload?.event ?? payload?.type ?? "reservation.updated",
      reservation,
      persistence: "not_configured",
      warning: "This reviewed POC validates and normalizes the webhook but does not persist it. Configure Supabase or another server database before enabling production webhooks."
    }, { status: 202 });
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Unable to parse Hospitable webhook."
    }, { status: 400 });
  }
}
