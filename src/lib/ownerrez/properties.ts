/**
 * OwnerRez Property Mapping Module
 * 
 * Prepares the application for all 4 HHH core properties.
 * Maps real OwnerRez property IDs and metadata to canonical HHH properties.
 * 
 * Does NOT modify database schemas or remove Hospitable.
 */

export interface HhhCoreProperty {
  hhhId: string; // Canonical PostgreSQL UUID in public.properties
  slug: string; // Slug ID (e.g. hhh-beech-mountain)
  name: string; // Canonical display name
  city: string;
  state: string;
  location: string;
  websiteUrl: string;
  bookingUrl: string;
  ownerrezPropertyId: number | null; // Real OwnerRez property ID (null if pending onboarding)
  ownerrezName: string | null; // Name in OwnerRez account
  hospitablePropertyId: string; // Preserved for parallel Hospitable compatibility
}

export const HHH_CORE_PROPERTIES: HhhCoreProperty[] = [
  {
    hhhId: "55791a54-b1a3-459e-bbd5-9073a418b774",
    slug: "hhh-beech-mountain",
    name: "Beech Mountain, North Carolina",
    city: "Beech Mountain",
    state: "NC",
    location: "Beech Mountain, NC",
    websiteUrl: "https://hiddenhoneyhomes.com/retreats/beech-mountain-nc",
    bookingUrl: "https://hiddenhoneyhomes.com/book-now/beech-mountain-retreat",
    ownerrezPropertyId: 495423, // VERIFIED REAL OWNERREZ PROPERTY ID
    ownerrezName: "HHH NC", // VERIFIED REAL OWNERREZ PROPERTY NAME
    hospitablePropertyId: "e5552f35-6f5a-4afc-afd1-d0a676e98dc4",
  },
  {
    hhhId: "38d9159e-a35d-405e-826e-7381ad3c3197",
    slug: "hhh-uptown-st-augustine",
    name: "Uptown St. Augustine",
    city: "St. Augustine",
    state: "FL",
    location: "St. Augustine, FL",
    websiteUrl: "https://hiddenhoneyhomes.com/retreats/uptown-st-augustine-fl",
    bookingUrl: "https://hiddenhoneyhomes.com/book-now/uptown-retreat/reserve",
    ownerrezPropertyId: null, // Pending addition to OwnerRez
    ownerrezName: null,
    hospitablePropertyId: "058aed01-470f-4ca7-a191-37c597e7f377",
  },
  {
    hhhId: "f0fb867d-47cd-47d4-afa6-c4bf226c1768",
    slug: "hhh-downtown-st-augustine",
    name: "Downtown St. Augustine (Lincoln)",
    city: "St. Augustine",
    state: "FL",
    location: "St. Augustine, FL",
    websiteUrl: "https://hiddenhoneyhomes.com/retreats/downtown-st-augustine-fl",
    bookingUrl: "https://hiddenhoneyhomes.com/book-now/downtown-retreat",
    ownerrezPropertyId: null, // Pending addition to OwnerRez
    ownerrezName: null,
    hospitablePropertyId: "5da25edc-88ac-43c4-876a-f7b626c88ecd",
  },
  {
    hhhId: "51be6158-268d-4c96-8f0b-9968f544ddfa",
    slug: "hhh-ellsworth-maine",
    name: "Ellsworth, Maine",
    city: "Ellsworth",
    state: "ME",
    location: "Ellsworth, ME",
    websiteUrl: "https://hiddenhoneyhomes.com/retreats/ellsworth-me",
    bookingUrl: "https://hiddenhoneyhomes.com/book-now/ellsworth-retreat",
    ownerrezPropertyId: null, // Pending addition to OwnerRez
    ownerrezName: null,
    hospitablePropertyId: "abe5540b-8cbc-4bc2-b561-b25f7d4d35b0",
  },
];

/**
 * Finds HHH core property by OwnerRez property ID.
 */
export function findHhhPropertyByOwnerRezId(ownerRezId: number | string): HhhCoreProperty | null {
  const numericId = typeof ownerRezId === "number" ? ownerRezId : Number(ownerRezId);
  if (!Number.isFinite(numericId)) return null;

  return HHH_CORE_PROPERTIES.find((p) => p.ownerrezPropertyId === numericId) || null;
}

/**
 * Resolves an OwnerRez property payload from the API to its corresponding HHH core property.
 */
export function matchOwnerRezProperty(p: {
  id?: number | string;
  name?: string;
  address?: { city?: string; state?: string; postal_code?: string };
}): {
  hhhProperty: HhhCoreProperty | null;
  matchReason: "id" | "name" | "city_state" | "none";
} {
  // 1. Direct ID match
  if (p.id !== undefined && p.id !== null) {
    const byId = findHhhPropertyByOwnerRezId(p.id);
    if (byId) {
      return { hhhProperty: byId, matchReason: "id" };
    }
  }

  // 2. Name match (case-insensitive substring)
  if (p.name) {
    const rawName = p.name.trim().toLowerCase();
    const byName = HHH_CORE_PROPERTIES.find((c) => {
      const cName = c.name.toLowerCase();
      const cOwnerrez = c.ownerrezName?.toLowerCase();
      return (
        (cOwnerrez && rawName === cOwnerrez) ||
        rawName.includes(cName) ||
        cName.includes(rawName)
      );
    });
    if (byName) {
      return { hhhProperty: byName, matchReason: "name" };
    }
  }

  // 3. City / State match
  if (p.address?.city && p.address?.state) {
    const city = p.address.city.trim().toLowerCase();
    const state = p.address.state.trim().toLowerCase();
    const byLocation = HHH_CORE_PROPERTIES.find((c) => {
      const cCity = c.city.toLowerCase();
      const cState = c.state.toLowerCase();
      return (
        (city.includes(cCity) || cCity.includes(city)) &&
        (state.includes(cState) || cState.includes(state))
      );
    });
    if (byLocation) {
      return { hhhProperty: byLocation, matchReason: "city_state" };
    }
  }

  return { hhhProperty: null, matchReason: "none" };
}

/**
 * Returns all 4 core properties with their current OwnerRez onboarding and mapping status.
 */
export function getCorePropertiesMappingSummary() {
  return HHH_CORE_PROPERTIES.map((p) => ({
    hhhId: p.hhhId,
    name: p.name,
    location: p.location,
    isMappedInOwnerRez: p.ownerrezPropertyId !== null,
    ownerrezPropertyId: p.ownerrezPropertyId,
    ownerrezName: p.ownerrezName,
    hospitablePropertyId: p.hospitablePropertyId,
  }));
}
