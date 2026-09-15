import assert from "assert";
import { executeSafeInitialAccrual, SingleAccrualResult } from "../ownerrez/sync";
import { executeSafeReconciliation } from "../ownerrez/sync";
import { handleOwnerRezWebhookEvent } from "../ownerrez/webhook";

/**
 * In-Memory Mock Database for Synthetic Staging Tests
 */
function createMockSupabase() {
  const ledgerRows: any[] = [];
  const commissionRules: any[] = [
    {
      id: "rule_synth_10pct",
      partner_id: "partner_synth_01",
      site_id: "site_synth_01",
      rule_type: "percentage",
      percentage: 10.0,
      fixed_amount: null,
      status: "active",
      created_at: new Date().toISOString(),
    },
  ];
  const reservations: any[] = [];
  const attributions: any[] = [];

  return {
    _state: { ledgerRows, commissionRules, reservations, attributions },
    from: (table: string) => {
      switch (table) {
        case "commission_ledger_events":
          return {
            select: () => ({
              eq: (col1: string, val1: any) => ({
                eq: (col2: string, val2: any) => ({
                  maybeSingle: async () => {
                    const row = ledgerRows.find((r) => r[col1] === val1 && r[col2] === val2);
                    return { data: row || null, error: null };
                  },
                  then: (resolve: any) => {
                    const rows = ledgerRows.filter((r) => r[col1] === val1 && r[col2] === val2);
                    resolve({ data: rows, error: null });
                  },
                }),
                maybeSingle: async () => {
                  const row = ledgerRows.find((r) => r[col1] === val1);
                  return { data: row || null, error: null };
                },
                then: (resolve: any) => {
                  const rows = ledgerRows.filter((r) => r[col1] === val1);
                  resolve({ data: rows, error: null });
                },
              }),
            }),
            insert: (payload: any) => {
              // Check unique idempotency_key
              const collision = ledgerRows.find((r) => r.idempotency_key === payload.idempotency_key);
              if (collision) {
                return {
                  select: () => ({
                    single: async () => {
                      const err: any = new Error("Unique constraint violation");
                      err.code = "23505";
                      return { data: null, error: err };
                    },
                  }),
                };
              }
              const newRow = {
                id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                ...payload,
                created_at: new Date().toISOString(),
              };
              ledgerRows.push(newRow);
              return {
                select: () => ({
                  single: async () => ({ data: newRow, error: null }),
                }),
              };
            },
          };

        case "commission_rules":
          return {
            select: () => ({
              eq: (col1: string, val1: any) => ({
                eq: (col2: string, val2: any) => ({
                  eq: (col3: string, val3: any) => ({
                    maybeSingle: async () => {
                      const row = commissionRules.find(
                        (r) => r[col1] === val1 && r[col2] === val2 && r[col3] === val3
                      );
                      return { data: row || null, error: null };
                    },
                  }),
                }),
                is: (col2: string, val2: any) => ({
                  eq: (col3: string, val3: any) => ({
                    maybeSingle: async () => {
                      const row = commissionRules.find(
                        (r) => r[col1] === val1 && (val2 === null ? r[col2] == null : r[col2] === val2) && r[col3] === val3
                      );
                      return { data: row || null, error: null };
                    },
                  }),
                }),
              }),
            }),
          };

        case "reservations":
          return {
            select: () => ({
              eq: (col: string, val: any) => ({
                single: async () => {
                  const row = reservations.find((r) => r[col] === val);
                  if (!row) return { data: null, error: { message: "Not found" } };
                  return { data: row, error: null };
                },
                maybeSingle: async () => {
                  const row = reservations.find((r) => r[col] === val);
                  return { data: row || null, error: null };
                },
              }),
            }),
            update: (payload: any) => ({
              eq: (col: string, val: any) => {
                const row = reservations.find((r) => r[col] === val);
                if (row) Object.assign(row, payload);
                return Promise.resolve({ error: null });
              },
            }),
          };

        default:
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          };
      }
    },
  };
}

export async function runAutomaticAccrualUnitTests() {
  console.log("=================================================================");
  console.log("  PHASE 6: AUTOMATIC INITIAL ACCRUAL LIFECYCLE TEST SUITE       ");
  console.log("=================================================================\n");

  // --------------------------------------------------------------------------
  // Test 1: New attributed unpaid booking -> exactly one INITIAL_ACCRUAL
  // --------------------------------------------------------------------------
  {
    console.log("[Test 1] New attributed unpaid booking -> exactly one INITIAL_ACCRUAL...");
    const mockSupabase = createMockSupabase();

    const mockBooking: any = {
      id: 9911001,
      charges: [
        { type: "rent", amount: 1200.0, description: "Nightly accommodation" },
        { type: "clean", amount: 150.0, description: "Cleaning fee" },
        { type: "tax", amount: 125.0, description: "Lodging taxes" },
      ],
      total_amount: 1475.0,
      total_paid: 0.0,
      total_owed: 1475.0,
      arrival: "2026-10-01",
      departure: "2026-10-05",
    };

    const res = await executeSafeInitialAccrual({
      reservationId: "res_synth_001",
      booking: mockBooking,
      attributionTier: "ATTRIBUTED",
      resolvedPartnerId: "partner_synth_01",
      resolvedSiteId: "site_synth_01",
      bookingChannel: "direct",
      grossAmount: 1475.0,
      cleaningFee: 150.0,
      serviceFee: 0.0,
      taxesAmount: 125.0,
      supabaseClient: mockSupabase,
    });

    assert.strictEqual(res.status, "ACCRUAL_CREATED");
    assert.strictEqual(res.calculatedCommission, 120.0); // 10% of 1200.00
    assert.strictEqual(res.commissionRuleId, "rule_synth_10pct");
    assert.strictEqual(res.idempotencyKey, "evt_accrual_res_synth_001");

    // Verify ledger in database
    const rows = mockSupabase._state.ledgerRows;
    assert.strictEqual(rows.length, 1, "Exactly one ledger row must be created");
    assert.strictEqual(rows[0].event_type, "INITIAL_ACCRUAL");
    assert.strictEqual(rows[0].delta_amount, 0.0, "INITIAL_ACCRUAL.delta_amount must remain exactly 0.00");
    assert.strictEqual(rows[0].calculated_commission, 120.0);
    assert.strictEqual(rows[0].partner_id, "partner_synth_01");
    assert.strictEqual(rows[0].site_id, "site_synth_01");
    assert.strictEqual(rows[0].reservation_id, "res_synth_001");
    assert.strictEqual(rows[0].booking_channel, "direct");
    assert.strictEqual(rows[0].provider_booking_id, "9911001");
    assert.strictEqual(rows[0].metadata.commissionable_base, 1200.0);
    assert.strictEqual(rows[0].metadata.gross_amount, 1475.0);

    console.log("  ✔ Test 1 Passed: Exactly one INITIAL_ACCRUAL created with delta_amount=0.00 and snapshot.\n");
  }

  // --------------------------------------------------------------------------
  // Test 2: Same booking synced repeatedly -> still exactly one accrual
  // --------------------------------------------------------------------------
  {
    console.log("[Test 2] Same booking synced repeatedly -> still exactly one accrual...");
    const mockSupabase = createMockSupabase();

    const mockBooking: any = {
      id: 9911002,
      charges: [{ type: "rent", amount: 1000.0 }],
      total_amount: 1000.0,
    };

    // First ingestion
    const res1 = await executeSafeInitialAccrual({
      reservationId: "res_synth_002",
      booking: mockBooking,
      attributionTier: "ATTRIBUTED",
      resolvedPartnerId: "partner_synth_01",
      resolvedSiteId: "site_synth_01",
      bookingChannel: "direct",
      grossAmount: 1000.0,
      cleaningFee: 0.0,
      serviceFee: 0.0,
      taxesAmount: 0.0,
      supabaseClient: mockSupabase,
    });
    assert.strictEqual(res1.status, "ACCRUAL_CREATED");
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 1);

    // Second sync (cron, manual refresh, etc.)
    const res2 = await executeSafeInitialAccrual({
      reservationId: "res_synth_002",
      booking: mockBooking,
      attributionTier: "ATTRIBUTED",
      resolvedPartnerId: "partner_synth_01",
      resolvedSiteId: "site_synth_01",
      bookingChannel: "direct",
      grossAmount: 1000.0,
      cleaningFee: 0.0,
      serviceFee: 0.0,
      taxesAmount: 0.0,
      supabaseClient: mockSupabase,
    });
    assert.strictEqual(res2.status, "ALREADY_ACCRUED");
    assert.strictEqual(res2.calculatedCommission, 100.0);
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 1, "Must not create duplicate accrual on repeat sync");

    // Third sync
    const res3 = await executeSafeInitialAccrual({
      reservationId: "res_synth_002",
      booking: mockBooking,
      attributionTier: "ATTRIBUTED",
      resolvedPartnerId: "partner_synth_01",
      resolvedSiteId: "site_synth_01",
      bookingChannel: "direct",
      grossAmount: 1000.0,
      cleaningFee: 0.0,
      serviceFee: 0.0,
      taxesAmount: 0.0,
      supabaseClient: mockSupabase,
    });
    assert.strictEqual(res3.status, "ALREADY_ACCRUED");
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 1);

    console.log("  ✔ Test 2 Passed: Repeated syncs return ALREADY_ACCRUED with zero duplicate ledger writes.\n");
  }

  // --------------------------------------------------------------------------
  // Test 3: Same booking delivered repeatedly by webhook -> still exactly one accrual
  // --------------------------------------------------------------------------
  {
    console.log("[Test 3] Same booking delivered repeatedly by webhook -> still exactly one accrual...");
    const mockSupabase = createMockSupabase();

    let accrualEventsCount = 0;
    const mockSyncFn = async (id: number) => {
      const accrualRes = await executeSafeInitialAccrual({
        reservationId: `res_synth_webhook_${id}`,
        booking: { id, charges: [{ type: "rent", amount: 800.0 }], total_amount: 800.0 } as any,
        attributionTier: "ATTRIBUTED",
        resolvedPartnerId: "partner_synth_01",
        resolvedSiteId: "site_synth_01",
        bookingChannel: "direct",
        grossAmount: 800.0,
        cleaningFee: 0,
        serviceFee: 0,
        taxesAmount: 0,
        supabaseClient: mockSupabase,
      });
      if (accrualRes.status === "ACCRUAL_CREATED") accrualEventsCount += 1;
      return {
        bookingId: id,
        ownerrezBookingId: id,
        inserted: accrualRes.status === "ACCRUAL_CREATED" ? 1 : 0,
        updated: accrualRes.status === "ALREADY_ACCRUED" ? 1 : 0,
        unchanged: 0,
        duplicates: 0,
        failed: 0,
        attributionTier: "ATTRIBUTED" as const,
        numericSourceId: 792965226,
        initialAccrual: accrualRes,
      };
    };

    const payload = {
      action: "entity_create",
      entity_type: "booking",
      entity_id: 9911003,
    };

    // First webhook delivery
    const wh1 = await handleOwnerRezWebhookEvent(payload, { syncFn: mockSyncFn, supabaseClient: mockSupabase });
    assert.strictEqual(wh1.status, 200);
    assert.strictEqual(wh1.body.result.initialAccrual.status, "ACCRUAL_CREATED");
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 1);

    // Redelivery / retry 1
    const wh2 = await handleOwnerRezWebhookEvent(payload, { syncFn: mockSyncFn, supabaseClient: mockSupabase });
    assert.strictEqual(wh2.status, 200);
    assert.strictEqual(wh2.body.result.initialAccrual.status, "ALREADY_ACCRUED");
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 1);

    // Redelivery / retry 2
    const wh3 = await handleOwnerRezWebhookEvent(payload, { syncFn: mockSyncFn, supabaseClient: mockSupabase });
    assert.strictEqual(wh3.status, 200);
    assert.strictEqual(wh3.body.result.initialAccrual.status, "ALREADY_ACCRUED");
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 1);
    assert.strictEqual(accrualEventsCount, 1);

    console.log("  ✔ Test 3 Passed: Webhook retries are strictly idempotent (accrual count = 1).\n");
  }

  // --------------------------------------------------------------------------
  // Test 4: Active commission rule changes after booking -> historical accrual remains unchanged
  // --------------------------------------------------------------------------
  {
    console.log("[Test 4] Active commission rule changes after booking -> historical accrual unchanged...");
    const mockSupabase = createMockSupabase();

    const mockBooking: any = {
      id: 9911004,
      charges: [{ type: "rent", amount: 1000.0 }],
      total_amount: 1000.0,
    };

    // Ingestion under original 10% rule -> $100 accrual
    const res1 = await executeSafeInitialAccrual({
      reservationId: "res_synth_004",
      booking: mockBooking,
      attributionTier: "ATTRIBUTED",
      resolvedPartnerId: "partner_synth_01",
      resolvedSiteId: "site_synth_01",
      bookingChannel: "direct",
      grossAmount: 1000.0,
      cleaningFee: 0.0,
      serviceFee: 0.0,
      taxesAmount: 0.0,
      supabaseClient: mockSupabase,
    });
    assert.strictEqual(res1.status, "ACCRUAL_CREATED");
    assert.strictEqual(res1.calculatedCommission, 100.0);

    // Active commission rule is later modified to 25% (or replaced)
    mockSupabase._state.commissionRules[0].percentage = 25.0;
    mockSupabase._state.commissionRules[0].id = "rule_synth_25pct";

    // Resyncing booking after rule change
    const res2 = await executeSafeInitialAccrual({
      reservationId: "res_synth_004",
      booking: mockBooking,
      attributionTier: "ATTRIBUTED",
      resolvedPartnerId: "partner_synth_01",
      resolvedSiteId: "site_synth_01",
      bookingChannel: "direct",
      grossAmount: 1000.0,
      cleaningFee: 0.0,
      serviceFee: 0.0,
      taxesAmount: 0.0,
      supabaseClient: mockSupabase,
    });

    assert.strictEqual(res2.status, "ALREADY_ACCRUED");
    assert.strictEqual(res2.calculatedCommission, 100.0, "Historical accrual calculation must remain $100.00");
    assert.strictEqual(mockSupabase._state.ledgerRows[0].calculated_commission, 100.0);
    assert.strictEqual(mockSupabase._state.ledgerRows[0].commission_rule_id, "rule_synth_10pct");
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 1);

    console.log("  ✔ Test 4 Passed: Rule changes do not mutate historical snapshot (stays $100.00 under rule_synth_10pct).\n");
  }

  // --------------------------------------------------------------------------
  // Test 5: Unmapped booking -> zero accruals and review-required
  // --------------------------------------------------------------------------
  {
    console.log("[Test 5] Unmapped booking -> zero accruals and review-required...");
    const mockSupabase = createMockSupabase();

    const mockBooking: any = {
      id: 9911005,
      charges: [{ type: "rent", amount: 1500.0 }],
      total_amount: 1500.0,
    };

    // Unattributed booking
    const resUnattr = await executeSafeInitialAccrual({
      reservationId: "res_synth_005",
      booking: mockBooking,
      attributionTier: "UNATTRIBUTED",
      resolvedPartnerId: null,
      resolvedSiteId: null,
      bookingChannel: "direct",
      grossAmount: 1500.0,
      cleaningFee: 0.0,
      serviceFee: 0.0,
      taxesAmount: 0.0,
      supabaseClient: mockSupabase,
    });
    assert.strictEqual(resUnattr.status, "NOT_ATTRIBUTED");
    assert.strictEqual(resUnattr.attempted, false);
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 0);

    // Review required booking
    const resReview = await executeSafeInitialAccrual({
      reservationId: "res_synth_005_review",
      booking: mockBooking,
      attributionTier: "REVIEW_REQUIRED",
      resolvedPartnerId: "partner_synth_01",
      resolvedSiteId: null,
      bookingChannel: "direct",
      grossAmount: 1500.0,
      cleaningFee: 0.0,
      serviceFee: 0.0,
      taxesAmount: 0.0,
      supabaseClient: mockSupabase,
    });
    assert.strictEqual(resReview.status, "NOT_ATTRIBUTED");
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 0);

    console.log("  ✔ Test 5 Passed: Unmapped and review-required bookings produce zero accruals.\n");
  }

  // --------------------------------------------------------------------------
  // Test 6: Missing/ambiguous commission rule -> zero accruals and review-required
  // --------------------------------------------------------------------------
  {
    console.log("[Test 6] Missing/ambiguous commission rule -> zero accruals and review-required...");
    const mockSupabase = createMockSupabase();

    const mockBooking: any = {
      id: 9911006,
      charges: [{ type: "rent", amount: 2000.0 }],
      total_amount: 2000.0,
    };

    // Partner with no commission rules configured in database
    const resNoRule = await executeSafeInitialAccrual({
      reservationId: "res_synth_006",
      booking: mockBooking,
      attributionTier: "ATTRIBUTED",
      resolvedPartnerId: "partner_with_no_rules",
      resolvedSiteId: "site_with_no_rules",
      bookingChannel: "direct",
      grossAmount: 2000.0,
      cleaningFee: 0.0,
      serviceFee: 0.0,
      taxesAmount: 0.0,
      supabaseClient: mockSupabase,
    });

    assert.strictEqual(resNoRule.status, "NO_ACTIVE_RULE");
    assert.strictEqual(resNoRule.calculatedCommission, 0);
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 0, "Zero ledger rows must be created when rule is missing");

    console.log("  ✔ Test 6 Passed: Missing commission rule fails closed with zero accruals.\n");
  }

  // --------------------------------------------------------------------------
  // Test 7: Fully paid booking after automatic accrual -> reconciliation uses that accrual and creates PAYMENT_REALIZED
  // --------------------------------------------------------------------------
  {
    console.log("[Test 7] Fully paid booking after automatic accrual -> creates PAYMENT_REALIZED...");
    const mockSupabase = createMockSupabase();

    const reservationId = "res_synth_007";
    const mockBooking: any = {
      id: 9911007,
      charges: [{ type: "rent", amount: 1500.0 }],
      total_amount: 1500.0,
    };

    // Step 1: Automatic Initial Accrual at Ingestion
    const accrualRes = await executeSafeInitialAccrual({
      reservationId,
      booking: mockBooking,
      attributionTier: "ATTRIBUTED",
      resolvedPartnerId: "partner_synth_01",
      resolvedSiteId: "site_synth_01",
      bookingChannel: "direct",
      grossAmount: 1500.0,
      cleaningFee: 0.0,
      serviceFee: 0.0,
      taxesAmount: 0.0,
      supabaseClient: mockSupabase,
    });
    assert.strictEqual(accrualRes.status, "ACCRUAL_CREATED");
    assert.strictEqual(accrualRes.calculatedCommission, 150.0); // 10% of 1500.00
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 1);
    assert.strictEqual(mockSupabase._state.ledgerRows[0].event_type, "INITIAL_ACCRUAL");

    // Add reservation row in mock DB (now fully paid)
    mockSupabase._state.reservations.push({
      id: reservationId,
      gross_amount: 1500.0,
      amount_received: 1500.0,
      payment_status: "PAID",
      reservation_status: "CONFIRMED",
      refund_amount: 0.0,
      partner_id: "partner_synth_01",
      site_id: "site_synth_01",
      platform: "direct",
      ownerrez_booking_id: 9911007,
    });

    // Step 2: Active commission rule in DB changes to 50% AFTER accrual was created
    mockSupabase._state.commissionRules[0].percentage = 50.0;

    // Step 3: Run payment reconciliation
    const reconRes = await executeSafeReconciliation(reservationId, mockSupabase);

    assert.strictEqual(reconRes.status, "REALIZED");
    assert.strictEqual(reconRes.rowsCreated, 1);
    assert.strictEqual(reconRes.realizedAmount, 150.0, "Must strictly inherit $150.00 from historical accrual, NOT 50% active rule ($750.00)");

    // Check ledger state
    const allEvents = mockSupabase._state.ledgerRows;
    assert.strictEqual(allEvents.length, 2, "Must contain exactly 1 INITIAL_ACCRUAL and 1 PAYMENT_REALIZED");
    const accrualEvent = allEvents.find((e) => e.event_type === "INITIAL_ACCRUAL");
    const realizedEvent = allEvents.find((e) => e.event_type === "PAYMENT_REALIZED");

    assert.ok(accrualEvent);
    assert.strictEqual(accrualEvent.delta_amount, 0.0);
    assert.strictEqual(accrualEvent.calculated_commission, 150.0);

    assert.ok(realizedEvent);
    assert.strictEqual(realizedEvent.delta_amount, 150.0);
    assert.strictEqual(realizedEvent.calculated_commission, 150.0);
    assert.strictEqual(realizedEvent.idempotency_key, `evt_realized_${reservationId}_full`);

    // Step 4: Repeat reconciliation is idempotent
    const repeatRecon = await executeSafeReconciliation(reservationId, mockSupabase);
    assert.strictEqual(repeatRecon.status, "REALIZED");
    assert.strictEqual(repeatRecon.rowsCreated, 0, "Repeat reconciliation must be idempotent");
    assert.strictEqual(mockSupabase._state.ledgerRows.length, 2);

    console.log("  ✔ Test 7 Passed: Fully paid reservation inherits historical accrual snapshot ($150.00) and creates PAYMENT_REALIZED.\n");
  }

  console.log("=================================================================");
  console.log("  ALL 7 AUTOMATIC INITIAL ACCRUAL TESTS PASSED 100%!            ");
  console.log("=================================================================");
}

if (process.argv[1] && process.argv[1].endsWith("ownerrez_automatic_accrual.test.ts")) {
  runAutomaticAccrualUnitTests().catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
  });
}
