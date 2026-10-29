/**
 * Writes Stripe-confirmed payments onto Hostaway reservations (payment_status + amount_received).
 * Dry run by default: prints what would change. Pass --apply to write.
 *
 * Usage: npx tsx scripts/stripe-reconcile-payments.ts [--apply]   (Node 22+)
 */
import { readFileSync } from "fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
import { createAdminClient } from "../src/lib/supabase/admin";
import { fetchStripeTallies } from "../src/lib/stripe/payment-verification";
import { mergeStripePayment, reconcileStripePayments, stripeNetReceived } from "../src/lib/stripe/reconcile-payments";

async function main() {
  const apply = process.argv.includes("--apply");
  const supabase = createAdminClient();
  const tallies = await fetchStripeTallies();

  const ids = [...tallies.keys()].filter((id) => stripeNetReceived(tallies.get(id)) !== null).map(Number);
  const { data, error } = await supabase
    .from("reservations")
    .select("hostaway_reservation_id, gross_amount, amount_received, payment_status, reservation_status, site_id")
    .in("hostaway_reservation_id", ids);
  if (error) throw new Error(error.message);

  const rows = (data || []).map((r: any) => {
    const m = mergeStripePayment(tallies.get(String(r.hostaway_reservation_id)), Number(r.gross_amount) || 0, {
      amountReceived: Number(r.amount_received) || 0,
      paymentStatus: r.payment_status,
    });
    return {
      hostaway: r.hostaway_reservation_id,
      status: r.reservation_status,
      attributed: !!r.site_id,
      total: Number(r.gross_amount),
      before: `${r.payment_status} ${Number(r.amount_received) || 0}`,
      after: m ? `${m.paymentStatus} ${m.amountReceived}` : "-",
      disputed: tallies.get(String(r.hostaway_reservation_id))?.disputed || false,
    };
  });
  console.table(rows);

  if (!apply) return console.log("Dry run. Re-run with --apply to write these changes.");
  console.log(await reconcileStripePayments(supabase, tallies));
}
main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
