/**
 * Hostaway Reservations API Service
 * 
 * Implements cursor pagination using Hostaway's `afterId` query parameter.
 * Avoids deprecated offset pagination as primary long-term design.
 */

import { hostawayRequest } from "./client";
import { HostawayReservation, HostawayPaginatedResult } from "./types";

export interface ReservationCursorOptions {
  limit?: number; // Default 50, max 100
  afterId?: number; // Cursor: fetch records with id > afterId or cursor
  sortOrder?: string; // Hostaway-supported: sortOrder=updatedOn (oldest to newest)
  status?: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
}

export interface ReservationCursorResult {
  reservations: HostawayReservation[];
  hasMore: boolean;
  nextAfterId: number | null;
  totalFetched: number;
}

/**
 * Fetch a page of reservations from Hostaway using afterId cursor pagination.
 * Supports Hostaway-supported parameters:
 * limit=100, sortOrder=updatedOn, afterId=<last reservation id>, includeResources=1, includePayments=1
 */
export async function getHostawayReservationsCursor(
  options: ReservationCursorOptions = {}
): Promise<ReservationCursorResult> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 100);

  const query = new URLSearchParams();
  query.set("limit", String(limit));

  // Hostaway API contract: afterId cursor pagination is not compatible with custom sortOrder
  const hasAfterId = options.afterId !== undefined && options.afterId !== null && options.afterId > 0;
  if (options.sortOrder && !hasAfterId) {
    query.set("sortOrder", options.sortOrder);
  }

  // Authoritative field requirements:
  // includeResources=1 for customFieldValues, attached resources, and fees
  // includePayments=1 for transaction records, paid amounts, and remaining balance
  query.set("includeResources", "1");
  query.set("includePayments", "1");

  if (hasAfterId) {
    query.set("afterId", String(options.afterId));
  }

  if (options.status) {
    query.set("status", options.status);
  }

  if (options.fromDate) {
    query.set("fromDate", options.fromDate);
  }

  if (options.toDate) {
    query.set("toDate", options.toDate);
  }

  const endpoint = `/reservations?${query.toString()}`;

  const res = await hostawayRequest<HostawayPaginatedResult<HostawayReservation>>(endpoint);
  const list = Array.isArray(res?.result) ? res.result : [];

  let nextAfterId: number | null = null;
  if (list.length > 0) {
    const lastItem = list[list.length - 1];
    nextAfterId = lastItem.id || null;
  }

  return {
    reservations: list,
    hasMore: list.length === limit,
    nextAfterId,
    totalFetched: list.length,
  };
}

/**
 * Fetch a single authoritative reservation by Hostaway ID.
 * Requests includeResources=1 and includePayments=1 to guarantee complete data.
 */
export async function fetchHostawayReservation(reservationId: number | string): Promise<HostawayReservation> {
  const cleanId = encodeURIComponent(String(reservationId).trim());
  const res = await hostawayRequest<{ result: HostawayReservation } | HostawayReservation>(
    `/reservations/${cleanId}?includeResources=1&includePayments=1`
  );

  if ("result" in res && res.result) {
    return res.result;
  }
  return res as HostawayReservation;
}
