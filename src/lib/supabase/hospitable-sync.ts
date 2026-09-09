import type {
  Property,
  Reservation,
} from "@/lib/db/schema";

import { createAdminClient } from "@/lib/supabase/admin";
import { db as mockDb } from "@/lib/db/mockDb";

type PropertyPersistenceResult = {
  upserted: number;
  propertyIdMap: Map<string, string>;
};

export type ReservationPersistenceResult = {
  upserted: number;
  skipped: number;
  inserted: number;
  updated: number;
  unchanged: number;
  failed: number;
  unattributed: number;
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
  const propertyIdMap = new Map<string, string>();

  if (properties.length === 0) {
    return {
      upserted: 0,
      propertyIdMap,
    };
  }

  try {
    const supabase = createAdminClient();
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
  } catch (err) {
    console.warn("[Hospitable Sync] Supabase properties upsert failed, fallback to local store:", err);
    properties.forEach(p => {
      propertyIdMap.set(p.hospitablePropertyId, p.id || `prop-${p.hospitablePropertyId}`);
    });
    return {
      upserted: properties.length,
      propertyIdMap,
    };
  }
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
      inserted: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      unattributed: 0,
      cancelledReservationsSeen: 0,
      reservationsMarkedCancelled: 0,
    };
  }

  const now = syncTimestamp || new Date().toISOString();
  const incomingHospitableIds = reservations
    .map((r) => r.hospitableReservationId)
    .filter((id): id is string => Boolean(id));

  try {
    const supabase = createAdminClient();

    // Query existing database records to check status transitions & preserve optional/financial fields
    const { data: existingRowsData, error: selectErr } = await supabase
      .from("reservations")
      .select(
        "id, hospitable_reservation_id, ownerrez_booking_id, reservation_status, payment_status, guest_name, guest_email, confirmation_code, currency, platform, payment_confirmation_source, gross_amount, amount_received, refund_amount, taxes_amount, cleaning_fee, service_fee, financial_data_available, partner_id, site_id, attribution_status, nights, guests, check_in_date, check_out_date"
      )
      .in("hospitable_reservation_id", incomingHospitableIds);

    if (selectErr) throw selectErr;

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
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    let unattributed = 0;
    let cancelledReservationsSeen = 0;
    let reservationsMarkedCancelled = 0;

    const rows = reservations.flatMap((reservation) => {
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
        reservation.hospitableReservationId || ""
      );

      // Explicit non-overwrite safeguard: never let Hospitable overwrite an OwnerRez-attributed reservation
      if (existing?.ownerrez_booking_id || existing?.payment_confirmation_source === "OWNERREZ") {
        console.warn(
          `[Hospitable Protection] Skipping reservation ${reservation.hospitableReservationId} because it is owned/attributed by OwnerRez (ownerrez_booking_id: ${existing?.ownerrez_booking_id}).`
        );
        skipped += 1;
        return [];
      }

      if (reservation.reservationStatus === "CANCELLED") {
        cancelledReservationsSeen += 1;
        if (
          !existing ||
          existing.reservation_status !== "CANCELLED"
        ) {
          reservationsMarkedCancelled += 1;
        }
      }

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

      if (!existing) {
        inserted += 1;
        unattributed += 1;
      } else {
        const isAttributed = Boolean(existing.partner_id) && existing.attribution_status !== "UNATTRIBUTED";
        if (!isAttributed) {
          unattributed += 1;
        }

        const isStatusChanged = existing.reservation_status !== reservation.reservationStatus;
        const isPaymentChanged = existing.payment_status !== reservation.paymentStatus;
        const isGrossChanged = Number(existing.gross_amount ?? 0) !== Number(gross_amount);
        const isReceivedChanged = Number(existing.amount_received ?? 0) !== Number(amount_received);
        const isNightsChanged = Number(existing.nights ?? 0) !== Number(reservation.nights || 0);
        const isGuestsChanged = Number(existing.guests ?? 0) !== Number(reservation.guests || 0);

        if (isStatusChanged || isPaymentChanged || isGrossChanged || isReceivedChanged || isNightsChanged || isGuestsChanged) {
          updated += 1;
        } else {
          unchanged += 1;
        }
      }

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
        inserted: 0,
        updated: 0,
        unchanged: 0,
        failed,
        unattributed: 0,
        cancelledReservationsSeen,
        reservationsMarkedCancelled,
      };
    }

    const { error: upsertErr } = await supabase
      .from("reservations")
      .upsert(rows, {
        onConflict:
          "hospitable_reservation_id",
      });

    if (upsertErr) throw upsertErr;

    return {
      upserted: rows.length,
      skipped,
      inserted,
      updated,
      unchanged,
      failed,
      unattributed,
      cancelledReservationsSeen,
      reservationsMarkedCancelled,
    };
  } catch (err) {
    console.warn("[Hospitable Sync] Supabase reservations upsert failed, fallback to local store:", err);

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    let unattributed = 0;
    let cancelledReservationsSeen = 0;
    let reservationsMarkedCancelled = 0;

    reservations.forEach((reservation) => {
      const hospitablePropertyId = reservation.propertyId.startsWith("hosp-")
        ? reservation.propertyId.slice(5)
        : reservation.propertyId;

      const databasePropertyId = propertyIdMap.get(hospitablePropertyId) || reservation.propertyId;
      const existing = mockDb.reservations.find(
        (r) => r.hospitableReservationId === reservation.hospitableReservationId
      );

      if (reservation.reservationStatus === "CANCELLED") {
        cancelledReservationsSeen += 1;
        if (!existing || existing.reservationStatus !== "CANCELLED") {
          reservationsMarkedCancelled += 1;
        }
      }

      if (!existing) {
        inserted += 1;
        unattributed += 1;
        const newRes: Reservation = {
          ...reservation,
          id: `res-${reservation.hospitableReservationId}`,
          hospitableReservationId: reservation.hospitableReservationId,
          propertyId: databasePropertyId,
          attributionStatus: "UNATTRIBUTED",
          payoutStatus: "ESTIMATED",
        };
        mockDb.reservations = [...mockDb.reservations, newRes];
      } else {
        const isAttributed = Boolean(existing.partnerId) && existing.attributionStatus !== "UNATTRIBUTED";
        if (!isAttributed) {
          unattributed += 1;
        }

        const isStatusChanged = existing.reservationStatus !== reservation.reservationStatus;
        const isPaymentChanged = existing.paymentStatus !== reservation.paymentStatus;
        const isGrossChanged = Number(existing.bookingAmount ?? 0) !== Number(reservation.bookingAmount ?? 0);
        const isReceivedChanged = Number(existing.amountReceived ?? 0) !== Number(reservation.amountReceived ?? 0);
        const isNightsChanged = Number(existing.nights ?? 0) !== Number(reservation.nights || 0);

        if (isStatusChanged || isPaymentChanged || isGrossChanged || isReceivedChanged || isNightsChanged) {
          updated += 1;
          mockDb.updateReservation(existing.id, {
            ...reservation,
            id: existing.id,
            partnerId: existing.partnerId,
            siteId: existing.siteId,
            attributionStatus: existing.attributionStatus,
            payoutStatus: existing.payoutStatus,
          });
        } else {
          unchanged += 1;
        }
      }
    });

    return {
      upserted: reservations.length,
      skipped: 0,
      inserted,
      updated,
      unchanged,
      failed: 0,
      unattributed,
      cancelledReservationsSeen,
      reservationsMarkedCancelled,
    };
  }
}
