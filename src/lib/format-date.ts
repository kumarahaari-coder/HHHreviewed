/**
 * Shared, human-readable date formatting for the UI.
 * Stay and booking dates are calendar dates (Hostaway sends 2027-03-16T00:00:00+00:00), so they are
 * formatted from the date part only, in UTC, to avoid off-by-one-day shifts in local time zones.
 */

const DATE_PART = /^(\d{4})-(\d{2})-(\d{2})/;

/** "Sep 12, 2026" from a date or ISO timestamp. Returns "—" when empty and the raw value when unparseable. */
export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const m = String(value).match(DATE_PART);
  if (!m) return String(value);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Sep 12 – Sep 15, 2026" style stay range; falls back to full dates across years. */
export function formatDateRange(start?: string | null, end?: string | null): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** "Oct 14, 2026, 6:05 PM" in the viewer's local time, for real moments in time (created/submitted/synced). */
export function formatDateTime(value?: string | number | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
