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

  const supabase = createAdminClient();

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
  const projection = await getPartnerFinancialProjection(params.partnerId);

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
}): Promise<void> {
  const supabase = createAdminClient();

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
}): Promise<PayoutBatchRecord> {
  const supabase = createAdminClient();

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

  return updated as PayoutBatchRecord;
}

/**
 * Approves a PENDING_APPROVAL batch enforcing maker-checker separation:
 * approvedBy cannot be the user who created or submitted the batch.
 */
export async function approvePayoutBatch(params: {
  batchId: string;
  approvedBy: string;
}): Promise<PayoutBatchRecord> {
  const supabase = createAdminClient();

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

  return updated as PayoutBatchRecord;
}

export function isPhase6SettlementEnabled(): boolean {
  return process.env.PHASE6_SETTLEMENT_ENABLED === "true";
}

export function isPhase6ExternalPayoutsEnabled(): boolean {
  return process.env.PHASE6_EXTERNAL_PAYOUTS_ENABLED === "true";
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
}): Promise<{ batch: PayoutBatchRecord; settledItemsCount: number }> {
  if (!isPhase6SettlementEnabled()) {
    throw new Error("Financial settlement is disabled in this environment (PHASE6_SETTLEMENT_ENABLED=false).");
  }

  const supabase = createAdminClient();

  // 1. Fetch batch
  const { data: batch, error: bErr } = await supabase
    .from("payout_batches")
    .select("*")
    .eq("id", params.batchId)
    .single();

  if (bErr || !batch) {
    throw new Error(`Batch not found: ${params.batchId}`);
  }

  const validPriorStatuses: PayoutBatchStatus[] = [
    "APPROVED",
    "AWAITING_MANUAL_CONFIRMATION",
    "PROCESSING",
  ];

  if (!validPriorStatuses.includes(batch.status)) {
    throw new Error(
      `Cannot settle batch from status '${batch.status}'. Must be in [${validPriorStatuses.join(", ")}].`
    );
  }

  // 2. Fetch pending items
  const { data: items, error: iErr } = await supabase
    .from("payout_items")
    .select("*")
    .eq("payout_batch_id", params.batchId)
    .eq("status", "PENDING");

  if (iErr || !items || items.length === 0) {
    throw new Error(`No pending payout items found for batch ${params.batchId}`);
  }

  // Fetch reservation metadata to populate ledger events
  const resIds = items.map((i) => i.reservation_id);
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
  const itemIds = items.map((i) => i.id);
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
  const ledgerInserts = items.map((item) => {
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
