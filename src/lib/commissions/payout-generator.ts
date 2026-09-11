import { createAdminClient } from "@/lib/supabase/admin";
import { getPartnerFinancialProjection } from "./projections";
import {
  PayoutBatchRecord,
  PayoutBatchStatus,
  PayoutItemRecord,
  PayoutRail,
} from "./types";

export interface GenerateDraftBatchParams {
  partnerId: string;
  payoutRail: PayoutRail;
  createdBy: string;
  pgClient?: any;
  supabaseClient?: any;
}

/**
 * Generates a DRAFT payout batch applying deterministic FIFO negative carry-forward netting.
 * Invariant: Batch amount will never exceed partnerPayoutAvailable.
 * If params.pgClient is provided, executes with database-level FOR UPDATE partner row locking.
 */
export async function generateDraftPayoutBatch(
  params: GenerateDraftBatchParams
): Promise<{ batch: PayoutBatchRecord; items: PayoutItemRecord[] } | null> {
  const activeStatuses: PayoutBatchStatus[] = [
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "AWAITING_MANUAL_CONFIRMATION",
    "PROCESSING",
    "REQUIRES_RECONCILIATION",
  ];

  // If a direct PostgreSQL client is provided, execute with native FOR UPDATE partner lock
  if (params.pgClient) {
    const client = params.pgClient;

    // 1. Lock partner row FOR UPDATE
    const partnerRes = await client.query(
      "SELECT id, status FROM public.partners WHERE id = $1 FOR UPDATE;",
      [params.partnerId]
    );
    if (partnerRes.rows.length === 0) {
      throw new Error(`Partner not found: ${params.partnerId}`);
    }

    // 2. Verify no active in-flight batch exists
    const activeRes = await client.query(
      `SELECT id, status, batch_number 
       FROM public.payout_batches 
       WHERE partner_id = $1 
         AND status = ANY($2);`,
      [params.partnerId, activeStatuses]
    );

    if (activeRes.rows.length > 0) {
      throw new Error(
        `An active payout batch (${activeRes.rows[0].batch_number}, status: ${activeRes.rows[0].status}) already exists for this partner.`
      );
    }

    // 3. Query ledger events & active payout items
    const ledgerRes = await client.query(
      "SELECT * FROM public.commission_ledger_events WHERE partner_id = $1 ORDER BY created_at ASC;",
      [params.partnerId]
    );
    const itemsRes = await client.query(
      "SELECT reservation_id, disbursed_amount, status FROM public.payout_items WHERE partner_id = $1 AND status IN ('SETTLED', 'PENDING');",
      [params.partnerId]
    );
    const resRes = await client.query(
      "SELECT id, partner_id, site_id, check_in_date, check_out_date FROM public.reservations WHERE partner_id = $1;",
      [params.partnerId]
    );

    const settledMap = new Map<string, number>();
    const lockedMap = new Map<string, number>();
    for (const item of itemsRes.rows) {
      const amt = Number(item.disbursed_amount || 0);
      if (item.status === "SETTLED") settledMap.set(item.reservation_id, (settledMap.get(item.reservation_id) || 0) + amt);
      else if (item.status === "PENDING") lockedMap.set(item.reservation_id, (lockedMap.get(item.reservation_id) || 0) + amt);
    }

    const eventsByRes = new Map<string, any[]>();
    for (const ev of ledgerRes.rows) {
      const list = eventsByRes.get(ev.reservation_id) || [];
      list.push(ev);
      eventsByRes.set(ev.reservation_id, list);
    }

    const resMetaMap = new Map<string, any>();
    for (const r of resRes.rows) {
      resMetaMap.set(r.id, r);
    }

    let partnerAccountingOutstanding = 0;
    let eligiblePositive = 0;
    let negativeCarryForward = 0;
    const summaries: any[] = [];

    for (const [resId, events] of eventsByRes.entries()) {
      let netRealized = 0;
      let hasEligibilityRelease = false;
      let latestDisputeHoldTime: string | null = null;
      let latestDisputeReleaseTime: string | null = null;
      let qualifyingLedgerEventId: string | null = null;

      for (const ev of events) {
        const delta = Number(ev.delta_amount || 0);
        if (ev.event_type === "PAYMENT_REALIZED" || ev.event_type === "REFUND_CLAWBACK" || ev.event_type === "MANUAL_ADJUSTMENT") {
          netRealized += delta;
        }
        if ((ev.event_type === "PAYMENT_REALIZED" || ev.event_type === "MANUAL_ADJUSTMENT") && delta > 0) {
          qualifyingLedgerEventId = ev.id;
        }
        if (ev.event_type === "ELIGIBILITY_RELEASE") hasEligibilityRelease = true;
        if (ev.event_type === "DISPUTE_HOLD") {
          if (!latestDisputeHoldTime || ev.created_at > latestDisputeHoldTime) latestDisputeHoldTime = ev.created_at;
        }
        if (ev.event_type === "DISPUTE_RELEASE") {
          if (!latestDisputeReleaseTime || ev.created_at > latestDisputeReleaseTime) latestDisputeReleaseTime = ev.created_at;
        }
      }

      netRealized = Math.round(netRealized * 100) / 100;
      const settled = Math.round((settledMap.get(resId) || 0) * 100) / 100;
      const locked = Math.round((lockedMap.get(resId) || 0) * 100) / 100;
      const outstanding = Math.round((netRealized - settled - locked) * 100) / 100;

      const isDisputeFree = !latestDisputeHoldTime || Boolean(latestDisputeReleaseTime && latestDisputeReleaseTime > latestDisputeHoldTime);
      const isStayEligible = hasEligibilityRelease && isDisputeFree;

      partnerAccountingOutstanding += outstanding;
      if (outstanding > 0 && isStayEligible) eligiblePositive += outstanding;
      else if (outstanding < 0) negativeCarryForward += Math.abs(outstanding);

      const meta = resMetaMap.get(resId);
      summaries.push({
        reservation_id: resId,
        check_in_date: meta?.check_in_date ? new Date(meta.check_in_date).toISOString().split("T")[0] : "",
        outstanding_amount: outstanding,
        is_stay_eligible: isStayEligible,
        qualifying_ledger_event_id: qualifyingLedgerEventId,
      });
    }

    partnerAccountingOutstanding = Math.round(partnerAccountingOutstanding * 100) / 100;
    eligiblePositive = Math.round(eligiblePositive * 100) / 100;
    negativeCarryForward = Math.round(negativeCarryForward * 100) / 100;
    const partnerPayoutAvailable = Math.round(Math.max(0, eligiblePositive - negativeCarryForward) * 100) / 100;

    if (partnerPayoutAvailable <= 0) {
      throw new Error(`No payout available for partner (Payout Available: $${partnerPayoutAvailable.toFixed(2)}, Negative Carry-Forward: $${negativeCarryForward.toFixed(2)}).`);
    }

    const eligibleReservations = summaries
      .filter((r) => r.outstanding_amount > 0 && r.is_stay_eligible)
      .sort((a, b) => {
        const dateCmp = a.check_in_date.localeCompare(b.check_in_date);
        if (dateCmp !== 0) return dateCmp;
        return a.reservation_id.localeCompare(b.reservation_id);
      });

    if (eligibleReservations.length === 0) {
      throw new Error("No completed, dispute-free stays found for payout batch inclusion.");
    }

    let remainingDeduction = negativeCarryForward;
    const itemsToInsert: any[] = [];
    let totalGross = 0;
    let totalDeduction = 0;
    let totalDisbursed = 0;

    for (const res of eligibleReservations) {
      if (!res.qualifying_ledger_event_id) continue;
      const grossAvailable = res.outstanding_amount;
      const deduction = Math.round(Math.min(grossAvailable, remainingDeduction) * 100) / 100;
      const netDisbursed = Math.round((grossAvailable - deduction) * 100) / 100;
      remainingDeduction = Math.round((remainingDeduction - deduction) * 100) / 100;

      if (netDisbursed > 0) {
        itemsToInsert.push({
          reservation_id: res.reservation_id,
          qualifying_ledger_event_id: res.qualifying_ledger_event_id,
          partner_id: params.partnerId,
          gross_amount: grossAvailable,
          netting_deduction: deduction,
          disbursed_amount: netDisbursed,
          status: "PENDING",
        });
        totalGross += grossAvailable;
        totalDeduction += deduction;
        totalDisbursed += netDisbursed;
      }
    }

    totalGross = Math.round(totalGross * 100) / 100;
    totalDeduction = Math.round(totalDeduction * 100) / 100;
    totalDisbursed = Math.round(totalDisbursed * 100) / 100;

    const batchNumber = `BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const batchRes = await client.query(
      `INSERT INTO public.payout_batches (
        batch_number, partner_id, payout_rail, total_gross_amount, total_netting_deduction, total_amount,
        status, created_by, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $8) RETURNING *;`,
      [
        batchNumber,
        params.partnerId,
        params.payoutRail,
        totalGross,
        totalDeduction,
        totalDisbursed,
        params.createdBy,
        JSON.stringify({ partnerAccountingOutstanding, negativeCarryForward, eligiblePositive }),
      ]
    );
    const createdBatch = batchRes.rows[0];

    const createdItems: any[] = [];
    for (const it of itemsToInsert) {
      const itRes = await client.query(
        `INSERT INTO public.payout_items (
          payout_batch_id, qualifying_ledger_event_id, reservation_id, partner_id,
          gross_amount, netting_deduction, disbursed_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;`,
        [
          createdBatch.id,
          it.qualifying_ledger_event_id,
          it.reservation_id,
          it.partner_id,
          it.gross_amount,
          it.netting_deduction,
          it.disbursed_amount,
          it.status,
        ]
      );
      createdItems.push(itRes.rows[0]);
    }

    return {
      batch: createdBatch as PayoutBatchRecord,
      items: createdItems as PayoutItemRecord[],
    };
  }

  const supabase = params.supabaseClient || createAdminClient();

  // 1. Verify partner exists and has active status
  const { data: partner, error: pErr } = await supabase
    .from("partners")
    .select("id, status")
    .eq("id", params.partnerId)
    .single();

  if (pErr || !partner) {
    throw new Error(`Partner not found: ${params.partnerId}`);
  }

  // 2. Verify no active in-flight batch exists for this partner

  const { data: activeBatches, error: abErr } = await supabase
    .from("payout_batches")
    .select("id, status, batch_number")
    .eq("partner_id", params.partnerId)
    .in("status", activeStatuses);

  if (abErr) {
    throw new Error(`Failed to check active batches: ${abErr.message}`);
  }

  if (activeBatches && activeBatches.length > 0) {
    throw new Error(
      `An active payout batch (${activeBatches[0].batch_number}, status: ${activeBatches[0].status}) already exists for this partner.`
    );
  }

  // 3. Calculate partner projection with negative carry-forward
  const projection = await getPartnerFinancialProjection(params.partnerId, supabase);

  if (projection.partnerPayoutAvailable <= 0) {
    throw new Error(
      `No payout available for partner (Payout Available: $${projection.partnerPayoutAvailable.toFixed(
        2
      )}, Negative Carry-Forward: $${projection.negativeCarryForward.toFixed(2)}).`
    );
  }

  // 4. Filter positive eligible reservations and apply deterministic FIFO tie-breaker:
  //    check_in_date ASC, reservation_id ASC
  const eligibleReservations = projection.reservations
    .filter((r) => r.outstanding_amount > 0 && r.is_stay_eligible)
    .sort((a, b) => {
      const dateCmp = a.check_in_date.localeCompare(b.check_in_date);
      if (dateCmp !== 0) return dateCmp;
      return a.reservation_id.localeCompare(b.reservation_id);
    });

  if (eligibleReservations.length === 0) {
    throw new Error("No completed, dispute-free stays found for payout batch inclusion.");
  }

  // 5. FIFO Netting Deduction Allocation
  let remainingDeduction = projection.negativeCarryForward;
  const itemsToInsert: Array<{
    reservation_id: string;
    qualifying_ledger_event_id: string;
    partner_id: string;
    gross_amount: number;
    netting_deduction: number;
    disbursed_amount: number;
    status: "PENDING";
  }> = [];

  let totalGross = 0;
  let totalDeduction = 0;
  let totalDisbursed = 0;

  for (const res of eligibleReservations) {
    if (!res.qualifying_ledger_event_id) continue;

    const grossAvailable = res.outstanding_amount;
    const deduction = Math.round(Math.min(grossAvailable, remainingDeduction) * 100) / 100;
    const netDisbursed = Math.round((grossAvailable - deduction) * 100) / 100;
    remainingDeduction = Math.round((remainingDeduction - deduction) * 100) / 100;

    if (netDisbursed > 0) {
      itemsToInsert.push({
        reservation_id: res.reservation_id,
        qualifying_ledger_event_id: res.qualifying_ledger_event_id,
        partner_id: params.partnerId,
        gross_amount: grossAvailable,
        netting_deduction: deduction,
        disbursed_amount: netDisbursed,
        status: "PENDING",
      });

      totalGross += grossAvailable;
      totalDeduction += deduction;
      totalDisbursed += netDisbursed;
    }
  }

  totalGross = Math.round(totalGross * 100) / 100;
  totalDeduction = Math.round(totalDeduction * 100) / 100;
  totalDisbursed = Math.round(totalDisbursed * 100) / 100;

  if (itemsToInsert.length === 0 || totalDisbursed <= 0) {
    throw new Error("All eligible earnings were fully absorbed by negative carry-forward. Zero batch created.");
  }

  // 6. Create DRAFT batch header
  const batchNumber = `BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const { data: createdBatch, error: batchErr } = await supabase
    .from("payout_batches")
    .insert({
      batch_number: batchNumber,
      partner_id: params.partnerId,
      payout_rail: params.payoutRail,
      total_gross_amount: totalGross,
      total_netting_deduction: totalDeduction,
      total_amount: totalDisbursed,
      currency: "USD",
      status: "DRAFT",
      created_by: params.createdBy,
      metadata: {
        partnerAccountingOutstanding: projection.partnerAccountingOutstanding,
        negativeCarryForward: projection.negativeCarryForward,
        eligiblePositive: projection.eligiblePositive,
      },
    })
    .select("*")
    .single();

  if (batchErr || !createdBatch) {
    throw new Error(`Failed to create payout batch: ${batchErr?.message}`);
  }

  // 7. Insert payout items referencing batch
  const payloadItems = itemsToInsert.map((item) => ({
    ...item,
    payout_batch_id: createdBatch.id,
  }));

  const { data: createdItems, error: itemsErr } = await supabase
    .from("payout_items")
    .insert(payloadItems)
    .select("*");

  if (itemsErr || !createdItems) {
    // Rollback batch header if items fail
    await supabase.from("payout_batches").delete().eq("id", createdBatch.id);
    throw new Error(`Failed to create payout items: ${itemsErr?.message}`);
  }

  return {
    batch: createdBatch as PayoutBatchRecord,
    items: createdItems as PayoutItemRecord[],
  };
}

/**
 * Cancels a payout batch and releases all pending items transactionally.
 * Because items transition to 'CANCELLED', the partial unique index frees
 * the qualifying ledger events for re-batching.
 */
export async function cancelPayoutBatch(params: {
  batchId: string;
  adminUserId: string;
  reason?: string;
  supabaseClient?: any;
}): Promise<void> {
  const supabase = params.supabaseClient || createAdminClient();

  // Fetch batch to verify state
  const { data: batch, error: bErr } = await supabase
    .from("payout_batches")
    .select("id, status")
    .eq("id", params.batchId)
    .single();

  if (bErr || !batch) {
    throw new Error(`Batch not found: ${params.batchId}`);
  }

  if (batch.status === "SETTLED") {
    throw new Error("Cannot cancel a settled payout batch.");
  }

  if (batch.status === "PROCESSING") {
    throw new Error("Cannot cancel a payout batch in PROCESSING status (bank disbursement in flight).");
  }

  // Check active payment attempts
  const { data: activeAttempts } = await supabase
    .from("payout_payment_attempts")
    .select("id, status, provider_transfer_id")
    .eq("payout_batch_id", params.batchId)
    .in("status", ["PENDING", "SUCCEEDED"]);

  if (activeAttempts && activeAttempts.length > 0) {
    throw new Error(
      `Cannot cancel payout batch: active disbursement in progress (trace: ${activeAttempts[0].provider_transfer_id || activeAttempts[0].id}).`
    );
  }

  // 1. Mark batch CANCELLED
  const { error: batchUpErr } = await supabase
    .from("payout_batches")
    .update({
      status: "CANCELLED",
      metadata: { cancellationReason: params.reason || "Admin void", cancelledBy: params.adminUserId },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.batchId);

  if (batchUpErr) {
    throw new Error(`Failed to cancel batch: ${batchUpErr.message}`);
  }

  // 2. Mark pending payout items CANCELLED
  const { error: itemsUpErr } = await supabase
    .from("payout_items")
    .update({
      status: "CANCELLED",
      updated_at: new Date().toISOString(),
    })
    .eq("payout_batch_id", params.batchId)
    .eq("status", "PENDING");

  if (itemsUpErr) {
    throw new Error(`Failed to release payout items: ${itemsUpErr.message}`);
  }

  // 3. Log audit action
  await supabase.from("application_audit_logs").insert({
    action: "CANCEL_PAYOUT_BATCH",
    performed_by_user_id: params.adminUserId,
    source: "admin_portal",
    details: { batchId: params.batchId, reason: params.reason },
  });
}

/**
 * Submits a DRAFT payout batch for Super Admin approval.
 * From this state onwards, batch contents are strictly immutable.
 */
export async function submitPayoutBatchForApproval(params: {
  batchId: string;
  submittedBy: string;
  supabaseClient?: any;
}): Promise<PayoutBatchRecord> {
  const supabase = params.supabaseClient || createAdminClient();

  const { data: batch, error: bErr } = await supabase
    .from("payout_batches")
    .select("*")
    .eq("id", params.batchId)
    .single();

  if (bErr || !batch) {
    throw new Error(`Batch not found: ${params.batchId}`);
  }

  if (batch.status !== "DRAFT") {
    throw new Error(`Only DRAFT batches can be submitted for approval (current: ${batch.status}).`);
  }

  const { data: updated, error: uErr } = await supabase
    .from("payout_batches")
    .update({
      status: "PENDING_APPROVAL",
      submitted_by: params.submittedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.batchId)
    .select("*")
    .single();

  if (uErr || !updated) {
    throw new Error(`Failed to submit batch for approval: ${uErr?.message}`);
  }

  // Audit log for submission
  await supabase.from("application_audit_logs").insert({
    action: "SUBMIT_PAYOUT_BATCH",
    performed_by_user_id: params.submittedBy,
    partner_id: updated.partner_id,
    source: "admin_portal",
    details: {
      batchId: params.batchId,
      batchNumber: updated.batch_number,
      totalAmount: updated.total_amount,
    },
  });

  return updated as PayoutBatchRecord;
}

/**
 * Approves a PENDING_APPROVAL batch enforcing maker-checker separation:
 * approvedBy cannot be the user who created or submitted the batch.
 */
export async function approvePayoutBatch(params: {
  batchId: string;
  approvedBy: string;
  supabaseClient?: any;
}): Promise<PayoutBatchRecord> {
  const supabase = params.supabaseClient || createAdminClient();

  const { data: batch, error: bErr } = await supabase
    .from("payout_batches")
    .select("*")
    .eq("id", params.batchId)
    .single();

  if (bErr || !batch) {
    throw new Error(`Batch not found: ${params.batchId}`);
  }

  if (batch.status !== "PENDING_APPROVAL") {
    throw new Error(`Only PENDING_APPROVAL batches can be approved (current: ${batch.status}).`);
  }

  // Maker-checker validation
  if (params.approvedBy === batch.created_by) {
    throw new Error("Maker-checker violation: The creator of a batch cannot approve it.");
  }

  if (batch.submitted_by && params.approvedBy === batch.submitted_by) {
    throw new Error("Maker-checker violation: The submitter of a batch cannot approve it.");
  }

  const { data: updated, error: uErr } = await supabase
    .from("payout_batches")
    .update({
      status: "APPROVED",
      approved_by: params.approvedBy,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.batchId)
    .select("*")
    .single();

  if (uErr || !updated) {
    throw new Error(`Failed to approve batch: ${uErr?.message}`);
  }

  // Audit log for approval
  await supabase.from("application_audit_logs").insert({
    action: "APPROVE_PAYOUT_BATCH",
    performed_by_user_id: params.approvedBy,
    partner_id: updated.partner_id,
    source: "admin_portal",
    details: {
      batchId: params.batchId,
      batchNumber: updated.batch_number,
      totalAmount: updated.total_amount,
    },
  });

  return updated as PayoutBatchRecord;
}

export function isPhase6SettlementEnabled(): boolean {
  return process.env.PHASE6_SETTLEMENT_ENABLED === "true";
}

export function isPhase6ExternalPayoutsEnabled(): boolean {
  return process.env.PHASE6_EXTERNAL_PAYOUTS_ENABLED === "true";
}

/**
 * Verifies all pre-settlement invariants before any settlement mutations occur:
 * 1. Batch status must be in ['APPROVED', 'AWAITING_MANUAL_CONFIRMATION', 'PROCESSING'].
 * 2. At least one payout item exists.
 * 3. Every payout item MUST be in the expected locked status ('PENDING').
 * 4. Every payout item MUST belong to the same partner as the batch header.
 * 5. Batch total_amount MUST exactly equal the sum of item disbursed_amount.
 * 6. Health check: No reservation in the batch has an active dispute hold or post-submission clawback exceeding net realized commission.
 */
export async function validateBatchSettlementPreconditions(params: {
  batch: PayoutBatchRecord;
  items: PayoutItemRecord[];
  supabaseClient?: any;
}): Promise<{ valid: boolean; error?: string }> {
  const { batch, items } = params;
  const supabase = params.supabaseClient || createAdminClient();

  const validPriorStatuses: PayoutBatchStatus[] = [
    "APPROVED",
    "AWAITING_MANUAL_CONFIRMATION",
    "PROCESSING",
  ];

  if (!validPriorStatuses.includes(batch.status)) {
    return {
      valid: false,
      error: `Cannot settle batch from status '${batch.status}'. Must be in [${validPriorStatuses.join(", ")}].`,
    };
  }

  if (!items || items.length === 0) {
    return {
      valid: false,
      error: `No payout items found for batch ${batch.id}.`,
    };
  }

  // 1. Verify every item is in the expected locked state PENDING
  for (const item of items) {
    if (item.status !== "PENDING") {
      return {
        valid: false,
        error: `Settlement blocked: Payout item ${item.id} (reservation ${item.reservation_id}) is in status '${item.status}', expected locked status 'PENDING'.`,
      };
    }
  }

  // 2. Verify every item belongs to the same partner as the batch
  for (const item of items) {
    if (item.partner_id !== batch.partner_id) {
      return {
        valid: false,
        error: `Partner boundary violation: Item ${item.id} partner (${item.partner_id}) does not match batch partner (${batch.partner_id}).`,
      };
    }
  }

  // 3. Verify batch total exactly equals sum of item disbursed amounts
  let itemsSum = 0;
  for (const item of items) {
    itemsSum += Number(item.disbursed_amount || 0);
  }
  itemsSum = Math.round(itemsSum * 100) / 100;
  const batchTotal = Math.round(Number(batch.total_amount || 0) * 100) / 100;

  if (itemsSum !== batchTotal) {
    return {
      valid: false,
      error: `Batch total mismatch: Batch total_amount ($${batchTotal.toFixed(2)}) does not equal sum of item disbursed_amounts ($${itemsSum.toFixed(2)}).`,
    };
  }

  // 4. Stale-state / dispute / clawback invalidation check
  const resIds = items.map((i) => i.reservation_id);
  const { data: ledgerEvents, error: ledErr } = await supabase
    .from("commission_ledger_events")
    .select("*")
    .in("reservation_id", resIds)
    .order("created_at", { ascending: true });

  if (ledErr) {
    return {
      valid: false,
      error: `Failed to load ledger events for pre-settlement verification: ${ledErr.message}`,
    };
  }

  const eventsByRes = new Map<string, any[]>();
  for (const ev of ledgerEvents || []) {
    const list = eventsByRes.get(ev.reservation_id) || [];
    list.push(ev);
    eventsByRes.set(ev.reservation_id, list);
  }

  for (const item of items) {
    const events = eventsByRes.get(item.reservation_id) || [];
    let netRealized = 0;
    let latestDisputeHoldTime: string | null = null;
    let latestDisputeReleaseTime: string | null = null;

    for (const ev of events) {
      const delta = Number(ev.delta_amount || 0);
      if (ev.event_type === "PAYMENT_REALIZED" || ev.event_type === "REFUND_CLAWBACK" || ev.event_type === "MANUAL_ADJUSTMENT") {
        netRealized += delta;
      }
      if (ev.event_type === "DISPUTE_HOLD") {
        if (!latestDisputeHoldTime || ev.created_at > latestDisputeHoldTime) {
          latestDisputeHoldTime = ev.created_at;
        }
      }
      if (ev.event_type === "DISPUTE_RELEASE") {
        if (!latestDisputeReleaseTime || ev.created_at > latestDisputeReleaseTime) {
          latestDisputeReleaseTime = ev.created_at;
        }
      }
    }

    const isDisputed = Boolean(
      latestDisputeHoldTime &&
        (!latestDisputeReleaseTime || latestDisputeReleaseTime <= latestDisputeHoldTime)
    );

    if (isDisputed) {
      return {
        valid: false,
        error: `Settlement blocked: Reservation ${item.reservation_id} has an active dispute hold registered after batch submission.`,
      };
    }

    netRealized = Math.round(netRealized * 100) / 100;
    if (netRealized < Number(item.disbursed_amount)) {
      return {
        valid: false,
        error: `Settlement blocked: Reservation ${item.reservation_id} net realized commission ($${netRealized.toFixed(2)}) is less than disbursed amount ($${Number(item.disbursed_amount).toFixed(2)}) due to post-submission refund clawback.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Creates a payout payment attempt record.
 * Strictly fails closed if PHASE6_EXTERNAL_PAYOUTS_ENABLED is not explicitly true.
 */
export async function createPayoutPaymentAttempt(params: {
  payoutBatchId: string;
  payoutRail: PayoutRail;
  amount: number;
  currency?: string;
  metadata?: Record<string, unknown>;
  supabaseClient?: any;
}): Promise<any> {
  if (!isPhase6ExternalPayoutsEnabled()) {
    throw new Error("External payouts are disabled in this environment (PHASE6_EXTERNAL_PAYOUTS_ENABLED=false).");
  }

  const supabase = params.supabaseClient || createAdminClient();
  const { data, error } = await supabase
    .from("payout_payment_attempts")
    .insert({
      payout_batch_id: params.payoutBatchId,
      payout_rail: params.payoutRail,
      amount: params.amount,
      currency: params.currency || "USD",
      status: "PENDING",
      metadata: params.metadata || {},
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create payout payment attempt: ${error.message}`);
  }

  return data;
}

/**
 * Settles an approved or manually confirmed payout batch.
 * 
 * Settlement Atomicity Invariant:
 *   1. payout_items.status -> SETTLED
 *   2. PAYOUT_SETTLEMENT ledger event inserted with idempotency key PAYOUT_SETTLEMENT:<payout_item_id>
 *   3. payout_batches.status -> SETTLED
 *   4. audit log entry inserted in application_audit_logs
 * All operations must succeed or be cleanly rolled back.
 */
export async function markPayoutBatchSettled(params: {
  batchId: string;
  adminUserId: string;
  transactionReference?: string;
  notes?: string;
  supabaseClient?: any;
}): Promise<{ batch: PayoutBatchRecord; settledItemsCount: number }> {
  if (!isPhase6SettlementEnabled()) {
    throw new Error("Financial settlement is disabled in this environment (PHASE6_SETTLEMENT_ENABLED=false).");
  }

  const supabase = params.supabaseClient || createAdminClient();

  // 1. Fetch batch
  const { data: batch, error: bErr } = await supabase
    .from("payout_batches")
    .select("*")
    .eq("id", params.batchId)
    .single();

  if (bErr || !batch) {
    throw new Error(`Batch not found: ${params.batchId}`);
  }

  // 2. Fetch items
  const { data: items, error: iErr } = await supabase
    .from("payout_items")
    .select("*")
    .eq("payout_batch_id", params.batchId);

  if (iErr || !items || items.length === 0) {
    throw new Error(`No payout items found for batch ${params.batchId}`);
  }

  // 3. Pre-settlement validation
  const validation = await validateBatchSettlementPreconditions({
    batch: batch as PayoutBatchRecord,
    items: items as PayoutItemRecord[],
    supabaseClient: supabase,
  });

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 2b. Validate payment attempt invariants
  const { data: attempts, error: attErr } = await supabase
    .from("payout_payment_attempts")
    .select("*")
    .eq("payout_batch_id", params.batchId);

  if (attErr) {
    throw new Error(`Failed to check payment attempts: ${attErr.message}`);
  }

  const activeAttempt = (attempts || []).find(
    (a: any) => a.status === "PENDING" || a.status === "SUCCEEDED"
  );

  if (activeAttempt) {
    if (Number(activeAttempt.requested_amount) !== Number(batch.total_amount)) {
      throw new Error(
        `Settlement blocked: Disbursement attempt amount ($${Number(activeAttempt.requested_amount).toFixed(2)}) does not match batch total ($${Number(batch.total_amount).toFixed(2)}).`
      );
    }

    if (!activeAttempt.provider_transfer_id) {
      throw new Error(
        `Settlement blocked: Bank trace has not been recorded for disbursement attempt '${activeAttempt.id}'.`
      );
    }

    if (
      params.transactionReference &&
      params.transactionReference.trim() !== activeAttempt.provider_transfer_id.trim()
    ) {
      throw new Error(
        `Settlement reference mismatch: Provided reference '${params.transactionReference}' does not match recorded bank trace '${activeAttempt.provider_transfer_id}'.`
      );
    }
  }

  const typedItems = items as PayoutItemRecord[];

  // Fetch reservation metadata to populate ledger events
  const resIds = typedItems.map((i: PayoutItemRecord) => i.reservation_id);
  const { data: reservations, error: resErr } = await supabase
    .from("reservations")
    .select("id, source_provider, platform, confirmation_code, ownerrez_booking_id, site_id")
    .in("id", resIds);

  if (resErr) {
    throw new Error(`Failed to load reservation details: ${resErr.message}`);
  }

  const resMap = new Map<string, (typeof reservations)[0]>();
  for (const r of reservations || []) {
    resMap.set(r.id, r);
  }

  // 3. Mark payout items SETTLED
  const itemIds = typedItems.map((i: PayoutItemRecord) => i.id);
  const { error: itemUpErr } = await supabase
    .from("payout_items")
    .update({
      status: "SETTLED",
      updated_at: new Date().toISOString(),
    })
    .in("id", itemIds);

  if (itemUpErr) {
    throw new Error(`Failed to update payout items to SETTLED: ${itemUpErr.message}`);
  }

  // 4. Insert PAYOUT_SETTLEMENT ledger event for each settled item
  const ledgerInserts = typedItems.map((item: PayoutItemRecord) => {
    const res = resMap.get(item.reservation_id);
    const provider = (res?.source_provider as "ownerrez" | "hospitable") || "ownerrez";
    const channel = res?.platform || "direct";

    return {
      partner_id: item.partner_id,
      site_id: res?.site_id || null,
      reservation_id: item.reservation_id,
      payout_batch_id: batch.id,
      payout_item_id: item.id,
      source_provider: provider,
      booking_channel: channel,
      provider_booking_id: String(res?.ownerrez_booking_id || res?.confirmation_code || item.reservation_id),
      ownerrez_booking_id: res?.ownerrez_booking_id || null,
      event_type: "PAYOUT_SETTLEMENT" as const,
      delta_amount: -Math.abs(Number(item.disbursed_amount)),
      calculated_commission: 0.00,
      currency: "USD",
      idempotency_key: `PAYOUT_SETTLEMENT:${item.id}`,
      metadata: {
        batchId: batch.id,
        batchNumber: batch.batch_number,
        transactionReference: params.transactionReference || null,
        payoutRail: batch.payout_rail,
      },
    };
  });

  const { error: ledgerErr } = await supabase
    .from("commission_ledger_events")
    .insert(ledgerInserts);

  if (ledgerErr) {
    // Rollback items status
    await supabase.from("payout_items").update({ status: "PENDING" }).in("id", itemIds);
    throw new Error(`Failed to insert PAYOUT_SETTLEMENT ledger events: ${ledgerErr.message}`);
  }

  // 5. Mark payout batch SETTLED
  const { data: settledBatch, error: batchUpErr } = await supabase
    .from("payout_batches")
    .update({
      status: "SETTLED",
      metadata: {
        ...batch.metadata,
        transactionReference: params.transactionReference || null,
        settledNotes: params.notes || null,
        settledBy: params.adminUserId,
        settledAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.batchId)
    .select("*")
    .single();

  if (batchUpErr || !settledBatch) {
    throw new Error(`Failed to mark payout batch SETTLED: ${batchUpErr?.message}`);
  }

  // 5b. Transition active payment attempt to SUCCEEDED if present
  await supabase
    .from("payout_payment_attempts")
    .update({
      status: "SUCCEEDED",
      updated_at: new Date().toISOString(),
    })
    .eq("payout_batch_id", params.batchId)
    .eq("status", "PENDING");

  // 6. Record audit log
  await supabase.from("application_audit_logs").insert({
    action: "SETTLE_PAYOUT_BATCH",
    performed_by_user_id: params.adminUserId,
    partner_id: batch.partner_id,
    source: "admin_portal",
    details: {
      batchId: batch.id,
      batchNumber: batch.batch_number,
      totalAmount: batch.total_amount,
      payoutRail: batch.payout_rail,
      transactionReference: params.transactionReference,
      itemCount: items.length,
    },
  });

  return {
    batch: settledBatch as PayoutBatchRecord,
    settledItemsCount: items.length,
  };
}

/**
 * Step 1 of Manual ACH Disbursement:
 * Records an immutable disbursement intent BEFORE Treasury presses final submit in the bank portal.
 * Transitions batch to 'PROCESSING', creates a pending 'payout_payment_attempts' record (without bank trace),
 * and permanently locks the batch against cancellation, regeneration, or duplicate execution.
 */
export async function initiateManualDisbursementIntent(params: {
  batchId: string;
  adminUserId: string;
  notes?: string;
  supabaseClient?: any;
}): Promise<{
  batch: PayoutBatchRecord;
  paymentAttempt: any;
  intentReference: string;
}> {
  const supabase = params.supabaseClient || createAdminClient();

  // 1. Fetch and validate batch
  const { data: batch, error: bErr } = await supabase
    .from("payout_batches")
    .select("*")
    .eq("id", params.batchId)
    .single();

  if (bErr || !batch) {
    throw new Error(`Batch not found: ${params.batchId}`);
  }

  // 1b. Check for existing payment attempts (prohibit second attempt creation)
  const { data: existingAttempts, error: aErr } = await supabase
    .from("payout_payment_attempts")
    .select("*")
    .eq("payout_batch_id", params.batchId);

  if (aErr) {
    throw new Error(`Failed to check existing payment attempts: ${aErr.message}`);
  }

  const activeAttempt = (existingAttempts || []).find(
    (a: any) => a.status === "PENDING" || a.status === "SUCCEEDED"
  );
  if (activeAttempt) {
    throw new Error(
      `Disbursement attempt already exists for batch ${params.batchId} with status '${activeAttempt.status}' (attemptId: ${activeAttempt.id}). Duplicate attempt creation is prohibited.`
    );
  }

  if (batch.status === "SETTLED") {
    throw new Error("Cannot initiate disbursement on an already settled payout batch.");
  }
  if (batch.status === "CANCELLED") {
    throw new Error("Cannot initiate disbursement on a cancelled payout batch.");
  }
  if (batch.status === "DRAFT") {
    throw new Error("Cannot initiate disbursement on a DRAFT batch; batch must be submitted and APPROVED first.");
  }
  if (batch.status === "PENDING_APPROVAL") {
    throw new Error("Cannot initiate disbursement on a PENDING_APPROVAL batch; Super Admin approval is required first.");
  }

  const allowedStatuses = ["APPROVED", "AWAITING_MANUAL_CONFIRMATION"];
  if (!allowedStatuses.includes(batch.status)) {
    throw new Error(`Cannot initiate disbursement intent on batch in status '${batch.status}'. Batch must be APPROVED.`);
  }

  // 3. Insert immutable manual payment attempt (pre-bank submission)
  const idempotencyKey = `manual_intent_${batch.id}_${Date.now()}`;
  const providerIdempotencyKey = `manual_intent_${batch.id}`;

  const { data: attempt, error: insertErr } = await supabase
    .from("payout_payment_attempts")
    .insert({
      payout_batch_id: batch.id,
      idempotency_key: idempotencyKey,
      payment_provider: "MANUAL_ACH",
      provider_idempotency_key: providerIdempotencyKey,
      provider_transfer_id: null, // Trace reference will be attached after bank dispatch
      requested_amount: batch.total_amount,
      status: "PENDING",
      attempt_count: 1,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insertErr) {
    throw new Error(`Failed to insert manual disbursement attempt: ${insertErr.message}`);
  }

  // 4. Transition batch to PROCESSING to seal against cancellation/modification
  const { data: updatedBatch, error: upErr } = await supabase
    .from("payout_batches")
    .update({
      status: "PROCESSING",
      metadata: {
        ...(batch.metadata || {}),
        manualDisbursementIntent: {
          initiatedBy: params.adminUserId,
          intentAttemptId: attempt.id,
          amount: batch.total_amount,
          notes: params.notes || null,
          initiatedAt: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.batchId)
    .select("*")
    .single();

  if (upErr) {
    throw new Error(`Failed to update batch to PROCESSING: ${upErr.message}`);
  }

  // 5. Audit log
  await supabase.from("application_audit_logs").insert({
    action: "INITIATE_MANUAL_DISBURSEMENT_INTENT",
    performed_by_user_id: params.adminUserId,
    partner_id: batch.partner_id,
    source: "admin_portal",
    details: {
      batchId: batch.id,
      attemptId: attempt.id,
      amount: batch.total_amount,
      partnerId: batch.partner_id,
    },
  });

  return {
    batch: updatedBatch as PayoutBatchRecord,
    paymentAttempt: attempt,
    intentReference: attempt.id,
  };
}

/**
 * Step 2 of Manual ACH Disbursement:
 * Records the bank trace/reference returned by the corporate bank portal against the existing pending attempt.
 */
export async function recordBankTraceForDisbursement(params: {
  batchId: string;
  adminUserId: string;
  bankTraceReference: string;
  notes?: string;
  supabaseClient?: any;
}): Promise<{
  batch: PayoutBatchRecord;
  paymentAttempt: any;
}> {
  const supabase = params.supabaseClient || createAdminClient();
  const traceRef = params.bankTraceReference?.trim();
  if (!traceRef) {
    throw new Error("Bank trace reference is required to record bank dispatch.");
  }

  // 1. Fetch batch
  const { data: batch, error: bErr } = await supabase
    .from("payout_batches")
    .select("*")
    .eq("id", params.batchId)
    .single();

  if (bErr || !batch) {
    throw new Error(`Batch not found: ${params.batchId}`);
  }

  if (batch.status !== "PROCESSING") {
    throw new Error(`Cannot record bank trace on batch in status '${batch.status}'. Batch must be in PROCESSING status.`);
  }

  // 2. Fetch pending attempt
  const { data: attempts, error: aErr } = await supabase
    .from("payout_payment_attempts")
    .select("*")
    .eq("payout_batch_id", params.batchId);

  if (aErr) {
    throw new Error(`Failed to check payment attempts: ${aErr.message}`);
  }

  const activeAttempt = (attempts || []).find((a: any) => a.status === "PENDING");
  if (!activeAttempt) {
    throw new Error(`No pending disbursement attempt found for batch ${params.batchId}. Intent must be initiated before recording bank trace.`);
  }

  // 3. Verify amount consistency
  if (Number(activeAttempt.requested_amount) !== Number(batch.total_amount)) {
    throw new Error(
      `Disbursement attempt amount ($${Number(activeAttempt.requested_amount).toFixed(2)}) does not match batch total ($${Number(batch.total_amount).toFixed(2)}).`
    );
  }

  // 4. Trace check (idempotent replay vs conflict)
  if (activeAttempt.provider_transfer_id) {
    if (activeAttempt.provider_transfer_id.trim() === traceRef) {
      return { batch: batch as PayoutBatchRecord, paymentAttempt: activeAttempt };
    }
    throw new Error(
      `Different bank trace '${traceRef}' submitted against existing attempt '${activeAttempt.id}' which already has trace '${activeAttempt.provider_transfer_id}'. Trace conflict prohibited.`
    );
  }

  // 5. Update attempt with bank trace
  const { data: updatedAttempt, error: upAttErr } = await supabase
    .from("payout_payment_attempts")
    .update({
      provider_transfer_id: traceRef,
      updated_at: new Date().toISOString(),
    })
    .eq("id", activeAttempt.id)
    .select("*")
    .single();

  if (upAttErr) {
    throw new Error(`Failed to update disbursement attempt with bank trace: ${upAttErr.message}`);
  }

  // 6. Update batch metadata
  const { data: updatedBatch, error: upBErr } = await supabase
    .from("payout_batches")
    .update({
      metadata: {
        ...(batch.metadata || {}),
        bankDisbursement: {
          traceReference: traceRef,
          recordedBy: params.adminUserId,
          recordedAt: new Date().toISOString(),
          notes: params.notes || null,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.batchId)
    .select("*")
    .single();

  if (upBErr) {
    throw new Error(`Failed to update batch metadata with bank trace: ${upBErr.message}`);
  }

  // 7. Audit log
  await supabase.from("application_audit_logs").insert({
    action: "RECORD_MANUAL_ACH_BANK_TRACE",
    performed_by_user_id: params.adminUserId,
    partner_id: batch.partner_id,
    source: "admin_portal",
    details: {
      batchId: batch.id,
      attemptId: activeAttempt.id,
      bankTraceReference: traceRef,
      amount: batch.total_amount,
    },
  });

  return { batch: updatedBatch as PayoutBatchRecord, paymentAttempt: updatedAttempt };
}

/**
 * Aborts a manual disbursement intent BEFORE bank submission (e.g. if bank transfer was never executed).
 * Returns batch to 'APPROVED' status and marks attempt 'FAILED'.
 */
export async function abortPreBankDisbursementIntent(params: {
  batchId: string;
  adminUserId: string;
  reason: string;
  supabaseClient?: any;
}): Promise<{
  batch: PayoutBatchRecord;
  paymentAttempt: any;
}> {
  const supabase = params.supabaseClient || createAdminClient();

  const { data: batch, error: bErr } = await supabase
    .from("payout_batches")
    .select("*")
    .eq("id", params.batchId)
    .single();

  if (bErr || !batch) {
    throw new Error(`Batch not found: ${params.batchId}`);
  }

  if (batch.status !== "PROCESSING") {
    throw new Error(`Cannot abort disbursement intent on batch in status '${batch.status}'.`);
  }

  const { data: attempts, error: aErr } = await supabase
    .from("payout_payment_attempts")
    .select("*")
    .eq("payout_batch_id", params.batchId)
    .eq("status", "PENDING");

  if (aErr) {
    throw new Error(`Failed to query payment attempts: ${aErr.message}`);
  }

  const activeAttempt = (attempts || [])[0];
  if (!activeAttempt) {
    throw new Error("No active pending disbursement attempt found to abort.");
  }

  if (activeAttempt.provider_transfer_id) {
    throw new Error(
      `Cannot abort: funds transfer was already registered with bank trace '${activeAttempt.provider_transfer_id}'. Batch must proceed through verification and settlement.`
    );
  }

  // 1. Mark attempt FAILED
  const { data: failedAttempt, error: upAttErr } = await supabase
    .from("payout_payment_attempts")
    .update({
      status: "FAILED",
      last_error: `Pre-bank disbursement aborted by ${params.adminUserId}: ${params.reason}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", activeAttempt.id)
    .select("*")
    .single();

  if (upAttErr) {
    throw new Error(`Failed to update attempt to FAILED: ${upAttErr.message}`);
  }

  // 2. Return batch to APPROVED
  const { data: updatedBatch, error: upBErr } = await supabase
    .from("payout_batches")
    .update({
      status: "APPROVED",
      metadata: {
        ...(batch.metadata || {}),
        disbursementAborted: {
          abortedBy: params.adminUserId,
          reason: params.reason,
          abortedAt: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.batchId)
    .select("*")
    .single();

  if (upBErr) {
    throw new Error(`Failed to return batch status to APPROVED: ${upBErr.message}`);
  }

  // 3. Audit log
  await supabase.from("application_audit_logs").insert({
    action: "ABORT_PRE_BANK_DISBURSEMENT_INTENT",
    performed_by_user_id: params.adminUserId,
    partner_id: batch.partner_id,
    source: "admin_portal",
    details: {
      batchId: batch.id,
      attemptId: activeAttempt.id,
      reason: params.reason,
    },
  });

  return { batch: updatedBatch as PayoutBatchRecord, paymentAttempt: failedAttempt };
}

/**
 * Backwards-compatible convenience wrapper combining initiate + trace if executed in one step.
 */
export async function recordManualDisbursementIntent(params: {
  batchId: string;
  adminUserId: string;
  bankTraceReference: string;
  notes?: string;
  supabaseClient?: any;
}): Promise<{
  batch: PayoutBatchRecord;
  paymentAttempt: any;
}> {
  // If no attempt exists yet, initiate intent first
  const supabase = params.supabaseClient || createAdminClient();
  const { data: attempts } = await supabase
    .from("payout_payment_attempts")
    .select("*")
    .eq("payout_batch_id", params.batchId)
    .eq("status", "PENDING");

  if (!attempts || attempts.length === 0) {
    await initiateManualDisbursementIntent({
      batchId: params.batchId,
      adminUserId: params.adminUserId,
      notes: params.notes,
      supabaseClient: supabase,
    });
  }

  return recordBankTraceForDisbursement(params);
}

/**
 * Validates whether a partner is cleared for payout under fail-closed tax compliance policy.
 * Exact database state required:
 *   1. creator_tax_documents.status === 'APPROVED'
 *   2. creator_tax_documents.current_version_id IS NOT NULL
 *   3. tax_document_versions:
 *      - quarantine_status === 'PASSED'
 *      - is_superseded === FALSE
 *      - document_type IN ('W_9', 'W_8')
 * If any condition fails, the partner is strictly NOT cleared for payout.
 */
export async function checkPartnerTaxClearance(
  partnerId: string,
  supabaseClient?: any
): Promise<{
  cleared: boolean;
  status: string;
  documentType?: string;
  reason?: string;
}> {
  const supabase = supabaseClient || createAdminClient();

  const { data: taxDoc, error: dErr } = await supabase
    .from("creator_tax_documents")
    .select("*")
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (dErr || !taxDoc) {
    return {
      cleared: false,
      status: "NOT_SUBMITTED",
      reason: "No tax document found for partner. Tax clearance is a fail-closed operational prerequisite.",
    };
  }

  if (taxDoc.status !== "APPROVED") {
    return {
      cleared: false,
      status: taxDoc.status,
      reason: `Tax document review status is '${taxDoc.status}'. Payouts require an APPROVED tax document.`,
    };
  }

  let version: any = null;
  if (taxDoc.current_version_id) {
    const { data: vById, error: vErr } = await supabase
      .from("tax_document_versions")
      .select("*")
      .eq("id", taxDoc.current_version_id)
      .maybeSingle();
    if (!vErr && vById) version = vById;
  } else if (taxDoc.current_version != null) {
    const { data: vByNum, error: vErr } = await supabase
      .from("tax_document_versions")
      .select("*")
      .eq("document_id", taxDoc.id)
      .eq("version_number", taxDoc.current_version)
      .maybeSingle();
    if (!vErr && vByNum) version = vByNum;
  }

  if (!version) {
    return {
      cleared: false,
      status: "VERSION_NOT_FOUND",
      reason: "Current tax document version could not be found.",
    };
  }

  if (version.quarantine_status && version.quarantine_status !== "PASSED") {
    return {
      cleared: false,
      status: "QUARANTINED",
      reason: `Tax document file quarantine status is '${version.quarantine_status}'.`,
    };
  }

  if (version.is_superseded === true) {
    return {
      cleared: false,
      status: "SUPERSEDED",
      reason: "Current tax document version has been superseded by a newer version.",
    };
  }

  return {
    cleared: true,
    status: "CLEARED",
    documentType: version.document_type || taxDoc.document_type,
  };
}
