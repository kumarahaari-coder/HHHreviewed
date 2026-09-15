import assert from "assert";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/ownerrez/oauth/callback/route";

export async function runOwnerRezOAuthCallbackTests() {
  console.log("=================================================================");
  console.log("  OWNERREZ OAUTH CALLBACK ENDPOINT TEST SUITE                   ");
  console.log("=================================================================\n");

  // Test 1: Empty request fails closed with 400
  {
    console.log("[Test 1] Missing code parameter fails closed with 400...");
    const req = new NextRequest("https://hh-hreviewed.vercel.app/api/ownerrez/oauth/callback");
    const res = await GET(req);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, "bad_request");
    console.log("  ✔ Test 1 Passed: Empty request rejected with 400.\n");
  }

  // Test 2: Error parameter returns 400 with sanitized message
  {
    console.log("[Test 2] OAuth error parameter returns 400...");
    const req = new NextRequest(
      "https://hh-hreviewed.vercel.app/api/ownerrez/oauth/callback?error=access_denied&error_description=User+cancelled"
    );
    const res = await GET(req);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, "access_denied");
    assert.strictEqual(body.message, "User cancelled");
    console.log("  ✔ Test 2 Passed: OAuth error handled safely.\n");
  }

  // Test 3: Valid code and state returns 200 without token exchange
  {
    console.log("[Test 3] Valid code and state returns 200 without token exchange...");
    const req = new NextRequest(
      "https://hh-hreviewed.vercel.app/api/ownerrez/oauth/callback?code=mock_auth_code_12345&state=mock_state_xyz"
    );
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.status, "REGISTERED_PASSIVE");
    assert.strictEqual(body.has_state, true);
    // Ensure raw code is not reflected in output
    assert.strictEqual((body as any).code, undefined);
    console.log("  ✔ Test 3 Passed: Valid OAuth callback acknowledged safely.\n");
  }

  console.log("=================================================================");
  console.log("  ALL OWNERREZ OAUTH CALLBACK TESTS PASSED 100%!                ");
  console.log("=================================================================");
}

if (process.argv[1] && process.argv[1].endsWith("ownerrez_oauth_callback.test.ts")) {
  runOwnerRezOAuthCallbackTests().catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
  });
}
