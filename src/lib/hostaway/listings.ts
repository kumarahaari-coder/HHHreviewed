/**
 * Hostaway Listings API Service
 */

import { hostawayRequest } from "./client";
import { HostawayListing, HostawayPaginatedResult } from "./types";
import { CANONICAL_HHH_PROPERTIES } from "./properties";

/**
 * Fetch all listings from Hostaway API.
 */
export async function getHostawayListings(
  params?: { limit?: number; offset?: number }
): Promise<HostawayListing[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));

  const endpoint = query.toString() ? `/listings?${query.toString()}` : "/listings";

  try {
    const res = await hostawayRequest<HostawayPaginatedResult<HostawayListing> | { result: HostawayListing[] }>(
      endpoint
    );
    return Array.isArray(res.result) ? res.result : [];
  } catch (err: any) {
    // If mock credentials or local simulation, provide canonical listings
    if (process.env.HOSTAWAY_ACCOUNT_ID?.startsWith("mock_")) {
      return CANONICAL_HHH_PROPERTIES.map((p) => ({
        id: p.hostawayListingId,
        name: p.propertyName,
        propertyType: "House",
        city: p.propertyName.split(",")[0],
        state: p.propertyName.includes("NC") ? "NC" : p.propertyName.includes("Maine") ? "ME" : "FL",
        country: "US",
        timezone: "America/New_York",
        price: 350,
        cleaningFee: 150,
        isActive: true,
      }));
    }
    throw err;
  }
}

/**
 * Fetch a single listing by Hostaway listing ID.
 */
export async function getHostawayListing(listingId: number): Promise<HostawayListing> {
  const res = await hostawayRequest<{ result: HostawayListing }>(`/listings/${listingId}`);
  return res.result;
}
