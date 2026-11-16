import { NextResponse } from "next/server";
import { getAdminReservations } from "@/lib/supabase/data-store";
import { getCurrentSession, isAdminRole } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthenticated: Login required." },
        { status: 401 }
      );
    }
    if (!isAdminRole(session.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Admin access required." },
        { status: 403 }
      );
    }

    const params = new URL(req.url).searchParams;
    const limit = Number(params.get("limit")) || undefined;
    const offset = Number(params.get("offset")) || undefined;
    const { reservations, total } = await getAdminReservations({ limit, offset });
    const loadedThrough = (offset ?? 0) + reservations.length;
    return NextResponse.json(
      { success: true, reservations, total, hasMore: loadedThrough < total },
      // Per-browser cache so quick page switches don't re-download the whole table.
      { headers: { "Cache-Control": "private, max-age=30" } }
    );
  } catch (err: any) {
    console.error("[API Admin Reservations Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch reservations" },
      { status: 500 }
    );
  }
}
