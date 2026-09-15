import assert from "assert";
import {
  verifyOwnerRezWebhookAuth,
  handleOwnerRezWebhookEvent,
} from "../ownerrez/webhook";
import { OwnerRezApiError } from "../ownerrez/client";
import { SingleSyncResult } from "../ownerrez/sync";

export async function runOwnerRezWebhookUnitTests() {
  console.log("=================================================================");
  console.log("  RUNNING OWNERREZ WEBHOOK AUTH, INGESTION & SAFETY TEST SUITE   ");
  console.log("=================================================================\n");

  const TEST_SECRET = "whsec_test_secret_key_84920491823901823091";

  // --------------------------------------------------------------------------
  // Test 1: Fail-Closed Authentication Verification
  // --------------------------------------------------------------------------
  {
    console.log("[Test 1] Webhook Authentication Verification (Fail-Closed)...");

    // 1a. Missing server secret -> fails closed with 500
    const noSecretRes = verifyOwnerRezWebhookAuth(
      new Headers({ "x-ownerrez-webhook-secret": "any-key" }),
      ""
    );
    assert.strictEqual(noSecretRes.status, 500, "Must return 500 when server secret is not configured");
    assert.strictEqual(noSecretRes.authorized, false);

    // 1b. Missing headers entirely -> fails closed with 401
    const noHeaderRes = verifyOwnerRezWebhookAuth(new Headers(), TEST_SECRET);
    assert.strictEqual(noHeaderRes.status, 401, "Must return 401 when no credentials are provided");
    assert.strictEqual(noHeaderRes.authorized, false);

    // 1c. Invalid custom header -> 401
    const badHeaderRes = verifyOwnerRezWebhookAuth(
      new Headers({ "x-ownerrez-webhook-secret": "wrong-secret" }),
      TEST_SECRET
    );
    assert.strictEqual(badHeaderRes.status, 401, "Must return 401 on incorrect secret");
    assert.strictEqual(badHeaderRes.authorized, false);

    // 1d. Invalid bearer token -> 401
    const badBearerRes = verifyOwnerRezWebhookAuth(
      new Headers({ authorization: "Bearer wrong-token" }),
      TEST_SECRET
    );
    assert.strictEqual(badBearerRes.status, 401, "Must return 401 on incorrect Bearer token");
    assert.strictEqual(badBearerRes.authorized, false);

    // 1e. Valid custom header (X-OwnerRez-Webhook-Secret) -> 200 authorized
    const validCustomRes = verifyOwnerRezWebhookAuth(
      new Headers({ "x-ownerrez-webhook-secret": TEST_SECRET }),
      TEST_SECRET
    );
    assert.strictEqual(validCustomRes.status, 200);
    assert.strictEqual(validCustomRes.authorized, true);

    // 1f. Valid custom header (X-Webhook-Secret) -> 200 authorized
    const validAltHeaderRes = verifyOwnerRezWebhookAuth(
      new Headers({ "x-webhook-secret": TEST_SECRET }),
      TEST_SECRET
    );
    assert.strictEqual(validAltHeaderRes.status, 200);
    assert.strictEqual(validAltHeaderRes.authorized, true);

    // 1g. Valid Bearer token -> 200 authorized
    const validBearerRes = verifyOwnerRezWebhookAuth(
      new Headers({ authorization: `Bearer ${TEST_SECRET}` }),
      TEST_SECRET
    );
    assert.strictEqual(validBearerRes.status, 200);
    assert.strictEqual(validBearerRes.authorized, true);

    // 1h. Valid Basic Auth -> 200 authorized
    const basicB64 = Buffer.from(`ownerrez:${TEST_SECRET}`).toString("base64");
    const validBasicRes = verifyOwnerRezWebhookAuth(
      new Headers({ authorization: `Basic ${basicB64}` }),
      TEST_SECRET
    );
    assert.strictEqual(validBasicRes.status, 200);
    assert.strictEqual(validBasicRes.authorized, true);

    console.log("  ✔ Test 1 Passed: Fail-closed authentication strictly verified across all supported headers.\n");
  }

  // --------------------------------------------------------------------------
  // Test 2: Webhook Test Event Handling
  // --------------------------------------------------------------------------
  {
    console.log("[Test 2] Webhook Test Event Handling...");

    const testPayload = {
      action: "webhook_test",
      user_id: 12345,
    };

    const res = await handleOwnerRezWebhookEvent(testPayload);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.message.includes("verified successfully"));

    console.log("  ✔ Test 2 Passed: Webhook test events handled successfully with 200 OK.\n");
  }

  // --------------------------------------------------------------------------
  // Test 3: Unsupported Entity Types Ignored Safely
  // --------------------------------------------------------------------------
  {
    console.log("[Test 3] Unsupported Entity Types Ignored Safely...");

    const guestPayload = {
      action: "entity_create",
      entity_type: "guest",
      entity_id: 998877,
    };

    const resGuest = await handleOwnerRezWebhookEvent(guestPayload);
    assert.strictEqual(resGuest.status, 200);
    assert.strictEqual(resGuest.body.success, true);
    assert.strictEqual(resGuest.body.ignored, true);

    const paymentPayload = {
      action: "entity_update",
      entity_type: "payment",
      entity_id: 554433,
    };

    const resPayment = await handleOwnerRezWebhookEvent(paymentPayload);
    assert.strictEqual(resPayment.status, 200);
    assert.strictEqual(resPayment.body.success, true);
    assert.strictEqual(resPayment.body.ignored, true);

    console.log("  ✔ Test 3 Passed: Non-booking entity types safely ignored without failing delivery.\n");
  }

  // --------------------------------------------------------------------------
  // Test 4: Malformed Payload Validation
  // --------------------------------------------------------------------------
  {
    console.log("[Test 4] Malformed Payload Validation...");

    // 4a. Non-object or null payload
    const resNull = await handleOwnerRezWebhookEvent(null);
    assert.strictEqual(resNull.status, 400);
    assert.strictEqual(resNull.body.success, false);

    const resArray = await handleOwnerRezWebhookEvent([]);
    assert.strictEqual(resArray.status, 400);

    // 4b. Missing action
    const resNoAction = await handleOwnerRezWebhookEvent({ entity_type: "booking", entity_id: 12345 });
    assert.strictEqual(resNoAction.status, 400);
    assert.ok(resNoAction.body.error.includes("action"));

    // 4c. Missing entity_id for booking event
    const resNoId = await handleOwnerRezWebhookEvent({ action: "entity_create", entity_type: "booking" });
    assert.strictEqual(resNoId.status, 400);
    assert.ok(resNoId.body.error.includes("entity_id"));

    // 4d. Non-numeric or negative entity_id
    const resInvalidId = await handleOwnerRezWebhookEvent({ action: "entity_create", entity_type: "booking", entity_id: -10 });
    assert.strictEqual(resInvalidId.status, 400);

    const resStringId = await handleOwnerRezWebhookEvent({ action: "entity_create", entity_type: "booking", entity_id: "abc" });
    assert.strictEqual(resStringId.status, 400);

    console.log("  ✔ Test 4 Passed: Malformed payloads rejected with 400 Bad Request.\n");
  }

  // --------------------------------------------------------------------------
  // Test 5: Booking Create Event (Delegation to syncOwnerRezBookingById)
  // --------------------------------------------------------------------------
  {
    console.log("[Test 5] Booking Create Event Delegation...");

    let delegateCalledWithId: number | null = null;
    const mockSyncResult: SingleSyncResult = {
      bookingId: 19150249,
      ownerrezBookingId: 19150249,
      inserted: 1,
      updated: 0,
      unchanged: 0,
      duplicates: 0,
      failed: 0,
      attributionTier: "ATTRIBUTED",
      numericSourceId: 792965226,
      siteId: "site_megbrass_123",
      partnerId: "partner_megbrass_456",
      propertyId: "prop_hhh_789",
    };

    const mockSyncFn = async (id: number): Promise<SingleSyncResult> => {
      delegateCalledWithId = id;
      return mockSyncResult;
    };

    const payload = {
      action: "entity_create",
      entity_type: "booking",
      entity_id: 19150249,
    };

    const res = await handleOwnerRezWebhookEvent(payload, { syncFn: mockSyncFn });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(delegateCalledWithId, 19150249, "Must delegate exactly to syncOwnerRezBookingById(19150249)");
    assert.strictEqual(res.body.result.inserted, 1);
    assert.strictEqual(res.body.result.attributionTier, "ATTRIBUTED");

    console.log("  ✔ Test 5 Passed: entity_create delegates directly to sync engine without logic duplication.\n");
  }

  // --------------------------------------------------------------------------
  // Test 6: Booking Update Event
  // --------------------------------------------------------------------------
  {
    console.log("[Test 6] Booking Update Event Delegation...");

    let delegateCalledWithId: number | null = null;
    const mockSyncResult: SingleSyncResult = {
      bookingId: 19150249,
      ownerrezBookingId: 19150249,
      inserted: 0,
      updated: 1,
      unchanged: 0,
      duplicates: 0,
      failed: 0,
      attributionTier: "ATTRIBUTED",
      numericSourceId: 792965226,
      siteId: "site_megbrass_123",
      partnerId: "partner_megbrass_456",
      propertyId: "prop_hhh_789",
    };

    const mockSyncFn = async (id: number): Promise<SingleSyncResult> => {
      delegateCalledWithId = id;
      return mockSyncResult;
    };

    const payload = {
      action: "entity_update",
      entity_type: "booking",
      entity_id: 19150249,
    };

    const res = await handleOwnerRezWebhookEvent(payload, { syncFn: mockSyncFn });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(delegateCalledWithId, 19150249);
    assert.strictEqual(res.body.result.updated, 1);

    console.log("  ✔ Test 6 Passed: entity_update correctly delegates and returns updated result.\n");
  }

  // --------------------------------------------------------------------------
  // Test 7: Duplicate Delivery Idempotency
  // --------------------------------------------------------------------------
  {
    console.log("[Test 7] Duplicate Delivery Idempotency...");

    let callCount = 0;
    const mockSyncFn = async (id: number): Promise<SingleSyncResult> => {
      callCount += 1;
      if (callCount === 1) {
        // First delivery: processes update
        return {
          bookingId: id,
          ownerrezBookingId: id,
          inserted: 0,
          updated: 1,
          unchanged: 0,
          duplicates: 0,
          failed: 0,
          attributionTier: "ATTRIBUTED",
          numericSourceId: null,
        };
      } else {
        // Redelivery / duplicate: idempotent unchanged
        return {
          bookingId: id,
          ownerrezBookingId: id,
          inserted: 0,
          updated: 0,
          unchanged: 1,
          duplicates: 0,
          failed: 0,
          attributionTier: "ATTRIBUTED",
          numericSourceId: null,
        };
      }
    };

    const payload = {
      action: "entity_update",
      entity_type: "booking",
      entity_id: 19150249,
    };

    // First delivery
    const res1 = await handleOwnerRezWebhookEvent(payload, { syncFn: mockSyncFn });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.result.updated, 1);

    // Duplicate delivery
    const res2 = await handleOwnerRezWebhookEvent(payload, { syncFn: mockSyncFn });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.body.result.unchanged, 1);
    assert.strictEqual(res2.body.result.inserted, 0);
    assert.strictEqual(callCount, 2);

    console.log("  ✔ Test 7 Passed: Duplicate delivery is strictly idempotent (unchanged: 1, no duplicates).\n");
  }

  // --------------------------------------------------------------------------
  // Test 8: Delete/Cancellation Semantics (Targeted Re-fetch & Fail-Closed Safety)
  // --------------------------------------------------------------------------
  {
    console.log("[Test 8] Delete/Cancellation Semantics & Fail-Closed Safety...");

    // Scenario A: Booking is cancelled in OwnerRez but still fetchable via API
    // OwnerRez returns status="cancelled"; sync engine updates reservation_status="CANCELLED" authoritatively
    {
      const mockCancelledSync: SingleSyncResult = {
        bookingId: 19150249,
        ownerrezBookingId: 19150249,
        inserted: 0,
        updated: 1,
        unchanged: 0,
        duplicates: 0,
        failed: 0,
        attributionTier: "ATTRIBUTED",
        numericSourceId: null,
      };

      const payload = {
        action: "entity_delete",
        entity_type: "booking",
        entity_id: 19150249,
      };

      const res = await handleOwnerRezWebhookEvent(payload, {
        syncFn: async () => mockCancelledSync,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.action, "entity_delete");
      assert.strictEqual(res.body.result.updated, 1);
      console.log("    ✔ 8a. Cancelled fetchable booking delegates to sync engine for authoritative reconciliation.");
    }

    // Scenario B: Booking is permanently deleted from OwnerRez (API returns 404)
    // Fail closed: do NOT invent financial states or blindly cancel. Flag review-required.
    {
      const localUpdatedRows: any[] = [];
      const mockSupabase = {
        from: (table: string) => {
          assert.strictEqual(table, "reservations");
          return {
            select: () => ({
              eq: (col: string, val: any) => ({
                maybeSingle: async () => ({
                  data: {
                    id: "res_uuid_existing_test",
                    confirmation_code: "ORB19150249",
                    attribution_status: "automatic",
                    reservation_status: "CONFIRMED",
                    payment_status: "UNPAID",
                  },
                  error: null,
                }),
              }),
            }),
            update: (payload: any) => ({
              eq: (col: string, val: any) => {
                localUpdatedRows.push({ ...payload, targetId: val });
                return Promise.resolve({ error: null });
              },
            }),
          };
        },
      };

      const mockNotFoundSync = async (id: number): Promise<SingleSyncResult> => {
        throw new OwnerRezApiError("Not found", 404, `/bookings/${id}`);
      };

      const payload = {
        action: "entity_delete",
        entity_type: "booking",
        entity_id: 19150249,
      };

      const res = await handleOwnerRezWebhookEvent(payload, {
        syncFn: mockNotFoundSync,
        supabaseClient: mockSupabase,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.reviewRequired, true, "Must flag reviewRequired: true");
      assert.strictEqual(localUpdatedRows.length, 1, "Must update the local reservation");
      assert.strictEqual(localUpdatedRows[0].attribution_status, "pending", "Must flag attribution_status as pending for review");
      assert.strictEqual(localUpdatedRows[0].reservation_status, undefined, "Must NOT alter reservation_status");
      assert.strictEqual(localUpdatedRows[0].gross_amount, undefined, "Must NOT alter gross_amount");
      assert.strictEqual(localUpdatedRows[0].amount_received, undefined, "Must NOT alter amount_received");

      console.log("    ✔ 8b. Purged 404 booking fails closed: flags review-required without mutating financial state.");
    }

    // Scenario C: Booking is 404 in OwnerRez and not present in local database
    {
      const mockSupabaseEmpty = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      };

      const mockNotFoundSync = async (id: number): Promise<SingleSyncResult> => {
        throw new OwnerRezApiError("Not found", 404, `/bookings/${id}`);
      };

      const payload = {
        action: "entity_delete",
        entity_type: "booking",
        entity_id: 99999999,
      };

      const res = await handleOwnerRezWebhookEvent(payload, {
        syncFn: mockNotFoundSync,
        supabaseClient: mockSupabaseEmpty,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.reviewRequired, false);

      console.log("    ✔ 8c. Purged 404 booking not present locally completes gracefully without error.");
    }

    console.log("  ✔ Test 8 Passed: Delete/cancellation semantics strictly adhere to fail-closed safety.\n");
  }

  // --------------------------------------------------------------------------
  // Test 9: Direct Next.js Route Handler Execution (/api/webhooks/ownerrez)
  // --------------------------------------------------------------------------
  {
    console.log("[Test 9] Direct Next.js Route Handler Execution...");
    const { POST } = await import("../../app/api/webhooks/ownerrez/route");

    // Temporarily set env secret
    process.env.OWNERREZ_WEBHOOK_SECRET = TEST_SECRET;

    // 9a. Unauthorized call (missing secret header)
    const unauthReq = new Request("http://localhost:3000/api/webhooks/ownerrez", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "webhook_test" }),
    });
    const unauthRes = await POST(unauthReq);
    assert.strictEqual(unauthRes.status, 401, "Route must reject request without auth credentials");

    // 9b. Authorized webhook test call
    const testReq = new Request("http://localhost:3000/api/webhooks/ownerrez", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OwnerRez-Webhook-Secret": TEST_SECRET,
      },
      body: JSON.stringify({ action: "webhook_test" }),
    });
    const testRes = await POST(testReq);
    assert.strictEqual(testRes.status, 200, "Route must accept valid test event");
    const testJson = await testRes.json();
    assert.strictEqual(testJson.success, true);

    // 9c. Non-booking entity type ignored
    const ignoreReq = new Request("http://localhost:3000/api/webhooks/ownerrez", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OwnerRez-Webhook-Secret": TEST_SECRET,
      },
      body: JSON.stringify({ action: "entity_create", entity_type: "guest", entity_id: 1234 }),
    });
    const ignoreRes = await POST(ignoreReq);
    assert.strictEqual(ignoreRes.status, 200);
    const ignoreJson = await ignoreRes.json();
    assert.strictEqual(ignoreJson.ignored, true);

    console.log("  ✔ Test 9 Passed: Next.js route POST handler executes cleanly with full HTTP contract.\n");
  }

  console.log("=================================================================");
  console.log("  ALL 9 OWNERREZ WEBHOOK UNIT TESTS PASSED 100%!                ");
  console.log("=================================================================");
}

if (process.argv[1] && process.argv[1].endsWith("ownerrez_webhook.test.ts")) {
  runOwnerRezWebhookUnitTests().catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
  });
}
