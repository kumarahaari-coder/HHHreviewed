/**
 * Hostaway Manual Sync Route
 * 
 * Endpoint: POST /api/hostaway/sync
 * 
 * Supports:
 * - Full batch sync with cursor pagination (`all: true`)
 * - Single reservation sync (`reservationId: number`)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, canPerformAdminReview } from "@/lib/authorization";
import { syncHostawayReservationsBatch, syncSingleHostawayReservation } from "@/lib/hostaway/sync";
import { fetchHostawayReservation } from "@/lib/hostaway/reservations";

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession();
    if (!session || !canPerformAdminReview(session)) {
      return NextResponse.json({ success: false, error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { all, reservationId } = body;

    if (reservationId) {
      const cleanId = Number(reservationId);
      if (isNaN(cleanId)) {
        return NextResponse.json({ success: false, error: "Invalid reservationId" }, { status: 400 });
      }

      const booking = await fetchHostawayReservation(cleanId);
      const result = await syncSingleHostawayReservation(booking);

      return NextResponse.json({
        success: true,
        mode: "single",
        result,
      });
    }

    // Default: Batch sync with cursor pagination
    const summary = await syncHostawayReservationsBatch({
      maxPages: body.maxPages || 10,
      limitPerPage: body.limit || 50,
      startingAfterId: body.afterId || 0,
    });

    return NextResponse.json({
      success: true,
      mode: "batch",
      summary,
    });
  } catch (error: any) {
    console.error("[Hostaway Sync Route Error]:", error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || "Sync execution failed." },
      { status: 500 }
    );
  }
}
