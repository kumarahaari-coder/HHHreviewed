/**
 * Which PMS a reservation was ingested from, for display and filtering.
 * Hostaway is the primary PMS; OwnerRez and Hospitable are legacy sources.
 */
import type { Reservation } from "@/lib/db/schema";

export type ReservationProvider = "HOSTAWAY" | "OWNERREZ" | "HOSPITABLE";

type ProviderFields = Pick<Reservation, "hostawayReservationId" | "ownerrezBookingId" | "paymentConfirmationSource">;

export function getReservationProvider(res: Partial<ProviderFields>): ReservationProvider {
  const source = String(res.paymentConfirmationSource || "").toUpperCase();
  if (res.hostawayReservationId || source === "HOSTAWAY") return "HOSTAWAY";
  if (res.ownerrezBookingId || source === "OWNERREZ") return "OWNERREZ";
  return "HOSPITABLE";
}

export const PROVIDER_LABELS: Record<ReservationProvider, string> = {
  HOSTAWAY: "Hostaway",
  OWNERREZ: "OwnerRez",
  HOSPITABLE: "Hospitable",
};

export function getReservationProviderLabel(res: Partial<ProviderFields>): string {
  return PROVIDER_LABELS[getReservationProvider(res)];
}
