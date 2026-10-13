import assert from "assert";
import { createAdminClient } from "../src/lib/supabase/admin";
import {
  findPartnerById,
  findPartnerByEmail,
  canDeletePartner,
  deletePartner,
  getAllPartners,
  getAllPartnerUsers
} from "../src/lib/supabase/data-store";

async function runPartnerReconciliationTests() {
  console.log("==================================================================");
  console.log("  HHH PRODUCTION PARTNER DIRECTORY RECONCILIATION & CRUD TESTS   ");
  console.log("==================================================================");

  try {
    process.loadEnvFile?.(".env.local");
  } catch {}

  const supabaseAdmin = createAdminClient();
  assert(supabaseAdmin, "Supabase Admin client must be available");

  let passed = 0;
  let total = 0;

  function recordPass(testName: string) {
    passed++;
    total++;
    console.log(`  ✓ PASS: ${testName}`);
  }

  function recordFail(testName: string, err: any) {
    total++;
    console.error(`  ✗ FAIL: ${testName}`, err);
    throw err;
  }

  // 1. Directory and API count consistency
  console.log("\n1. Directory & Supabase Inventory Consistency:");
  try {
    const { data: dbPartners, error: pErr } = await supabaseAdmin
      .from("partners")
      .select("*");
    assert(!pErr, `Supabase error: ${pErr?.message}`);
    assert(dbPartners && dbPartners.length > 0, "Expected at least 1 partner in database");

    const storePartners = await getAllPartners();
    assert.strictEqual(
      storePartners.length,
      dbPartners.length,
      `getAllPartners count (${storePartners.length}) must match Supabase partners count (${dbPartners.length})`
    );
    recordPass(`Directory count consistency: Exact match of ${dbPartners.length} partners`);
  } catch (err) {
    recordFail("Directory count consistency", err);
  }

  // 2. Stale / Nonexistent partner ID handling
  console.log("\n2. Stale / Nonexistent Partner ID Handling:");
  try {
    const fakeId = "00000000-0000-0000-0000-ffffffffffff";
    const partner = await findPartnerById(fakeId);
    assert.strictEqual(partner, null, "Nonexistent partner ID should return null");

    const deleteCheck = await canDeletePartner(fakeId);
    assert.strictEqual(deleteCheck.canDelete, false, "Cannot delete nonexistent partner");
    assert.strictEqual(deleteCheck.reason, "Partner not found", "Expected 'Partner not found' reason");

    const deleteResult = await deletePartner(fakeId);
    assert.strictEqual(deleteResult.success, false, "deletePartner on fake ID must fail gracefully");
    assert(deleteResult.error?.includes("Partner not found"), "Error must state partner not found");
    recordPass("Stale/nonexistent partner IDs handled safely with authoritative validation");
  } catch (err) {
    recordFail("Stale/nonexistent partner ID handling", err);
  }

  // 3. Historical Megbrass Protection & Deletion Safeguards
  console.log("\n3. Historical Megbrass Attribution & Safeguards (b6cb0291-af01-43e3-8b2c-5d13ad5e266f):");
  try {
    const megbrassPartnerId = "b6cb0291-af01-43e3-8b2c-5d13ad5e266f";
    const megbrass = await findPartnerById(megbrassPartnerId);
    assert(megbrass, `Megbrass partner ${megbrassPartnerId} must exist in Supabase`);
    assert.strictEqual(megbrass.email, "kumarahaari@aceassured.com");

    // Check linked sites
    const { data: sites } = await supabaseAdmin
      .from("sites")
      .select("*")
      .eq("partner_id", megbrassPartnerId);
    assert(sites && sites.length === 1, "Megbrass partner must have exactly 1 site bound");
    assert.strictEqual(String(sites[0].ownerrez_listing_site_id), "792965226");

    // Check attributed reservations
    const { data: reservations } = await supabaseAdmin
      .from("reservations")
      .select("*")
      .eq("partner_id", megbrassPartnerId);
    assert(reservations && reservations.length === 3, `Expected 3 attributed reservations, found ${reservations?.length}`);

    // Check commission ledger events
    const { data: ledgerEvents } = await supabaseAdmin
      .from("commission_ledger_events")
      .select("*")
      .eq("partner_id", megbrassPartnerId);
    assert(ledgerEvents && ledgerEvents.length === 3, `Expected 3 ledger events, found ${ledgerEvents?.length}`);

    const totalLedger = ledgerEvents.reduce((sum, e) => sum + Number(e.calculated_commission || 0), 0);
    assert.strictEqual(
      totalLedger.toFixed(2),
      "357.50",
      `Commission ledger total must be exactly $357.50, got $${totalLedger.toFixed(2)}`
    );

    // Test Deletion Blocking Safeguard
    const deleteCheck = await canDeletePartner(megbrassPartnerId);
    assert.strictEqual(deleteCheck.canDelete, false, "canDeletePartner MUST return false for Megbrass");
    assert.strictEqual(deleteCheck.requiresArchive, true, "requiresArchive MUST be true");
    assert(
      deleteCheck.reason?.includes("Cannot delete partner with historical records"),
      `Reason must describe historical records: ${deleteCheck.reason}`
    );

    // Attempting deletePartner directly must also be blocked
    const directDelete = await deletePartner(megbrassPartnerId);
    assert.strictEqual(directDelete.success, false, "deletePartner MUST be blocked");
    assert.strictEqual(directDelete.requiresArchive, true);
    assert(directDelete.error?.includes("destructive deletion is blocked"));

    // Verify row is still intact!
    const rechecked = await findPartnerById(megbrassPartnerId);
    assert(rechecked, "Partner row must remain intact after blocked deletion attempt");
    recordPass("Historical Megbrass partner and $357.50 ledger baseline are strictly preserved and deletion-blocked");
  } catch (err) {
    recordFail("Megbrass safeguards test", err);
  }

  // 4. Partner User Mapping & Login Readiness
  console.log("\n4. Partner Account State & Login Readiness Verification:");
  try {
    const allUsers = await getAllPartnerUsers();
    assert(allUsers.length > 0, "Expected partner users in Supabase");

    // Check user with linked clerk id
    const linkedUser = allUsers.find(u => u.clerkId || (u as any).clerkUserId);
    assert(linkedUser, "Expected at least 1 partner user with linked Clerk ID");

    // Check pending user
    const pendingUser = allUsers.find(u => !u.clerkId && !(u as any).clerkUserId);
    assert(pendingUser, "Expected at least 1 partner user pending Clerk link");

    const linkedCount = allUsers.filter(u => !!(u.clerkUserId || (u as any).clerkId)).length;
    const pendingCount = allUsers.filter(u => !(u.clerkUserId || (u as any).clerkId)).length;
    recordPass(`Login readiness distinguished: ${linkedCount} linked, ${pendingCount} pending`);
  } catch (err) {
    recordFail("Login readiness test", err);
  }

  // 5. Duplicate Partner Email Pre-Check
  console.log("\n5. Duplicate Partner Pre-Check:");
  try {
    const existing = await findPartnerByEmail("kumarahaari@aceassured.com");
    assert(existing, "Expected existing partner for kumarahaari@aceassured.com");
    recordPass("Duplicate partner email pre-check correctly identifies existing partner");
  } catch (err) {
    recordFail("Duplicate partner pre-check", err);
  }

  // 6. Frozen Hostaway Configuration Invariants
  console.log("\n6. Frozen Hostaway Configuration & Safety Invariants:");
  try {
    const hostawayIngestion = process.env.HOSTAWAY_INGESTION_ENABLED ?? "true";
    const hostawayAttribution = process.env.HOSTAWAY_COMMISSION_ATTRIBUTION_ENABLED ?? "false";
    const phase6Settlement = process.env.PHASE6_SETTLEMENT_ENABLED ?? "false";
    const phase6Payouts = process.env.PHASE6_EXTERNAL_PAYOUTS_ENABLED ?? "false";

    assert.strictEqual(hostawayIngestion, "true", "HOSTAWAY_INGESTION_ENABLED must remain true");
    assert.strictEqual(hostawayAttribution, "false", "HOSTAWAY_COMMISSION_ATTRIBUTION_ENABLED must remain false");
    assert.strictEqual(phase6Settlement, "false", "PHASE6_SETTLEMENT_ENABLED must remain false");
    assert.strictEqual(phase6Payouts, "false", "PHASE6_EXTERNAL_PAYOUTS_ENABLED must remain false");

    recordPass("Frozen Hostaway and Phase 6 financial kill switches remain unchanged");
  } catch (err) {
    recordFail("Hostaway safety invariants", err);
  }

  // 7. Route Authorization & Anonymous Access Protection
  console.log("\n7. Route Authorization & Non-Admin Rejection:");
  try {
    const { NextRequest } = await import("next/server");
    const { GET: getPartnersHandler, POST: postPartnersHandler } = await import("../src/app/api/admin/partners/route");
    const { POST: actionPartnersHandler } = await import("../src/app/api/admin/partners/actions/route");

    // Unauthenticated GET /api/admin/partners
    const getRes = await getPartnersHandler(new NextRequest("https://hh-hreviewed.vercel.app/api/admin/partners"));
    assert.strictEqual(getRes.status, 403, "Unauthenticated GET /api/admin/partners must return HTTP 403");

    // Unauthenticated POST /api/admin/partners
    const postRes = await postPartnersHandler(new NextRequest("https://hh-hreviewed.vercel.app/api/admin/partners", {
      method: "POST",
      body: JSON.stringify({ email: "attacker@test.com", contactName: "Attacker" })
    }));
    assert.strictEqual(postRes.status, 403, "Unauthenticated POST /api/admin/partners must return HTTP 403");

    // Unauthenticated POST /api/admin/partners/actions
    const actionRes = await actionPartnersHandler(new NextRequest("https://hh-hreviewed.vercel.app/api/admin/partners/actions", {
      method: "POST",
      body: JSON.stringify({ action: "DELETE", partnerId: "b6cb0291-af01-43e3-8b2c-5d13ad5e266f" })
    }));
    assert.strictEqual(actionRes.status, 403, "Unauthenticated POST /api/admin/partners/actions must return HTTP 403");

    recordPass("Admin partner management routes strictly enforce admin authorization (HTTP 403 on unauthenticated/unauthorized callers)");
  } catch (err) {
    recordFail("Route authorization tests", err);
  }

  console.log("\n------------------------------------------------------------------");
  console.log(`SUMMARY: ${passed} Passed, 0 Failed out of ${total} tests.`);
  console.log("------------------------------------------------------------------\n");
}

runPartnerReconciliationTests().catch(err => {
  console.error("FATAL: Tests failed:", err);
  process.exit(1);
});
