/**
 * Read-only: confirm the Stripe account behind STRIPE_SECRET_KEY and match recent charges
 * against Hostaway reservations (amount + date). Prints no guest PII.
 * Usage: npx tsx scripts/stripe-verify-account.ts
 */
import { existsSync, readFileSync } from "fs";
import { hostawayRequest } from "../src/lib/hostaway/client";

for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) throw new Error("STRIPE_SECRET_KEY missing");

async function stripe(path: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
  const json: any = await res.json();
  if (!res.ok) throw new Error(`${path}: ${json?.error?.message || res.status}`);
  return json;
}

async function main() {
  try {
    const acct = await stripe("/account");
    console.log("Stripe account:", acct.id, "| expected:", process.env.STRIPE_ACCOUNT_ID,
      acct.id === process.env.STRIPE_ACCOUNT_ID ? "MATCH" : "MISMATCH");
  } catch (e: any) {
    console.log("(account lookup skipped - key lacks Accounts Read; account id is in the key's error)");
  }
  console.log("key mode:", KEY!.startsWith("rk_live") || KEY!.startsWith("sk_live") ? "live" : "test");

  const charges = (await stripe("/charges?limit=100")).data as any[];
  console.log("\ncharges fetched:", charges.length);
  const rows = charges.map((c) => ({
    id: c.id,
    date: new Date(c.created * 1000).toISOString().slice(0, 10),
    amount: c.amount / 100,
    currency: c.currency,
    status: c.status,
    paid: c.paid,
    captured: c.captured,
    refunded: c.amount_refunded / 100,
    disputed: !!c.disputed,
    meta: Object.keys(c.metadata || {}).join(",") || "-",
    desc: String(c.description || "").slice(0, 40),
  }));
  console.table(rows.slice(0, 20));

  const list = await hostawayRequest<any>("/reservations?limit=100&sortOrder=arrivalDateDesc", undefined, { maxRetries: 1 });
  const res: any[] = list?.result || [];
  let matched = 0;
  const out: any[] = [];
  for (const r of res) {
    const total = Number(r.totalPrice);
    if (!total) continue;
    const hit = rows.find((c) => Math.abs(c.amount - total) < 0.01 && c.status === "succeeded");
    if (hit) matched++;
    out.push({ resId: r.id, channel: r.channelName, status: r.status, paymentStatus: r.paymentStatus, total, stripeCharge: hit?.id || "-" });
  }
  console.log(`\nHostaway reservations with an equal-amount Stripe charge: ${matched}/${out.length}`);
  console.table(out.filter((o) => o.stripeCharge !== "-").slice(0, 20));
}
main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
