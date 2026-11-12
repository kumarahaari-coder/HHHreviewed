/**
 * Read-only: lists guests whose existing bookings disagree with the first-touch rule.
 * A guest belongs to the partner site of their earliest NON-CANCELLED partner-attributed booking; any later booking
 * credited to a different site, or to no site, is a conflict. Nothing is written or re-attributed.
 * It also lists non-cancelled bookings whose credited site differs from the site that owns their booking-engine
 * source (e.g. 210263-005), which is how a wrongly locked booking shows up. Guest emails are masked in the output.
 *
 * Usage: npx tsx scripts/report-guest-attribution-conflicts.ts
 */
import { existsSync, readFileSync } from "fs";
for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
import { createAdminClient } from "../src/lib/supabase/admin";
import { normalizeGuestEmail } from "../src/lib/hostaway/guest-attribution";

const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");
const stamp = (r: any) => Date.parse(r.booking_date || r.created_at || r.check_in_date || "") || Number.MAX_SAFE_INTEGER;

async function main() {
  const supabase = createAdminClient();
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("reservations")
      .select("id, guest_email, site_id, partner_id, booking_date, check_in_date, created_at, reservation_status, platform, hostaway_reservation_id, raw_hostaway_data")
      .not("guest_email", "is", null)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const byGuest = new Map<string, any[]>();
  for (const r of rows) {
    const email = normalizeGuestEmail(r.guest_email);
    if (!email) continue;
    byGuest.set(email, [...(byGuest.get(email) || []), r]);
  }

  const { data: accruals } = await supabase.from("commission_ledger_events").select("reservation_id").eq("event_type", "INITIAL_ACCRUAL");
  const accrued = new Set((accruals || []).map((a: any) => a.reservation_id));

  let repeatGuests = 0;
  const conflicts: { guest: string; reservation: string; had: string; shouldBe: string; accrued: boolean }[] = [];
  for (const [email, list] of byGuest) {
    if (list.length < 2) continue;
    repeatGuests++;
    const sorted = [...list].sort((a, b) => stamp(a) - stamp(b));
    const owner = sorted.find((r) => r.site_id && r.partner_id && r.reservation_status !== "CANCELLED");
    if (!owner) continue;
    for (const r of sorted) {
      if (stamp(r) <= stamp(owner) && r.id !== owner.id) continue; // earlier than the owner: not affected by the lock
      if (r.id === owner.id || (r.site_id === owner.site_id && r.partner_id === owner.partner_id)) continue;
      conflicts.push({ guest: mask(email), reservation: r.id, had: r.site_id || "(none)", shouldBe: owner.site_id, accrued: accrued.has(r.id) });
    }
  }

  // Source check: the site that owns a booking-engine source host should be the site credited.
  const hostLabel = (u: unknown) => { try { return new URL(String(u)).hostname.toLowerCase().split(".")[0]; } catch { return null; } };
  const sourceSites = new Map<string, Set<string>>();
  const add = (label: string | null, id: string) => { if (label) sourceSites.set(label, (sourceSites.get(label) || new Set()).add(id)); };
  const { data: siteRows } = await supabase.from("sites").select("id, website_url").eq("status", "active");
  for (const s of siteRows || []) add(hostLabel(s.website_url), s.id);
  const { data: propRows } = await supabase.from("site_properties").select("site_id, custom_booking_url").eq("status", "active");
  for (const sp of propRows || []) add(hostLabel(sp.custom_booking_url), sp.site_id);
  const sourceMismatch = rows.filter((r) => {
    const raw = r.raw_hostaway_data || {};
    const src = String(raw.source ?? "").toLowerCase();
    if (r.reservation_status === "CANCELLED" || String(raw.channelName ?? "").toLowerCase() !== "bookingengine") return false;
    const owners = sourceSites.get(src);
    return !!owners && owners.size === 1 && !owners.has(r.site_id);
  }).map((r) => ({ hostaway: r.hostaway_reservation_id, source: r.raw_hostaway_data.source, credited: r.site_id || "(none)", expected: [...sourceSites.get(String(r.raw_hostaway_data.source).toLowerCase())!][0], accrued: accrued.has(r.id) }));

  console.log(`guests with a usable email: ${byGuest.size}`);
  console.log(`guests with 2+ bookings:    ${repeatGuests}`);
  console.log(`bookings that disagree with first-touch: ${conflicts.length}`);
  console.log(`  of which already accrued (not rewritten): ${conflicts.filter((c) => c.accrued).length}`);
  if (conflicts.length) console.table(conflicts.slice(0, 50));
  console.log(`\nnon-cancelled booking-engine bookings credited to a different site than their source: ${sourceMismatch.length}`);
  if (sourceMismatch.length) console.table(sourceMismatch.slice(0, 50));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
