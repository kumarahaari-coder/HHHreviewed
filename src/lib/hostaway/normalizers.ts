/**
 * Hostaway Reservation Normalizer Module
 * 
 * Maps raw Hostaway reservation payloads into HHH canonical reservation schema.
 * Enforces critical invariants:
 * - sourceProvider = "hostaway" strictly separated from platform (Airbnb, Vrbo, Direct, etc.)
 * - Never returns "hostaway" as the booking channel / platform
 * - Exact fee breakdown (cleaning fee, taxes, service fees)
 * - Safe numeric calculation of nights and amounts
 */

import { HostawayReservation } from "./types";
import { Reservation, ReservationStatus, PaymentStatus } from "@/lib/db/schema";

/**
 * Calculates night count between arrivalDate and departureDate (YYYY-MM-DD).
 */
export function calculateStayNights(arrivalDate: string, departureDate: string): number {
  try {
    const arr = new Date(arrivalDate + "T00:00:00Z");
    const dep = new Date(departureDate + "T00:00:00Z");
    const diff = dep.getTime() - arr.getTime();
    const nights = Math.round(diff / (1000 * 60 * 60 * 24));
    return nights > 0 ? nights : 0;
  } catch {
    return 0;
  }
}

/**
 * Normalizes Hostaway reservation status to HHH canonical ReservationStatus.
 */
export function normalizeHostawayReservationStatus(status: string): ReservationStatus {
  const s = (status || "").trim().toLowerCase();
  if (s === "cancelled" || s === "canceled") return "CANCELLED";
  if (s === "checked_in" || s === "checkedin") return "CHECKED_IN";
  if (s === "checked_out" || s === "checkedout") return "CHECKED_OUT";
  if (s === "completed") return "COMPLETED";
  if (s === "inquiry" || s === "pending") return "PENDING";
  if (s === "new" || s === "modified" || s === "confirmed" || s === "accepted") return "CONFIRMED";
  return "CONFIRMED";
}

/**
 * Normalizes Hostaway payment status to HHH canonical PaymentStatus.
 */
export function normalizeHostawayPaymentStatus(
  totalPrice: number,
  paidAmount: number,
  isPaid?: number | boolean
): PaymentStatus {
  const gross = Number(totalPrice || 0);
  const paid = Number(paidAmount || 0);

  if (isPaid === 1 || isPaid === true) return "PAID";
  if (gross > 0 && paid >= gross) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "UNPAID";
}

/**
 * Derives booking channel (platform) independently from the provider.
 * Never returns 'hostaway' as booking channel.
 */
export function deriveHostawayBookingChannel(booking: HostawayReservation): string {
  const channelName = (booking.channelName || "").trim().toLowerCase();
  const source = (booking.source || "").trim().toLowerCase();

  if (channelName.includes("airbnb") || source.includes("airbnb")) return "airbnb";
  if (channelName.includes("vrbo") || channelName.includes("homeaway") || source.includes("vrbo")) return "vrbo";
  if (channelName.includes("booking.com") || channelName.includes("bcom") || source.includes("booking.com") || source.includes("bcom")) return "booking.com";
  if (channelName.includes("expedia") || source.includes("expedia")) return "expedia";
  if (channelName.includes("tripadvisor") || source.includes("tripadvisor")) return "tripadvisor";

  // Hostaway direct booking engine, WordPress widget, custom portal, or direct API
  return "direct";
}

export interface ExtractReferralOptions {
  customFieldDefinitions?: import("./types").HostawayCustomFieldDefinition[];
  referralCustomFieldId?: number;
}

/**
 * Extracts HHH_REFERRAL_SITE_ID from Hostaway custom fields / values.
 * Resolves both named fields and Hostaway's standard customFieldId format:
 * customFieldId -> field definition -> HHH_REFERRAL_SITE_ID
 */
export function extractReferralSiteId(
  booking: HostawayReservation,
  options?: ExtractReferralOptions
): string | null {
  const targetId =
    options?.referralCustomFieldId ??
    (process.env.HOSTAWAY_REFERRAL_CUSTOM_FIELD_ID
      ? Number(process.env.HOSTAWAY_REFERRAL_CUSTOM_FIELD_ID)
      : undefined);

  const definitions = options?.customFieldDefinitions;

  // Build set of matching customFieldIds
  const matchingFieldIds = new Set<number>();
  if (targetId !== undefined && !isNaN(targetId)) {
    matchingFieldIds.add(targetId);
  }
  if (definitions) {
    for (const d of definitions) {
      if (d.name?.trim().toUpperCase() === "HHH_REFERRAL_SITE_ID") {
        matchingFieldIds.add(d.id);
      }
    }
  }

  // 1. Check customFieldValues array (standard Hostaway reservation response with includeResources=1)
  if (Array.isArray(booking.customFieldValues)) {
    for (const item of booking.customFieldValues as any[]) {
      // By customFieldId resolution
      if (item.customFieldId && matchingFieldIds.has(Number(item.customFieldId))) {
        if (item.value != null && String(item.value).trim()) {
          return String(item.value).trim();
        }
      }
      // If name is directly attached
      if (
        item.name?.trim().toUpperCase() === "HHH_REFERRAL_SITE_ID" &&
        item.value != null &&
        String(item.value).trim()
      ) {
        return String(item.value).trim();
      }
    }
  }

  // 2. Check customFields array
  if (Array.isArray(booking.customFields)) {
    for (const cf of booking.customFields as any[]) {
      if (cf.id && matchingFieldIds.has(Number(cf.id)) && cf.value != null && String(cf.value).trim()) {
        return String(cf.value).trim();
      }
      if (cf.name?.trim().toUpperCase() === "HHH_REFERRAL_SITE_ID" && cf.value && String(cf.value).trim()) {
        return String(cf.value).trim();
      }
    }
  }

  // 3. Check customValues object map
  if (booking.customValues && typeof booking.customValues === "object") {
    for (const [key, val] of Object.entries(booking.customValues)) {
      if (key.trim().toUpperCase() === "HHH_REFERRAL_SITE_ID" && val && String(val).trim()) {
        return String(val).trim();
      }
      const numKey = Number(key);
      if (!isNaN(numKey) && matchingFieldIds.has(numKey) && val && String(val).trim()) {
        return String(val).trim();
      }
    }
  }

  // 4. Check raw audit metadata
  if (booking.raw?.HHH_REFERRAL_SITE_ID) {
    return String(booking.raw.HHH_REFERRAL_SITE_ID).trim();
  }

  return null;
}

export interface NormalizedHostawayReservation {
  hostawayReservationId: number;
  confirmationCode: string;
  listingMapId: number;
  checkInDate: string;
  checkOutDate: string;
  bookingDate: string;
  nights: number;
  guests: number;
  guestName: string;
  guestEmail: string;
  reservationStatus: ReservationStatus;
  paymentStatus: PaymentStatus;
  grossAmount: number;
  amountReceived: number;
  cleaningFee: number;
  taxesAmount: number;
  serviceFee: number;
  currency: string;
  platform: string;
  sourceProvider: "hostaway";
  referralSiteId: string | null;
  rawHostawayData: Record<string, unknown>;
}

/**
 * Canonical transformation of a Hostaway reservation.
 */
export function normalizeHostawayReservation(
  booking: HostawayReservation
): NormalizedHostawayReservation {
  const hostawayReservationId = Number(booking.id || booking.hostawayReservationId);
  const confirmationCode = (booking.reservationId || `HA-${hostawayReservationId}`).trim();

  const arrival = (booking.arrivalDate || "").slice(0, 10);
  const departure = (booking.departureDate || "").slice(0, 10);
  const bookingDate = (booking.reservationDate || booking.insertedOn || arrival).slice(0, 19);

  const nights = calculateStayNights(arrival, departure);
  const adults = Number(booking.adults || 0);
  const children = Number(booking.children || 0);
  const guests = Number(booking.numberOfGuests || adults + children || 1);

  const guestName =
    booking.guestName?.trim() ||
    [booking.guestFirstName, booking.guestLastName].filter(Boolean).join(" ").trim() ||
    "Guest";

  const guestEmail = (booking.guestEmail || "").trim().toLowerCase();

  const grossAmount = Math.round(Number(booking.totalPrice || 0) * 100) / 100;
  const amountReceived = Math.round(Number(booking.paidAmount || 0) * 100) / 100;
  const cleaningFee = Math.round(Number(booking.cleaningFee || 0) * 100) / 100;
  const taxesAmount = Math.round(Number(booking.taxAmount || 0) * 100) / 100;
  const serviceFee = Math.round(Number(booking.channelFee || booking.hostawayFee || 0) * 100) / 100;

  const reservationStatus = normalizeHostawayReservationStatus(booking.status);
  const paymentStatus = normalizeHostawayPaymentStatus(grossAmount, amountReceived, booking.isPaid);

  const platform = deriveHostawayBookingChannel(booking);
  const referralSiteId = extractReferralSiteId(booking);

  // Strict PII Minimization & Sanitization:
  // Retain only provider evidence necessary for audit/reconciliation, attribution, and financial calculation.
  // Never persist guest phone, postal address, IDs/documents, freeform messages, or payment credentials.
  const sanitizedCustomFields = Array.isArray(booking.customFieldValues || booking.customFields)
    ? (booking.customFieldValues || booking.customFields)!.map((cf: any) => ({
        customFieldId: cf.customFieldId,
        name: cf.name,
        value: typeof cf.value === "string" && cf.value.length > 500 ? cf.value.slice(0, 500) : cf.value,
      }))
    : [];

  const rawAuditData = {
    id: booking.id,
    listingMapId: booking.listingMapId,
    reservationId: booking.reservationId,
    channelId: booking.channelId,
    channelName: booking.channelName,
    source: booking.source,
    status: booking.status,
    arrivalDate: booking.arrivalDate,
    departureDate: booking.departureDate,
    nights,
    numberOfGuests: guests,
    totalPrice: grossAmount,
    basePrice: Math.round(Number(booking.basePrice || 0) * 100) / 100,
    paidAmount: amountReceived,
    taxAmount: taxesAmount,
    cleaningFee: cleaningFee,
    channelFee: serviceFee,
    hostawayFee: Math.round(Number(booking.hostawayFee || 0) * 100) / 100,
    currency: booking.currency || "USD",
    isPaid: booking.isPaid,
    // Sensitive PII explicitly redacted / omitted from audit payload
    guestName: guestName ? "[REDACTED_NAME]" : "[NONE]",
    guestEmail: guestEmail ? "[REDACTED_EMAIL]" : "[NONE]",
    guestPhone: "[OMITTED_PII]",
    guestAddress: "[OMITTED_PII]",
    guestNotes: "[OMITTED_FREEFORM]",
    paymentCredentials: "[OMITTED_SENSITIVE]",
    customFields: sanitizedCustomFields,
    insertedOn: booking.insertedOn,
    updatedOn: booking.updatedOn,
  };

  return {
    hostawayReservationId,
    confirmationCode,
    listingMapId: Number(booking.listingMapId),
    checkInDate: arrival,
    checkOutDate: departure,
    bookingDate,
    nights,
    guests,
    guestName,
    guestEmail,
    reservationStatus,
    paymentStatus,
    grossAmount,
    amountReceived,
    cleaningFee,
    taxesAmount,
    serviceFee,
    currency: booking.currency || "USD",
    platform,
    sourceProvider: "hostaway",
    referralSiteId,
    rawHostawayData: rawAuditData,
  };
}
