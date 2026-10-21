/**
 * Hostaway Deterministic HHH Referral Attribution Engine
 * 
 * Enforces strict, zero-guesswork referral attribution:
 * site -> partner -> commission rule.
 * 
 * Invariants:
 * - NEVER guess commission attribution based on domain, channel, listing, or browser heuristics.
 * - Exact referral identifier: `HHH_REFERRAL_SITE_ID` (exact site UUID).
 * - Survives: booking creation, API retrieval, reservation updates, webhook events, and cancellations.
 * - Idempotent, fail-closed, and unalterable.
 */

import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { HostawayReservation, HostawayAttributionResult, HostawayAttributionClassification, HostawayCustomFieldDefinition } from "./types";
import { extractReferralSiteId, ExtractReferralOptions } from "./normalizers";

/**
 * Creates a cryptographically signed, tamper-resistant HHH attribution token.
 * Prevents guest tampering when identifier travels through guest-visible fields or URLs.
 */
export function createSignedAttributionToken(
  siteId: string,
  partnerId?: string,
  secretKey?: string
): string {
  const secret =
    secretKey ||
    process.env.HHH_ATTRIBUTION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "hhh_fallback_att_secret_key_prod";

  const payload = {
    siteId,
    partnerId: partnerId || undefined,
    ts: Date.now(),
    exp: Date.now() + 30 * 24 * 3600 * 1000, // 30-day attribution window
  };

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `hhh_${body}.${signature}`;
}

/**
 * Verifies and decodes a signed HHH attribution token.
 * Returns null if token is tampered with, expired, or invalid.
 */
export function verifySignedAttributionToken(
  token: string,
  secretKey?: string
): { siteId: string; partnerId?: string } | null {
  if (!token || !token.startsWith("hhh_")) return null;
  const raw = token.substring(4);
  const dotIdx = raw.lastIndexOf(".");
  if (dotIdx === -1) return null;

  const body = raw.substring(0, dotIdx);
  const signature = raw.substring(dotIdx + 1);

  const secret =
    secretKey ||
    process.env.HHH_ATTRIBUTION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "hhh_fallback_att_secret_key_prod";

  try {
    const expectedSig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }

    return { siteId: payload.siteId, partnerId: payload.partnerId };
  } catch {
    return null;
  }
}

/**
 * Booking-engine source attribution (fallback when HHH_REFERRAL_SITE_ID is empty).
 *
 * Hostaway records which booking engine a guest booked through in `source` (e.g. "210263-002",
 * channelName "bookingengine"). A site is credited only when the first hostname label of its website URL
 * or of one of its active property booking URLs is EXACTLY that source (210263-002.holidayfuture.com),
 * there is exactly one such active site, and
 * the partner is active. Zero matches stays UNATTRIBUTED; several matches go to REVIEW_REQUIRED.
 */
async function resolveAttributionFromBookingEngineSource(
  booking: HostawayReservation,
  supabaseClient?: any
): Promise<HostawayAttributionResult | null> {
  const source = String((booking as any).source ?? "").trim().toLowerCase();
  const channelName = String((booking as any).channelName ?? "").trim().toLowerCase();
  if (!source || channelName !== "bookingengine") return null;

  try {
    const supabase = supabaseClient || createAdminClient();
    const hostLabel = (url: unknown): string | null => {
      try {
        return new URL(String(url)).hostname.toLowerCase().split(".")[0];
      } catch {
        return null;
      }
    };

    // A site's booking engine host can appear either as its own website URL, or as the per-property
    // booking URLs partners are redirected to (site_properties.custom_booking_url, e.g.
    // https://210263-003.holidayfuture.com/listings/595516 for a site whose public website is elsewhere).
    const candidateSiteIds = new Set<string>();

    const { data: sites, error } = await supabase
      .from("sites")
      .select("id, partner_id, status, website_url")
      .ilike("website_url", `%${source}%`);
    if (error || !Array.isArray(sites)) return null;
    for (const site of sites) {
      if (hostLabel(site.website_url) === source) candidateSiteIds.add(site.id);
    }

    const { data: siteProps } = await supabase
      .from("site_properties")
      .select("site_id, custom_booking_url, status")
      .ilike("custom_booking_url", `%${source}%`);
    for (const sp of Array.isArray(siteProps) ? siteProps : []) {
      if (String(sp.status).toLowerCase() === "active" && hostLabel(sp.custom_booking_url) === source) {
        candidateSiteIds.add(sp.site_id);
      }
    }

    if (candidateSiteIds.size === 0) return null;

    let matches = sites.filter((site: any) => candidateSiteIds.has(site.id) && String(site.status).toLowerCase() === "active");
    const missing = [...candidateSiteIds].filter((id) => !matches.some((m: any) => m.id === id));
    if (missing.length > 0) {
      const { data: extra } = await supabase
        .from("sites")
        .select("id, partner_id, status, website_url")
        .in("id", missing);
      matches = matches.concat((Array.isArray(extra) ? extra : []).filter((site: any) => String(site.status).toLowerCase() === "active"));
    }

    if (matches.length === 0) return null;
    if (matches.length > 1) {
      return {
        attributionTier: "REVIEW_REQUIRED",
        confidenceScore: 0,
        matchedSignals: [`HOSTAWAY_BOOKING_ENGINE_SOURCE_AMBIGUOUS:${source}`],
        referralSiteId: undefined,
        classification: "REQUIRES_HHH_ATTRIBUTION_BRIDGE",
      };
    }

    const site = matches[0];
    const { data: partner } = await supabase
      .from("partners")
      .select("id, status")
      .eq("id", site.partner_id)
      .maybeSingle();
    if (!partner || String(partner.status).toLowerCase() !== "active") return null;

    return {
      siteId: site.id,
      partnerId: site.partner_id,
      attributionTier: "ATTRIBUTED",
      confidenceScore: 100,
      matchedSignals: [
        `HOSTAWAY_BOOKING_ENGINE_SOURCE:${source}`,
        `EXACT_SITE_ID:${site.id}`,
        `EXACT_PARTNER_ID:${site.partner_id}`,
      ],
      referralSiteId: site.id,
      classification: "PROVEN_DETERMINISTIC",
    };
  } catch (err: any) {
    console.error("[Hostaway Attribution] Booking engine source lookup failed:", err?.message);
    return null;
  }
}

/**
 * Resolves deterministic partner and site attribution from a Hostaway reservation.
 * Refuses attribution if HHH_REFERRAL_SITE_ID is missing, ambiguous, or inactive.
 */
export async function resolveHostawayAttribution(
  booking: HostawayReservation,
  supabaseClient?: any,
  options?: ExtractReferralOptions
): Promise<HostawayAttributionResult> {
  const extracted = extractReferralSiteId(booking, options);

  // Guard 1: Missing referral identifier -> try the exact booking-engine source, else UNATTRIBUTED
  if (!extracted) {
    const engineMatch = await resolveAttributionFromBookingEngineSource(booking, supabaseClient);
    if (engineMatch) return engineMatch;
    return {
      attributionTier: "UNATTRIBUTED",
      confidenceScore: 0,
      matchedSignals: [],
      referralSiteId: undefined,
      classification: "REQUIRES_HHH_ATTRIBUTION_BRIDGE",
    };
  }

  // Handle signed attribution token if present
  let lookupSiteId = extracted;
  let signedTokenVerified = false;
  let tokenPartnerId: string | undefined = undefined;

  if (extracted.startsWith("hhh_")) {
    const verified = verifySignedAttributionToken(extracted);
    if (!verified) {
      return {
        attributionTier: "REVIEW_REQUIRED",
        confidenceScore: 0,
        matchedSignals: ["INVALID_OR_TAMPERED_SIGNED_TOKEN"],
        referralSiteId: extracted,
        classification: "REQUIRES_HHH_ATTRIBUTION_BRIDGE",
      };
    }
    lookupSiteId = verified.siteId;
    tokenPartnerId = verified.partnerId;
    signedTokenVerified = true;
  }

  const supabase = supabaseClient || createAdminClient();

  // Guard 2: Deterministic Site Lookup in public.sites by exact UUID or site_code
  // NEVER look up against public.properties (property UUIDs must fail closed)
  try {
    const { data: siteRow, error: siteErr } = await supabase
      .from("sites")
      .select("id, partner_id, status, site_name, tracking_code")
      .or(`id.eq.${lookupSiteId},tracking_code.eq.${lookupSiteId}`)
      .maybeSingle();

    if (siteErr || !siteRow) {
      return {
        attributionTier: "REVIEW_REQUIRED",
        confidenceScore: 0,
        matchedSignals: [`HOSTAWAY_UNRESOLVED_SITE_ID:${lookupSiteId}`],
        referralSiteId: lookupSiteId,
        classification: "REQUIRES_HHH_ATTRIBUTION_BRIDGE",
      };
    }

    // Guard 3: Status must be ACTIVE (or un-suspended)
    if (siteRow.status && siteRow.status !== "active" && siteRow.status !== "ACTIVE") {
      return {
        attributionTier: "REVIEW_REQUIRED",
        confidenceScore: 0,
        matchedSignals: [`HOSTAWAY_INACTIVE_SITE:${siteRow.id}`, `STATUS:${siteRow.status}`],
        referralSiteId: lookupSiteId,
        classification: "REQUIRES_HHH_ATTRIBUTION_BRIDGE",
      };
    }

    // Guard 4: If token contains partner_id, verify it matches the current site relationship
    if (tokenPartnerId && siteRow.partner_id && tokenPartnerId !== siteRow.partner_id) {
      return {
        attributionTier: "REVIEW_REQUIRED",
        confidenceScore: 0,
        matchedSignals: [
          `TOKEN_PARTNER_MISMATCH:${tokenPartnerId}`,
          `SITE_EXPECTED_PARTNER:${siteRow.partner_id}`,
        ],
        referralSiteId: lookupSiteId,
        classification: "REQUIRES_HHH_ATTRIBUTION_BRIDGE",
      };
    }

    // Deterministic match confirmed; derive partner_id authoritatively from public.sites
    return {
      siteId: siteRow.id,
      partnerId: siteRow.partner_id,
      attributionTier: "ATTRIBUTED",
      confidenceScore: 100,
      matchedSignals: [
        signedTokenVerified ? "HOSTAWAY_SIGNED_ATTRIBUTION_TOKEN" : "HOSTAWAY_CUSTOM_FIELD:HHH_REFERRAL_SITE_ID",
        `EXACT_SITE_ID:${siteRow.id}`,
        `EXACT_PARTNER_ID:${siteRow.partner_id}`,
      ],
      referralSiteId: lookupSiteId,
      classification: "PROVEN_DETERMINISTIC",
    };
  } catch (err: any) {
    console.error("[Hostaway Attribution Error] Database query failed:", err?.message);
    return {
      attributionTier: "REVIEW_REQUIRED",
      confidenceScore: 0,
      matchedSignals: [`DATABASE_ERROR:${err?.message}`],
      referralSiteId: lookupSiteId,
      classification: "REQUIRES_HHH_ATTRIBUTION_BRIDGE",
    };
  }
}

/**
 * HHH Attribution Bridge:
 * Builds tamper-resistant booking URL injecting signed attribution tokens.
 */
export function buildHostawayBookingUrlWithAttribution(
  baseBookingUrl: string,
  siteId: string,
  partnerId?: string,
  secretKey?: string
): string {
  const signedToken = createSignedAttributionToken(siteId, partnerId, secretKey);
  try {
    const url = new URL(baseBookingUrl);
    url.searchParams.set("ref_token", signedToken);
    url.searchParams.set("hhh_ref", signedToken);
    url.searchParams.set("ref_site_id", siteId);
    url.searchParams.set("customField_HHH_REFERRAL_SITE_ID", siteId);
    return url.toString();
  } catch {
    const separator = baseBookingUrl.includes("?") ? "&" : "?";
    return `${baseBookingUrl}${separator}customField_HHH_REFERRAL_SITE_ID=${encodeURIComponent(siteId)}&ref_site_id=${encodeURIComponent(siteId)}&hhh_ref=${encodeURIComponent(signedToken)}`;
  }
}
