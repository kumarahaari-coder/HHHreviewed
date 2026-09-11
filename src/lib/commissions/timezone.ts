/**
 * Property Timezone and Stay Completion Utility
 * 
 * Computes stay completion timestamp based on the authoritative property timezone
 * (from public.properties.timezone, defaulting to 'America/New_York') and adds a
 * configurable post-stay hold buffer (default: 24 hours) for dispute/cleaning clearance.
 */

export const DEFAULT_PROPERTY_TIMEZONE = "America/New_York";
export const DEFAULT_POST_STAY_HOLD_HOURS = 24;

/**
 * Standard checkout time in local property time is 11:00 AM.
 * Returns the exact UTC timestamp when a reservation's stay is eligible for payout release.
 */
export function computeEligibilityReleaseTimestamp(
  checkOutDateStr: string, // YYYY-MM-DD
  propertyTimezone?: string | null,
  holdHours: number = DEFAULT_POST_STAY_HOLD_HOURS
): Date {
  let timezone = propertyTimezone?.trim() || DEFAULT_PROPERTY_TIMEZONE;
  const cleanDate = checkOutDateStr.split("T")[0];
  
  // Create reference date for 11:00 AM on check-out date
  // Parse in local property timezone
  const [year, month, day] = cleanDate.split("-").map(Number);
  
  // Format local checkout representation
  // We compute UTC offset for the given timezone at that date
  const tempUtc = new Date(Date.UTC(year, month - 1, day, 11, 0, 0));
  
  // Resolve timezone offset using Intl.DateTimeFormat
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    timezone = DEFAULT_PROPERTY_TIMEZONE;
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  
  const parts = formatter.formatToParts(tempUtc);
  const partMap: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      partMap[part.type] = Number(part.value);
    }
  }
  
  // Compute difference between target local time (11:00) and what tempUtc mapped to in that timezone
  const mappedHour = partMap.hour === 24 ? 0 : partMap.hour;
  const hourDiff = 11 - mappedHour;
  
  const localCheckoutUtc = new Date(tempUtc.getTime() + hourDiff * 3600 * 1000);
  
  // Add post-stay hold buffer (default 24 hours)
  const releaseTimeUtc = new Date(localCheckoutUtc.getTime() + holdHours * 3600 * 1000);
  return releaseTimeUtc;
}

/**
 * Checks whether a given reservation has completed its stay and passed the post-stay hold buffer.
 */
export function isStayEligibleForRelease(
  checkOutDateStr: string,
  propertyTimezone?: string | null,
  holdHours: number = DEFAULT_POST_STAY_HOLD_HOURS,
  now: Date = new Date()
): boolean {
  if (!checkOutDateStr) return false;
  const releaseTimestamp = computeEligibilityReleaseTimestamp(checkOutDateStr, propertyTimezone, holdHours);
  return now.getTime() >= releaseTimestamp.getTime();
}
