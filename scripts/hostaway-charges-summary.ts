/** Read-only: summarize Hostaway guest-payment charges (no PII). Usage: npx tsx scripts/hostaway-charges-summary.ts */
import { existsSync, readFileSync } from "fs";
import { hostawayRequest } from "../src/lib/hostaway/client";
for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
async function main() {
  const all: any[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const r = await hostawayRequest<any>(`/guestPayments/charges?limit=100&offset=${offset}`, undefined, { maxRetries: 1 });
    const rows = r?.result || [];
    all.push(...rows);
    if (rows.length < 100) break;
  }
  console.log("total charges:", all.length);
  const by: Record<string, { n: number; amt: number; cap: number }> = {};
  for (const c of all) {
    const k = `${c.paymentProvider}/${c.status}`;
    by[k] ||= { n: 0, amt: 0, cap: 0 };
    by[k].n++; by[k].amt += Number(c.amount || 0); by[k].cap += Number(c.capturedAmount || 0);
  }
  console.table(by);
  const paid = all.filter((c) => c.paymentProviderChargeId);
  console.log("with Stripe charge id:", paid.length);
  for (const c of paid.slice(0, 15))
    console.log(c.reservationId, c.status, c.amount, c.capturedAmount, c.chargeDate, c.paymentProviderChargeId, "refunds:", (c.refundIds || []).length);
  const accts = new Set(paid.map((c) => String(c.paymentProviderChargeId).match(/^ch_.{4}(.+)$/)?.[1]?.slice(0, 12)));
  console.log("stripe account suffixes in charge ids:", [...accts]);
}
main();
