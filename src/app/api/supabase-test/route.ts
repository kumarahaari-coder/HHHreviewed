import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = createAdminClient();

    // 1. Inspect properties table
    const { data: propertiesData, error: propErr } = await supabase
      .from("properties")
      .select("id, hospitable_property_id, property_name, location, timezone, website_url, booking_url, image_url, summary, maximum_occupancy, status, last_synced_at, updated_at")
      .limit(2);

    // 2. Inspect reservations table
    const { data: reservationsData, error: resErr } = await supabase
      .from("reservations")
      .select("id, hospitable_reservation_id, confirmation_code, property_id, guest_name, guest_email, booking_date, check_in_date, check_out_date, nights, guests, reservation_status, payment_status, gross_amount, amount_received, refund_amount, taxes_amount, cleaning_fee, service_fee, currency, platform, payment_confirmation_source, financial_data_available, partner_id, site_id, attribution_status, payout_status, last_synced_at, updated_at")
      .limit(2);

    // 3. Inspect hospitable_sync_logs table
    const { data: logsData, error: logsErr } = await supabase
      .from("hospitable_sync_logs")
      .select("id, sync_type, status, records_processed, error_details, started_at, completed_at")
      .limit(2);

    // Try executing SQL via Supabase RPC or direct RPC if created, or report table sample metadata
    return NextResponse.json({
      success: true,
      inspectionTimestamp: new Date().toISOString(),
      propertiesSample: {
        count: propertiesData?.length ?? 0,
        sampleRow: propertiesData?.[0] ?? null,
        error: propErr ? propErr.message : null
      },
      reservationsSample: {
        count: reservationsData?.length ?? 0,
        sampleRow: reservationsData?.[0] ?? null,
        error: resErr ? resErr.message : null
      },
      hospitableSyncLogsSample: {
        count: logsData?.length ?? 0,
        sampleRow: logsData?.[0] ?? null,
        error: logsErr ? logsErr.message : null
      }
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Live schema introspection error"
    }, { status: 500 });
  }
}
