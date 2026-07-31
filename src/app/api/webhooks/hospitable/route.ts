import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/mockDb";
import { attributeReservation } from "@/lib/attribution";
import { calculatePayout, runSystemPayoutRecalculation } from "@/lib/payouts";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // 1. Basic Ingestion Validation
    if (!payload.reservation_id || !payload.code || !payload.property_id) {
      return NextResponse.json({ success: false, error: "Missing required booking identifier fields." }, { status: 400 });
    }

    // 2. Prevent Duplicate Processing
    const exists = db.reservations.find(r => r.hospitableReservationId === payload.reservation_id);
    if (exists) {
      return NextResponse.json({ success: false, error: "Event has already been processed." }, { status: 409 });
    }

    // 3. Compute Attribution Logic
    const mockResForAttr = {
      confirmationCode: payload.code,
      bookingDate: new Date().toISOString(),
      originalData: JSON.stringify({
        widget_id: payload.widget_id,
        metadata: {
          referrer: payload.referrer_url
        }
      })
    };

    const attribution = attributeReservation(mockResForAttr);

    // 4. Create and Save Reservation
    const newReservation = db.addReservation({
      hospitableReservationId: payload.reservation_id,
      confirmationCode: payload.code,
      partnerId: attribution.partnerId,
      siteId: attribution.siteId,
      propertyId: payload.property_id,
      bookingDate: new Date().toISOString(),
      checkInDate: payload.check_in,
      checkOutDate: payload.check_out,
      nights: payload.nights,
      guests: payload.guests,
      reservationStatus: payload.status || "CONFIRMED",
      paymentStatus: payload.payment_status || "PAID",
      bookingAmount: payload.booking_amount,
      amountReceived: payload.amount_received || (payload.booking_amount * 0.9), // Net received estimate
      refundAmount: 0,
      taxesAmount: payload.taxes_amount || 0,
      cleaningFee: payload.cleaning_fee || 150,
      serviceFee: payload.service_fee || 80,
      currency: "USD",
      attributionStatus: attribution.attributionStatus,
      payoutStatus: "ESTIMATED",
      attributionSource: attribution.attributionSource,
      originalData: mockResForAttr.originalData
    });

    // 5. Trigger Payout Calculation Sync
    runSystemPayoutRecalculation();

    // Find the generated payout record
    const associatedPayout = db.payouts.find(p => p.reservationId === newReservation.id);

    return NextResponse.json({
      success: true,
      message: "Webhook event ingested successfully.",
      reservationId: newReservation.id,
      attribution: {
        status: newReservation.attributionStatus,
        source: newReservation.attributionSource
      },
      payout: {
        status: associatedPayout?.status || "ESTIMATED",
        amount: associatedPayout?.finalPayout || 0
      }
    });

  } catch (error: any) {
    db.addNotification("WARNING", `Webhook processing error: ${error?.message || "Unknown error"}`);
    return NextResponse.json({ success: false, error: error?.message || "Internal server ingestion error" }, { status: 500 });
  }
}
