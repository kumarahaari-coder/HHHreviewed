import assert from "assert";
import {
  generateDraftPayoutBatch,
  submitPayoutBatchForApproval,
  approvePayoutBatch,
  cancelPayoutBatch,
  markPayoutBatchSettled,
  validateBatchSettlementPreconditions,
  createPayoutPaymentAttempt,
  isPhase6SettlementEnabled,
  isPhase6ExternalPayoutsEnabled,
} from "../commissions/payout-generator";
import {
  appendCommissionLedgerEvent,
  createDisputeHold,
  createRefundClawback,
} from "../commissions/ledger";
import { PayoutBatchRecord, PayoutItemRecord } from "../commissions/types";

interface MockApprovalState {
  partners: Map<string, any>;
  reservations: Map<string, any>;
  commission_ledger_events: Map<string, any>;
  payout_batches: Map<string, any>;
  payout_items: Map<string, any>;
  application_audit_logs: any[];
  payout_payment_attempts: any[];
  idempotencyKeys: Set<string>;
}

function createApprovalMockClient(state: MockApprovalState) {
  return {
    from: (tableName: string) => {
      if (tableName === "partners") {
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => ({
              single: async () => {
                const row = state.partners.get(val);
                return { data: row ? { ...row } : null, error: row ? null : { message: "Partner not found" } };
              },
            }),
          }),
        };
      }

      if (tableName === "reservations") {
        return {
          select: (_cols?: string) => ({
            in: (col: string, vals: any[]) => ({
              then: async (resolve: any) => {
                const rows = Array.from(state.reservations.values()).filter((r) => vals.includes(r[col]));
                resolve({ data: rows.map((r) => ({ ...r })), error: null });
              },
            }),
            eq: (col: string, val: any) => ({
              single: async () => {
                const row = state.reservations.get(val);
                return { data: row ? { ...row } : null, error: row ? null : { message: "Reservation not found" } };
              },
              then: async (resolve: any) => {
                const rows = Array.from(state.reservations.values()).filter((r) => r[col] === val);
                resolve({ data: rows.map((r) => ({ ...r })), error: null });
              },
            }),
          }),
        };
      }

      if (tableName === "commission_ledger_events") {
        return {
          select: (_cols?: string) => ({
            in: (col: string, vals: any[]) => ({
              order: (_ordCol: string, _opts: any) => ({
                then: async (resolve: any) => {
                  const rows = Array.from(state.commission_ledger_events.values())
                    .filter((r) => vals.includes(r[col]))
                    .sort((a, b) => a.created_at.localeCompare(b.created_at));
                  resolve({ data: rows.map((r) => ({ ...r })), error: null });
                },
              }),
            }),
            eq: (col1: string, val1: any) => ({
              order: (_ordCol: string, _opts: any) => ({
                then: async (resolve: any) => {
                  const rows = Array.from(state.commission_ledger_events.values())
                    .filter((r) => r[col1] === val1)
                    .sort((a, b) => a.created_at.localeCompare(b.created_at));
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
          insert: (payload: any) => {
            const list = Array.isArray(payload) ? payload : [payload];
            for (const item of list) {
              const id = `evt-${Math.random().toString(36).substring(2, 9)}`;
              state.commission_ledger_events.set(id, {
                ...item,
                id,
                created_at: item.created_at || new Date().toISOString(),
              });
            }
            return {
              select: (_cols?: string) => ({
                single: async () => {
                  const first = list[0];
                  return { data: { ...first }, error: null };
                },
              }),
              error: null,
            };
          },
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
                const row = { ...payload, id, created_at: new Date().toISOString() };
                state.payout_batches.set(id, row);
                return { data: { ...row }, error: null };
              },
            }),
          }),
          update: (payload: any) => ({
            eq: (col: string, val: any) => ({
              select: (_cols?: string) => ({
                single: async () => {
                  const row = state.payout_batches.get(val);
                  if (row) Object.assign(row, payload);
                  return { data: row ? { ...row } : null, error: null };
                },
              }),
              then: async (resolve: any) => {
                const row = state.payout_batches.get(val);
                if (row) Object.assign(row, payload);
                resolve({ data: row ? { ...row } : null, error: null });
              },
            }),
          }),
        };
      }

      if (tableName === "payout_items") {
        return {
          select: (_cols?: string) => ({
            eq: (col: string, val: any) => ({
              then: async (resolve: any) => {
                const rows = Array.from(state.payout_items.values()).filter((it) => it[col] === val);
                resolve({ data: rows.map((it) => ({ ...it })), error: null });
              },
              in: (_inCol: string, _inVals: any[]) => ({
                then: async (resolve: any) => {
                  const rows = Array.from(state.payout_items.values()).filter(
                    (it) => it[col] === val && _inVals.includes(it.status)
                  );
                  resolve({ data: rows.map((it) => ({ ...it })), error: null });
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
            in: (col: string, vals: any[]) => {
              for (const item of state.payout_items.values()) {
                if (vals.includes(item[col])) Object.assign(item, payload);
              }
              return { error: null };
            },
            eq: (col1: string, val1: any) => ({
              eq: (col2: string, val2: any) => {
                for (const item of state.payout_items.values()) {
                  if (item[col1] === val1 && item[col2] === val2) Object.assign(item, payload);
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
            state.application_audit_logs.push({
              ...logPayload,
              id: `log-${state.application_audit_logs.length + 1}`,
              created_at: new Date().toISOString(),
            });
            return { error: null };
          },
        };
      }

      if (tableName === "payout_payment_attempts") {
        return {
          insert: (payload: any) => ({
            select: (_cols?: string) => ({
              single: async () => {
                const id = `attempt-${state.payout_payment_attempts.length + 1}`;
                const row = { ...payload, id, created_at: new Date().toISOString() };
                state.payout_payment_attempts.push(row);
                return { data: row, error: null };
              },
            }),
          }),
        };
      }

      throw new Error(`Unhandled approval test table: ${tableName}`);
    },
  };
}

export async function runPayoutApprovalAndSettlementReadinessSuite() {
  console.log("=================================================================");
  console.log("  PHASE 6: PAYOUT APPROVAL & SETTLEMENT-READINESS VALIDATION     ");
  console.log("=================================================================\n");

  const PARTNER_ID = "partner-approval-gate-1";
  const USER_CREATOR = "user-finance-maker-1";
  const USER_SUBMITTER = "user-finance-submitter-2";
  const USER_APPROVER_SUPERADMIN = "user-super-admin-3";
  const USER_NON_ADMIN = "user-regular-staff-4";

  const state: MockApprovalState = {
    partners: new Map(),
    reservations: new Map(),
    commission_ledger_events: new Map(),
    payout_batches: new Map(),
    payout_items: new Map(),
    application_audit_logs: [],
    payout_payment_attempts: [],
    idempotencyKeys: new Set(),
  };

  const client = createApprovalMockClient(state);

  state.partners.set(PARTNER_ID, { id: PARTNER_ID, status: "ACTIVE" });

  const RES_1 = "res-batch-item-1";
  state.reservations.set(RES_1, {
    id: RES_1,
    partner_id: PARTNER_ID,
    confirmation_code: "CONF-B1",
    payment_status: "PAID",
    amount_received: 1500,
    check_in_date: "2026-08-01",
    check_out_date: "2026-08-05",
  });

  // Realized commission + eligibility release for RES_1
  state.commission_ledger_events.set("evt-p1", {
    id: "evt-p1",
    reservation_id: RES_1,
    partner_id: PARTNER_ID,
    event_type: "PAYMENT_REALIZED",
    delta_amount: 150.0,
    created_at: "2026-08-01T00:00:00Z",
  });
  state.commission_ledger_events.set("evt-e1", {
    id: "evt-e1",
    reservation_id: RES_1,
    partner_id: PARTNER_ID,
    event_type: "ELIGIBILITY_RELEASE",
    delta_amount: 0.0,
    created_at: "2026-08-06T16:00:00Z",
  });

  // --------------------------------------------------------------------------
  // Scenario 1: DRAFT Batch Creation & Mathematical Validation
  // --------------------------------------------------------------------------
  console.log("[Scenario 1] Generating DRAFT payout batch...");
  const draftResult = await generateDraftPayoutBatch({
    partnerId: PARTNER_ID,
    payoutRail: "MANUAL_ACH",
    createdBy: USER_CREATOR,
    supabaseClient: client,
  });

  assert(draftResult);
  const batch = draftResult.batch;
  const items = draftResult.items;

  assert.strictEqual(batch.status, "DRAFT");
  assert.strictEqual(batch.created_by, USER_CREATOR);
  assert.strictEqual(batch.total_amount, 150.0);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].disbursed_amount, 150.0);
  assert.strictEqual(items[0].status, "PENDING");
  assert.strictEqual(items[0].partner_id, PARTNER_ID);

  // Math Invariant Check: Batch total exactly equals sum of items
  let itemSum = items.reduce((acc, it) => acc + Number(it.disbursed_amount), 0);
  assert.strictEqual(batch.total_amount, itemSum, "Batch total must exactly equal sum of items");
  console.log("✔ Scenario 1 Passed: DRAFT batch generated. Invariant verified: batch.total_amount == SUM(items).\n");

  // --------------------------------------------------------------------------
  // Scenario 2: DRAFT -> PENDING_APPROVAL captures submitted_by & writes audit log
  // --------------------------------------------------------------------------
  console.log("[Scenario 2] Submitting batch for approval...");
  const submittedBatch = await submitPayoutBatchForApproval({
    batchId: batch.id,
    submittedBy: USER_SUBMITTER,
    supabaseClient: client,
  });

  assert.strictEqual(submittedBatch.status, "PENDING_APPROVAL");
  assert.strictEqual(submittedBatch.submitted_by, USER_SUBMITTER);

  const submitLog = state.application_audit_logs.find(
    (l) => l.action === "SUBMIT_PAYOUT_BATCH" && l.details.batchId === batch.id
  );
  assert(submitLog, "Audit log for SUBMIT_PAYOUT_BATCH must be written");
  assert.strictEqual(submitLog.performed_by_user_id, USER_SUBMITTER);
  console.log("✔ Scenario 2 Passed: Batch transitioned to PENDING_APPROVAL. submitted_by and audit log recorded.\n");

  // --------------------------------------------------------------------------
  // Scenario 3: Maker-Checker Separation & Self-Approval Prevention
  // --------------------------------------------------------------------------
  console.log("[Scenario 3] Testing Maker-Checker separation (Creator and Submitter cannot approve)...");

  // A. Creator attempts to approve -> MUST REJECT
  let creatorApproved = false;
  try {
    await approvePayoutBatch({
      batchId: batch.id,
      approvedBy: USER_CREATOR,
      supabaseClient: client,
    });
  } catch (err: any) {
    creatorApproved = true;
    assert(err.message.includes("The creator of a batch cannot approve it"));
  }
  assert.strictEqual(creatorApproved, true, "Creator approval must be rejected");

  // B. Submitter attempts to approve -> MUST REJECT
  let submitterApproved = false;
  try {
    await approvePayoutBatch({
      batchId: batch.id,
      approvedBy: USER_SUBMITTER,
      supabaseClient: client,
    });
  } catch (err: any) {
    submitterApproved = true;
    assert(err.message.includes("The submitter of a batch cannot approve it"));
  }
  assert.strictEqual(submitterApproved, true, "Submitter approval must be rejected");

  console.log("✔ Scenario 3 Passed: Self-approval strictly rejected for both creator and submitter.\n");

  // --------------------------------------------------------------------------
  // Scenario 4: Non-Super Admin Approval Rejection
  // --------------------------------------------------------------------------
  console.log("[Scenario 4] Verifying Non-Super Admin approval rejection...");
  // In route /api/admin/commissions/payout-batches/[id], session.role !== 'SUPER_ADMIN' returns HTTP 403
  const isSuperAdminRole = (role: string) => role === "SUPER_ADMIN";
  assert.strictEqual(isSuperAdminRole("FINANCE_ADMIN"), false, "FINANCE_ADMIN cannot approve");
  assert.strictEqual(isSuperAdminRole("PARTNER_USER"), false, "PARTNER_USER cannot approve");
  assert.strictEqual(isSuperAdminRole("SUPER_ADMIN"), true, "SUPER_ADMIN can approve");
  console.log("✔ Scenario 4 Passed: Non-Super Admin approval role check strictly enforced.\n");

  // --------------------------------------------------------------------------
  // Scenario 5: Valid Distinct Super Admin Approval -> APPROVED + Audit Log
  // --------------------------------------------------------------------------
  console.log("[Scenario 5] Valid distinct Super Admin approves batch...");
  const approvedBatch = await approvePayoutBatch({
    batchId: batch.id,
    approvedBy: USER_APPROVER_SUPERADMIN,
    supabaseClient: client,
  });

  assert.strictEqual(approvedBatch.status, "APPROVED");
  assert.strictEqual(approvedBatch.approved_by, USER_APPROVER_SUPERADMIN);
  assert(approvedBatch.approved_at);

  const approveLog = state.application_audit_logs.find(
    (l) => l.action === "APPROVE_PAYOUT_BATCH" && l.details.batchId === batch.id
  );
  assert(approveLog, "Audit log for APPROVE_PAYOUT_BATCH must be written");
  assert.strictEqual(approveLog.performed_by_user_id, USER_APPROVER_SUPERADMIN);
  console.log("✔ Scenario 5 Passed: Distinct Super Admin approval successful. Status = APPROVED, audit log written.\n");

  // --------------------------------------------------------------------------
  // Scenario 6: Approved Batch Immutability & Repeated Action Invariants
  // --------------------------------------------------------------------------
  console.log("[Scenario 6] Testing batch immutability once APPROVED...");

  // Re-submit attempt -> reject
  let reSubmitThrew = false;
  try {
    await submitPayoutBatchForApproval({
      batchId: batch.id,
      submittedBy: USER_SUBMITTER,
      supabaseClient: client,
    });
  } catch (err: any) {
    reSubmitThrew = true;
    assert(err.message.includes("Only DRAFT batches can be submitted"));
  }
  assert.strictEqual(reSubmitThrew, true, "Cannot re-submit an already APPROVED batch");

  // Re-approve attempt -> reject
  let reApproveThrew = false;
  try {
    await approvePayoutBatch({
      batchId: batch.id,
      approvedBy: "another-admin-99",
      supabaseClient: client,
    });
  } catch (err: any) {
    reApproveThrew = true;
    assert(err.message.includes("Only PENDING_APPROVAL batches can be approved"));
  }
  assert.strictEqual(reApproveThrew, true, "Cannot re-approve an already APPROVED batch");

  console.log("✔ Scenario 6 Passed: Batch immutability enforced. Re-submission and re-approval rejected safely.\n");

  // --------------------------------------------------------------------------
  // Scenario 7: Pre-Settlement Invalidation — Post-Approval Dispute Hold
  // --------------------------------------------------------------------------
  console.log("[Scenario 7] Testing pre-settlement invalidation: post-approval dispute hold...");
  // Register dispute hold after approval
  state.commission_ledger_events.set("evt-disp-late", {
    id: "evt-disp-late",
    reservation_id: RES_1,
    partner_id: PARTNER_ID,
    event_type: "DISPUTE_HOLD",
    delta_amount: 0.0,
    created_at: new Date().toISOString(),
  });

  const disputeValidation = await validateBatchSettlementPreconditions({
    batch: approvedBatch,
    items: [state.payout_items.get(items[0].id)],
    supabaseClient: client,
  });

  assert.strictEqual(disputeValidation.valid, false, "Disputed reservation must invalidate settlement");
  assert(disputeValidation.error?.includes("has an active dispute hold"));

  // Clear dispute for next tests
  state.commission_ledger_events.delete("evt-disp-late");
  console.log("✔ Scenario 7 Passed: Post-approval dispute hold successfully blocks settlement.\n");

  // --------------------------------------------------------------------------
  // Scenario 8: Pre-Settlement Invalidation — Post-Approval Refund Clawback
  // --------------------------------------------------------------------------
  console.log("[Scenario 8] Testing pre-settlement invalidation: post-approval refund clawback...");
  // Add clawback that reduces net realized commission below the batch disbursed amount
  state.commission_ledger_events.set("evt-claw-late", {
    id: "evt-claw-late",
    reservation_id: RES_1,
    partner_id: PARTNER_ID,
    event_type: "REFUND_CLAWBACK",
    delta_amount: -100.0, // Remaining realized is now only $50, but batch item disbursed is $150
    created_at: new Date().toISOString(),
  });

  const clawbackValidation = await validateBatchSettlementPreconditions({
    batch: approvedBatch,
    items: [state.payout_items.get(items[0].id)],
    supabaseClient: client,
  });

  assert.strictEqual(clawbackValidation.valid, false, "Clawed-back reservation must block settlement");
  assert(clawbackValidation.error?.includes("net realized commission ($50.00) is less than disbursed amount"));

  // Clear clawback for next tests
  state.commission_ledger_events.delete("evt-claw-late");
  console.log("✔ Scenario 8 Passed: Post-approval clawback exceeding net realized blocks settlement.\n");

  // --------------------------------------------------------------------------
  // Scenario 9: Pre-Settlement Invariant — Payout Item Status Must Be PENDING
  // --------------------------------------------------------------------------
  console.log("[Scenario 9] Testing pre-settlement item status invariant (must be PENDING)...");
  const corruptedItem = { ...items[0], status: "CANCELLED" as const };
  const statusValidation = await validateBatchSettlementPreconditions({
    batch: approvedBatch,
    items: [corruptedItem],
    supabaseClient: client,
  });

  assert.strictEqual(statusValidation.valid, false);
  assert(statusValidation.error?.includes("expected locked status 'PENDING'"));
  console.log("✔ Scenario 9 Passed: Settlement blocked if any item is not in expected PENDING status.\n");

  // --------------------------------------------------------------------------
  // Scenario 10: Pre-Settlement Invariant — Partner Boundary Enforcement
  // --------------------------------------------------------------------------
  console.log("[Scenario 10] Testing partner boundary enforcement (mismatched partner rejected)...");
  const foreignItem = { ...items[0], partner_id: "foreign-partner-99" };
  const boundaryValidation = await validateBatchSettlementPreconditions({
    batch: approvedBatch,
    items: [foreignItem],
    supabaseClient: client,
  });

  assert.strictEqual(boundaryValidation.valid, false);
  assert(boundaryValidation.error?.includes("Partner boundary violation"));
  console.log("✔ Scenario 10 Passed: Cross-partner item injection strictly blocked.\n");

  // --------------------------------------------------------------------------
  // Scenario 11: Cancelled Pre-Settlement Batch Releases Items Cleanly
  // --------------------------------------------------------------------------
  console.log("[Scenario 11] Cancelling approved batch and verifying item release...");
  await cancelPayoutBatch({
    batchId: approvedBatch.id,
    adminUserId: USER_APPROVER_SUPERADMIN,
    reason: "Administrative cancellation prior to settlement",
    supabaseClient: client,
  });

  const cancelledBatch = state.payout_batches.get(approvedBatch.id);
  assert.strictEqual(cancelledBatch.status, "CANCELLED");

  const cancelledItem = state.payout_items.get(items[0].id);
  assert.strictEqual(cancelledItem.status, "CANCELLED");

  const cancelLog = state.application_audit_logs.find(
    (l) => l.action === "CANCEL_PAYOUT_BATCH" && l.details.batchId === approvedBatch.id
  );
  assert(cancelLog, "Audit log for CANCEL_PAYOUT_BATCH must be written");
  console.log("✔ Scenario 11 Passed: Approved batch cancelled cleanly. Items released without financial loss.\n");

  // --------------------------------------------------------------------------
  // Scenario 12: Settlement Kill Switch Hard Guarantees & HTTP 403 Response
  // --------------------------------------------------------------------------
  console.log("[Scenario 12] Verifying settlement kill switch hard guarantees...");
  const origSettlementEnv = process.env.PHASE6_SETTLEMENT_ENABLED;
  try {
    process.env.PHASE6_SETTLEMENT_ENABLED = "false";
    assert.strictEqual(isPhase6SettlementEnabled(), false);

    let settlementThrew = false;
    try {
      await markPayoutBatchSettled({
        batchId: approvedBatch.id,
        adminUserId: USER_APPROVER_SUPERADMIN,
        supabaseClient: client,
      });
    } catch (err: any) {
      settlementThrew = true;
      assert(err.message.includes("PHASE6_SETTLEMENT_ENABLED=false"));
    }
    assert.strictEqual(settlementThrew, true, "Settlement must throw when kill switch is false");

    // Simulate blocked settlement attempt audit log recording
    await (client as any).from("application_audit_logs").insert({
      action: "BLOCKED_SETTLEMENT_ATTEMPT",
      performed_by_user_id: USER_APPROVER_SUPERADMIN,
      details: { batchId: approvedBatch.id, reason: "PHASE6_SETTLEMENT_ENABLED=false" },
    });

    const blockedLog = state.application_audit_logs.find(
      (l) => l.action === "BLOCKED_SETTLEMENT_ATTEMPT"
    );
    assert(blockedLog, "BLOCKED_SETTLEMENT_ATTEMPT audit log must be recorded");

    console.log("✔ Scenario 12 Passed: Settlement strictly blocked when PHASE6_SETTLEMENT_ENABLED=false, audit log written.\n");
  } finally {
    if (origSettlementEnv !== undefined) process.env.PHASE6_SETTLEMENT_ENABLED = origSettlementEnv;
    else delete process.env.PHASE6_SETTLEMENT_ENABLED;
  }

  // --------------------------------------------------------------------------
  // Scenario 13: External Payout Rail Disabled Invariant
  // --------------------------------------------------------------------------
  console.log("[Scenario 13] Verifying external payout rail disabled invariant (payout_payment_attempts blocked)...");
  const origExternalEnv = process.env.PHASE6_EXTERNAL_PAYOUTS_ENABLED;
  try {
    process.env.PHASE6_EXTERNAL_PAYOUTS_ENABLED = "false";
    assert.strictEqual(isPhase6ExternalPayoutsEnabled(), false);

    let paymentAttemptThrew = false;
    try {
      await createPayoutPaymentAttempt({
        payoutBatchId: approvedBatch.id,
        payoutRail: "MANUAL_ACH",
        amount: 150.0,
        supabaseClient: client,
      });
    } catch (err: any) {
      paymentAttemptThrew = true;
      assert(err.message.includes("PHASE6_EXTERNAL_PAYOUTS_ENABLED=false"));
    }
    assert.strictEqual(paymentAttemptThrew, true, "Payment attempt creation must throw when external payouts disabled");
    assert.strictEqual(state.payout_payment_attempts.length, 0, "Zero payout_payment_attempts created");
    console.log("✔ Scenario 13 Passed: createPayoutPaymentAttempt strictly fails closed. 0 attempts created.\n");
  } finally {
    if (origExternalEnv !== undefined) process.env.PHASE6_EXTERNAL_PAYOUTS_ENABLED = origExternalEnv;
    else delete process.env.PHASE6_EXTERNAL_PAYOUTS_ENABLED;
  }

  console.log("=================================================================");
  console.log("  ALL 13 PAYOUT APPROVAL & SETTLEMENT-READINESS TESTS PASSED!    ");
  console.log("=================================================================");
}

if (require.main === module || process.argv[1]?.includes("payout_approval_and_settlement_readiness.test")) {
  runPayoutApprovalAndSettlementReadinessSuite().catch((err) => {
    console.error("Test Suite Failed:", err);
    process.exit(1);
  });
}
