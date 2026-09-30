/**
 * Hostaway Custom Fields Service
 * 
 * Manages custom field definitions and mappings:
 * customFieldId -> field definition -> HHH_REFERRAL_SITE_ID
 * 
 * Hostaway stores custom field values on reservations as:
 * { customFieldId: number, value: string }
 * rather than including the field name directly.
 */

import { hostawayRequest } from "./client";
import { HostawayCustomFieldDefinition, HostawayPaginatedResult } from "./types";

// In-memory cache of custom field definitions with TTL (1 hour)
let cachedDefinitions: HostawayCustomFieldDefinition[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 3600 * 1000;

export const DEFAULT_REFERRAL_CUSTOM_FIELD_NAME = "HHH_REFERRAL_SITE_ID";

/**
 * Returns the configured or resolved customFieldId for HHH_REFERRAL_SITE_ID.
 */
export function getReferralCustomFieldIdFromEnv(): number | null {
  const envId = process.env.HOSTAWAY_REFERRAL_CUSTOM_FIELD_ID;
  if (envId && !isNaN(Number(envId))) {
    return Number(envId);
  }
  return null;
}

/**
 * Fetches all custom field definitions from Hostaway API with caching.
 */
export async function getHostawayCustomFields(forceRefresh = false): Promise<HostawayCustomFieldDefinition[]> {
  const now = Date.now();
  if (!forceRefresh && cachedDefinitions && now < cacheExpiresAt) {
    return cachedDefinitions;
  }

  try {
    const res = await hostawayRequest<HostawayPaginatedResult<HostawayCustomFieldDefinition> | { result: HostawayCustomFieldDefinition[] }>(
      "/customFields"
    );

    const list = Array.isArray((res as any)?.result)
      ? (res as any).result
      : Array.isArray(res)
      ? res
      : [];

    cachedDefinitions = list;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return list;
  } catch (err: any) {
    // If API fetch fails and we have stale cache, return it
    if (cachedDefinitions) {
      return cachedDefinitions;
    }
    // Return empty list fail-closed
    return [];
  }
}

/**
 * Resolves the custom field definition for HHH_REFERRAL_SITE_ID.
 */
export async function resolveReferralCustomFieldDefinition(): Promise<HostawayCustomFieldDefinition | null> {
  const definitions = await getHostawayCustomFields();
  const envId = getReferralCustomFieldIdFromEnv();

  if (envId !== null) {
    const match = definitions.find((d) => d.id === envId);
    if (match) return match;
  }

  const nameMatch = definitions.find(
    (d) => d.name?.trim().toUpperCase() === DEFAULT_REFERRAL_CUSTOM_FIELD_NAME
  );

  return nameMatch || null;
}

/**
 * Clears cached custom field definitions (for test cleanup).
 */
export function resetCustomFieldsCache(): void {
  cachedDefinitions = null;
  cacheExpiresAt = 0;
}
