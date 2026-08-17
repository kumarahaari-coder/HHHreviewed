import {
  Reservation,
  ReservationAttribution,
  RedirectClick,
  CompetingCandidate
} from "@/lib/db/schema";
import {
  getRedirectClicksForPropertyWindow,
  saveReservationAttribution,
  getReservationAttributionByReservationId
} from "@/lib/supabase/data-store";

/**
 * Evaluates a single direct reservation against historical redirect clicks.
 * Strictly implements conservative probabilistic matching without triggering payouts.
 */
export async function reconcileReservation(
  reservation: Partial<Reservation> & { id: string; propertyId: string }
): Promise<ReservationAttribution> {
  // If already manually reviewed and finalized, do not overwrite unless requested
  const existing = await getReservationAttributionByReservationId(reservation.id);
  if (existing && existing.status === "ATTRIBUTED" && existing.reviewedBy) {
    return existing;
  }

  const bookingTimestamp = reservation.bookingDate
    ? new Date(reservation.bookingDate).getTime()
    : Date.now();

  const windowStart = new Date(bookingTimestamp - 72 * 60 * 60 * 1000).toISOString(); // 72h lookback
  const windowEnd = new Date(bookingTimestamp).toISOString();

  // 1. Query clicks matching this property within the 72-hour window prior to booking
  let candidateClicks: RedirectClick[] = [];
  try {
    candidateClicks = await getRedirectClicksForPropertyWindow(
      reservation.propertyId,
      windowStart,
      windowEnd
    );
  } catch (err: any) {
    console.error(`[Reconciliation Error] Failed to fetch clicks for res ${reservation.id}:`, err);
  }

  // 2. Case: Zero matching clicks found in 72h window
  if (!candidateClicks || candidateClicks.length === 0) {
    return saveReservationAttribution({
      reservationId: reservation.id,
      attributionMethod: "UNATTRIBUTED",
      confidenceScore: 0.0,
      matchedSignals: ["NO_MATCHING_CLICKS_IN_72H_WINDOW"],
      competingCandidates: [],
      status: "UNATTRIBUTED"
    });
  }

  // 3. Analyze candidate clicks
  const clicksWithElapsed = candidateClicks.map(c => {
    const clickTime = new Date(c.clickedAt).getTime();
    const elapsedMs = Math.max(0, bookingTimestamp - clickTime);
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    return { click: c, elapsedHours };
  }).filter(c => c.elapsedHours <= 72); // ensure strictly within 72h

  if (clicksWithElapsed.length === 0) {
    return saveReservationAttribution({
      reservationId: reservation.id,
      attributionMethod: "UNATTRIBUTED",
      confidenceScore: 0.0,
      matchedSignals: ["NO_MATCHING_CLICKS_IN_72H_WINDOW"],
      competingCandidates: [],
      status: "UNATTRIBUTED"
    });
  }

  // Group by partner to check for multiple competing partner sources
  const partnerClicksMap = new Map<string, typeof clicksWithElapsed[0]>();
  for (const item of clicksWithElapsed) {
    if (!partnerClicksMap.has(item.click.partnerId)) {
      partnerClicksMap.set(item.click.partnerId, item);
    }
  }

  const distinctPartners = Array.from(partnerClicksMap.values());
  const clicksWithin24h = clicksWithElapsed.filter(c => c.elapsedHours <= 24);

  // 4. Case: Multiple competing partners clicked within the window
  if (distinctPartners.length > 1) {
    const primaryCandidate = clicksWithElapsed[0]; // most recent click
    const competing: CompetingCandidate[] = distinctPartners.map(p => ({
      siteId: p.click.siteId,
      partnerId: p.click.partnerId,
      clickId: p.click.id,
      clickedAt: p.click.clickedAt,
      elapsedHours: Number(p.elapsedHours.toFixed(1))
    }));

    return saveReservationAttribution({
      reservationId: reservation.id,
      siteId: primaryCandidate.click.siteId,
      partnerId: primaryCandidate.click.partnerId,
      sitePropertyId: primaryCandidate.click.sitePropertyId,
      clickId: primaryCandidate.click.id,
      attributionMethod: "TIME_WINDOW_PROBABILISTIC",
      confidenceScore: 55.0, // Reduced confidence due to multi-source collision
      matchedSignals: [
        "PROPERTY_MATCH",
        "MULTIPLE_COMPETING_PARTNERS",
        `COMPETING_SOURCES_COUNT_${distinctPartners.length}`,
        `MOST_RECENT_ELAPSED_${primaryCandidate.elapsedHours.toFixed(1)}H`
      ],
      competingCandidates: competing,
      status: "REVIEW_REQUIRED"
    });
  }

  // 5. Case: Single partner with click(s) within 24 hours (High confidence candidate)
  if (clicksWithin24h.length > 0) {
    const bestClick = clicksWithin24h[0];
    const score = bestClick.elapsedHours <= 6 ? 90.0 : 85.0;

    return saveReservationAttribution({
      reservationId: reservation.id,
      siteId: bestClick.click.siteId,
      partnerId: bestClick.click.partnerId,
      sitePropertyId: bestClick.click.sitePropertyId,
      clickId: bestClick.click.id,
      attributionMethod: "TIME_WINDOW_PROBABILISTIC",
      confidenceScore: score,
      matchedSignals: [
        "PROPERTY_MATCH",
        "CLICK_WITHIN_24H",
        `ELAPSED_${bestClick.elapsedHours.toFixed(1)}H`,
        "SINGLE_PARTNER_SOURCE"
      ],
      competingCandidates: [],
      status: "REVIEW_REQUIRED" // Conservative: Remains REVIEW_REQUIRED until Admin reviews
    });
  }

  // 6. Case: Single partner click in extended window (24h to 72h)
  const extendedClick = clicksWithElapsed[0];
  return saveReservationAttribution({
    reservationId: reservation.id,
    siteId: extendedClick.click.siteId,
    partnerId: extendedClick.click.partnerId,
    sitePropertyId: extendedClick.click.sitePropertyId,
    clickId: extendedClick.click.id,
    attributionMethod: "TIME_WINDOW_PROBABILISTIC",
    confidenceScore: 65.0,
    matchedSignals: [
      "PROPERTY_MATCH",
      "EXTENDED_TIME_WINDOW_24_TO_72H",
      `ELAPSED_${extendedClick.elapsedHours.toFixed(1)}H`,
      "SINGLE_PARTNER_SOURCE"
    ],
    competingCandidates: [],
    status: "REVIEW_REQUIRED"
  });
}
