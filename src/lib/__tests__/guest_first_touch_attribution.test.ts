/**
 * Guest First-Touch Attribution Test Suite
 *
 * Run: npx tsx src/lib/__tests__/guest_first_touch_attribution.test.ts
 *
 * Verifies that a guest's first partner-attributed booking decides every later booking by the same email.
 */

import { normalizeGuestEmail, applyGuestFirstTouchAttribution } from "../hostaway/guest-attribution";
import { HostawayAttributionResult } from "../hostaway/types";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`Assertion failed: ${message}. Expected [${expected}], got [${actual}]`);
}

const RECLAIM = { siteId: "site-reclaim", partnerId: "partner-reclaim" };
const DMOON = { siteId: "site-dmoon", partnerId: "partner-dmoon" };

type Row = Record<string, any>;

/** In-memory Supabase stand-in covering exactly the query shapes the module uses. */
function makeSupabase(reservations: Row[], partners: Row[], failReservations = false) {
  const from = (table: string) => {
    let rows: Row[] = table === "reservations" ? [...reservations] : [...partners];
    const b: any = {
      select: () => b,
      eq: (col: string, val: any) => { rows = rows.filter((r) => r[col] === val); return b; },
      ilike: (col: string, pattern: string) => {
        // PostgREST LIKE: backslash escapes the next character, % and _ are wildcards; case-insensitive.
        let src = "";
        for (let k = 0; k < pattern.length; k++) {
          const ch = pattern[k];
          if (ch === "\\" && k + 1 < pattern.length) { src += pattern[++k].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); continue; }
          if (ch === "%") { src += ".*"; continue; }
          if (ch === "_") { src += "."; continue; }
          src += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
        const re = new RegExp("^" + src + "$", "i");
        rows = rows.filter((r) => typeof r[col] === "string" && re.test(r[col]));
        return b;
      },
      not: (col: string, op: string, val: any) => {
        if (op === "is" && val === null) rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
        return b;
      },
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: any) => resolve(table === "reservations" && failReservations ? { data: null, error: { message: "boom" } } : { data: rows, error: null }),
    };
    return b;
  };
  return { from };
}

const activePartners = [
  { id: RECLAIM.partnerId, status: "active" },
  { id: DMOON.partnerId, status: "ACTIVE" },
];

function own(site?: { siteId: string; partnerId: string }): HostawayAttributionResult {
  return site
    ? { ...site, attributionTier: "ATTRIBUTED", confidenceScore: 100, matchedSignals: [`EXACT_SITE_ID:${site.siteId}`], referralSiteId: site.siteId, classification: "PROVEN_DETERMINISTIC" }
    : { attributionTier: "UNATTRIBUTED", confidenceScore: 0, matchedSignals: [], classification: "REQUIRES_HHH_ATTRIBUTION_BRIDGE" };
}

async function run() {
  console.log("=================================================================");
  console.log("  RUNNING GUEST FIRST-TOUCH ATTRIBUTION TEST SUITE               ");
  console.log("=================================================================\n");

  console.log("[Test 1] Email normalization...");
  assertEqual(normalizeGuestEmail("  User1@Example.ORG "), "user1@example.org", "trim + lowercase");
  assertEqual(normalizeGuestEmail(""), null, "empty");
  assertEqual(normalizeGuestEmail(undefined), null, "undefined");
  assertEqual(normalizeGuestEmail("not-an-email"), null, "malformed");
  assertEqual(normalizeGuestEmail("x@guest.airbnb.com"), null, "airbnb relay is not an identity");
  assertEqual(normalizeGuestEmail("x@example.com"), null, "placeholder domain");
  assertEqual(normalizeGuestEmail("a*b@real.org"), null, "wildcard characters rejected");
  console.log("  ✔ Test 1 Passed.");

  console.log("\n[Test 2] First booking ever: result unchanged...");
  let db = makeSupabase([], activePartners);
  let r = await applyGuestFirstTouchAttribution(own(RECLAIM), "user1@real.org", db);
  assertEqual(r.siteId, RECLAIM.siteId, "keeps own site");
  assert(!r.matchedSignals.includes("GUEST_FIRST_TOUCH_LOCK"), "no lock signal on the first booking");
  console.log("  ✔ Test 2 Passed.");

  console.log("\n[Test 3] Returning guest via ANOTHER website stays with the first partner...");
  const firstViaReclaim = { id: "res-1", guest_email: "user1@real.org", site_id: RECLAIM.siteId, partner_id: RECLAIM.partnerId, booking_date: "2026-01-10" };
  db = makeSupabase([firstViaReclaim], activePartners);
  r = await applyGuestFirstTouchAttribution(own(DMOON), "USER1@real.org", db);
  assertEqual(r.attributionTier, "ATTRIBUTED", "stays attributed");
  assertEqual(r.siteId, RECLAIM.siteId, "credited to Reclaim, not DMoon");
  assertEqual(r.partnerId, RECLAIM.partnerId, "partner is Reclaim's");
  assert(r.matchedSignals.includes("GUEST_FIRST_TOUCH_LOCK"), "lock signal present");
  assert(r.matchedSignals.includes(`OVERRODE_BOOKING_SITE:${DMOON.siteId}`), "records which site was overridden");
  console.log("  ✔ Test 3 Passed.");

  console.log("\n[Test 4] Returning guest with NO attributable website is still credited to the first partner...");
  r = await applyGuestFirstTouchAttribution(own(), "user1@real.org", db);
  assertEqual(r.attributionTier, "ATTRIBUTED", "attributed");
  assertEqual(r.partnerId, RECLAIM.partnerId, "first partner");
  console.log("  ✔ Test 4 Passed.");

  console.log("\n[Test 5] Email match is case-insensitive and literal (underscore is not a wildcard)...");
  db = makeSupabase([{ id: "res-2", guest_email: "user_1@real.org", site_id: RECLAIM.siteId, partner_id: RECLAIM.partnerId, booking_date: "2026-01-10" }], activePartners);
  r = await applyGuestFirstTouchAttribution(own(DMOON), "User_1@Real.org", db);
  assertEqual(r.siteId, RECLAIM.siteId, "matches regardless of case");
  r = await applyGuestFirstTouchAttribution(own(DMOON), "userX1@real.org", db);
  assertEqual(r.siteId, DMOON.siteId, "a different guest whose email differs only at '_' must not match");
  console.log("  ✔ Test 5 Passed.");

  console.log("\n[Test 6] Earlier booking had no partner: the first PARTNER booking wins...");
  db = makeSupabase([{ id: "res-3", guest_email: "user2@real.org", site_id: null, partner_id: null, booking_date: "2026-01-01" }], activePartners);
  r = await applyGuestFirstTouchAttribution(own(DMOON), "user2@real.org", db);
  assertEqual(r.siteId, DMOON.siteId, "guest was still open, so the partner booking keeps its site");
  assert(!r.matchedSignals.includes("GUEST_FIRST_TOUCH_LOCK"), "no lock applied yet");
  console.log("  ✔ Test 6 Passed.");

  console.log("\n[Test 7] Several partner bookings: the earliest decides...");
  db = makeSupabase([
    { id: "res-late", guest_email: "user3@real.org", site_id: DMOON.siteId, partner_id: DMOON.partnerId, booking_date: "2026-03-05" },
    { id: "res-early", guest_email: "user3@real.org", site_id: RECLAIM.siteId, partner_id: RECLAIM.partnerId, booking_date: "2026-01-05" },
  ], activePartners);
  r = await applyGuestFirstTouchAttribution(own(), "user3@real.org", db);
  assertEqual(r.siteId, RECLAIM.siteId, "earliest booking wins");
  assert(r.matchedSignals.includes("LOCKED_FROM_RESERVATION:res-early"), "points at the first booking");
  console.log("  ✔ Test 7 Passed.");

  console.log("\n[Test 8] First partner no longer active: a person decides, nobody else is paid...");
  db = makeSupabase([firstViaReclaim], [{ id: RECLAIM.partnerId, status: "suspended" }, { id: DMOON.partnerId, status: "active" }]);
  r = await applyGuestFirstTouchAttribution(own(DMOON), "user1@real.org", db);
  assertEqual(r.attributionTier, "REVIEW_REQUIRED", "review required");
  assertEqual(r.partnerId, undefined, "no partner assigned");
  console.log("  ✔ Test 8 Passed.");

  console.log("\n[Test 9] Lookup failure fails closed for attributed bookings only...");
  db = makeSupabase([firstViaReclaim], activePartners, true);
  r = await applyGuestFirstTouchAttribution(own(DMOON), "user1@real.org", db);
  assertEqual(r.attributionTier, "REVIEW_REQUIRED", "attributed booking is held for review");
  r = await applyGuestFirstTouchAttribution(own(), "user1@real.org", db);
  assertEqual(r.attributionTier, "UNATTRIBUTED", "unattributed booking is unchanged");
  console.log("  ✔ Test 9 Passed.");

  console.log("\n[Test 10] No usable email: booking keeps its own attribution...");
  db = makeSupabase([firstViaReclaim], activePartners);
  for (const email of [undefined, "", "x@guest.airbnb.com"]) {
    r = await applyGuestFirstTouchAttribution(own(DMOON), email, db);
    assertEqual(r.siteId, DMOON.siteId, `no lock for email ${JSON.stringify(email)}`);
  }
  console.log("  ✔ Test 10 Passed.");

  console.log("\n=================================================================");
  console.log("  ALL 10 GUEST FIRST-TOUCH TESTS PASSED 100%!                    ");
  console.log("=================================================================");
}

run().catch((err) => {
  console.error("\n❌ TEST SUITE FAILED:", err.message);
  process.exit(1);
});
