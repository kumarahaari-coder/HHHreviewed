import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Load local env for direct Supabase invariant checking
const envPath = path.resolve(".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const match = line.trim().match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const PROD_URL = "https://hh-hreviewed.vercel.app";
const AUTH_COOKIE = "demo_role=SUPER_ADMIN; demo_email=hiddenhoneyace@gmail.com";

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("================================================================================");
  console.log("PHASE 6: POST-DEPLOYMENT PRODUCTION SMOKE TEST & INVARIANT VERIFICATION");
  console.log("Target:", PROD_URL);
  console.log("================================================================================\n");

  const results: Record<string, any> = {};

  // 1. GET /api/readiness
  console.log("[1/8] Testing GET /api/readiness...");
  const readyRes = await fetch(`${PROD_URL}/api/readiness`);
  const readyData = await readyRes.json();
  console.log(`  HTTP ${readyRes.status}:`, readyData);
  if (readyRes.status !== 200 || !readyData.ready || readyData.database !== "CONNECTED") {
    throw new Error(`Readiness check failed: ${JSON.stringify(readyData)}`);
  }
  results.readiness = { status: readyRes.status, data: readyData };

  // 2. GET /api/ownerrez/health
  console.log("\n[2/8] Testing GET /api/ownerrez/health...");
  const healthRes = await fetch(`${PROD_URL}/api/ownerrez/health`);
  const healthData = await healthRes.json();
  console.log(`  HTTP ${healthRes.status}:`, healthData);
  if (healthRes.status !== 200 || !healthData.configured) {
    throw new Error(`OwnerRez health check failed: ${JSON.stringify(healthData)}`);
  }
  results.ownerrezHealth = { status: healthRes.status, data: healthData };

  // 3. Phase 5 Commission Preview: GET /api/admin/commissions/preview
  console.log("\n[3/8] Testing Phase 5 Commission Preview (GET /api/admin/commissions/preview)...");
  const previewRes = await fetch(`${PROD_URL}/api/admin/commissions/preview?limit=100`, {
    headers: { Cookie: AUTH_COOKIE },
  });
  const previewData = await previewRes.json();
  console.log(`  HTTP ${previewRes.status}: success=${previewData.success}, total=${previewData.total}`);
  if (previewRes.status !== 200 || !previewData.success) {
    throw new Error(`Commission preview failed: ${JSON.stringify(previewData)}`);
  }
  // Check booking 19150249 in preview
  const b19150249 = (previewData.previews || []).find((p: any) => p.ownerrezBookingId === 19150249);
  console.log("  Booking 19150249 in preview:", b19150249);
  if (!b19150249) {
    throw new Error("Booking 19150249 missing from preview results!");
  }
  const calc = b19150249.commissionCalculations;
  const lifecycle = b19150249.lifecycle;
  if (calc?.realizedCommission !== 0 || calc?.payoutEligibleCommission !== 0 || lifecycle?.status !== "PENDING_PAYMENT") {
    throw new Error(`Booking 19150249 mutated: ${JSON.stringify(b19150249)}`);
  }
  console.log(`  ✓ Booking 19150249 confirmed untouched: status=${lifecycle.status}, realized=$${calc.realizedCommission}, eligible=$${calc.payoutEligibleCommission}`);
  results.preview = { status: previewRes.status, booking19150249: b19150249 };

  // 4. GET /api/admin/commissions/ledger
  console.log("\n[4/8] Testing GET /api/admin/commissions/ledger...");
  const ledgerRes = await fetch(`${PROD_URL}/api/admin/commissions/ledger`, {
    headers: { Cookie: AUTH_COOKIE },
  });
  const ledgerData = await ledgerRes.json();
  console.log(`  HTTP ${ledgerRes.status}:`, ledgerData);
  if (ledgerRes.status !== 200 || !ledgerData.success) {
    throw new Error(`GET /api/admin/commissions/ledger failed: ${JSON.stringify(ledgerData)}`);
  }
  if (!Array.isArray(ledgerData.events) || ledgerData.events.length !== 0) {
    throw new Error(`Expected empty ledger events array, got: ${JSON.stringify(ledgerData.events)}`);
  }
  console.log("  ✓ API queries public.commission_ledger_events successfully: returned exactly 0 events (empty ledger)");
  results.ledgerApi = { status: ledgerRes.status, count: ledgerData.events.length };

  // 5. GET /api/admin/commissions/payout-batches
  console.log("\n[5/8] Testing GET /api/admin/commissions/payout-batches...");
  const batchesRes = await fetch(`${PROD_URL}/api/admin/commissions/payout-batches`, {
    headers: { Cookie: AUTH_COOKIE },
  });
  const batchesData = await batchesRes.json();
  console.log(`  HTTP ${batchesRes.status}:`, batchesData);
  if (batchesRes.status !== 200 || !batchesData.success) {
    throw new Error(`GET /api/admin/commissions/payout-batches failed: ${JSON.stringify(batchesData)}`);
  }
  if (!Array.isArray(batchesData.batches) || batchesData.batches.length !== 0) {
    throw new Error(`Expected empty payout batches array, got: ${JSON.stringify(batchesData.batches)}`);
  }
  console.log("  ✓ API queries public.payout_batches successfully: returned exactly 0 batches (empty batches)");
  results.batchesApi = { status: batchesRes.status, count: batchesData.batches.length };

  // 6. GET /admin/payouts UI Page
  console.log("\n[6/8] Testing GET /admin/payouts (UI route)...");
  const uiRes = await fetch(`${PROD_URL}/admin/payouts`, {
    headers: { Cookie: AUTH_COOKIE },
  });
  console.log(`  HTTP ${uiRes.status}: content-type = ${uiRes.headers.get("content-type")}`);
  if (uiRes.status !== 200) {
    throw new Error(`GET /admin/payouts failed with HTTP ${uiRes.status}`);
  }
  const uiText = await uiRes.text();
  if (!uiText.includes("Payout") && !uiText.includes("Batches")) {
    console.log("  ⚠ Notice: /admin/payouts returned HTML without expected headings, length:", uiText.length);
  } else {
    console.log("  ✓ /admin/payouts UI rendered successfully!");
  }
  results.uiPage = { status: uiRes.status };

  // 7. Explicit Settlement Block Verification
  console.log("\n[7/8] Explicitly testing that financial settlement is hard-blocked...");
  const fakeBatchId = "00000000-0000-0000-0000-000000000000";
  const settleRes = await fetch(`${PROD_URL}/api/admin/commissions/payout-batches/${fakeBatchId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: AUTH_COOKIE,
    },
    body: JSON.stringify({ action: "settle" }),
  });
  const settleData = await settleRes.json();
  console.log(`  HTTP ${settleRes.status}:`, settleData);
  if (settleRes.status !== 403 || !settleData.error?.includes("Financial settlement is disabled")) {
    throw new Error(`Expected 403 settlement disabled denial, got: HTTP ${settleRes.status} ${JSON.stringify(settleData)}`);
  }
  console.log("  ✓ Settlement attempt strictly denied by kill switch: 'Financial settlement is disabled in this environment.'");
  results.settlementDenied = { status: settleRes.status, error: settleData.error };

  // 8. Re-run Production Invariants Check on Live Database
  console.log("\n[8/8] Verifying Production Invariants via Live Supabase Client...");
  const tablesToCheck = [
    "commission_ledger_events",
    "payout_batches",
    "payout_items",
    "payout_payment_attempts",
    "commission_adjustment_requests",
  ];

  const tableCounts: Record<string, number> = {};
  for (const table of tablesToCheck) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) {
      throw new Error(`Failed to query table ${table}: ${error.message}`);
    }
    console.log(`  • public.${table.padEnd(32)} = ${count} (Expected: 0)`);
    if (count !== 0) throw new Error(`Table ${table} contains rows: ${count}`);
    tableCounts[table] = count ?? 0;
  }

  // Check baseline reservations and legacy payouts
  const { count: resCount, error: resErr } = await supabase.from("reservations").select("*", { count: "exact", head: true });
  const { count: payCount, error: payErr } = await supabase.from("payouts").select("*", { count: "exact", head: true });

  if (resErr) throw new Error(`Failed to query reservations: ${resErr.message}`);
  if (payErr) throw new Error(`Failed to query payouts: ${payErr.message}`);

  console.log(`  • public.reservations            = ${resCount} (Expected: 38)`);
  console.log(`  • public.payouts (legacy)         = ${payCount} (Expected: 0)`);

  if (resCount !== 38) throw new Error(`reservations count mutated: ${resCount}`);
  if (payCount !== 0) throw new Error(`legacy payouts count mutated: ${payCount}`);

  // Check booking 19150249 in reservations table
  const { data: bRow, error: bErr } = await supabase
    .from("reservations")
    .select("ownerrez_booking_id, confirmation_code, total_payout")
    .eq("ownerrez_booking_id", 19150249)
    .single();

  if (bErr || !bRow) {
    throw new Error(`Booking 19150249 not found in reservations table: ${bErr?.message}`);
  }
  console.log(`  • Booking 19150249 in DB: ownerrez_booking_id=${bRow.ownerrez_booking_id}, total_payout=${bRow.total_payout}`);

  console.log("\n================================================================================");
  console.log("ALL PRODUCTION SMOKE TESTS & INVARIANTS PASSED 100%!");
  console.log("================================================================================");

  console.log(JSON.stringify({
    success: true,
    target: PROD_URL,
    readiness: results.readiness,
    ownerrezHealth: results.ownerrezHealth,
    preview: {
      booking19150249: results.preview.booking19150249
    },
    ledgerApi: results.ledgerApi,
    batchesApi: results.batchesApi,
    settlementDenied: results.settlementDenied,
    invariants: {
      ...tableCounts,
      reservations: resCount,
      legacyPayouts: payCount,
      booking19150249Realized: 0,
      booking19150249Eligible: 0
    }
  }, null, 2));
}

main().catch((err) => {
  console.error("\n[FATAL SMOKE TEST FAILURE]:", err);
  process.exit(1);
});
