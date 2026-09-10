import { createAdminClient } from "@/lib/supabase/admin";
import { ownerRezRequest } from "./client";
import { reconcileReservationPaymentRealization } from "@/lib/commissions/ledger";

export interface OwnerRezCharge {
  type?: string;
  category?: string;
  amount?: number;
  rate?: number;
  description?: string;
  is_taxable?: boolean;
}

export interface OwnerRezBooking {
  id: number;
  type: string;
  status: string;
  is_block: boolean;
  property_id: number;
  property?: {
    id: number;
    name: string;
  };
  quote_id?: number;
  is_quote?: boolean;
  listing_site?: string;
  arrival: string;
  departure: string;
  check_in?: string;
  check_out?: string;
  adults?: number;
  children?: number;
  infants?: number;
  pets?: number;
  guest_id?: number;
  guest?: {
    id: number;
    first_name?: string;
    last_name?: string;
  };
  booked_utc?: string;
  created_utc?: string;
  updated_utc?: string;
  total_amount: number;
  total_paid?: number;
  total_owed?: number;
  currency_code?: string;
  charges?: OwnerRezCharge[];
}

export interface ListingSite {
  id: number;
  name: string;
  domain?: string;
  active: boolean;
}

export type AttributionTier = "ATTRIBUTED" | "REVIEW_REQUIRED" | "UNATTRIBUTED";

export interface SingleSyncResult {
  bookingId: number;
  ownerrezBookingId: number;
  inserted: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  failed: number;
  attributionTier: AttributionTier;
  numericSourceId: number | null;
  siteId?: string;
  partnerId?: string;
  propertyId?: string;
  error?: string;
}

export interface DiscoveredSource {
  sourceName: string;
  numericSourceId: number | null;
  siteId: string | null;
  partnerId: string | null;
  status: AttributionTier;
  bookingCount: number;
}

export interface BatchSyncResult {
  totalFetched: number;
  blocksFiltered: number;
  bookingsProcessed: number;
  inserted: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  failed: number;
  attributed: number;
  unattributed: number;
  reviewRequired: number;
  sourcesDiscovered: DiscoveredSource[];
  errors: string[];
}

/**
 * Authoritatively derives the booking channel independently from the integration provider.
 * Uses booking provenance (listing site, quote indicators) to establish channel.
 * Never returns 'ownerrez' as a booking channel.
 */
export function deriveOwnerRezBookingChannel(booking: OwnerRezBooking): string {
  const listingSite = (booking.listing_site || "").trim().toLowerCase();

  if (listingSite.includes("airbnb")) return "airbnb";
  if (listingSite.includes("vrbo") || listingSite.includes("homeaway")) return "vrbo";
  if (listingSite.includes("booking.com") || listingSite.includes("bcom")) return "booking.com";
  if (listingSite.includes("tripadvisor") || listingSite.includes("flipkey")) return "tripadvisor";
  if (listingSite.includes("expedia")) return "expedia";
  if (listingSite.includes("direct") || listingSite.includes("website") || listingSite.includes("widget")) return "direct";

  // If quote_id is present or booking is linked to a direct partner storefront (e.g. Megbrass),
  // it is authoritatively established as a direct booking channel.
  if (booking.quote_id || booking.is_quote || listingSite) {
    return "direct";
  }

  return "direct";
}

/**
 * Fetch a single booking with charges from OwnerRez API
 */
export async function fetchOwnerRezBooking(bookingId: number): Promise<OwnerRezBooking> {
  return await ownerRezRequest<OwnerRezBooking>(`/bookings/${bookingId}`);
}

/**
 * Single-call in-memory listing sites registry.
 * Queries /v2/listingsites once per sync run, enforcing unique active exact-name matches.
 */
export async function loadListingSitesRegistry(): Promise<Map<string, ListingSite>> {
  const sitesResponse = await ownerRezRequest<{ items?: ListingSite[] } | ListingSite[]>("/listingsites");
  const items: ListingSite[] = Array.isArray(sitesResponse)
    ? sitesResponse
    : (sitesResponse?.items || []);

  const registry = new Map<string, ListingSite>();
  const countMap = new Map<string, number>();

  for (const s of items) {
    if (!s.active) continue;
    const key = s.name.trim().toLowerCase();
    countMap.set(key, (countMap.get(key) || 0) + 1);
    registry.set(key, s);
  }

  // Remove ambiguous names that matched more than one active record
  for (const [key, count] of countMap.entries()) {
    if (count > 1) {
      registry.delete(key);
      console.warn(`[ListingSites Registry] Ambiguous listing site '${key}' found ${count} active records. Excluded.`);
    }
  }

  return registry;
}

/**
 * Calculate stay night count between arrival and departure strings (YYYY-MM-DD)
 */
function calculateNights(arrival: string, departure: string): number {
  try {
    const arr = new Date(arrival + "T00:00:00Z");
    const dep = new Date(departure + "T00:00:00Z");
    const diff = dep.getTime() - arr.getTime();
    const nights = Math.round(diff / (1000 * 60 * 60 * 24));
    return nights > 0 ? nights : 0;
  } catch {
    return 0;
  }
}

/**
 * Synchronize a single booking record with live Supabase database.
 * Supports both standalone invocation and batch invocation with an in-memory registry.
 */
export async function syncSingleBookingRecord(
  bookingId: number,
  supabaseClient?: ReturnType<typeof createAdminClient>,
  listingSitesRegistry?: Map<string, ListingSite>,
  propertyCache?: Map<number, string>
): Promise<SingleSyncResult> {
  const supabase = supabaseClient || createAdminClient();

  // 1. Fetch live booking from OwnerRez API
  const booking = await fetchOwnerRezBooking(bookingId);

  if (!booking || booking.type !== "booking") {
    return {
      bookingId,
      ownerrezBookingId: booking?.id || bookingId,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      duplicates: 0,
      failed: 1,
      attributionTier: "UNATTRIBUTED",
      numericSourceId: null,
      error: `Booking ${bookingId} is not a valid guest reservation (type: ${booking?.type})`,
    };
  }

  // 2. Resolve Property UUID in public.properties via ownerrez_property_id
  let hhhPropertyId: string | null = null;
  if (propertyCache && propertyCache.has(booking.property_id)) {
    hhhPropertyId = propertyCache.get(booking.property_id)!;
  } else {
    const { data: propertyRow, error: propErr } = await supabase
      .from("properties")
      .select("id, property_name, ownerrez_property_id")
      .eq("ownerrez_property_id", booking.property_id)
      .maybeSingle();

    if (propErr || !propertyRow) {
      return {
        bookingId,
        ownerrezBookingId: booking.id,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        duplicates: 0,
        failed: 1,
        attributionTier: "UNATTRIBUTED",
        numericSourceId: null,
        error: `No HHH property found with ownerrez_property_id = ${booking.property_id}`,
      };
    }
    hhhPropertyId = propertyRow.id;
  }

  // 3. Deterministic 3-Tier Source & Attribution Resolution
  let resolvedNumericSourceId: number | null = null;
  let resolvedSiteId: string | null = null;
  let resolvedPartnerId: string | null = null;
  let attributionTier: AttributionTier = "UNATTRIBUTED";
  let confidenceScore = 0.0;
  let matchedSignals: string[] = [];

  const rawListingSite = (booking.listing_site || "").trim();

  if (rawListingSite) {
    let matchedSiteRecord: ListingSite | null = null;
    if (listingSitesRegistry) {
      matchedSiteRecord = listingSitesRegistry.get(rawListingSite.toLowerCase()) || null;
    } else {
      const freshRegistry = await loadListingSitesRegistry();
      matchedSiteRecord = freshRegistry.get(rawListingSite.toLowerCase()) || null;
    }

    if (matchedSiteRecord) {
      resolvedNumericSourceId = matchedSiteRecord.id;

      // Query public.sites strictly by ownerrez_listing_site_id
      const { data: siteRow } = await supabase
        .from("sites")
        .select("id, partner_id, ownerrez_listing_site_id")
        .eq("ownerrez_listing_site_id", resolvedNumericSourceId)
        .maybeSingle();

      if (siteRow) {
        // Tier 3: Source resolves AND HHH site mapping exists
        resolvedSiteId = siteRow.id;
        resolvedPartnerId = siteRow.partner_id;
        attributionTier = "ATTRIBUTED";
        confidenceScore = 100.0;
        matchedSignals = [
          "OWNERREZ_LISTING_SITE",
          `OWNERREZ_LISTING_SITE_ID:${resolvedNumericSourceId}`,
        ];
      } else {
        // Tier 2: Source resolves to numeric ID but no HHH site mapping exists
        attributionTier = "REVIEW_REQUIRED";
        confidenceScore = 0.0;
        matchedSignals = [
          `OWNERREZ_UNMAPPED_SOURCE:${resolvedNumericSourceId}`,
        ];
      }
    } else {
      // Source name present in booking but not resolved in active /v2/listingsites
      attributionTier = "REVIEW_REQUIRED";
      confidenceScore = 0.0;
      matchedSignals = [
        `OWNERREZ_UNKNOWN_SOURCE_NAME:${rawListingSite}`,
      ];
    }
  } else {
    // Tier 1: Absent listing_site
    attributionTier = "UNATTRIBUTED";
    confidenceScore = 0.0;
    matchedSignals = [];
  }

  // 4. Derive Monetary Components directly from charges
  // Financial safeguard: do not automatically map OwnerRez category = "resort" to HHH service_fee
  const charges = booking.charges || [];
  let cleaningFee = 0;
  let serviceFee = 0;
  let taxesAmount = 0;

  for (const c of charges) {
    const amount = Number(c.amount || 0);
    const cat = (c.category || "").toLowerCase();
    const typ = (c.type || "").toLowerCase();
    const desc = (c.description || "").toLowerCase();

    if (cat === "cleaning" || typ === "cleaning" || desc.includes("cleaning fee")) {
      cleaningFee += amount;
    } else if (cat === "service" || typ === "service_fee" || desc.includes("service fee")) {
      serviceFee += amount;
    } else if (cat === "tax" || typ === "tax" || desc.includes("tax")) {
      taxesAmount += amount;
    }
  }

  const grossAmount = Number(booking.total_amount || 0);
  const amountReceived = Number(booking.total_paid || 0);
  const refundAmount = 0.0;
  const nights = calculateNights(booking.arrival, booking.departure);
  const guests = (booking.adults || 0) + (booking.children || 0) + (booking.infants || 0);
  const guestName = [booking.guest?.first_name, booking.guest?.last_name].filter(Boolean).join(" ") || "Guest";
  const confirmationCode = `ORB${booking.id}`;

  const reservationStatus = booking.status === "cancelled" ? "CANCELLED" : "CONFIRMED";
  const paymentStatus =
    amountReceived >= grossAmount && grossAmount > 0
      ? "PAID"
      : amountReceived > 0
      ? "PARTIAL"
      : "UNPAID";

  // Database column enum mapping:
  const dbAttributionStatus =
    attributionTier === "ATTRIBUTED"
      ? "automatic"
      : attributionTier === "REVIEW_REQUIRED"
      ? "pending"
      : "unattributed";


  // Provider / Channel separation:
  const bookingChannel = deriveOwnerRezBookingChannel(booking);
  const providerSource = "OWNERREZ";

  // 5. Privacy-safe Provider Audit Payload (raw_ownerrez_data)
  const sanitizedAuditData = {
    id: booking.id,
    type: booking.type,
    status: booking.status,
    is_block: booking.is_block,
    property_id: booking.property_id,
    quote_id: booking.quote_id || null,
    listing_site: booking.listing_site || null,
    numeric_source_id: resolvedNumericSourceId,
    arrival: booking.arrival,
    departure: booking.departure,
    adults: booking.adults || 0,
    children: booking.children || 0,
    infants: booking.infants || 0,
    total_amount: grossAmount,
    total_paid: amountReceived,
    total_owed: Number(booking.total_owed || 0),
    currency_code: booking.currency_code || "USD",
    charges: booking.charges || [],
    guest: {
      id: booking.guest?.id,
      first_name: booking.guest?.first_name,
      last_name: booking.guest?.last_name,
    },
    booked_utc: booking.booked_utc,
  };

  // 6. Check existing reservation to enforce idempotency
  let { data: existingRow, error: checkErr } = await supabase
    .from("reservations")
    .select(
      "id, ownerrez_booking_id, hospitable_reservation_id, property_id, site_id, partner_id, gross_amount, amount_received, nights, guests, reservation_status, payment_status, attribution_status, quote_id, platform, payment_confirmation_source, confirmation_code"
    )
    .eq("ownerrez_booking_id", booking.id)
    .maybeSingle();

  if (checkErr) {
    throw new Error(`Failed to check existing reservation: ${checkErr.message}`);
  }

  // Cross-Provider Duplicate Protection:
  // If not found by ownerrez_booking_id, perform overlap analysis against existing Hospitable reservations
  if (!existingRow) {
    const { data: hospCandidates } = await supabase
      .from("reservations")
      .select("id, hospitable_reservation_id, ownerrez_booking_id, confirmation_code, property_id, check_in_date, check_out_date, gross_amount, guest_name")
      .eq("property_id", hhhPropertyId)
      .not("hospitable_reservation_id", "is", null);

    for (const h of hospCandidates || []) {
      const hIn = (h.check_in_date || "").slice(0, 10);
      const hOut = (h.check_out_date || "").slice(0, 10);
      const exactDates = (hIn === booking.arrival && hOut === booking.departure);
      const exactAmount = Math.abs(Number(h.gross_amount) - grossAmount) < 0.01;
      const sameCode = h.confirmation_code === confirmationCode;

      if (exactDates && (exactAmount || sameCode)) {
        // EXACT_PROVIDER_CROSSOVER: Safe provider linking!
        console.log(`[Cross-Provider Linking] Exact match found for stay ${booking.arrival} to ${booking.departure} on Hospitable row ${h.id}. Linking to OwnerRez booking ${booking.id}.`);
        existingRow = h as any;
        break;
      }
    }
  }

  const now = new Date().toISOString();

  // If existing record matches all critical fields exactly, register as unchanged
  if (existingRow && existingRow.ownerrez_booking_id === booking.id) {
    const isGrossEqual = Number(existingRow.gross_amount) === grossAmount;
    const isReceivedEqual = Number(existingRow.amount_received) === amountReceived;
    const isStatusEqual = existingRow.reservation_status === reservationStatus;
    const isPaymentEqual = existingRow.payment_status === paymentStatus;
    const isSiteEqual = existingRow.site_id === resolvedSiteId;
    const isPartnerEqual = existingRow.partner_id === resolvedPartnerId;
    const isAttrEqual = existingRow.attribution_status === dbAttributionStatus;
    const isQuoteEqual = Number(existingRow.quote_id || 0) === Number(booking.quote_id || 0);
    const isPlatformEqual = (existingRow.platform || "").toLowerCase() === bookingChannel.toLowerCase();

    if (
      isGrossEqual &&
      isReceivedEqual &&
      isStatusEqual &&
      isPaymentEqual &&
      isSiteEqual &&
      isPartnerEqual &&
      isAttrEqual &&
      isQuoteEqual &&
      isPlatformEqual
    ) {
      // Step 9a: Automatically reconcile ledger payment realization for unchanged booking
      try {
        await reconcileReservationPaymentRealization({
          reservationId: existingRow.id,
          sourceProvider: "ownerrez",
        });
      } catch (reconErr: any) {
        console.warn(`[OwnerRez Sync] Payment realization reconciliation notice for unchanged res ${existingRow.id}:`, reconErr.message);
      }

      return {
        bookingId,
        ownerrezBookingId: booking.id,
        inserted: 0,
        updated: 0,
        unchanged: 1,
        duplicates: 0,
        failed: 0,
        attributionTier,
        numericSourceId: resolvedNumericSourceId,
        siteId: resolvedSiteId || undefined,
        partnerId: resolvedPartnerId || undefined,
        propertyId: hhhPropertyId || undefined,
      };
    }
  }

  // 7. Upsert Reservation row
  const reservationPayload = {
    ownerrez_booking_id: booking.id,
    quote_id: booking.quote_id || null,
    property_id: hhhPropertyId,
    site_id: resolvedSiteId,
    partner_id: resolvedPartnerId,
    confirmation_code: confirmationCode,
    guest_name: guestName,
    guest_email: null,
    booking_date: booking.booked_utc || booking.created_utc || now,
    check_in_date: booking.arrival,
    check_out_date: booking.departure,
    nights,
    guests,
    reservation_status: reservationStatus,
    payment_status: paymentStatus,
    gross_amount: grossAmount,
    amount_received: amountReceived,
    refund_amount: refundAmount,
    taxes_amount: taxesAmount,
    cleaning_fee: cleaningFee,
    service_fee: serviceFee,
    currency: booking.currency_code || "USD",
    platform: bookingChannel,
    payment_confirmation_source: providerSource,
    attribution_status: dbAttributionStatus,
    financial_data_available: true,
    raw_ownerrez_data: sanitizedAuditData,
    last_synced_at: now,
    updated_at: now,
  };

  let reservationId: string;

  if (existingRow) {
    const { data: updatedRes, error: updateErr } = await supabase
      .from("reservations")
      .update(reservationPayload)
      .eq("id", existingRow.id)
      .select("id")
      .single();

    if (updateErr) throw new Error(`Failed to update reservation: ${updateErr.message}`);
    reservationId = updatedRes.id;
  } else {
    const { data: insertedRes, error: insertErr } = await supabase
      .from("reservations")
      .insert({
        ...reservationPayload,
        created_at: now,
      })
      .select("id")
      .single();

    if (insertErr) throw new Error(`Failed to insert reservation: ${insertErr.message}`);
    reservationId = insertedRes.id;
  }

  // 8. Deterministic Attribution Record in public.reservation_attributions
  const attributionMethod =
    attributionTier === "ATTRIBUTED"
      ? "OWNERREZ_LISTING_SITE"
      : "OWNERREZ_SOURCE_INSPECTION";

  const { error: attrErr } = await supabase
    .from("reservation_attributions")
    .upsert(
      {
        reservation_id: reservationId,
        site_id: resolvedSiteId,
        partner_id: resolvedPartnerId,
        click_id: null,
        attribution_method: attributionMethod,
        confidence_score: confidenceScore,
        matched_signals: matchedSignals,
        competing_candidates: [],
        status: attributionTier,
        updated_at: now,
      },
      { onConflict: "reservation_id" }
    );

  if (attrErr) {
    console.warn("Could not upsert reservation_attributions:", attrErr.message);
  }

  // 9. Automatic Phase 6 Commission Payment Realization Reconciliation
  try {
    await reconcileReservationPaymentRealization({
      reservationId,
      sourceProvider: "ownerrez",
    });
  } catch (reconErr: any) {
    console.warn(`[OwnerRez Sync] Payment realization reconciliation notice for res ${reservationId}:`, reconErr.message);
  }

  return {
    bookingId,
    ownerrezBookingId: booking.id,
    inserted: existingRow ? 0 : 1,
    updated: existingRow ? 1 : 0,
    unchanged: 0,
    duplicates: 0,
    failed: 0,
    attributionTier,
    numericSourceId: resolvedNumericSourceId,
    siteId: resolvedSiteId || undefined,
    partnerId: resolvedPartnerId || undefined,
    propertyId: hhhPropertyId || undefined,
  };
}

/**
 * Backward-compatible single booking sync
 */
export async function syncOwnerRezBookingById(bookingId: number): Promise<SingleSyncResult> {
  return await syncSingleBookingRecord(bookingId);
}

/**
 * Bulk synchronization for all mapped properties with hardened pagination and single-call source registry.
 */
export async function syncAllOwnerRezBookings(): Promise<BatchSyncResult> {
  const supabase = createAdminClient();

  // 1. Single-call in-memory listing sites registry
  const registry = await loadListingSitesRegistry();

  // 2. Fetch all mapped properties
  const { data: properties, error: propErr } = await supabase
    .from("properties")
    .select("id, property_name, ownerrez_property_id")
    .not("ownerrez_property_id", "is", null);

  if (propErr || !properties || properties.length === 0) {
    throw new Error(`Failed to query mapped properties: ${propErr?.message || "No mapped properties found"}`);
  }

  const propertyIds = properties
    .map((p) => Number(p.ownerrez_property_id))
    .filter((id) => Boolean(id) && !isNaN(id));

  const propertyCache = new Map<number, string>();
  for (const p of properties) {
    if (p.ownerrez_property_id) {
      propertyCache.set(Number(p.ownerrez_property_id), p.id);
    }
  }

  let totalFetched = 0;
  let blocksFiltered = 0;
  let bookingsProcessed = 0;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let duplicates = 0;
  let failed = 0;
  let attributed = 0;
  let unattributed = 0;
  let reviewRequired = 0;
  const sourcesMap = new Map<string, DiscoveredSource>();
  const errors: string[] = [];

  // 3. Hardened pagination with loop detection and max page safety guard
  const visitedUrls = new Set<string>();
  const MAX_PAGES = 50;
  let pageCount = 0;
  let nextUrl: string | null = `/bookings?limit=100&property_ids=${propertyIds.join(",")}`;

  while (nextUrl && pageCount < MAX_PAGES) {
    pageCount += 1;

    if (visitedUrls.has(nextUrl)) {
      throw new Error(`Loop detected: pagination URL '${nextUrl}' was encountered a second time.`);
    }
    visitedUrls.add(nextUrl);

    let endpoint = nextUrl;
    if (endpoint.startsWith("https://api.ownerrez.com")) {
      const u = new URL(endpoint);
      endpoint = `${u.pathname}${u.search}`;
    }
    if (endpoint.startsWith("/v2/")) {
      endpoint = endpoint.substring(3);
    }

    const res: any = await ownerRezRequest(endpoint);
    const items: any[] = Array.isArray(res) ? res : (res?.items || []);
    totalFetched += items.length;

    for (const item of items) {
      // Dynamic block filtering
      if (item.type === "block" || item.is_block) {
        blocksFiltered += 1;
        continue;
      }

      if (item.type !== "booking") {
        continue;
      }

      bookingsProcessed += 1;

      try {
        const syncRes = await syncSingleBookingRecord(
          item.id,
          supabase,
          registry,
          propertyCache
        );

        inserted += syncRes.inserted;
        updated += syncRes.updated;
        unchanged += syncRes.unchanged;
        duplicates += syncRes.duplicates;
        failed += syncRes.failed;

        if (syncRes.attributionTier === "ATTRIBUTED") {
          attributed += 1;
        } else if (syncRes.attributionTier === "REVIEW_REQUIRED") {
          reviewRequired += 1;
        } else {
          unattributed += 1;
        }

        // Track discovered source
        const srcKey = (item.listing_site || "NO_LISTING_SITE").trim();
        const existingSrc = sourcesMap.get(srcKey);
        if (existingSrc) {
          existingSrc.bookingCount += 1;
        } else {
          sourcesMap.set(srcKey, {
            sourceName: srcKey,
            numericSourceId: syncRes.numericSourceId,
            siteId: syncRes.siteId || null,
            partnerId: syncRes.partnerId || null,
            status: syncRes.attributionTier,
            bookingCount: 1,
          });
        }
      } catch (itemErr: any) {
        failed += 1;
        errors.push(`Booking ${item.id}: ${itemErr.message}`);
      }
    }

    nextUrl = res.next_page_url || null;
  }

  return {
    totalFetched,
    blocksFiltered,
    bookingsProcessed,
    inserted,
    updated,
    unchanged,
    duplicates,
    failed,
    attributed,
    unattributed,
    reviewRequired,
    sourcesDiscovered: Array.from(sourcesMap.values()),
    errors,
  };
}
