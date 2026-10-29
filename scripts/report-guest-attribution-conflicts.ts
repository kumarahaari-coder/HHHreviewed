/**
 * Read-only: lists guests whose existing bookings disagree with the first-touch rule.
 * A guest belongs to the partner site of their earliest partner-attributed booking; any later booking
 * credited to a different site, or to no site, is a conflict. Nothing is written or re-attributed.
 * Guest emails are masked in the output.
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
      .select("id, guest_email, site_id, partner_id, booking_date, check_in_date, created_at, reservation_status, platform")
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
    const owner = sorted.find((r) => r.site_id && r.partner_id);
    if (!owner) continue;
    for (const r of sorted) {
      if (stamp(r) <= stamp(owner) && r.id !== owner.id) continue; // earlier than the owner: not affected by the lock
      if (r.id === owner.id || (r.site_id === owner.site_id && r.partner_id === owner.partner_id)) continue;
      conflicts.push({ guest: mask(email), reservation: r.id, had: r.site_id || "(none)", shouldBe: owner.site_id, accrued: accrued.has(r.id) });
    }
  }

  console.log(`guests with a usable email: ${byGuest.size}`);
  console.log(`guests with 2+ bookings:    ${repeatGuests}`);
  console.log(`bookings that disagree with first-touch: ${conflicts.length}`);
  console.log(`  of which already accrued (not rewritten): ${conflicts.filter((c) => c.accrued).length}`);
  if (conflicts.length) console.table(conflicts.slice(0, 50));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
