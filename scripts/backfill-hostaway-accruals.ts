/**
 * Backfill INITIAL_ACCRUAL for existing partner-attributed Hostaway bookings.
 *
 * Accruals are only created when a booking is first inserted by the sync, so bookings that already existed when
 * commission attribution was switched on never get one (and can never be realized or paid).
 *
 * DRY RUN BY DEFAULT: prints what would happen and writes nothing.
 *   npx tsx scripts/backfill-hostaway-accruals.ts            # dry run
 *   npx tsx scripts/backfill-hostaway-accruals.ts --apply    # writes INITIAL_ACCRUAL rows (immutable ledger!)
 *   add --include-cancelled to also list cancelled bookings (they are never accrued)
 *
 * Uses the same rule resolution and commission formula as the sync (executeHostawayInitialAccrual), so the numbers
 * match what a new booking would get. Idempotent: the ledger key evt_accrual_<reservationId> prevents duplicates.
 */
import { existsSync, readFileSync } from "fs";
for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
import { createAdminClient } from "../src/lib/supabase/admin";
import { resolveCommissionRule } from "../src/lib/ownerrez/commission-preview";
import { computeHostawayCommission, executeHostawayInitialAccrual } from "../src/lib/hostaway/sync";

const APPLY = process.argv.includes("--apply");
const INCLUDE_CANCELLED = process.argv.includes("--include-cancelled");

async function main() {
  const supabase = createAdminClient();
  console.log(APPLY ? "MODE: APPLY (writing)\n" : "MODE: DRY RUN (nothing is written)\n");

  const { data: rows, error } = await supabase
    .from("reservations")
    .select("id, hostaway_reservation_id, confirmation_code, partner_id, site_id, platform, reservation_status, payment_status, attribution_status, gross_amount, cleaning_fee, service_fee, taxes_amount, check_out_date")
    .not("hostaway_reservation_id", "is", null)
    .not("partner_id", "is", null)
    .order("check_out_date", { ascending: true });
  if (error) throw new Error(error.message);

  const ids = (rows || []).map((r: any) => r.id);
  const { data: acc } = ids.length
    ? await supabase.from("commission_ledger_events").select("reservation_id").eq("event_type", "INITIAL_ACCRUAL").in("reservation_id", ids)
    : { data: [] as any[] };
  const hasAccrual = new Set((acc || []).map((a: any) => a.reservation_id));
  const { data: partners } = await supabase.from("partners").select("id, business_name");
  const partnerName = new Map((partners || []).map((p: any) => [p.id, p.business_name]));

  const report: any[] = [];
  let totalCommission = 0;
  let toCreate = 0;

  for (const r of rows || []) {
    const base = {
      booking: r.confirmation_code,
      partner: partnerName.get(r.partner_id) || r.partner_id,
      stay_out: String(r.check_out_date || "").slice(0, 10),
      status: r.reservation_status,
      pay: r.payment_status,
      gross: Number(r.gross_amount),
    };
    let action = "";
    let commission = 0;

    if (hasAccrual.has(r.id)) action = "skip: already has accrual";
    else if (r.reservation_status === "CANCELLED") {
      if (!INCLUDE_CANCELLED) continue;
      action = "skip: cancelled (never accrued)";
    } else if (r.attribution_status !== "automatic") action = `skip: attribution is '${r.attribution_status}' (sync only accrues deterministic/automatic)`;
    else if (!r.site_id) action = "skip: no site";
    else {
      const rule = await resolveCommissionRule(r.partner_id, r.site_id, supabase);
      if (!rule.rule) action = "skip: NO ACTIVE COMMISSION RULE for this partner";
      else {
        const c = computeHostawayCommission(
          { grossAmount: Number(r.gross_amount || 0), cleaningFee: Number(r.cleaning_fee || 0), serviceFee: Number(r.service_fee || 0), taxesAmount: Number(r.taxes_amount || 0) },
          rule.rule
        );
        if (c.calculatedCommission <= 0) action = "skip: commission would be $0";
        else {
          commission = c.calculatedCommission;
          action = APPLY ? "CREATE" : "would create";
          toCreate++;
          totalCommission += commission;
          if (APPLY) {
            const res = await executeHostawayInitialAccrual({
              reservationId: r.id,
              hostawayBookingId: Number(r.hostaway_reservation_id),
              booking: {} as any,
              normalized: { grossAmount: Number(r.gross_amount || 0), cleaningFee: Number(r.cleaning_fee || 0), serviceFee: Number(r.service_fee || 0), taxesAmount: Number(r.taxes_amount || 0) } as any,
              resolvedPartnerId: r.partner_id,
              resolvedSiteId: r.site_id,
              bookingChannel: r.platform || "direct",
              attributionSignals: ["backfill"],
              supabaseClient: supabase,
            });
            action = `created: ${res.status}`;
          }
        }
      }
    }
    report.push({ ...base, commission, action });
  }

  console.table(report);
  console.log(`\nPartner-attributed Hostaway bookings reviewed: ${rows?.length ?? 0}`);
  console.log(`${APPLY ? "Accruals created" : "Accruals that would be created"}: ${toCreate}   total forecast commission: $${totalCommission.toFixed(2)}`);
  const skipped: Record<string, number> = {};
  report.forEach((x) => { if (x.action.startsWith("skip")) skipped[x.action] = (skipped[x.action] || 0) + 1; });
  console.log("Skipped:", skipped);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
