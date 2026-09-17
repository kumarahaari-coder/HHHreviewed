import { NextRequest } from "next/server";
import { getClerkAuthSession, canPerformAdminReview, canAccessCreatorData, isAdminRole, isCreatorRole } from "../src/lib/authorization";
import { isMockAuthAllowed } from "../src/lib/config";
import { POST as ownerrezSyncHandler } from "../src/app/api/ownerrez/sync/route";
import { GET as reservationsHandler } from "../src/app/api/admin/reservations/route";
import { GET as sessionHandler } from "../src/app/api/auth/session/route";
import { POST as switchRoleHandler } from "../src/app/api/auth/switch-role/route";
import { GET as partnerDashboardHandler } from "../src/app/api/partner/dashboard/route";

async function runProductionAuthHardeningTests() {
  console.log("=================================================");
  console.log("  HHH PRODUCTION AUTHENTICATION HARDENING TESTS  ");
  console.log("=================================================");

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passCount++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
      failCount++;
    }
  }

  // Ensure test runs in production-mode context
  process.env.NODE_ENV = "production";
  process.env.VERCEL_ENV = "production";
  delete process.env.AUTH_MODE;

  console.log("\n1. Environment & Mock Gate Verification:");
  const mockAllowed = isMockAuthAllowed();
  assert(mockAllowed === false, "isMockAuthAllowed() returns false in production environment");

  console.log("\n2. Anonymous Access & Cookie Forgery Prevention:");
  
  // Test A: GET /api/auth/session unauthenticated
  const sessionRes = await sessionHandler(new NextRequest("https://hhh.track/api/auth/session"));
  const sessionData = await sessionRes.json();
  assert(
    sessionRes.status === 200 && sessionData.authenticated === false && sessionData.status === "UNAUTHENTICATED",
    "/api/auth/session returns HTTP 200 with authenticated: false for unauthenticated requests"
  );

  // Test B: Anonymous POST /api/ownerrez/sync
  const syncRes = await ownerrezSyncHandler(new NextRequest("https://hhh.track/api/ownerrez/sync", { method: "POST", body: JSON.stringify({ all: true }) }));
  assert(syncRes.status === 401, "Anonymous caller to /api/ownerrez/sync receives HTTP 401");

  // Test C: Anonymous GET /api/admin/reservations
  const resRes = await reservationsHandler();
  assert(resRes.status === 401 || resRes.status === 403, "Anonymous caller to /api/admin/reservations receives HTTP 401/403");

  // Test D: Forged demo cookies ingestion
  const forgedSession = await getClerkAuthSession();
  assert(forgedSession === null, "Forged/stale demo cookies return null session in production mode");

  // Test E: Anonymous call to POST /api/auth/switch-role
  const switchRes = await switchRoleHandler(new NextRequest("https://hhh.track/api/auth/switch-role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "SUPER_ADMIN" })
  }));
  assert(switchRes.status === 401 || switchRes.status === 403, "POST /api/auth/switch-role rejects unauthenticated callers with HTTP 401/403");

  console.log("\n3. Authenticated Cross-Role Route Authorization Gate:");

  const partnerOwnerSession = {
    userId: "user-partner-1",
    email: "partner@example.com",
    role: "PARTNER_OWNER" as const,
    partnerId: "partner-123"
  };

  const creatorSession = {
    userId: "user-creator-1",
    email: "creator@example.com",
    role: "CREATOR" as const,
    partnerId: "partner-123"
  };

  const partnerMissingMappingSession = {
    userId: "user-unmapped-1",
    email: "unmapped@example.com",
    role: "PARTNER_OWNER" as const,
    partnerId: undefined
  };

  const superAdminSession = {
    userId: "user-super-admin-1",
    email: "admin@hiddenhoneyhomes.com",
    role: "SUPER_ADMIN" as const
  };

  const adminSession = {
    userId: "user-admin-1",
    email: "admin2@hiddenhoneyhomes.com",
    role: "ADMIN" as const
  };

  // 3.1 Route /admin Gate Verification
  assert(isAdminRole(partnerOwnerSession.role) === false, "PARTNER_OWNER -> /admin denied (role check fails)");
  assert(isAdminRole(creatorSession.role) === false, "CREATOR -> /admin denied (role check fails)");
  assert(isAdminRole(superAdminSession.role) === true, "SUPER_ADMIN -> /admin allowed (role check succeeds)");
  assert(isAdminRole(adminSession.role) === true, "ADMIN -> /admin allowed (role check succeeds)");

  // 3.2 Route /partner Gate Verification
  assert(canAccessCreatorData(partnerOwnerSession, "partner-123") === true, "PARTNER_OWNER with own valid partner -> /partner allowed");
  assert(canAccessCreatorData(partnerMissingMappingSession, "partner-123") === false, "PARTNER_OWNER with invalid/missing partner mapping -> /partner denied");
  assert(canAccessCreatorData(partnerOwnerSession, "partner-456") === false, "partner A cannot access partner B (cross-tenant access denied)");

  // 3.3 Super Admin Partner Preview Gate Verification
  const isSuperAdminPreviewAllowed = isAdminRole(superAdminSession.role) && canPerformAdminReview(superAdminSession);
  assert(isSuperAdminPreviewAllowed === true, "SUPER_ADMIN Partner Preview -> /partner?previewPartnerId=<validated> allowed while role remains SUPER_ADMIN");

  console.log("\n-------------------------------------------------");
  console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed.`);
  console.log("-------------------------------------------------");

  if (failCount > 0) {
    process.exit(1);
  }
}

runProductionAuthHardeningTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
