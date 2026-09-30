/**
 * Hostaway API & PMS Integration Types
 * 
 * Strict typing for Hostaway API v1 entities, token manager,
 * cursor pagination, reservation normalization, webhooks, and attribution.
 */

export interface HostawayOAuthResponse {
  token_type: string; // "Bearer"
  access_token: string;
  expires_in: number; // e.g. 86400 (seconds)
}

export interface HostawayCustomField {
  id?: number;
  name: string;
  value: string;
}

export interface HostawayCustomFieldDefinition {
  id: number;
  name: string;
  type: string;
  isPublic?: number | boolean;
  usableInBookingEngine?: number | boolean;
}

export interface HostawayCustomFieldValueItem {
  id?: number;
  reservationId?: number;
  customFieldId: number;
  value: string | number | null;
  name?: string;
}

export interface HostawayListing {
  id: number;
  name: string;
  propertyType?: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
  price?: number;
  cleaningFee?: number;
  currency?: string;
  bedroomsNumber?: number;
  bathroomsNumber?: number;
  personCapacity?: number;
  isActive?: boolean;
}

export interface HostawayReservation {
  id: number;
  hostawayReservationId?: number;
  reservationId?: string; // external reservation confirmation code (e.g. from Airbnb/Vrbo/Direct)
  listingMapId: number;
  channelId?: number;
  channelName?: string;
  source?: string;
  status: "new" | "modified" | "cancelled" | "pending" | "confirmed" | "inquiry" | string;
  arrivalDate: string; // YYYY-MM-DD
  departureDate: string; // YYYY-MM-DD
  reservationDate?: string; // YYYY-MM-DD HH:mm:ss or ISO
  insertedOn?: string;
  updatedOn?: string;
  totalPrice: number; // Gross price
  basePrice?: number;
  taxAmount?: number;
  cleaningFee?: number;
  channelFee?: number;
  hostawayFee?: number;
  paidAmount?: number;
  isPaid?: number | boolean;
  currency?: string;
  numberOfGuests?: number;
  adults?: number;
  children?: number;
  infants?: number;
  guestName?: string;
  guestFirstName?: string;
  guestLastName?: string;
  guestEmail?: string;
  guestPhone?: string;
  comment?: string;
  specialRequests?: string;
  customFields?: HostawayCustomField[];
  customFieldValues?: (HostawayCustomFieldValueItem | HostawayCustomField)[];
  customValues?: Record<string, string>;
  raw?: Record<string, unknown>;
}

export interface HostawayPaginatedResult<T> {
  status: "success" | "fail" | string;
  result: T[];
  count?: number;
  limit?: number;
  offset?: number;
  total?: number;
}

export interface HostawayWebhookPayload {
  event?: string;
  type?: string;
  action?: string;
  id?: number | string;
  eventId?: number | string;
  timestamp?: string | number;
  reservationId?: number;
  data?: Partial<HostawayReservation> | Record<string, unknown>;
  [key: string]: unknown;
}

export type PropertyMappingStatus = "EXACT_MATCH" | "UNMAPPED" | "AMBIGUOUS";

export interface HostawayListingPropertyReport {
  hostawayListingId: number;
  hostawayListingName: string;
  hhhPropertyId: string | null;
  hhhPropertyName: string | null;
  mappingStatus: PropertyMappingStatus;
}

export type HostawayAttributionClassification =
  | "PROVEN_DETERMINISTIC"
  | "REQUIRES_HHH_ATTRIBUTION_BRIDGE"
  | "NOT_SUPPORTED";

export interface HostawayAttributionResult {
  partnerId?: string;
  siteId?: string;
  sitePropertyId?: string;
  attributionTier: "ATTRIBUTED" | "REVIEW_REQUIRED" | "UNATTRIBUTED";
  confidenceScore: number;
  matchedSignals: string[];
  referralSiteId?: string;
  classification: HostawayAttributionClassification;
}

export type CrossProviderDeduplicationStatus =
  | "SAME_BOOKING_CONFIRMED"
  | "POTENTIAL_MATCH_REVIEW_REQUIRED"
  | "HOSTAWAY_ONLY"
  | "LEGACY_ONLY"
  | "CONFLICT";

export interface SignedAttributionTokenPayload {
  siteId: string;
  partnerId?: string;
  timestamp: number;
  exp: number;
}

export interface DeduplicationMatchResult {
  status: CrossProviderDeduplicationStatus;
  matchedReservationId?: string;
  reason: string;
  existingProvider?: "ownerrez" | "hospitable";
  existingConfirmationCode?: string;
}

export interface HostawaySyncSummary {
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  failed: number;
  attributed: number;
  unattributed: number;
  reviewRequired: number;
  sameBookingLinked: number;
  hostawayOnlyInserted: number;
  cursorAfterId?: number;
  errors: string[];
  timestamp: string;
  success: boolean;
  convergenceStatus?: "SYNC_CONVERGED" | "SYNC_RECONCILIATION_INCOMPLETE" | "SYNC_IN_PROGRESS";
}
