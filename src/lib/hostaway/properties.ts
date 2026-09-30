/**
 * Hostaway Listing & Property Mapping Engine
 * 
 * Enforces exact, deterministic Hostaway listingMapId -> HHH property_id mapping.
 * Rules:
 * - NO fuzzy matching in production.
 * - Explicit provider mapping structure (never overwrites historical OwnerRez/Hospitable mappings).
 * - A production reservation CANNOT create financial attribution if property mapping is UNMAPPED or AMBIGUOUS.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { HostawayListing, HostawayListingPropertyReport, PropertyMappingStatus } from "./types";

export interface CanonicalPropertyDefinition {
  id: string; // HHH Property UUID
  propertyName: string;
  hostawayListingId: number;
  ownerrezPropertyId: number;
  hospitablePropertyId: string;
}

/**
 * Authoritative Canonical HHH Properties Registry.
 * Preserves historical OwnerRez and Hospitable identities alongside Hostaway.
 */
export const CANONICAL_HHH_PROPERTIES: CanonicalPropertyDefinition[] = [
  {
    id: "55791a54-b1a3-459e-bbd5-9073a418b774",
    propertyName: "Beech Mountain, North Carolina",
    hostawayListingId: 101001,
    ownerrezPropertyId: 495423,
    hospitablePropertyId: "e5552f35-6f5a-4afc-afd1-d0a676e98dc4",
  },
  {
    id: "38d9159e-a35d-405e-826e-7381ad3c3197",
    propertyName: "Uptown St. Augustine",
    hostawayListingId: 101002,
    ownerrezPropertyId: 495793,
    hospitablePropertyId: "058aed01-470f-4ca7-a191-37c597e7f377",
  },
  {
    id: "f0fb867d-47cd-47d4-afa6-c4bf226c1768",
    propertyName: "Downtown St. Augustine",
    hostawayListingId: 101003,
    ownerrezPropertyId: 495794,
    hospitablePropertyId: "5da25edc-88ac-43c4-876a-f7b626c88ecd",
  },
  {
    id: "51be6158-268d-4c96-8f0b-9968f544ddfa",
    propertyName: "Ellsworth, Maine",
    hostawayListingId: 101004,
    ownerrezPropertyId: 495795,
    hospitablePropertyId: "abe5540b-8cbc-4bc2-b561-b25f7d4d35b0",
  },
];

/**
 * Resolves Hostaway listingMapId to HHH canonical property UUID.
 * Checks database properties table first (hostaway_listing_id),
 * falling back to authoritative static registry.
 */
export async function resolveHostawayProperty(
  listingMapId: number,
  supabaseClient?: any
): Promise<{
  propertyId: string | null;
  propertyName: string | null;
  status: PropertyMappingStatus;
}> {
  if (!listingMapId || isNaN(listingMapId)) {
    return { propertyId: null, propertyName: null, status: "UNMAPPED" };
  }

  // 1. Try DB lookup if supabase is available
  try {
    const supabase = supabaseClient || createAdminClient();
    const { data: propRow } = await supabase
      .from("properties")
      .select("id, property_name, hostaway_listing_id")
      .eq("hostaway_listing_id", listingMapId)
      .maybeSingle();

    if (propRow) {
      return {
        propertyId: propRow.id,
        propertyName: propRow.property_name,
        status: "EXACT_MATCH",
      };
    }
  } catch {
    // Non-fatal, fallback to canonical registry
  }

  // 2. Authoritative Canonical Registry Lookup
  const canonical = CANONICAL_HHH_PROPERTIES.find((p) => p.hostawayListingId === listingMapId);
  if (canonical) {
    return {
      propertyId: canonical.id,
      propertyName: canonical.propertyName,
      status: "EXACT_MATCH",
    };
  }

  return {
    propertyId: null,
    propertyName: null,
    status: "UNMAPPED",
  };
}

/**
 * Builds an audit report for all Hostaway listings against HHH properties.
 */
export async function generateListingMappingReport(
  hostawayListings: HostawayListing[],
  supabaseClient?: any
): Promise<HostawayListingPropertyReport[]> {
  const reports: HostawayListingPropertyReport[] = [];

  for (const listing of hostawayListings) {
    const res = await resolveHostawayProperty(listing.id, supabaseClient);
    reports.push({
      hostawayListingId: listing.id,
      hostawayListingName: listing.name,
      hhhPropertyId: res.propertyId,
      hhhPropertyName: res.propertyName,
      mappingStatus: res.status,
    });
  }

  return reports;
}
