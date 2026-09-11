import { NextResponse } from "next/server";
import { syncOwnerRezBookingById, syncAllOwnerRezBookings } from "@/lib/ownerrez/sync";
import { getCurrentSession, isAdminRole } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // 1. Enforce Server-Side Admin Authorization
    const session = await getCurrentSession();
    if (!session || !isAdminRole(session.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Admin authorization required to trigger OwnerRez sync." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // 2. Multi-Property Bulk Sync
    if (body.all === true) {
      const batchResult = await syncAllOwnerRezBookings();
      return NextResponse.json({
        success: batchResult.failed === 0,
        result: batchResult,
        ...batchResult,
      });
    }

    // 3. Targeted Single Booking Sync
    const rawBookingId = body.bookingId;
    if (rawBookingId === undefined || rawBookingId === null) {
      return NextResponse.json(
        { success: false, error: "Invalid payload: Specify either { all: true } or an integer { bookingId }." },
        { status: 400 }
      );
    }

    const bookingId = Number(rawBookingId);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid bookingId: Must be a positive integer." },
        { status: 400 }
      );
    }

    const singleResult = await syncOwnerRezBookingById(bookingId);

    return NextResponse.json({
      success: singleResult.failed === 0,
      result: singleResult,
    });
  } catch (error: any) {
    console.error("[OwnerRez Sync API Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Internal server error during OwnerRez sync",
      },
      { status: 500 }
    );
  }
}
