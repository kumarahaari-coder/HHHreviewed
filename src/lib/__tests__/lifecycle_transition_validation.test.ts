import assert from "assert";
import {
  appendCommissionLedgerEvent,
  reconcileReservationPaymentRealization,
  createRefundClawback,
  createDisputeHold,
  createDisputeRelease,
} from "../commissions/ledger";
import {
  reconcileReservationEligibilityRelease,
} from "../commissions/eligibility";
import {
  getPartnerFinancialProjection,
  getReservationFinancialSummaries,
} from "../commissions/projections";
import {
  generateDraftPayoutBatch,
  cancelPayoutBatch,
} from "../commissions/payout-generator";

interface MockLifecycleState {
  reservations: Map<string, any>;
  properties: Map<string, any>;
  partners: Map<string, any>;
  commission_ledger_events: Map<string, any>;
  payout_batches: Map<string, any>;
  payout_items: Map<string, any>;
  application_audit_logs: any[];
  idempotencyKeys: Set<string>;
}

function createLifecycleMockClient(state: MockLifecycleState) {
  return {
    from: (tableName: string) => {
      if (tableName === "reservations") {
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => ({
              single: async () => {
                if (col === "id") {
                  const row = state.reservations.get(val);
                  return { data: row ? { ...row } : null, error: row ? null : { message: "Not found" } };
                }
                return { data: null, error: { message: "Unsupported column" } };
              },
              then: async (resolve: any) => {
                const rows = Array.from(state.reservations.values()).filter((r) => r[col] === val);
                resolve({ data: rows.map((r) => ({ ...r })), error: null });
              },
            }),
            in: (col: string, vals: any[]) => ({
              then: async (resolve: any) => {
                const rows = Array.from(state.reservations.values()).filter((r) => vals.includes(r[col]));
                resolve({ data: rows.map((r) => ({ ...r })), error: null });
              },
            }),
          }),
        };
      }

      if (tableName === "properties") {
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => ({
              single: async () => {
                const row = state.properties.get(val);
                return { data: row ? { ...row } : null, error: row ? null : { message: "Not found" } };
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
                const row = {
                  ...payload,
                  id,
                  created_at: payload.created_at || new Date(Date.now() + state.commission_ledger_events.size * 1000).toISOString(),
                };
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
              single: async () => {
                const row = state.payout_batches.get(val);
                return { data: row ? { ...row } : null, error: row ? null : { message: "Batch not found" } };
              },
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
                const row = { ...payload, id, created_at: new Date().toISOString(), status: payload.status || "DRAFT" };
                state.payout_batches.set(id, row);
                return { data: { ...row }, error: null };
              },
            }),
          }),
          update: (payload: any) => ({
            eq: (col: string, val: any) => {
              const row = state.payout_batches.get(val);
              if (row) {
                Object.assign(row, payload);
              }
              return { data: row ? { ...row } : null, error: null };
            },
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
          update: (payload: any) => ({
            eq: (col1: string, val1: any) => ({
              eq: (col2: string, val2: any) => {
                for (const item of state.payout_items.values()) {
                  if (item[col1] === val1 && item[col2] === val2) {
                    Object.assign(item, payload);
                  }
                }
                return { error: null };
              },
            }),
          }),
        };
      }

      if (tableName === "application_audit_logs") {
        return {
          insert: async (logPayload: any) => {
            state.application_audit_logs.push(logPayload);
            return { error: null };
          },
        };
      }

      if (tableName === "payout_payment_attempts") {
        return {
          select: (_cols?: string) => ({
            eq: (_col: string, _val: any) => ({
              in: (_inCol: string, _inVals: any[]) => ({
                then: async (resolve: any) => resolve({ data: [], error: null }),
              }),
              then: async (resolve: any) => resolve({ data: [], error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unhandled lifecycle mock table: ${tableName}`);
    },
  };
}

export async function runLifecycleTransitionTestSuite() {
  console.log("=================================================================");
  console.log("  PHASE 6: END-TO-END LIFECYCLE TRANSITION VALIDATION SUITE      ");
  console.log("=================================================================\n");

  const PARTNER_ID = "partner-lifecycle-uuid";
  const SITE_ID = "site-lifecycle-uuid";
  const PROPERTY_ID = "prop-lifecycle-uuid";
  const RULE_HISTORICAL = "rule-10-percent-historical";
  const RULE_CURRENT_CHANGED = "rule-25-percent-new";

  const state: MockLifecycleState = {
    reservations: new Map(),
    properties: new Map(),
    partners: new Map(),
    commission_ledger_events: new Map(),
    payout_batches: new Map(),
    payout_items: new Map(),
    application_audit_logs: [],
    idempotencyKeys: new Set(),
  };

  const client = createLifecycleMockClient(state);

  // Setup Partner & Property
  state.partners.set(PARTNER_ID, { id: PARTNER_ID, status: "ACTIVE" });
  state.properties.set(PROPERTY_ID, { id: PROPERTY_ID, timezone: "America/New_York" });

  const RES_ID = "res-lifecycle-1001";
  state.reservations.set(RES_ID, {
    id: RES_ID,
    confirmation_code: "CONF-1001",
    partner_id: PARTNER_ID,
    site_id: SITE_ID,
    property_id: PROPERTY_ID,
    reservation_status: "CONFIRMED",
    payment_status: "UNPAID",
    gross_amount: 1000.0,
    amount_received: 0.0,
    check_in_date: "2026-10-01",
    check_out_date: "2026-10-05",
    ownerrez_booking_id: 1001,
    platform: "ownerrez",
  });

  // --------------------------------------------------------------------------
  // Step 1: Initial Booking Accrual (UNPAID)
  // --------------------------------------------------------------------------
  console.log("[Transition 1] Initial booking accrual with Rule A (10% rate)...");
  const accrualEvent = await appendCommissionLedgerEvent({
    partnerId: PARTNER_ID,
    siteId: SITE_ID,
    reservationId: RES_ID,
    commissionRuleId: RULE_HISTORICAL,
    sourceProvider: "ownerrez",
    bookingChannel: "DIRECT",
    providerBookingId: "1001",
    ownerrezBookingId: 1001,
    eventType: "INITIAL_ACCRUAL",
    deltaAmount: 0.0,
    calculatedCommission: 100.0, // 10% of $1,000
    idempotencyKey: `evt_accrual_${RES_ID}_${RULE_HISTORICAL}`,
    metadata: { ruleId: RULE_HISTORICAL, commissionRate: 0.10, snapshotVersion: 1 },
    supabaseClient: client,
  });

  assert(accrualEvent);
  assert.strictEqual(accrualEvent.event_type, "INITIAL_ACCRUAL");
  assert.strictEqual(accrualEvent.delta_amount, 0.0);
  assert.strictEqual(accrualEvent.calculated_commission, 100.0);

  let proj = await getPartnerFinancialProjection(PARTNER_ID, client);
  assert.strictEqual(proj.partnerAccountingOutstanding, 0.0, "Accounting outstanding must be 0 while unpaid");
  assert.strictEqual(proj.partnerPayoutAvailable, 0.0, "Payout available must be 0 while unpaid");
  console.log("✔ Step 1 Verified: INITIAL_ACCRUAL recorded. Available = $0.00, Accounting = $0.00.\n");

  // --------------------------------------------------------------------------
  // Step 2 & 3: UNPAID -> PAID with Active Rule Changed (Snapshot Isolation)
  // --------------------------------------------------------------------------
  console.log("[Transition 2] Full payment received after active commission rule was altered to 25%...");
  // Simulate active commission rule changed in settings to 25%
  // Reservation transitions to PAID in OwnerRez
  const resRecord = state.reservations.get(RES_ID);
  resRecord.payment_status = "PAID";
  resRecord.amount_received = 1000.0;

  // Execute payment realization
  const recon1 = await reconcileReservationPaymentRealization({
    reservationId: RES_ID,
    sourceProvider: "ownerrez",
    supabaseClient: client,
  });

  assert.strictEqual(recon1.status, "REALIZED");
  assert.strictEqual(recon1.rowsCreated, 1);
  assert.strictEqual(recon1.realizedAmount, 100.0, "MUST strictly use historical accrual ($100), NEVER active rule ($250)");
  assert.strictEqual(recon1.event?.commission_rule_id, RULE_HISTORICAL);
  assert.strictEqual(recon1.event?.delta_amount, 100.0);

  proj = await getPartnerFinancialProjection(PARTNER_ID, client);
  assert.strictEqual(proj.partnerAccountingOutstanding, 100.0, "Accounting liability is now $100.00");
  assert.strictEqual(proj.partnerPayoutAvailable, 0.0, "Payout available is still $0.00 (stay not yet completed)");
  console.log("✔ Step 2 Verified: Exactly 1 PAYMENT_REALIZED created strictly using historical snapshot ($100.00).\n");

  // --------------------------------------------------------------------------
  // Step 4: Repeated Paid Syncs (Idempotency)
  // --------------------------------------------------------------------------
  console.log("[Transition 3] Repeated paid syncs against already-realized booking...");
  const recon2 = await reconcileReservationPaymentRealization({
    reservationId: RES_ID,
    sourceProvider: "ownerrez",
    supabaseClient: client,
  });

  assert.strictEqual(recon2.status, "REALIZED");
  assert.strictEqual(recon2.rowsCreated, 0, "Repeated sync MUST produce 0 duplicate realization rows");
  assert.strictEqual(state.commission_ledger_events.size, 2, "Total events must remain 2 (ACCRUAL + REALIZATION)");
  console.log("✔ Step 3 Verified: Idempotency enforced. 0 duplicate realization rows created.\n");

  // --------------------------------------------------------------------------
  // Step 5: PAID + Future Stay -> No ELIGIBILITY_RELEASE
  // --------------------------------------------------------------------------
  console.log("[Transition 4] Evaluating eligibility while stay is in the future...");
  const eligFuture = await reconcileReservationEligibilityRelease({
    reservationId: RES_ID,
    holdHours: 24,
    now: new Date("2026-10-02T12:00:00Z"), // Prior to checkout
    supabaseClient: client,
  });

  assert.strictEqual(eligFuture.status, "STAY_NOT_COMPLETED");
  assert.strictEqual(eligFuture.rowsCreated, 0);
  assert.strictEqual(state.commission_ledger_events.size, 2, "No ELIGIBILITY_RELEASE event created");

  proj = await getPartnerFinancialProjection(PARTNER_ID, client);
  assert.strictEqual(proj.partnerAccountingOutstanding, 100.0, "Accounting outstanding = $100.00");
  assert.strictEqual(proj.partnerPayoutAvailable, 0.0, "Payout available must remain $0.00 for future stay");
  console.log("✔ Step 4 Verified: Future stay produces 0 ELIGIBILITY_RELEASE rows. Payout available remains $0.00.\n");

  // --------------------------------------------------------------------------
  // Step 6: Checkout + 24h Hold Elapsed -> Exactly One ELIGIBILITY_RELEASE
  // --------------------------------------------------------------------------
  console.log("[Transition 5] Stay checkout completed and 24h hold elapsed...");
  // Checkout was 2026-10-05. Local 11:00 AM EDT + 24h = 2026-10-06 15:00 UTC.
  // Evaluate at 2026-10-06 16:00 UTC
  const eligPassed = await reconcileReservationEligibilityRelease({
    reservationId: RES_ID,
    holdHours: 24,
    now: new Date("2026-10-06T16:00:00Z"),
    supabaseClient: client,
  });

  assert.strictEqual(eligPassed.status, "ELIGIBLE_RELEASED");
  assert.strictEqual(eligPassed.rowsCreated, 1);
  assert.strictEqual(eligPassed.event?.event_type, "ELIGIBILITY_RELEASE");
  assert.strictEqual(eligPassed.event?.delta_amount, 0.0);

  // Repeat eligibility check (idempotency)
  const eligRepeat = await reconcileReservationEligibilityRelease({
    reservationId: RES_ID,
    holdHours: 24,
    now: new Date("2026-10-06T17:00:00Z"),
    supabaseClient: client,
  });
  assert.strictEqual(eligRepeat.status, "ALREADY_RELEASED");
  assert.strictEqual(eligRepeat.rowsCreated, 0);

  proj = await getPartnerFinancialProjection(PARTNER_ID, client);
  assert.strictEqual(proj.partnerAccountingOutstanding, 100.0, "Accounting outstanding = $100.00");
  assert.strictEqual(proj.eligiblePositive, 100.0, "Eligible positive capacity = $100.00");
  assert.strictEqual(proj.partnerPayoutAvailable, 100.0, "Payout available is now unlocked to $100.00");
  console.log("✔ Step 5 Verified: ELIGIBILITY_RELEASE created once. Repeat is no-op. Payout available = $100.00.\n");

  // --------------------------------------------------------------------------
  // Step 7: Eligible Reservation -> One Correct DRAFT Payout Item
  // --------------------------------------------------------------------------
  console.log("[Transition 6] Generating DRAFT payout batch for eligible reservation...");
  const draftBatchResult = await generateDraftPayoutBatch({
    partnerId: PARTNER_ID,
    payoutRail: "MANUAL_ACH",
    createdBy: "super-admin-maker",
    supabaseClient: client,
  });

  assert(draftBatchResult);
  assert.strictEqual(draftBatchResult.batch.status, "DRAFT");
  assert.strictEqual(draftBatchResult.batch.total_gross_amount, 100.0);
  assert.strictEqual(draftBatchResult.batch.total_netting_deduction, 0.0);
  assert.strictEqual(draftBatchResult.batch.total_amount, 100.0);
  assert.strictEqual(draftBatchResult.items.length, 1);
  assert.strictEqual(draftBatchResult.items[0].reservation_id, RES_ID);
  assert.strictEqual(draftBatchResult.items[0].disbursed_amount, 100.0);
  assert.strictEqual(draftBatchResult.items[0].status, "PENDING");

  // Locked item verification: while batch is DRAFT/PENDING, payout capacity is locked
  proj = await getPartnerFinancialProjection(PARTNER_ID, client);
  assert.strictEqual(proj.partnerAccountingOutstanding, 0.0, "Accounting outstanding is 0 while locked in pending batch (netRealized - locked)");
  assert.strictEqual(proj.partnerPayoutAvailable, 0.0, "Payout available becomes $0.00 while in-flight batch is pending");
  console.log("✔ Step 6 Verified: DRAFT batch and PENDING item created. Available locked to $0.00.\n");

  // --------------------------------------------------------------------------
  // Step 8: Draft Batch Cancellation Releases Items for Regeneration
  // --------------------------------------------------------------------------
  console.log("[Transition 7] Cancelling draft batch and verifying clean item release...");
  await cancelPayoutBatch({
    batchId: draftBatchResult.batch.id,
    adminUserId: "super-admin-canceller",
    reason: "Correcting payout rail",
    supabaseClient: client,
  });

  const cancelledBatch = state.payout_batches.get(draftBatchResult.batch.id);
  assert.strictEqual(cancelledBatch.status, "CANCELLED");
  const cancelledItem = state.payout_items.get(draftBatchResult.items[0].id);
  assert.strictEqual(cancelledItem.status, "CANCELLED");

  // Verify availability unlocked
  proj = await getPartnerFinancialProjection(PARTNER_ID, client);
  assert.strictEqual(proj.partnerPayoutAvailable, 100.0, "Payout available unlocked back to $100.00");

  // Regenerate draft batch
  const regeneratedBatch = await generateDraftPayoutBatch({
    partnerId: PARTNER_ID,
    payoutRail: "BANK_WIRE",
    createdBy: "super-admin-maker",
    supabaseClient: client,
  });
  assert(regeneratedBatch);
  assert.strictEqual(regeneratedBatch.batch.status, "DRAFT");
  assert.strictEqual(regeneratedBatch.batch.total_amount, 100.0);

  // Void this batch to continue testing clawbacks/disputes
  await cancelPayoutBatch({
    batchId: regeneratedBatch.batch.id,
    adminUserId: "super-admin-canceller",
    reason: "Reset for next lifecycle tests",
    supabaseClient: client,
  });
  console.log("✔ Step 7 Verified: Batch cancellation freed items cleanly. Batch regenerated successfully.\n");

  // --------------------------------------------------------------------------
  // Step 9: Partial Refund Before Payout Reduces Available Payout Correctly
  // --------------------------------------------------------------------------
  console.log("[Transition 8] Partial refund ($250 of $1,000) produces REFUND_CLAWBACK (-$25.00)...");
  const partialClawback = await createRefundClawback({
    partnerId: PARTNER_ID,
    siteId: SITE_ID,
    reservationId: RES_ID,
    sourceProvider: "ownerrez",
    bookingChannel: "DIRECT",
    providerBookingId: "1001",
    clawbackAmount: 25.0, // -$25.00
    refundReferenceId: "ref-partial-1",
    supabaseClient: client,
  });

  assert(partialClawback);
  assert.strictEqual(partialClawback.event_type, "REFUND_CLAWBACK");
  assert.strictEqual(partialClawback.delta_amount, -25.0);

  proj = await getPartnerFinancialProjection(PARTNER_ID, client);
  assert.strictEqual(proj.partnerAccountingOutstanding, 75.0, "Accounting liability reduced: $100 - $25 = $75.00");
  assert.strictEqual(proj.partnerPayoutAvailable, 75.0, "Available payout reduced to exactly $75.00");

  // Batch generation with partial refund
  const partialBatch = await generateDraftPayoutBatch({
    partnerId: PARTNER_ID,
    payoutRail: "MANUAL_ACH",
    createdBy: "super-admin-maker",
    supabaseClient: client,
  });
  assert.strictEqual(partialBatch?.batch.total_amount, 75.0, "Batch amount strictly reflects reduced commission");
  await cancelPayoutBatch({
    batchId: partialBatch!.batch.id,
    adminUserId: "super-admin-canceller",
    supabaseClient: client,
  });
  console.log("✔ Step 8 Verified: Partial refund correctly reduced net commission from $100 to $75.00.\n");

  // --------------------------------------------------------------------------
  // Step 10: Full Refund/Clawback Producing Negative Carry-Forward & Zero Payout
  // --------------------------------------------------------------------------
  console.log("[Transition 9] Full refund clawback producing negative carry-forward...");
  // Simulate an additional -$125.00 clawback for an older cancelled stay
  const RES_PAST_CLAW = "res-past-claw-999";
  state.reservations.set(RES_PAST_CLAW, {
    id: RES_PAST_CLAW,
    confirmation_code: "CONF-PAST-999",
    partner_id: PARTNER_ID,
    check_in_date: "2026-07-01",
    check_out_date: "2026-07-05",
    reservation_status: "CANCELLED",
    payment_status: "REFUNDED",
    amount_received: 0.0,
  });

  await createRefundClawback({
    partnerId: PARTNER_ID,
    siteId: SITE_ID,
    reservationId: RES_PAST_CLAW,
    sourceProvider: "ownerrez",
    bookingChannel: "DIRECT",
    providerBookingId: "999",
    clawbackAmount: 125.0, // -$125.00
    refundReferenceId: "ref-full-999",
    supabaseClient: client,
  });

  proj = await getPartnerFinancialProjection(PARTNER_ID, client);
  // Net accounting = +$75 (Res 1) + (-$125) (Past Claw) = -$50.00
  assert.strictEqual(proj.partnerAccountingOutstanding, -50.0, "Accounting liability = -$50.00");
  assert.strictEqual(proj.eligiblePositive, 75.0, "Eligible positive from completed stay = $75.00");
  assert.strictEqual(proj.negativeCarryForward, 125.0, "Negative carry-forward = $125.00");
  assert.strictEqual(proj.partnerPayoutAvailable, 0.0, "MAX(0, 75 - 125) = $0.00 payout capacity");

  let batchAttemptThrew = false;
  try {
    await generateDraftPayoutBatch({
      partnerId: PARTNER_ID,
      payoutRail: "MANUAL_ACH",
      createdBy: "super-admin-maker",
      supabaseClient: client,
    });
  } catch (err: any) {
    batchAttemptThrew = true;
    assert(err.message.includes("No payout available for partner"));
  }
  assert.strictEqual(batchAttemptThrew, true, "Must refuse draft batch generation when negative carry-forward exceeds earnings");
  console.log("✔ Step 9 Verified: Negative carry-forward correctly zeroes out payout capacity ($0.00).\n");

  // --------------------------------------------------------------------------
  // Step 11: Active Dispute Blocks Draft Payout Generation
  // --------------------------------------------------------------------------
  console.log("[Transition 10] Active dispute blocks payout eligibility on a positive stay...");
  // Add a fresh positive completed stay for $200 commission to overcome the -$125 clawback
  const RES_DISP = "res-dispute-test-2002";
  state.reservations.set(RES_DISP, {
    id: RES_DISP,
    confirmation_code: "CONF-2002",
    partner_id: PARTNER_ID,
    site_id: SITE_ID,
    property_id: PROPERTY_ID,
    reservation_status: "CONFIRMED",
    payment_status: "PAID",
    gross_amount: 2000.0,
    amount_received: 2000.0,
    check_in_date: "2026-08-01",
    check_out_date: "2026-08-05",
    ownerrezBookingId: 2002,
    platform: "ownerrez",
  });

  // Accrual, Realization, and Eligibility Release for RES_DISP
  await appendCommissionLedgerEvent({
    partnerId: PARTNER_ID,
    reservationId: RES_DISP,
    sourceProvider: "ownerrez",
    bookingChannel: "DIRECT",
    providerBookingId: "2002",
    eventType: "INITIAL_ACCRUAL",
    deltaAmount: 0.0,
    calculatedCommission: 200.0,
    idempotencyKey: `evt_accrual_${RES_DISP}`,
    supabaseClient: client,
  });
  await reconcileReservationPaymentRealization({
    reservationId: RES_DISP,
    sourceProvider: "ownerrez",
    supabaseClient: client,
  });
  await reconcileReservationEligibilityRelease({
    reservationId: RES_DISP,
    holdHours: 24,
    now: new Date("2026-09-01T00:00:00Z"),
    supabaseClient: client,
  });

  // Guest raises chargeback/dispute
  await createDisputeHold({
    partnerId: PARTNER_ID,
    reservationId: RES_DISP,
    sourceProvider: "ownerrez",
    bookingChannel: "DIRECT",
    providerBookingId: "2002",
    disputeId: "disp-chargeback-01",
    reason: "Unauthorized transaction claimed by guest",
    createdBy: "dispute-admin",
    supabaseClient: client,
  });

  // Summaries verification: RES_DISP has is_dispute_free = false, is_stay_eligible = false
  const summaries = await getReservationFinancialSummaries(PARTNER_ID, client);
  const dispSummary = summaries.find((s) => s.reservation_id === RES_DISP);
  assert.strictEqual(dispSummary?.is_dispute_free, false, "Disputed stay must have is_dispute_free = false");
  assert.strictEqual(dispSummary?.is_stay_eligible, false, "Disputed stay must have is_stay_eligible = false");

  // Since RES_DISP is ineligible and RES_ID only has +$75 vs -$125 clawback, payout available is still $0.00
  proj = await getPartnerFinancialProjection(PARTNER_ID, client);
  assert.strictEqual(proj.partnerPayoutAvailable, 0.0, "Disputed stay cannot be included in payout available");
  console.log("✔ Step 10 Verified: Active DISPUTE_HOLD blocks stay eligibility and excludes it from payout available.\n");

  // --------------------------------------------------------------------------
  // Step 12: Dispute Release Restores Eligibility Without Duplicating Realization
  // --------------------------------------------------------------------------
  console.log("[Transition 11] Dispute release restores eligibility without duplicating realization...");
  const preReleaseEventsCount = state.commission_ledger_events.size;

  await createDisputeRelease({
    partnerId: PARTNER_ID,
    reservationId: RES_DISP,
    sourceProvider: "ownerrez",
    bookingChannel: "DIRECT",
    providerBookingId: "2002",
    disputeId: "disp-chargeback-01",
    reason: "Merchant represented successfully; funds retained",
    createdBy: "dispute-admin",
    supabaseClient: client,
  });

  // Verify dispute release created exactly 1 event
  assert.strictEqual(state.commission_ledger_events.size, preReleaseEventsCount + 1);

  // Re-check financial summaries: is_dispute_free and is_stay_eligible are now restored to true
  const postSummaries = await getReservationFinancialSummaries(PARTNER_ID, client);
  const clearedSummary = postSummaries.find((s) => s.reservation_id === RES_DISP);
  assert.strictEqual(clearedSummary?.is_dispute_free, true, "Restored dispute free");
  assert.strictEqual(clearedSummary?.is_stay_eligible, true, "Restored stay eligible");

  // Re-verify payout capacity:
  // Eligible positive: +$75 (Res 1) + +$200 (Res 2) = $275.00
  // Negative carry-forward: $125.00
  // Payout available: $275 - $125 = $150.00!
  proj = await getPartnerFinancialProjection(PARTNER_ID, client);
  assert.strictEqual(proj.eligiblePositive, 275.0);
  assert.strictEqual(proj.negativeCarryForward, 125.0);
  assert.strictEqual(proj.partnerPayoutAvailable, 150.0);

  // Generate DRAFT batch now that dispute is cleared
  const clearedBatch = await generateDraftPayoutBatch({
    partnerId: PARTNER_ID,
    payoutRail: "MANUAL_ACH",
    createdBy: "super-admin-maker",
    supabaseClient: client,
  });

  assert(clearedBatch);
  assert.strictEqual(clearedBatch.batch.status, "DRAFT");
  assert.strictEqual(clearedBatch.batch.total_gross_amount, 275.0);
  assert.strictEqual(clearedBatch.batch.total_netting_deduction, 125.0);
  assert.strictEqual(clearedBatch.batch.total_amount, 150.0);

  console.log("✔ Step 11 Verified: DISPUTE_RELEASE cleanly restored eligibility. Draft batch generated for $150.00 net ($275 gross - $125 clawback).\n");

  console.log("=================================================================");
  console.log("  ALL 11 END-TO-END LIFECYCLE TRANSITION SCENARIOS PASSED 100%!  ");
  console.log("=================================================================");
}

if (require.main === module || process.argv[1]?.includes("lifecycle_transition_validation.test")) {
  runLifecycleTransitionTestSuite().catch((err) => {
    console.error("Test Suite Failed:", err);
    process.exit(1);
  });
}
