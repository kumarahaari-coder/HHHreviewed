/**
 * Read-only probe: where does Hostaway say guest money went?
 * Usage: npx tsx scripts/hostaway-payment-probe.ts [reservationId]
 * Prints payment-related fields only (no guest PII).
 */
import { existsSync, readFileSync } from "fs";
import { hostawayRequest } from "../src/lib/hostaway/client";

for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const PAY = /paid|payment|stripe|charge|balance|total|price|channel|status|currency|id$/i;

async function get(path: string) {
  try {
    return await hostawayRequest<any>(path, undefined, { maxRetries: 1 });
  } catch (e: any) {
    return { __error: String(e?.message || e).slice(0, 200) };
  }
}

async function main() {
  const idArg = process.argv[2];
  const list = await get("/reservations?limit=100&sortOrder=arrivalDateDesc");
  const rows: any[] = list?.result || [];
  console.log("reservations fetched:", rows.length, list.__error || "");
  const direct = rows.filter((r) => /direct|booking ?engine|website|manual/i.test(String(r.channelName || r.source || "")));
  console.log("channels:", [...new Set(rows.map((r) => r.channelName))]);
  console.log("direct-ish:", direct.length);
  for (const r of (idArg ? rows.filter((x) => String(x.id) === idArg) : direct.slice(0, 5))) {
    const slim: any = {};
    for (const k of Object.keys(r)) if (PAY.test(k) && typeof r[k] !== "object") slim[k] = r[k];
    console.log("\nRESERVATION", slim);
    for (const p of [
      `/reservations/${r.id}?includeResources=1`,
      `/financeField/${r.id}`,
      `/guestPayments/charges?reservationId=${r.id}`,
      `/reservations/${r.id}/payments`,
    ]) {
      const res = await get(p);
      const body = res?.result;
      console.log(p, "->", res.__error ? res.__error : JSON.stringify(
        Array.isArray(body) ? body.slice(0, 5) : Object.fromEntries(Object.entries(body || {}).filter(([k, v]) => PAY.test(k) && typeof v !== "object"))
      ).slice(0, 1200));
    }
  }
  for (const p of ["/stripeAccounts", "/paymentMethods", "/guestPayments/charges?limit=5"]) {
    const res = await get(p);
    console.log("\n" + p, "->", res.__error || JSON.stringify(res.result).slice(0, 800));
  }
}
main();
