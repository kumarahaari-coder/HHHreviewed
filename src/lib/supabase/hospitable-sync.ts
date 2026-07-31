import type {
  Property,
  Reservation,
} from "@/lib/db/schema";

import { createAdminClient } from "@/lib/supabase/admin";

type PropertyPersistenceResult = {
  upserted: number;
  propertyIdMap: Map<string, string>;
};

export type ReservationPersistenceResult = {
  upserted: number;
  skipped: number;
  cancelledReservationsSeen: number;
  reservationsMarkedCancelled: number;
};


function parseOriginalData(value?: string): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {
      value,
    };
  }
}

function normalizePropertyStatus(
  status: Property["status"]
): "active" | "inactive" {
  return status === "INACTIVE"
    ? "inactive"
    : "active";
}

export async function upsertHospitableProperties(
  properties: Property[]
): Promise<PropertyPersistenceResult> {
  const supabase = createAdminClient();

  if (properties.length === 0) {
    return {
      upserted: 0,
      propertyIdMap: new Map(),
    };
  }

  const now = new Date().toISOString();

  const rows = properties.map((property) => ({
    hospitable_property_id:
      property.hospitablePropertyId,

    property_name:
      property.name,

    location:
      property.location || null,

    timezone:
      property.timezone || null,

    website_url:
      property.websiteUrl || null,

    booking_url:
      property.bookingUrl || null,

    image_url:
      property.imageUrl || null,

    summary:
      property.summary || null,

    maximum_occupancy:
      property.maximumOccupancy ?? null,

    status:
      normalizePropertyStatus(property.status),

    raw_hospitable_data:
      property,

    last_synced_at:
      now,

    updated_at:
      now,
  }));

  const { data, error } = await supabase
    .from("properties")
    .upsert(rows, {
      onConflict: "hospitable_property_id",
    })
    .select("id, hospitable_property_id");

  if (error) {
    throw new Error(
      `Failed to upsert Hospitable properties: ${error.message}`
    );
  }

  const propertyIdMap = new Map<string, string>();

  for (const property of data ?? []) {
    if (
      property.hospitable_property_id &&
      property.id
    ) {
      propertyIdMap.set(
        property.hospitable_property_id,
        property.id
      );
    }
  }

  /*
   * Fetch all requested properties again.
   *
   * This ensures propertyIdMap is complete even if Supabase
   * returns only inserted or updated rows differently depending
   * on configuration.
   */
  const hospitablePropertyIds = properties.map(
    (property) => property.hospitablePropertyId
  );

  const {
    data: storedProperties,
    error: storedPropertiesError,
  } = await supabase
    .from("properties")
    .select("id, hospitable_property_id")
    .in(
      "hospitable_property_id",
      hospitablePropertyIds
    );

  if (storedPropertiesError) {
    throw new Error(
      `Properties were saved, but their database IDs could not be retrieved: ${storedPropertiesError.message}`
    );
  }

  for (const property of storedProperties ?? []) {
    if (
      property.hospitable_property_id &&
      property.id
    ) {
      propertyIdMap.set(
        property.hospitable_property_id,
        property.id
      );
    }
  }

  return {
    upserted: rows.length,
    propertyIdMap,
  };
}

export async function upsertHospitableReservations(
  reservations: Reservation[],
  propertyIdMap: Map<string, string>,
  syncTimestamp?: string
): Promise<ReservationPersistenceResult> {
  const supabase = createAdminClient();

  if (reservations.length === 0) {
    return {
      upserted: 0,
      skipped: 0,
      cancelledReservationsSeen: 0,
      reservationsMarkedCancelled: 0,
    };
  }

  const now = syncTimestamp || new Date().toISOString();
  const incomingHospitableIds = reservations.map(
    (r) => r.hospitableReservationId
  );

  // Query existing database records to check status transitions & preserve optional/financial fields
  const { data: existingRowsData } = await supabase
    .from("reservations")
    .select(
      "hospitable_reservation_id, reservation_status, guest_name, guest_email, confirmation_code, currency, platform, payment_confirmation_source, gross_amount, amount_received, refund_amount, taxes_amount, cleaning_fee, service_fee, financial_data_available"
    )
    .in("hospitable_reservation_id", incomingHospitableIds);

  const existingMap = new Map<string, Record<string, unknown>>();
  for (const row of existingRowsData ?? []) {
    if (row.hospitable_reservation_id) {
      existingMap.set(
        String(row.hospitable_reservation_id),
        row as Record<string, unknown>
      );
    }
  }

  let skipped = 0;
  let cancelledReservationsSeen = 0;
  let reservationsMarkedCancelled = 0;

  const rows = reservations.flatMap((reservation) => {
    /*
     * Normalization creates:
     * propertyId = "hosp-<Hospitable property ID>"
     * Map uses: <Hospitable property ID> => <Supabase UUID>
     */
    const hospitablePropertyId =
      reservation.propertyId.startsWith("hosp-")
        ? reservation.propertyId.slice(5)
        : reservation.propertyId;

    const databasePropertyId =
      propertyIdMap.get(hospitablePropertyId);

    if (!databasePropertyId) {
      console.warn(
        "Skipping reservation because its property could not be resolved",
        {
          reservationId:
            reservation.hospitableReservationId,
          normalizedPropertyId:
            reservation.propertyId,
          hospitablePropertyId,
        }
      );

      skipped += 1;
      return [];
    }

    const existing = existingMap.get(
      reservation.hospitableReservationId
    );

    // Track cancellation metrics
    if (reservation.reservationStatus === "CANCELLED") {
      cancelledReservationsSeen += 1;
      if (
        !existing ||
        existing.reservation_status !== "CANCELLED"
      ) {
        reservationsMarkedCancelled += 1;
      }
    }

    // Financial values handling:
    // If incoming financialDataAvailable is true, update using explicit incoming values (zero is valid).
    // If incoming financialDataAvailable is false AND an existing record is present, preserve prior stored financial values.
    const hasIncomingFinancials =
      reservation.financialDataAvailable ?? false;
    const useExistingFinancials =
      !hasIncomingFinancials && Boolean(existing);

    const gross_amount = useExistingFinancials
      ? (existing?.gross_amount as number) ?? 0
      : reservation.bookingAmount ?? 0;

    const amount_received = useExistingFinancials
      ? (existing?.amount_received as number) ?? 0
      : reservation.amountReceived ?? 0;

    const refund_amount = useExistingFinancials
      ? (existing?.refund_amount as number) ?? 0
      : reservation.refundAmount ?? 0;

    const taxes_amount = useExistingFinancials
      ? (existing?.taxes_amount as number) ?? 0
      : reservation.taxesAmount ?? 0;

    const cleaning_fee = useExistingFinancials
      ? (existing?.cleaning_fee as number) ?? 0
      : reservation.cleaningFee ?? 0;

    const service_fee = useExistingFinancials
      ? (existing?.service_fee as number) ?? 0
      : reservation.serviceFee ?? 0;

    // Optional fields: preserve existing value if incoming is empty/null/fallback
    const confirmation_code =
      reservation.confirmationCode ||
      (existing?.confirmation_code as string) ||
      null;

    const guest_name =
      (existing?.guest_name as string) || null;

    const guest_email =
      (existing?.guest_email as string) || null;

    const currency =
      reservation.currency ||
      (existing?.currency as string) ||
      "USD";

    const platform =
      reservation.platform ||
      (existing?.platform as string) ||
      null;

    const payment_confirmation_source =
      reservation.paymentConfirmationSource ||
      (existing?.payment_confirmation_source as string) ||
      null;

    /*
     * Internally owned fields (partner_id, site_id, attribution_status)
     * are completely omitted from the object payload below so Supabase bulk
     * upsert NEVER touches or overwrites them.
     */
    return [
      {
        hospitable_reservation_id:
          reservation.hospitableReservationId,

        confirmation_code,

        property_id:
          databasePropertyId,

        guest_name,

        guest_email,

        booking_date:
          reservation.bookingDate || null,

        check_in_date:
          reservation.checkInDate || null,

        check_out_date:
          reservation.checkOutDate || null,

        nights:
          reservation.nights || 0,

        guests:
          reservation.guests || 0,

        reservation_status:
          reservation.reservationStatus,

        payment_status:
          reservation.paymentStatus,

        gross_amount,

        amount_received,

        refund_amount,

        taxes_amount,

        cleaning_fee,

        service_fee,

        currency,

        raw_hospitable_data:
          parseOriginalData(
            reservation.originalData
          ),

        platform,

        payment_confirmation_source,

        financial_data_available:
          hasIncomingFinancials ||
          Boolean(existing?.financial_data_available),

        last_synced_at:
          now,

        updated_at:
          now,
      },
    ];
  });

  if (rows.length === 0) {
    return {
      upserted: 0,
      skipped,
      cancelledReservationsSeen,
      reservationsMarkedCancelled,
    };
  }

  const { error } = await supabase
    .from("reservations")
    .upsert(rows, {
      onConflict:
        "hospitable_reservation_id",
    });

  if (error) {
    throw new Error(
      `Failed to upsert Hospitable reservations: ${error.message}`
    );
  }

  return {
    upserted: rows.length,
    skipped,
    cancelledReservationsSeen,
    reservationsMarkedCancelled,
  };
}

