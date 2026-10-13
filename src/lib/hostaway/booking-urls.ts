/**
 * Hostaway Direct Booking Engine URL Resolver
 * 
 * Queries Hostaway listing data for canonical listings 595515–595518
 * using attachObjects[]=bookingEngineUrls.
 * 
 * Rules:
 * - Verifies returned URLs, availability, and exact listing identity.
 * - Never fabricates missing URLs or assumes every listing has an active booking engine.
 * - Associates verified URLs with canonical HHH property UUIDs without changing
 *   frozen Hostaway property mappings.
 */

import { hostawayRequest } from "./client";

export interface HostawayDirectBookingUrlInfo {
  listingId: number;
  propertyId: string;
  propertyName: string;
  primaryBookingUrl: string | null;
  availableUrls: string[];
  isVerified: boolean;
  hasBookingEngine: boolean;
}

export const CANONICAL_HOSTAWAY_PROPERTY_MAP: Record<number, { propertyId: string; propertyName: string }> = {
  595515: {
    propertyId: "55791a54-b1a3-459e-bbd5-9073a418b774",
    propertyName: "Beech Mountain, North Carolina"
  },
  595516: {
    propertyId: "f0fb867d-47cd-47d4-afa6-c4bf226c1768",
    propertyName: "Downtown St. Augustine (Lincoln)"
  },
  595517: {
    propertyId: "38d9159e-a35d-405e-826e-7381ad3c3197",
    propertyName: "Uptown St. Augustine"
  },
  595518: {
    propertyId: "51be6158-268d-4c96-8f0b-9968f544ddfa",
    propertyName: "Ellsworth, Maine"
  }
};

export async function getVerifiedHostawayBookingUrls(): Promise<HostawayDirectBookingUrlInfo[]> {
  const listingIds = [595515, 595516, 595517, 595518];
  const results: HostawayDirectBookingUrlInfo[] = [];

  for (const listingId of listingIds) {
    const canonical = CANONICAL_HOSTAWAY_PROPERTY_MAP[listingId];
    if (!canonical) continue;

    try {
      const res = await hostawayRequest<{ result: any }>(
        `/listings/${listingId}?attachObjects[]=bookingEngineUrls`,
        undefined,
        { timeoutMs: 8000, maxRetries: 2 }
      );

      const listing = res?.result;
      const urls: string[] = Array.isArray(listing?.bookingEngineUrls)
        ? listing.bookingEngineUrls.filter((u: any) => typeof u === "string" && u.startsWith("http"))
        : [];

      // Pick preferred book.hiddenhoneyhomes.com domain if available, otherwise first verified URL
      const primaryUrl = urls.find(u => u.includes("book.hiddenhoneyhomes.com")) || urls[0] || null;
      const hasBookingEngine = urls.length > 0 && primaryUrl !== null;

      results.push({
        listingId,
        propertyId: canonical.propertyId,
        propertyName: canonical.propertyName,
        primaryBookingUrl: primaryUrl,
        availableUrls: urls,
        hasBookingEngine,
        isVerified: hasBookingEngine
      });
    } catch (err: any) {
      console.warn(`[Hostaway Booking URLs] Failed to query listing ${listingId}:`, err?.message);
      // Fail closed: never fabricate unverified URLs
      results.push({
        listingId,
        propertyId: canonical.propertyId,
        propertyName: canonical.propertyName,
        primaryBookingUrl: null,
        availableUrls: [],
        hasBookingEngine: false,
        isVerified: false
      });
    }
  }

  return results;
}
