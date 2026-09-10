import assert from "assert";
import { reconcileReservationPaymentRealization } from "../commissions/ledger";
import { executeSafeReconciliation } from "../ownerrez/sync";

interface InMemoryState {
  reservations: Map<string, any>;
  commission_ledger_events: Map<string, any>;
  idempotencyKeys: Set<string>;
}

function createMockSupabaseClient(state: InMemoryState) {
  return {
    from: (tableName: string) => {
      if (tableName === "reservations") {
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => ({
              single: async () => {
                if (col === "id") {
                  const row = state.reservations.get(val);
                  if (!row) return { data: null, error: { message: "Row not found" } };
                  return { data: { ...row }, error: null };
                }
                return { data: null, error: { message: "Unsupported column filter" } };
              },
            }),
          }),
        };
      }

      if (tableName === "commission_ledger_events") {
        return {
          select: (_cols?: string) => ({
            eq: (col1: string, val1: any) => ({
              eq: (col2: string, val2: any) => {
                return {
                  // e.g. .eq("reservation_id", id).eq("event_type", "INITIAL_ACCRUAL")
                  then: async (resolve: any) => {
                    const rows = Array.from(state.commission_ledger_events.values()).filter(
                      (r) => r[col1] === val1 && r[col2] === val2
                    );
                    resolve({ data: rows.map((r) => ({ ...r })), error: null });
                  },
                };
              },
              maybeSingle: async () => {
                // e.g. .eq("idempotency_key", key).maybeSingle()
                const rows = Array.from(state.commission_ledger_events.values()).filter(
                  (r) => r[col1] === val1
                );
                return { data: rows.length > 0 ? { ...rows[0] } : null, error: null };
              },
            }),
          }),
          insert: (payload: any) => ({
            select: (_cols?: string) => ({
              single: async () => {
                const key = payload.idempotency_key;
                if (state.idempotencyKeys.has(key)) {
                  // Simulate PostgreSQL unique violation
                  return {
                    data: null,
                    error: {
                      code: "23505",
                      message: `duplicate key value violates unique constraint on idempotency_key: ${key}`,
                    },
                  };
                }
                state.idempotencyKeys.add(key);
                const id = `evt-${Math.random().toString(36).substring(2, 9)}`;
                const createdRow = {
                  ...payload,
                  id,
                  created_at: new Date().toISOString(),
                };
                state.commission_ledger_events.set(id, createdRow);
                return { data: { ...createdRow }, error: null };
              },
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${tableName}`);
    },
  };
}

export async function runPaymentReconciliationUnitTests() {
  console.log("=================================================================");
  console.log("  RUNNING PHASE 6 PAYMENT REALIZATION RECONCILIATION TEST SUITE ");
  console.log("=================================================================\n");

  const PARTNER_ID = "partner-megbrass-uuid";
  const SITE_ID = "site-megbrass-uuid";
  const RULE_ID_HISTORICAL = "rule-10pct-uuid";

  // --------------------------------------------------------------------------
  // Scenario 1: Unpaid + Accrual → No Realization
  // --------------------------------------------------------------------------
  {
    console.log("[Test 1] Unpaid booking with existing INITIAL_ACCRUAL...");
    const state: InMemoryState = {
      reservations: new Map(),
      commission_ledger_events: new Map(),
      idempotencyKeys: new Set(),
    };

    const resId = "res-unpaid-001";
    state.reservations.set(resId, {
      id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      ownerrez_booking_id: 19150249,
      gross_amount: 1475.0,
      amount_received: 0.0,
      refund_amount: 0.0,
      payment_status: "UNPAID",
      reservation_status: "CONFIRMED",
      platform: "direct",
    });

    state.commission_ledger_events.set("evt-accrual-1", {
      id: "evt-accrual-1",
      reservation_id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      commission_rule_id: RULE_ID_HISTORICAL,
      event_type: "INITIAL_ACCRUAL",
      delta_amount: 0.0,
      calculated_commission: 127.5,
      idempotency_key: `evt_accrual_${resId}_${RULE_ID_HISTORICAL}`,
    });
    state.idempotencyKeys.add(`evt_accrual_${resId}_${RULE_ID_HISTORICAL}`);

    const client = createMockSupabaseClient(state);
    const res = await reconcileReservationPaymentRealization({
      reservationId: resId,
      sourceProvider: "ownerrez",
      supabaseClient: client,
    });

    assert.strictEqual(res.status, "UNPAID_PENDING_PAYMENT", "Status must be UNPAID_PENDING_PAYMENT");
    assert.strictEqual(res.rowsCreated, 0, "Must create 0 rows");
    assert.strictEqual(res.realizedAmount, 0.0, "Realized amount must be 0.00");
    assert.strictEqual(state.commission_ledger_events.size, 1, "Ledger must retain only the initial accrual");
    console.log("  ✔ Test 1 Passed: Unpaid booking produces zero realization.\n");
  }

  // --------------------------------------------------------------------------
  // Scenario 2: Partial Payment + Accrual → No Realization
  // --------------------------------------------------------------------------
  {
    console.log("[Test 2] Partial payment booking ($500 of $1475) with existing INITIAL_ACCRUAL...");
    const state: InMemoryState = {
      reservations: new Map(),
      commission_ledger_events: new Map(),
      idempotencyKeys: new Set(),
    };

    const resId = "res-partial-002";
    state.reservations.set(resId, {
      id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      ownerrez_booking_id: 19150249,
      gross_amount: 1475.0,
      amount_received: 500.0,
      refund_amount: 0.0,
      payment_status: "PARTIAL",
      reservation_status: "CONFIRMED",
      platform: "direct",
    });

    state.commission_ledger_events.set("evt-accrual-2", {
      id: "evt-accrual-2",
      reservation_id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      commission_rule_id: RULE_ID_HISTORICAL,
      event_type: "INITIAL_ACCRUAL",
      delta_amount: 0.0,
      calculated_commission: 127.5,
      idempotency_key: `evt_accrual_${resId}_${RULE_ID_HISTORICAL}`,
    });
    state.idempotencyKeys.add(`evt_accrual_${resId}_${RULE_ID_HISTORICAL}`);

    const client = createMockSupabaseClient(state);
    const res = await reconcileReservationPaymentRealization({
      reservationId: resId,
      sourceProvider: "ownerrez",
      supabaseClient: client,
    });

    assert.strictEqual(res.status, "PARTIAL_PAYMENT_UNALLOCATED", "Status must be PARTIAL_PAYMENT_UNALLOCATED");
    assert.strictEqual(res.rowsCreated, 0, "Must create 0 rows");
    assert.strictEqual(res.realizedAmount, 0.0, "Realized amount must be 0.00");
    assert.strictEqual(state.commission_ledger_events.size, 1, "Ledger must retain only the initial accrual");
    console.log("  ✔ Test 2 Passed: Partial payment produces zero pro-rata realization.\n");
  }

  // --------------------------------------------------------------------------
  // Scenario 3: Fully Paid + Accrual → Exactly One Realization
  // --------------------------------------------------------------------------
  {
    console.log("[Test 3] Fully paid booking ($1475 of $1475) with INITIAL_ACCRUAL...");
    const state: InMemoryState = {
      reservations: new Map(),
      commission_ledger_events: new Map(),
      idempotencyKeys: new Set(),
    };

    const resId = "res-fullypaid-003";
    state.reservations.set(resId, {
      id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      ownerrez_booking_id: 19150249,
      gross_amount: 1475.0,
      amount_received: 1475.0,
      refund_amount: 0.0,
      payment_status: "PAID",
      reservation_status: "CONFIRMED",
      platform: "direct",
    });

    state.commission_ledger_events.set("evt-accrual-3", {
      id: "evt-accrual-3",
      reservation_id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      commission_rule_id: RULE_ID_HISTORICAL,
      event_type: "INITIAL_ACCRUAL",
      delta_amount: 0.0,
      calculated_commission: 127.5,
      source_provider: "ownerrez",
      booking_channel: "direct",
      provider_booking_id: "19150249",
      ownerrez_booking_id: 19150249,
      idempotency_key: `evt_accrual_${resId}_${RULE_ID_HISTORICAL}`,
      metadata: { originalContractedBase: 1275.0 },
    });
    state.idempotencyKeys.add(`evt_accrual_${resId}_${RULE_ID_HISTORICAL}`);

    const client = createMockSupabaseClient(state);
    const res = await reconcileReservationPaymentRealization({
      reservationId: resId,
      sourceProvider: "ownerrez",
      supabaseClient: client,
    });

    assert.strictEqual(res.status, "REALIZED", "Status must be REALIZED");
    assert.strictEqual(res.rowsCreated, 1, "Must create exactly 1 row");
    assert.strictEqual(res.realizedAmount, 127.5, "Realized amount must equal 127.50");
    assert.strictEqual(state.commission_ledger_events.size, 2, "Ledger must now contain 2 events");

    const createdEvent = Array.from(state.commission_ledger_events.values()).find(
      (e) => e.event_type === "PAYMENT_REALIZED"
    );
    assert.ok(createdEvent, "PAYMENT_REALIZED event must exist");
    assert.strictEqual(createdEvent.delta_amount, 127.5, "Delta must be +127.50");
    assert.strictEqual(createdEvent.commission_rule_id, RULE_ID_HISTORICAL, "Must inherit historical commission rule");
    assert.strictEqual(createdEvent.idempotency_key, `evt_realized_${resId}_full`, "Must match deterministic key");
    console.log("  ✔ Test 3 Passed: Fully paid booking creates exactly 1 PAYMENT_REALIZED event.\n");
  }

  // --------------------------------------------------------------------------
  // Scenario 4: Fully Paid + No Accrual → Zero Writes + MISSING_ACCRUAL_REVIEW_REQUIRED
  // --------------------------------------------------------------------------
  {
    console.log("[Test 4] Fully paid booking with NO historical INITIAL_ACCRUAL...");
    const state: InMemoryState = {
      reservations: new Map(),
      commission_ledger_events: new Map(),
      idempotencyKeys: new Set(),
    };

    const resId = "res-no-accrual-004";
    state.reservations.set(resId, {
      id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      ownerrez_booking_id: 19150249,
      gross_amount: 1475.0,
      amount_received: 1475.0,
      refund_amount: 0.0,
      payment_status: "PAID",
      reservation_status: "CONFIRMED",
      platform: "direct",
    });

    const client = createMockSupabaseClient(state);
    const res = await reconcileReservationPaymentRealization({
      reservationId: resId,
      sourceProvider: "ownerrez",
      supabaseClient: client,
    });

    assert.strictEqual(res.status, "MISSING_ACCRUAL_REVIEW_REQUIRED", "Must fail closed with MISSING_ACCRUAL_REVIEW_REQUIRED");
    assert.strictEqual(res.rowsCreated, 0, "Must create 0 rows");
    assert.strictEqual(res.realizedAmount, 0.0, "Realized amount must be 0.00");
    assert.strictEqual(state.commission_ledger_events.size, 0, "Ledger must remain empty (zero writes)");
    console.log("  ✔ Test 4 Passed: Missing accrual fails closed with zero writes.\n");
  }

  // --------------------------------------------------------------------------
  // Scenario 5: Changed/Deactivated Commission Rule After Accrual → Realization Uses Snapshot
  // --------------------------------------------------------------------------
  {
    console.log("[Test 5] Rule changed/deactivated after initial accrual...");
    const state: InMemoryState = {
      reservations: new Map(),
      commission_ledger_events: new Map(),
      idempotencyKeys: new Set(),
    };

    const resId = "res-rule-change-005";
    state.reservations.set(resId, {
      id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      ownerrez_booking_id: 19150249,
      gross_amount: 1475.0,
      amount_received: 1475.0,
      refund_amount: 0.0,
      payment_status: "PAID",
      reservation_status: "CONFIRMED",
      platform: "direct",
    });

    // Historical accrual recorded at 10% ($127.50) under historical rule ID
    state.commission_ledger_events.set("evt-accrual-5", {
      id: "evt-accrual-5",
      reservation_id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      commission_rule_id: RULE_ID_HISTORICAL,
      event_type: "INITIAL_ACCRUAL",
      delta_amount: 0.0,
      calculated_commission: 127.5,
      source_provider: "ownerrez",
      booking_channel: "direct",
      provider_booking_id: "19150249",
      ownerrez_booking_id: 19150249,
      idempotency_key: `evt_accrual_${resId}_${RULE_ID_HISTORICAL}`,
      metadata: { originalRulePercentage: 10, contractedRentBase: 1275.0 },
    });
    state.idempotencyKeys.add(`evt_accrual_${resId}_${RULE_ID_HISTORICAL}`);

    const client = createMockSupabaseClient(state);
    const res = await reconcileReservationPaymentRealization({
      reservationId: resId,
      sourceProvider: "ownerrez",
      supabaseClient: client,
    });

    assert.strictEqual(res.status, "REALIZED");
    assert.strictEqual(res.realizedAmount, 127.5, "Must use historical accrual amount (127.50)");
    const realizedEv = Array.from(state.commission_ledger_events.values()).find(
      (e) => e.event_type === "PAYMENT_REALIZED"
    );
    assert.strictEqual(realizedEv.commission_rule_id, RULE_ID_HISTORICAL, "Must retain historical rule ID");
    assert.strictEqual(realizedEv.delta_amount, 127.5, "Must not recalculate using any different rule");
    console.log("  ✔ Test 5 Passed: Realization strictly inherits historical accrual snapshot.\n");
  }

  // --------------------------------------------------------------------------
  // Scenario 6: Concurrent Fully-Paid Reconciliation → Exactly One Realization
  // --------------------------------------------------------------------------
  {
    console.log("[Test 6] Two simultaneous concurrent reconciliation calls for fully-paid booking...");
    const state: InMemoryState = {
      reservations: new Map(),
      commission_ledger_events: new Map(),
      idempotencyKeys: new Set(),
    };

    const resId = "res-concurrency-006";
    state.reservations.set(resId, {
      id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      ownerrez_booking_id: 19150249,
      gross_amount: 1475.0,
      amount_received: 1475.0,
      refund_amount: 0.0,
      payment_status: "PAID",
      reservation_status: "CONFIRMED",
      platform: "direct",
    });

    state.commission_ledger_events.set("evt-accrual-6", {
      id: "evt-accrual-6",
      reservation_id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      commission_rule_id: RULE_ID_HISTORICAL,
      event_type: "INITIAL_ACCRUAL",
      delta_amount: 0.0,
      calculated_commission: 127.5,
      idempotency_key: `evt_accrual_${resId}_${RULE_ID_HISTORICAL}`,
    });
    state.idempotencyKeys.add(`evt_accrual_${resId}_${RULE_ID_HISTORICAL}`);

    const client = createMockSupabaseClient(state);

    // Launch both reconciliations concurrently
    const [resA, resB] = await Promise.all([
      reconcileReservationPaymentRealization({ reservationId: resId, sourceProvider: "ownerrez", supabaseClient: client }),
      reconcileReservationPaymentRealization({ reservationId: resId, sourceProvider: "ownerrez", supabaseClient: client }),
    ]);

    const totalRowsCreated = resA.rowsCreated + resB.rowsCreated;
    assert.strictEqual(totalRowsCreated, 1, "Exactly one call must create the row; other must be idempotent no-op");
    assert.strictEqual(resA.realizedAmount, 127.5);
    assert.strictEqual(resB.realizedAmount, 127.5);
    assert.strictEqual(state.commission_ledger_events.size, 2, "Ledger must contain exactly 2 events (1 accrual + 1 realization)");
    console.log("  ✔ Test 6 Passed: Concurrency protected by unique constraint; exactly 1 realization created.\n");
  }

  // --------------------------------------------------------------------------
  // Scenario 7: Cancelled / Refunded Booking → Zero Realization
  // --------------------------------------------------------------------------
  {
    console.log("[Test 7] Cancelled booking with funds received ($1475) and historical accrual...");
    const state: InMemoryState = {
      reservations: new Map(),
      commission_ledger_events: new Map(),
      idempotencyKeys: new Set(),
    };

    const resId = "res-cancelled-007";
    state.reservations.set(resId, {
      id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      ownerrez_booking_id: 19150249,
      gross_amount: 1475.0,
      amount_received: 1475.0,
      refund_amount: 0.0,
      payment_status: "PAID",
      reservation_status: "CANCELLED", // Cancelled!
      platform: "direct",
    });

    state.commission_ledger_events.set("evt-accrual-7", {
      id: "evt-accrual-7",
      reservation_id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      commission_rule_id: RULE_ID_HISTORICAL,
      event_type: "INITIAL_ACCRUAL",
      delta_amount: 0.0,
      calculated_commission: 127.5,
      idempotency_key: `evt_accrual_${resId}_${RULE_ID_HISTORICAL}`,
    });
    state.idempotencyKeys.add(`evt_accrual_${resId}_${RULE_ID_HISTORICAL}`);

    const client = createMockSupabaseClient(state);
    const res = await reconcileReservationPaymentRealization({
      reservationId: resId,
      sourceProvider: "ownerrez",
      supabaseClient: client,
    });

    assert.strictEqual(res.status, "CANCELLED_REVIEW_REQUIRED", "Status must be CANCELLED_REVIEW_REQUIRED");
    assert.strictEqual(res.rowsCreated, 0, "Must create 0 rows");
    assert.strictEqual(res.realizedAmount, 0.0, "Realized amount must be 0.00");
    assert.strictEqual(state.commission_ledger_events.size, 1, "Ledger must not contain PAYMENT_REALIZED");
    console.log("  ✔ Test 7 Passed: Cancelled booking fails closed with zero realization.\n");
  }

  // --------------------------------------------------------------------------
  // Scenario 8: Reconciliation Internal Exception Hardening & Secret Sanitization
  // --------------------------------------------------------------------------
  {
    console.log("[Test 8] Internal reconciliation exception hardening & secret sanitization...");
    const brokenClient = {
      from: () => {
        throw new Error(
          "DB connection error: bearer super-secret-jwt-token-12345 failed with token=ultra-private-key-67890"
        );
      },
    };

    const res = await executeSafeReconciliation("res-err-008", brokenClient);

    assert.strictEqual(res.attempted, true, "Must record attempted = true");
    assert.strictEqual(res.status, "ERROR", "Status must be ERROR");
    assert.strictEqual(res.rowsCreated, 0, "Must create 0 rows");
    assert.strictEqual(res.realizedAmount, 0.0, "Realized amount must be 0.00");
    assert.ok(res.error, "Error message must be present");
    assert.ok(!res.error.includes("super-secret-jwt-token-12345"), "Must redact bearer token");
    assert.ok(!res.error.includes("ultra-private-key-67890"), "Must redact sensitive token parameter");
    assert.ok(res.error.includes("bearer [REDACTED]"), "Must replace bearer token with [REDACTED]");
    assert.ok(res.error.includes("token=[REDACTED]"), "Must replace token value with [REDACTED]");
    console.log("  ✔ Test 8 Passed: Internal reconciliation exception handled safely, returning status='ERROR' and sanitized message.\n");
  }

  // --------------------------------------------------------------------------
  // Scenario 9: Successful Reconciliation Reporting (Observability Contract)
  // --------------------------------------------------------------------------
  {
    console.log("[Test 9] Successful reconciliation reporting structure for unpaid and paid states...");
    const state: InMemoryState = {
      reservations: new Map(),
      commission_ledger_events: new Map(),
      idempotencyKeys: new Set(),
    };

    const resId = "res-obs-009";
    state.reservations.set(resId, {
      id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      ownerrez_booking_id: 19150249,
      gross_amount: 1475.0,
      amount_received: 0.0,
      refund_amount: 0.0,
      payment_status: "UNPAID",
      reservation_status: "CONFIRMED",
      platform: "direct",
    });

    state.commission_ledger_events.set("evt-accrual-9", {
      id: "evt-accrual-9",
      reservation_id: resId,
      partner_id: PARTNER_ID,
      site_id: SITE_ID,
      commission_rule_id: RULE_ID_HISTORICAL,
      event_type: "INITIAL_ACCRUAL",
      delta_amount: 0.0,
      calculated_commission: 127.5,
      idempotency_key: `evt_accrual_${resId}_${RULE_ID_HISTORICAL}`,
    });
    state.idempotencyKeys.add(`evt_accrual_${resId}_${RULE_ID_HISTORICAL}`);

    const client = createMockSupabaseClient(state);

    // 9a. Test unpaid booking reporting
    const resUnpaid = await executeSafeReconciliation(resId, client);
    assert.strictEqual(resUnpaid.attempted, true, "attempted must be true");
    assert.strictEqual(resUnpaid.status, "UNPAID_PENDING_PAYMENT", "status must be UNPAID_PENDING_PAYMENT");
    assert.strictEqual(resUnpaid.rowsCreated, 0, "rowsCreated must be 0");
    assert.strictEqual(resUnpaid.realizedAmount, 0.0, "realizedAmount must be 0.00");
    assert.ok(resUnpaid.reason && resUnpaid.reason.includes("unpaid"), "reason must explain unpaid state");
    assert.strictEqual(resUnpaid.error, undefined, "error must be undefined on successful reconciliation");

    // 9b. Transition to fully paid and verify realization reporting
    state.reservations.set(resId, {
      ...state.reservations.get(resId),
      payment_status: "PAID",
      amount_received: 1475.0,
    });

    const resPaid = await executeSafeReconciliation(resId, client);
    assert.strictEqual(resPaid.attempted, true, "attempted must be true");
    assert.strictEqual(resPaid.status, "REALIZED", "status must be REALIZED");
    assert.strictEqual(resPaid.rowsCreated, 1, "rowsCreated must be 1");
    assert.strictEqual(resPaid.realizedAmount, 127.5, "realizedAmount must be 127.50");
    assert.ok(resPaid.reason && resPaid.reason.includes("PAYMENT_REALIZED"), "reason must confirm realization");
    assert.strictEqual(resPaid.error, undefined, "error must be undefined on successful realization");

    console.log("  ✔ Test 9 Passed: Successful reconciliation reporting strictly adheres to observability contract.\n");
  }

  console.log("=================================================================");
  console.log("  ALL 9 PAYMENT RECONCILIATION SCENARIOS PASSED 100%!           ");
  console.log("=================================================================");
}

if (process.argv[1] && process.argv[1].endsWith("payment_reconciliation.test.ts")) {
  runPaymentReconciliationUnitTests().catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
  });
}
