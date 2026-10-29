/**
 * Hostaway Guest First-Touch Attribution
 *
 * A guest belongs to the partner whose website brought their first partner-attributed booking, forever.
 * Every later booking by the same guest email is credited to that same site and partner, whatever
 * booking website or channel it came through (including none).
 *
 * Rules:
 * - Identity is the normalized guest email (trimmed, lowercased). No email, a malformed email, or a
 *   relay/placeholder address means no lock: the booking keeps its own attribution.
 * - The owner is the earliest-booked reservation, across every provider, that already carries a site.
 *   A guest whose earlier bookings had no partner stays open until a partner-attributed booking arrives;
 *   that booking becomes the lock.
 * - Dynamic: nothing is hardcoded to a website or partner. The lock is derived from reservations at sync
 *   time, so new booking websites, partners and sites work without configuration.
 * - Fail closed: a failed lookup, or an owner partner that is no longer active, sends the booking to
 *   REVIEW_REQUIRED. It is never handed to a different partner by default.
 * - Forward only: existing reservations are never re-attributed here; see
 *   scripts/report-guest-attribution-conflicts.ts for the read-only conflict report.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { HostawayAttributionResult } from "./types";

/** Relay/placeholder domains that are never a stable guest identity. Extend via HOSTAWAY_GUEST_EMAIL_IGNORE_DOMAINS. */
const DEFAULT_IGNORED_EMAIL_DOMAINS = [
  "guest.airbnb.com",
  "m.airbnb.com",
  "guest.booking.com",
  "m.expediapartnercentral.com",
  "example.com",
  "invalid",
];

function ignoredDomains(): string[] {
  const extra = (process.env.HOSTAWAY_GUEST_EMAIL_IGNORE_DOMAINS || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_IGNORED_EMAIL_DOMAINS, ...extra];
}

/** Returns the canonical identity for a guest email, or null when it cannot identify a guest. */
export function normalizeGuestEmail(raw: string | null | undefined): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[^\s@*,()]+@[^\s@*,()]+\.[^\s@*,()]+$/.test(email)) return null;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (ignoredDomains().some((d) => domain === d || domain.endsWith(`.${d}`))) return null;
  return email;
}

export interface GuestAttributionOwner {
  reservationId: string;
  siteId: string;
  partnerId: string;
}

/** Escapes LIKE wildcards so an email is matched as a literal, case-insensitively. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Finds the reservation that first brought this guest through a partner site.
 * Returns null when no earlier booking of this guest carries a site.
 */
export async function findGuestAttributionOwner(
  guestEmail: string,
  supabaseClient?: any
): Promise<GuestAttributionOwner | null> {
  const supabase = supabaseClient || createAdminClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("id, site_id, partner_id, booking_date, check_in_date, created_at")
    .ilike("guest_email", escapeLike(guestEmail))
    .not("site_id", "is", null)
    .not("partner_id", "is", null)
    .order("booking_date", { ascending: true, nullsFirst: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;

  const stamp = (r: any) => Date.parse(r.booking_date || r.created_at || r.check_in_date || "") || Number.MAX_SAFE_INTEGER;
  const first = [...rows].sort((a, b) => stamp(a) - stamp(b))[0];
  return { reservationId: first.id, siteId: first.site_id, partnerId: first.partner_id };
}

/**
 * Applies the first-touch lock to a booking's own attribution result.
 * Returns the result unchanged when the guest has no earlier partner-attributed booking.
 */
export async function applyGuestFirstTouchAttribution(
  attribution: HostawayAttributionResult,
  rawGuestEmail: string | null | undefined,
  supabaseClient?: any
): Promise<HostawayAttributionResult> {
  const email = normalizeGuestEmail(rawGuestEmail);
  if (!email) return attribution;

  const supabase = supabaseClient || createAdminClient();

  let owner: GuestAttributionOwner | null;
  try {
    owner = await findGuestAttributionOwner(email, supabase);
  } catch (err: any) {
    console.error("[Hostaway Guest Attribution] Owner lookup failed:", err?.message);
    if (attribution.attributionTier !== "ATTRIBUTED") return attribution;
    return {
      attributionTier: "REVIEW_REQUIRED",
      confidenceScore: 0,
      matchedSignals: [...attribution.matchedSignals, "GUEST_FIRST_TOUCH_LOOKUP_FAILED"],
      referralSiteId: attribution.referralSiteId,
      classification: "REQUIRES_HHH_ATTRIBUTION_BRIDGE",
    };
  }

  if (!owner) return attribution;

  // The guest stays with the first partner. If that partner is no longer active, a person decides.
  const { data: partner } = await supabase.from("partners").select("id, status").eq("id", owner.partnerId).maybeSingle();
  if (!partner || String(partner.status).toLowerCase() !== "active") {
    return {
      attributionTier: "REVIEW_REQUIRED",
      confidenceScore: 0,
      matchedSignals: [`GUEST_FIRST_TOUCH_OWNER_INACTIVE:${owner.partnerId}`, `LOCKED_FROM_RESERVATION:${owner.reservationId}`],
      referralSiteId: owner.siteId,
      classification: "REQUIRES_HHH_ATTRIBUTION_BRIDGE",
    };
  }

  const signals = [
    "GUEST_FIRST_TOUCH_LOCK",
    `LOCKED_FROM_RESERVATION:${owner.reservationId}`,
    `EXACT_SITE_ID:${owner.siteId}`,
    `EXACT_PARTNER_ID:${owner.partnerId}`,
  ];
  if (attribution.siteId && attribution.siteId !== owner.siteId) {
    signals.push(`OVERRODE_BOOKING_SITE:${attribution.siteId}`);
  }

  return {
    siteId: owner.siteId,
    partnerId: owner.partnerId,
    attributionTier: "ATTRIBUTED",
    confidenceScore: 100,
    matchedSignals: signals,
    referralSiteId: owner.siteId,
    classification: "PROVEN_DETERMINISTIC",
  };
}
