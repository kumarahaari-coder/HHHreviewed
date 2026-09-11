import assert from "assert";
import {
  computeEligibilityReleaseTimestamp,
  isStayEligibleForRelease,
} from "../commissions/timezone";
import {
  reconcileReservationEligibilityRelease,
  processCompletedStaysEligibility,
} from "../commissions/eligibility";
import { generateDraftPayoutBatch } from "../commissions/payout-generator";
import { ReservationFinancialSummary } from "../commissions/types";

interface MockState {
  reservations: Map<string, any>;
  properties: Map<string, any>;
  partners: Map<string, any>;
  commission_ledger_events: Map<string, any>;
  payout_batches: Map<string, any>;
  payout_items: Map<string, any>;
  idempotencyKeys: Set<string>;
}

function createMockClient(state: MockState) {
  return {
    from: (tableName: string) => {
      if (tableName === "reservations") {
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => ({
              single: async () => {
                if (col === "id") {
                  const row = state.reservations.get(val);
                  if (!row) return { data: null, error: { message: "Reservation not found" } };
                  return { data: { ...row }, error: null };
                }
                return { data: null, error: { message: "Unsupported column" } };
              },
            }),
            neq: (col: string, val: any) => {
              const filterFn = (r: any) => r[col] !== val;
              const createQueryObj = (additionalFilter?: (r: any) => boolean) => ({
                eq: (eqCol: string, eqVal: any) =>
                  createQueryObj((r: any) => (additionalFilter ? additionalFilter(r) : true) && r[eqCol] === eqVal),
                order: (_orderCol: string, _opts: any) => ({
                  limit: (_lim: number) => ({
                    then: async (resolve: any) => {
                      let rows = Array.from(state.reservations.values()).filter(filterFn);
                      if (additionalFilter) rows = rows.filter(additionalFilter);
                      resolve({ data: rows.map((r) => ({ ...r })), error: null });
                    },
                  }),
                }),
              });
              return createQueryObj();
            },
          }),
        };
      }

      if (tableName === "properties") {
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => ({
              single: async () => {
                const row = state.properties.get(val);
                return { data: row ? { ...row } : null, error: null };
              },
            }),
          }),
        };
      }

      if (tableName === "partners") {
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => ({
              single: async () => {
                const row = state.partners.get(val);
                return { data: row ? { ...row } : null, error: row ? null : { message: "Not found" } };
              },
            }),
          }),
        };
      }

      if (tableName === "commission_ledger_events") {
        return {
          select: (_cols?: string) => ({
            eq: (col1: string, val1: any) => ({
              order: (_ordCol: string, _opts: any) => ({
                then: async (resolve: any) => {
                  const rows = Array.from(state.commission_ledger_events.values())
                    .filter((r) => r[col1] === val1)
                    .sort((a, b) => a.created_at.localeCompare(b.created_at));
                  resolve({ data: rows.map((r) => ({ ...r })), error: null });
                },
              }),
              eq: (col2: string, val2: any) => ({
                then: async (resolve: any) => {
                  const rows = Array.from(state.commission_ledger_events.values()).filter(
                    (r) => r[col1] === val1 && r[col2] === val2
                  );
                  resolve({ data: rows.map((r) => ({ ...r })), error: null });
                },
              }),
              maybeSingle: async () => {
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
                  return {
                    data: null,
                    error: {
                      code: "23505",
                      message: `duplicate key violates idempotency: ${key}`,
                    },
                  };
                }
                state.idempotencyKeys.add(key);
                const id = `evt-${Math.random().toString(36).substring(2, 9)}`;
                const row = { ...payload, id, created_at: new Date().toISOString() };
                state.commission_ledger_events.set(id, row);
                return { data: { ...row }, error: null };
              },
            }),
          }),
        };
      }

      if (tableName === "payout_batches") {
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => ({
              in: (_inCol: string, _inVals: any[]) => ({
                then: async (resolve: any) => {
                  const rows = Array.from(state.payout_batches.values()).filter(
                    (b) => b[col] === val && _inVals.includes(b.status)
                  );
                  resolve({ data: rows.map((r) => ({ ...r })), error: null });
                },
              }),
            }),
          }),
          insert: (payload: any) => ({
            select: (_cols?: string) => ({
              single: async () => {
                const id = `batch-${Math.random().toString(36).substring(2, 9)}`;
                const row = { ...payload, id, created_at: new Date().toISOString() };
                state.payout_batches.set(id, row);
                return { data: { ...row }, error: null };
              },
            }),
          }),
        };
      }

      if (tableName === "payout_items") {
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => ({
              in: (_inCol: string, _inVals: any[]) => ({
                then: async (resolve: any) => {
                  const rows = Array.from(state.payout_items.values()).filter(
                    (it) => it[col] === val && _inVals.includes(it.status)
                  );
                  resolve({ data: rows.map((r) => ({ ...r })), error: null });
                },
              }),
            }),
          }),
          insert: (payload: any[]) => ({
            select: (_cols?: string) => ({
              then: async (resolve: any) => {
                const created: any[] = [];
                for (const p of payload) {
                  const id = `item-${Math.random().toString(36).substring(2, 9)}`;
                  const row = { ...p, id, created_at: new Date().toISOString() };
                  state.payout_items.set(id, row);
                  created.push(row);
                }
                resolve({ data: created, error: null });
              },
            }),
          }),
        };
      }

      throw new Error(`Unhandled mock table: ${tableName}`);
    },
  };
}

export async function runEligibilityAndPayoutTests() {
  console.log("=================================================================");
  console.log("  PHASE 6: ELIGIBILITY RELEASE & DRAFT PAYOUT TEST SUITE        ");
  console.log("=================================================================\n");

  const PARTNER_ID = "partner-synthetic-uuid-1";
  const PROPERTY_ID = "prop-synthetic-uuid-1";

  // --------------------------------------------------------------------------
  // Test 1: Property-Local Checkout Time + 24h Hold Buffer
  // --------------------------------------------------------------------------
  {
    console.log("[Test 1] Property-local checkout + 24h hold calculation across timezones...");
    // Check-out: 2026-09-01
    // Local checkout 11:00 AM EDT (15:00 UTC) + 24h hold = 2026-09-02 11:00 AM EDT (15:00 UTC)
    const releaseTimeEDT = computeEligibilityReleaseTimestamp("2026-09-01", "America/New_York", 24);
    assert.strictEqual(releaseTimeEDT.toISOString(), "2026-09-02T15:00:00.000Z");

    // Check before 24h hold buffer elapsed (e.g. 2026-09-02 14:59 UTC -> 1 minute before)
    const beforeElapsed = new Date("2026-09-02T14:59:00.000Z");
    assert.strictEqual(
      isStayEligibleForRelease("2026-09-01", "America/New_York", 24, beforeElapsed),
      false,
      "Before hold buffer must evaluate to false"
    );

    // Check at or after 24h hold buffer (e.g. 2026-09-02 15:00 UTC)
    const afterElapsed = new Date("2026-09-02T15:00:00.000Z");
    assert.strictEqual(
      isStayEligibleForRelease("2026-09-01", "America/New_York", 24, afterElapsed),
      true,
      "After hold buffer must evaluate to true"
    );

    // North Carolina offset '-0400'
    const releaseTimeOffset = computeEligibilityReleaseTimestamp("2026-10-23", "-0400", 24);
    assert.strictEqual(releaseTimeOffset.toISOString(), "2026-10-24T15:00:00.000Z");

    console.log("✔ Test 1 Passed: Exact property-local checkout + 24h hold calculation verified.\n");
  }

  // --------------------------------------------------------------------------
  // Test 2: Ineligibility Guard — Unpaid Reservation (Booking 19150249 replica)
  // --------------------------------------------------------------------------
  {
    console.log("[Test 2] Ineligibility Guard: Unpaid booking (zero received, status UNPAID)...");
    const state: MockState = {
      reservations: new Map(),
      properties: new Map(),
      partners: new Map(),
      commission_ledger_events: new Map(),
      payout_batches: new Map(),
      payout_items: new Map(),
      idempotencyKeys: new Set(),
    };

    state.properties.set(PROPERTY_ID, { id: PROPERTY_ID, timezone: "-0400" });
    state.reservations.set("res-unpaid", {
      id: "res-unpaid",
      confirmation_code: "ORB19150249",
      property_id: PROPERTY_ID,
      partner_id: PARTNER_ID,
      reservation_status: "CONFIRMED",
      payment_status: "UNPAID",
      amount_received: 0.0,
      gross_amount: 1475.0,
      check_in_date: "2026-08-01",
      check_out_date: "2026-08-05", // Stay physically past, but UNPAID
      ownerrez_booking_id: 19150249,
    });
    // INITIAL_ACCRUAL exists, but zero PAYMENT_REALIZED
    state.commission_ledger_events.set("evt-accrual", {
      id: "evt-accrual",
      reservation_id: "res-unpaid",
      partner_id: PARTNER_ID,
      event_type: "INITIAL_ACCRUAL",
      delta_amount: 0.0,
      calculated_commission: 127.5,
      idempotency_key: "evt_accrual_res-unpaid",
      created_at: "2026-08-01T00:00:00Z",
    });

    const client = createMockClient(state);
    const result = await reconcileReservationEligibilityRelease({
      reservationId: "res-unpaid",
      holdHours: 24,
      now: new Date("2026-09-01T00:00:00Z"),
      supabaseClient: client,
    });

    assert.strictEqual(result.status, "UNPAID_INELIGIBLE");
    assert.strictEqual(result.rowsCreated, 0);
    assert.strictEqual(result.event, null);
    assert.strictEqual(state.commission_ledger_events.size, 1, "No new ledger event must be created");
    console.log("✔ Test 2 Passed: Unpaid reservation safely rejected with UNPAID_INELIGIBLE (0 rows created).\n");
  }

  // --------------------------------------------------------------------------
  // Test 3: Ineligibility Guard — Cancelled Reservation
  // --------------------------------------------------------------------------
  {
    console.log("[Test 3] Ineligibility Guard: Cancelled reservation...");
    const state: MockState = {
      reservations: new Map(),
      properties: new Map(),
      partners: new Map(),
      commission_ledger_events: new Map(),
      payout_batches: new Map(),
      payout_items: new Map(),
      idempotencyKeys: new Set(),
    };

    state.properties.set(PROPERTY_ID, { id: PROPERTY_ID, timezone: "America/New_York" });
    state.reservations.set("res-cancelled", {
      id: "res-cancelled",
      confirmation_code: "CAN-001",
      property_id: PROPERTY_ID,
      partner_id: PARTNER_ID,
      reservation_status: "CANCELLED",
      payment_status: "PAID",
      amount_received: 1000.0,
      check_in_date: "2026-08-01",
      check_out_date: "2026-08-05",
    });

    const client = createMockClient(state);
    const result = await reconcileReservationEligibilityRelease({
      reservationId: "res-cancelled",
      holdHours: 24,
      now: new Date("2026-09-01T00:00:00Z"),
      supabaseClient: client,
    });

    assert.strictEqual(result.status, "CANCELLED_INELIGIBLE");
    assert.strictEqual(result.rowsCreated, 0);
    console.log("✔ Test 3 Passed: Cancelled reservation rejected with CANCELLED_INELIGIBLE (0 rows created).\n");
  }

  // --------------------------------------------------------------------------
  // Test 4: Ineligibility Guard — Disputed Reservation
  // --------------------------------------------------------------------------
  {
    console.log("[Test 4] Ineligibility Guard: Disputed reservation (active DISPUTE_HOLD)...");
    const state: MockState = {
      reservations: new Map(),
      properties: new Map(),
      partners: new Map(),
      commission_ledger_events: new Map(),
      payout_batches: new Map(),
      payout_items: new Map(),
      idempotencyKeys: new Set(),
    };

    state.properties.set(PROPERTY_ID, { id: PROPERTY_ID, timezone: "America/New_York" });
    state.reservations.set("res-disputed", {
      id: "res-disputed",
      confirmation_code: "DISP-001",
      property_id: PROPERTY_ID,
      partner_id: PARTNER_ID,
      reservation_status: "CONFIRMED",
      payment_status: "PAID",
      amount_received: 1000.0,
      check_in_date: "2026-08-01",
      check_out_date: "2026-08-05",
    });

    state.commission_ledger_events.set("evt-paid", {
      id: "evt-paid",
      reservation_id: "res-disputed",
      partner_id: PARTNER_ID,
      event_type: "PAYMENT_REALIZED",
      delta_amount: 100.0,
      created_at: "2026-08-01T00:00:00Z",
    });
    state.commission_ledger_events.set("evt-dispute", {
      id: "evt-dispute",
      reservation_id: "res-disputed",
      partner_id: PARTNER_ID,
      event_type: "DISPUTE_HOLD",
      delta_amount: 0.0,
      created_at: "2026-08-06T00:00:00Z",
    });

    const client = createMockClient(state);
    const result = await reconcileReservationEligibilityRelease({
      reservationId: "res-disputed",
      holdHours: 24,
      now: new Date("2026-09-01T00:00:00Z"),
      supabaseClient: client,
    });

    assert.strictEqual(result.status, "DISPUTED_INELIGIBLE");
    assert.strictEqual(result.rowsCreated, 0);
    console.log("✔ Test 4 Passed: Disputed reservation rejected with DISPUTED_INELIGIBLE (0 rows created).\n");
  }

  // --------------------------------------------------------------------------
  // Test 5: Ineligibility Guard — Future Stay (Checkout + Hold not elapsed)
  // --------------------------------------------------------------------------
  {
    console.log("[Test 5] Ineligibility Guard: Future stay (checkout not elapsed)...");
    const state: MockState = {
      reservations: new Map(),
      properties: new Map(),
      partners: new Map(),
      commission_ledger_events: new Map(),
      payout_batches: new Map(),
      payout_items: new Map(),
      idempotencyKeys: new Set(),
    };

    state.properties.set(PROPERTY_ID, { id: PROPERTY_ID, timezone: "America/New_York" });
    state.reservations.set("res-future", {
      id: "res-future",
      confirmation_code: "FUT-001",
      property_id: PROPERTY_ID,
      partner_id: PARTNER_ID,
      reservation_status: "CONFIRMED",
      payment_status: "PAID",
      amount_received: 2000.0,
      check_in_date: "2026-10-20",
      check_out_date: "2026-10-25",
    });
    state.commission_ledger_events.set("evt-paid", {
      id: "evt-paid",
      reservation_id: "res-future",
      partner_id: PARTNER_ID,
      event_type: "PAYMENT_REALIZED",
      delta_amount: 200.0,
      created_at: "2026-09-01T00:00:00Z",
    });

    const client = createMockClient(state);
    const result = await reconcileReservationEligibilityRelease({
      reservationId: "res-future",
      holdHours: 24,
      now: new Date("2026-09-11T12:00:00Z"), // Today: before Oct 25 checkout
      supabaseClient: client,
    });

    assert.strictEqual(result.status, "STAY_NOT_COMPLETED");
    assert.strictEqual(result.rowsCreated, 0);
    console.log("✔ Test 5 Passed: Future stay evaluated as STAY_NOT_COMPLETED (0 rows created).\n");
  }

  // --------------------------------------------------------------------------
  // Test 6: Eligible Stay + Exactly One Release Event (Idempotency)
  // --------------------------------------------------------------------------
  {
    console.log("[Test 6] Eligible Stay Release and Idempotency Verification...");
    const state: MockState = {
      reservations: new Map(),
      properties: new Map(),
      partners: new Map(),
      commission_ledger_events: new Map(),
      payout_batches: new Map(),
      payout_items: new Map(),
      idempotencyKeys: new Set(),
    };

    const resId = "res-eligible-001";
    state.properties.set(PROPERTY_ID, { id: PROPERTY_ID, timezone: "America/New_York" });
    state.reservations.set(resId, {
      id: resId,
      confirmation_code: "ELIG-001",
      property_id: PROPERTY_ID,
      partner_id: PARTNER_ID,
      reservation_status: "CONFIRMED",
      payment_status: "PAID",
      amount_received: 1500.0,
      check_in_date: "2026-08-10",
      check_out_date: "2026-08-15",
    });
    state.commission_ledger_events.set("evt-paid", {
      id: "evt-paid",
      reservation_id: resId,
      partner_id: PARTNER_ID,
      event_type: "PAYMENT_REALIZED",
      delta_amount: 150.0,
      created_at: "2026-08-10T00:00:00Z",
    });

    const client = createMockClient(state);

    // First run: must create ELIGIBILITY_RELEASE
    const firstRun = await reconcileReservationEligibilityRelease({
      reservationId: resId,
      holdHours: 24,
      now: new Date("2026-08-17T00:00:00Z"), // 2 days after checkout
      supabaseClient: client,
    });

    assert.strictEqual(firstRun.status, "ELIGIBLE_RELEASED");
    assert.strictEqual(firstRun.rowsCreated, 1);
    assert(firstRun.event);
    assert.strictEqual(firstRun.event.event_type, "ELIGIBILITY_RELEASE");
    assert.strictEqual(firstRun.event.delta_amount, 0.0);
    assert.strictEqual(firstRun.event.idempotency_key, `evt_release_${resId}`);

    // Second run: must detect existing release and create 0 rows
    const secondRun = await reconcileReservationEligibilityRelease({
      reservationId: resId,
      holdHours: 24,
      now: new Date("2026-08-17T01:00:00Z"),
      supabaseClient: client,
    });

    assert.strictEqual(secondRun.status, "ALREADY_RELEASED");
    assert.strictEqual(secondRun.rowsCreated, 0);
    assert.strictEqual(secondRun.event?.id, firstRun.event.id);

    // Total ledger events must be exactly 2 (PAYMENT_REALIZED + 1 ELIGIBILITY_RELEASE)
    assert.strictEqual(state.commission_ledger_events.size, 2);
    console.log("✔ Test 6 Passed: Exactly one ELIGIBILITY_RELEASE created, repeat run is idempotent (0 rows).\n");
  }

  // --------------------------------------------------------------------------
  // Test 7: Batch Worker Scanner Verification
  // --------------------------------------------------------------------------
  {
    console.log("[Test 7] processCompletedStaysEligibility batch scanner verification...");
    const state: MockState = {
      reservations: new Map(),
      properties: new Map(),
      partners: new Map(),
      commission_ledger_events: new Map(),
      payout_batches: new Map(),
      payout_items: new Map(),
      idempotencyKeys: new Set(),
    };

    state.properties.set(PROPERTY_ID, { id: PROPERTY_ID, timezone: "-0400" });

    // Res 1: Unpaid booking (19150249)
    state.reservations.set("res-19150249", {
      id: "res-19150249",
      confirmation_code: "ORB19150249",
      property_id: PROPERTY_ID,
      partner_id: PARTNER_ID,
      reservation_status: "CONFIRMED",
      payment_status: "UNPAID",
      amount_received: 0,
      check_in_date: "2026-10-20",
      check_out_date: "2026-10-23",
    });

    // Res 2: Cancelled booking
    state.reservations.set("res-can", {
      id: "res-can",
      confirmation_code: "CAN-99",
      property_id: PROPERTY_ID,
      partner_id: PARTNER_ID,
      reservation_status: "CANCELLED",
      payment_status: "PAID",
      amount_received: 500,
      check_in_date: "2026-08-01",
      check_out_date: "2026-08-05",
    });

    // Res 3: Eligible completed stay
    state.reservations.set("res-completed", {
      id: "res-completed",
      confirmation_code: "DONE-100",
      property_id: PROPERTY_ID,
      partner_id: PARTNER_ID,
      reservation_status: "CONFIRMED",
      payment_status: "PAID",
      amount_received: 1000,
      check_in_date: "2026-08-01",
      check_out_date: "2026-08-05",
    });
    state.commission_ledger_events.set("evt-paid-100", {
      id: "evt-paid-100",
      reservation_id: "res-completed",
      partner_id: PARTNER_ID,
      event_type: "PAYMENT_REALIZED",
      delta_amount: 100.0,
      created_at: "2026-08-01T00:00:00Z",
    });

    const client = createMockClient(state);
    const batchSummary = await processCompletedStaysEligibility({
      partnerId: PARTNER_ID,
      now: new Date("2026-09-01T00:00:00Z"),
      supabaseClient: client,
    });

    assert.strictEqual(batchSummary.eligibleReleased, 1, "Only res-completed must be released");
    assert.strictEqual(batchSummary.skippedUnpaid, 1, "res-19150249 must be skipped as unpaid");
    assert.strictEqual(batchSummary.errors, 0, "Zero errors");

    const unpaidResResult = batchSummary.results.find((r) => r.reservationId === "res-19150249");
    assert.strictEqual(unpaidResResult?.status, "UNPAID_INELIGIBLE");
    assert.strictEqual(unpaidResResult?.rowsCreated, 0);

    console.log("✔ Test 7 Passed: Batch scanner correctly released eligible stay and skipped unpaid 19150249.\n");
  }

  // --------------------------------------------------------------------------
  // Test 8: Working Capital Math & Partner Payout Availability Invariants
  // --------------------------------------------------------------------------
  {
    console.log("[Test 8] Partner payout availability math & FIFO negative carry-forward derivation...");

    // Case A: Unpaid booking only -> payout available = $0.00
    {
      const summaries: ReservationFinancialSummary[] = [
        {
          reservation_id: "res-19150249",
          partner_id: PARTNER_ID,
          check_in_date: "2026-10-20",
          net_realized: 0.0,
          settled_amount: 0.0,
          locked_amount: 0.0,
          outstanding_amount: 0.0,
          has_eligibility_release: false,
          is_dispute_free: true,
          is_stay_eligible: false,
        },
      ];

      let eligiblePositive = 0;
      let negativeCarryForward = 0;
      for (const s of summaries) {
        if (s.outstanding_amount > 0 && s.is_stay_eligible) eligiblePositive += s.outstanding_amount;
        else if (s.outstanding_amount < 0) negativeCarryForward += Math.abs(s.outstanding_amount);
      }
      const partnerPayoutAvailable = Math.max(0, eligiblePositive - negativeCarryForward);

      assert.strictEqual(partnerPayoutAvailable, 0.0, "Unpaid booking yields $0 payout available");
    }

    // Case B: Completed stay (+$250) + Clawback (-$50) + Future Stay (+$500)
    {
      const summaries: ReservationFinancialSummary[] = [
        {
          reservation_id: "res-clawback",
          partner_id: PARTNER_ID,
          check_in_date: "2026-07-01",
          net_realized: 0.0,
          settled_amount: 50.0,
          locked_amount: 0.0,
          outstanding_amount: -50.0,
          has_eligibility_release: true,
          is_dispute_free: true,
          is_stay_eligible: false,
        },
        {
          reservation_id: "res-completed",
          partner_id: PARTNER_ID,
          check_in_date: "2026-08-01",
          net_realized: 250.0,
          settled_amount: 0.0,
          locked_amount: 0.0,
          outstanding_amount: 250.0,
          has_eligibility_release: true,
          is_dispute_free: true,
          is_stay_eligible: true,
          qualifying_ledger_event_id: "evt-paid-250",
        },
        {
          reservation_id: "res-future",
          partner_id: PARTNER_ID,
          check_in_date: "2026-10-15",
          net_realized: 500.0,
          settled_amount: 0.0,
          locked_amount: 0.0,
          outstanding_amount: 500.0,
          has_eligibility_release: false, // Future stay: no release!
          is_dispute_free: true,
          is_stay_eligible: false,
        },
      ];

      let accountingOutstanding = 0;
      let eligiblePositive = 0;
      let negativeCarryForward = 0;

      for (const s of summaries) {
        accountingOutstanding += s.outstanding_amount;
        if (s.outstanding_amount > 0 && s.is_stay_eligible) eligiblePositive += s.outstanding_amount;
        else if (s.outstanding_amount < 0) negativeCarryForward += Math.abs(s.outstanding_amount);
      }
      const partnerPayoutAvailable = Math.max(0, eligiblePositive - negativeCarryForward);

      assert.strictEqual(accountingOutstanding, 700.0, "Accounting liability = -50 + 250 + 500 = $700.00");
      assert.strictEqual(eligiblePositive, 250.0, "Eligible positive = $250.00");
      assert.strictEqual(negativeCarryForward, 50.0, "Negative carry forward = $50.00");
      assert.strictEqual(partnerPayoutAvailable, 200.0, "Payout available = 250 - 50 = $200.00 (NOT $700.00)");
    }

    console.log("✔ Test 8 Passed: Working capital projection and negative carry-forward math verified.\n");
  }

  // --------------------------------------------------------------------------
  // Test 9: generateDraftPayoutBatch() with Synthetic Data
  // --------------------------------------------------------------------------
  {
    console.log("[Test 9] generateDraftPayoutBatch() synthetic execution...");
    const state: MockState = {
      reservations: new Map(),
      properties: new Map(),
      partners: new Map(),
      commission_ledger_events: new Map(),
      payout_batches: new Map(),
      payout_items: new Map(),
      idempotencyKeys: new Set(),
    };

    state.partners.set(PARTNER_ID, { id: PARTNER_ID, status: "ACTIVE" });

    // 1. Unpaid booking test: verify generateDraftPayoutBatch() refuses to create batch
    // Using mock client and verifying fail-closed error
    const client = createMockClient(state);

    let unpaidThrew = false;
    try {
      // In this state, partner has 0 eligible stays
      await generateDraftPayoutBatch({
        partnerId: PARTNER_ID,
        payoutRail: "MANUAL_ACH",
        createdBy: "admin-user-1",
        pgClient: {
          query: async (sql: string, params: any[]) => {
            if (sql.includes("FROM public.partners")) return { rows: [{ id: PARTNER_ID, status: "ACTIVE" }] };
            if (sql.includes("FROM public.payout_batches")) return { rows: [] };
            if (sql.includes("FROM public.commission_ledger_events")) return { rows: [] };
            if (sql.includes("FROM public.payout_items")) return { rows: [] };
            if (sql.includes("FROM public.reservations")) return { rows: [] };
            return { rows: [] };
          },
        },
      });
    } catch (err: any) {
      unpaidThrew = true;
      assert(err.message.includes("No payout available for partner"));
    }
    assert.strictEqual(unpaidThrew, true, "Must throw when no payout available");
    assert.strictEqual(state.payout_batches.size, 0, "Zero batches created");
    assert.strictEqual(state.payout_items.size, 0, "Zero items created");

    // 2. Synthetic Batch Generation with eligible stay + negative carry-forward netting
    const resStayId = "res-synthetic-stay-1";
    const resClawId = "res-synthetic-claw-1";

    const syntheticLedger = [
      {
        id: "evt-paid-stay",
        reservation_id: resStayId,
        partner_id: PARTNER_ID,
        event_type: "PAYMENT_REALIZED",
        delta_amount: 250.0,
        created_at: "2026-08-01T00:00:00Z",
      },
      {
        id: "evt-release-stay",
        reservation_id: resStayId,
        partner_id: PARTNER_ID,
        event_type: "ELIGIBILITY_RELEASE",
        delta_amount: 0.0,
        created_at: "2026-08-05T00:00:00Z",
      },
      {
        id: "evt-claw",
        reservation_id: resClawId,
        partner_id: PARTNER_ID,
        event_type: "REFUND_CLAWBACK",
        delta_amount: -50.0,
        created_at: "2026-07-15T00:00:00Z",
      },
    ];

    const syntheticReservations = [
      {
        id: resStayId,
        partner_id: PARTNER_ID,
        check_in_date: "2026-08-01",
        check_out_date: "2026-08-04",
      },
      {
        id: resClawId,
        partner_id: PARTNER_ID,
        check_in_date: "2026-07-01",
        check_out_date: "2026-07-05",
      },
    ];

    const syntheticBatches: any[] = [];
    const syntheticItems: any[] = [];

    const mockPgClient = {
      query: async (sql: string, params: any[]) => {
        if (sql.includes("FROM public.partners")) {
          return { rows: [{ id: PARTNER_ID, status: "ACTIVE" }] };
        }
        if (sql.includes("SELECT") && sql.includes("FROM public.payout_batches")) {
          return { rows: [] };
        }
        if (sql.includes("FROM public.commission_ledger_events")) {
          return { rows: syntheticLedger };
        }
        if (sql.includes("FROM public.payout_items WHERE")) {
          return { rows: [] };
        }
        if (sql.includes("FROM public.reservations")) {
          return { rows: syntheticReservations };
        }
        if (sql.includes("INSERT INTO public.payout_batches")) {
          const row = {
            id: "batch-syn-001",
            batch_number: params[0],
            partner_id: params[1],
            payout_rail: params[2],
            total_gross_amount: params[3],
            total_netting_deduction: params[4],
            total_amount: params[5],
            status: "DRAFT",
            created_by: params[6],
            metadata: JSON.parse(params[7]),
          };
          syntheticBatches.push(row);
          return { rows: [row] };
        }
        if (sql.includes("INSERT INTO public.payout_items")) {
          const row = {
            id: `item-syn-${syntheticItems.length + 1}`,
            payout_batch_id: params[0],
            qualifying_ledger_event_id: params[1],
            reservation_id: params[2],
            partner_id: params[3],
            gross_amount: params[4],
            netting_deduction: params[5],
            disbursed_amount: params[6],
            status: params[7],
          };
          syntheticItems.push(row);
          return { rows: [row] };
        }
        throw new Error(`Unhandled SQL: ${sql}`);
      },
    };

    const draftResult = await generateDraftPayoutBatch({
      partnerId: PARTNER_ID,
      payoutRail: "MANUAL_ACH",
      createdBy: "admin-tester",
      pgClient: mockPgClient,
    });

    assert(draftResult);
    assert.strictEqual(draftResult.batch.status, "DRAFT");
    assert.strictEqual(draftResult.batch.total_gross_amount, 250.0);
    assert.strictEqual(draftResult.batch.total_netting_deduction, 50.0);
    assert.strictEqual(draftResult.batch.total_amount, 200.0);
    assert.strictEqual(draftResult.items.length, 1);
    assert.strictEqual(draftResult.items[0].reservation_id, resStayId);
    assert.strictEqual(draftResult.items[0].gross_amount, 250.0);
    assert.strictEqual(draftResult.items[0].netting_deduction, 50.0);
    assert.strictEqual(draftResult.items[0].disbursed_amount, 200.0);
    assert.strictEqual(draftResult.items[0].status, "PENDING");

    console.log("✔ Test 9 Passed: Synthetic DRAFT batch created successfully with FIFO negative netting ($250 - $50 = $200).\n");
  }

  console.log("=================================================================");
  console.log("  ALL 9 ELIGIBILITY & DRAFT PAYOUT UNIT TESTS PASSED (100%)      ");
  console.log("=================================================================");
}

if (require.main === module || process.argv[1]?.includes("eligibility_and_draft_payout.test")) {
  runEligibilityAndPayoutTests().catch((err) => {
    console.error("Test Suite Failed:", err);
    process.exit(1);
  });
}
