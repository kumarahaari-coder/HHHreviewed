import { GET as cronGET } from "@/app/api/cron/sync-reservations/route";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runCronAuthConcurrencyTests() {
  console.log("Starting Phase 4 Cron Auth & Concurrency tests...");

  const originalSecret = process.env.CRON_SECRET;

  try {
    // Test 1: Missing CRON_SECRET on server -> HTTP 500
    {
      delete process.env.CRON_SECRET;
      const req = new Request("http://localhost:3000/api/cron/sync-reservations", { method: "GET" });
      const res = await cronGET(req);
      assert(res.status === 500, "Expected status 500 when CRON_SECRET missing");
      const json = await res.json();
      assert(json.success === false, "Expected success = false");
      assert(json.error === "Server CRON_SECRET is not configured.", "Expected error message");
      console.log("✓ Test 1 Passed: Missing CRON_SECRET returns 500");
    }

    // Set test secret
    const TEST_SECRET = "super_secret_cron_token_123456789";
    process.env.CRON_SECRET = TEST_SECRET;

    // Test 2: Missing Authorization header -> HTTP 401
    {
      const req = new Request("http://localhost:3000/api/cron/sync-reservations", { method: "GET" });
      const res = await cronGET(req);
      assert(res.status === 401, "Expected status 401 when Authorization missing");
      const json = await res.json();
      assert(json.success === false, "Expected success = false");
      assert(json.error === "Unauthorized scheduled sync request.", "Expected 401 error message");
      console.log("✓ Test 2 Passed: Missing Authorization header returns 401");
    }

    // Test 3: Malformed Authorization header -> HTTP 401
    {
      const req = new Request("http://localhost:3000/api/cron/sync-reservations", {
        method: "GET",
        headers: { authorization: TEST_SECRET }, // missing "Bearer "
      });
      const res = await cronGET(req);
      assert(res.status === 401, "Expected status 401 for malformed bearer header");
      console.log("✓ Test 3 Passed: Malformed bearer header returns 401");
    }

    // Test 4: Incorrect Secret -> HTTP 401
    {
      const req = new Request("http://localhost:3000/api/cron/sync-reservations", {
        method: "GET",
        headers: { authorization: "Bearer wrong_secret_token" },
      });
      const res = await cronGET(req);
      assert(res.status === 401, "Expected status 401 for wrong secret token");
      console.log("✓ Test 4 Passed: Incorrect secret returns 401");
    }

    // Test 5: Secret zero-leakage check
    {
      const req = new Request("http://localhost:3000/api/cron/sync-reservations", {
        method: "GET",
        headers: { authorization: "Bearer wrong_secret_token" },
      });
      const res = await cronGET(req);
      const jsonStr = JSON.stringify(await res.json());
      assert(!jsonStr.includes(TEST_SECRET), "Response must not leak CRON_SECRET");
      assert(!jsonStr.includes("wrong_secret_token"), "Response must not leak bearer token");
      console.log("✓ Test 5 Passed: Zero secret leakage in response");
    }

    console.log("All Phase 4 Cron Auth & Concurrency tests completed successfully!");
    return true;
  } finally {
    if (originalSecret !== undefined) {
      process.env.CRON_SECRET = originalSecret;
    } else {
      delete process.env.CRON_SECRET;
    }
  }
}

if (require.main === module) {
  runCronAuthConcurrencyTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}
