import { NextResponse } from "next/server";
import { getAdminReservations } from "@/lib/supabase/data-store";
import { getCurrentSession, isAdminRole } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session || !isAdminRole(session.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Admin access required." },
        { status: 403 }
      );
    }

    const reservations = await getAdminReservations();
    return NextResponse.json({ success: true, reservations });
  } catch (err: any) {
    console.error("[API Admin Reservations Error]:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch reservations" },
      { status: 500 }
    );
  }
}
