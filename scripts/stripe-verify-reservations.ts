/**
 * Read-only: for every Hostaway reservation in our DB, compare what Stripe actually received
 * (succeeded+captured charges minus refunds, no disputes) against the full booking total.
 * Stripe charges are tied to reservations by the "Reservation Id: N" Hostaway writes in the description.
 * Nothing is written. No guest PII is printed.
 *
 * Usage: npx tsx scripts/stripe-verify-reservations.ts
 */
import { existsSync, readFileSync } from "fs";
for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
import { createAdminClient } from "../src/lib/supabase/admin";

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) throw new Error("STRIPE_SECRET_KEY missing");
const TOLERANCE = 0.01;

async function stripeCharges(): Promise<any[]> {
  const all: any[] = [];
  let after = "";
  for (;;) {
    const res = await fetch(`https://api.stripe.com/v1/charges?limit=100${after}`, { headers: { Authorization: `Bearer ${KEY}` } });
    const json: any = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || String(res.status));
    all.push(...json.data);
    if (!json.has_more) return all;
    after = `&starting_after=${json.data[json.data.length - 1].id}`;
  }
}

type Tally = { received: number; refunded: number; charges: number; failed: number; disputed: boolean };

async function main() {
  const charges = await stripeCharges();
  const byRes = new Map<string, Tally>();
  let unlinked = 0;
  for (const c of charges) {
    const id = /Reservation Id:\s*(\d+)/i.exec(String(c.description || ""))?.[1];
    if (!id) { unlinked++; continue; }
    const t = byRes.get(id) || { received: 0, refunded: 0, charges: 0, failed: 0, disputed: false };
    if (c.status === "succeeded" && c.paid && c.captured) {
      t.received += c.amount / 100;
      t.refunded += c.amount_refunded / 100;
      t.charges++;
    } else if (c.status === "failed") t.failed++;
    if (c.disputed) t.disputed = true;
    byRes.set(id, t);
  }
  console.log(`Stripe charges: ${charges.length} (${unlinked} without a Reservation Id), reservations seen in Stripe: ${byRes.size}`);

  const supabase = createAdminClient();
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("reservations")
      .select("id, hostaway_reservation_id, gross_amount, amount_received, payment_status, reservation_status, site_id")
      .not("hostaway_reservation_id", "is", null)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const out = rows.map((r) => {
    const t = byRes.get(String(r.hostaway_reservation_id));
    const net = t ? Math.round((t.received - t.refunded) * 100) / 100 : 0;
    const total = Number(r.gross_amount) || 0;
    let verdict: string;
    if (!t || t.charges === 0) verdict = "NO_STRIPE_PAYMENT";
    else if (t.disputed) verdict = "DISPUTED";
    else if (net + TOLERANCE >= total) verdict = "FULLY_RECEIVED";
    else verdict = "PARTIAL";
    return {
      hostaway: r.hostaway_reservation_id,
      status: r.reservation_status,
      hwPay: r.payment_status,
      attributed: !!r.site_id,
      total,
      hwReceived: Number(r.amount_received) || 0,
      stripeNet: net,
      refunded: t?.refunded || 0,
      failed: t?.failed || 0,
      verdict,
    };
  });

  const counts: Record<string, number> = {};
  for (const o of out) counts[o.verdict] = (counts[o.verdict] || 0) + 1;
  console.log("DB reservations:", out.length, counts);

  const interesting = out.filter((o) => o.verdict !== "NO_STRIPE_PAYMENT" || o.hwPay === "PAID");
  console.table(interesting.slice(0, 60));
  const mismatch = out.filter((o) => o.hwPay === "PAID" && o.verdict !== "FULLY_RECEIVED");
  console.log(`\nHostaway says PAID but Stripe does not show the full total: ${mismatch.length}`);
  const stripeOnly = [...byRes.keys()].filter((id) => !rows.some((r) => String(r.hostaway_reservation_id) === id));
  console.log(`Reservation IDs in Stripe but not in our DB: ${stripeOnly.length}`, stripeOnly.slice(0, 20).join(","));
}
main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
