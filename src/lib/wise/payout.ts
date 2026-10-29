import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelTransfer,
  createQuote,
  createTransfer,
  deterministicUuid,
  fundTransferFromBalance,
  getTransfer,
  getUsdBalance,
  WISE_FAILED_STATES,
  WISE_SENT_STATES,
  WISE_UNFUNDED_STATES,
} from "./client";
import { getActivePayoutAccount } from "./payout-account";
import { isPhase6ExternalPayoutsEnabled, markPayoutBatchSettled } from "@/lib/commissions/payout-generator";

/**
 * Pays an APPROVED batch to the partner through Wise.
 *
 * Order matters: the PENDING attempt row is inserted first. Its unique provider_idempotency_key
 * serialises double clicks, and Wise dedupes on customerTransactionId, so a retry cannot pay twice.
 */
export async function initiateWisePayout(params: { batchId: string; adminUserId: string }) {
  if (!isPhase6ExternalPayoutsEnabled()) {
    throw new Error("External payouts are disabled in this environment (PHASE6_EXTERNAL_PAYOUTS_ENABLED=false).");
  }
  const supabase = createAdminClient();

  const { data: batch, error: bErr } = await supabase.from("payout_batches").select("*").eq("id", params.batchId).single();
  if (bErr || !batch) throw new Error(`Batch not found: ${params.batchId}`);
  if (batch.payout_rail !== "WISE") throw new Error(`Batch rail is '${batch.payout_rail}', not WISE.`);
  if (batch.status !== "APPROVED") throw new Error(`Batch must be APPROVED (current status: ${batch.status}).`);

  const { data: partner } = await supabase.from("partners").select("status").eq("id", batch.partner_id).maybeSingle();
  const partnerStatus = String(partner?.status || "").toLowerCase();
  if (partnerStatus === "archived" || partnerStatus === "suspended") {
    throw new Error(`Partner account is ${partnerStatus}; payout blocked.`);
  }

  const account = await getActivePayoutAccount(batch.partner_id, supabase);
  if (!account) throw new Error("Partner has no payout account on file.");
  if (!account.verified_at) throw new Error("Partner payout account has not been verified by an admin yet.");

  const { data: attempts, error: aErr } = await supabase
    .from("payout_payment_attempts")
    .select("id, status, provider_transfer_id, provider_idempotency_key")
    .eq("payout_batch_id", batch.id)
    .order("created_at", { ascending: true });
  if (aErr) throw new Error(`Failed to check payment attempts: ${aErr.message}`);
  if ((attempts || []).some((a: any) => a.status === "SUCCEEDED" || (a.status === "PENDING" && a.provider_transfer_id))) {
    throw new Error("A payment attempt already exists for this batch. Use Refresh Wise status or Retry funding.");
  }

  const amount = Number(batch.total_amount);

  // Fail before creating anything in Wise if we obviously cannot pay.
  try {
    const balance = await getUsdBalance();
    if (balance < amount) {
      throw new Error(`Insufficient Wise USD balance ($${balance.toFixed(2)} available, $${amount.toFixed(2)} needed plus fees).`);
    }
  } catch (err: any) {
    if (String(err.message).startsWith("Insufficient")) throw err;
    // Balance lookup failing (e.g. permissions) must not block the payout; funding reports its own errors.
  }

  // A PENDING attempt with no transfer id means a previous click died after the attempt row was written.
  // Reuse it: the same customerTransactionId makes Wise return the existing transfer instead of creating a second one.
  const orphan = (attempts || []).find((a: any) => a.status === "PENDING" && !a.provider_transfer_id);
  const attemptNo = orphan ? (attempts || []).length : (attempts || []).length + 1;
  const customerTransactionId = orphan ? orphan.provider_idempotency_key : deterministicUuid(`wise:${batch.id}:${attemptNo}`);

  let attempt: any = orphan ? { id: orphan.id } : null;
  if (!attempt) {
    const { data: inserted, error: insErr } = await supabase
      .from("payout_payment_attempts")
      .insert({
        payout_batch_id: batch.id,
        idempotency_key: `wise_${batch.id}_${attemptNo}`,
        payment_provider: "WISE",
        provider_idempotency_key: customerTransactionId,
        provider_transfer_id: null,
        requested_amount: amount,
        status: "PENDING",
        attempt_count: 1,
      })
      .select("*")
      .single();
    if (insErr || !inserted) throw new Error(`Could not start payment attempt (possible duplicate click): ${insErr?.message}`);
    attempt = inserted;
  }

  const fail = async (message: string) => {
    await supabase
      .from("payout_payment_attempts")
      .update({ status: "FAILED", last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", attempt.id);
  };

  let transfer;
  try {
    const quote = await createQuote({ targetAmountUsd: amount, targetAccountId: Number(account.wise_recipient_id) });
    if (Number(quote.targetAmount) !== amount) {
      throw new Error(`Wise quote target ($${quote.targetAmount}) does not match the batch amount ($${amount}). Nothing was sent.`);
    }
    transfer = await createTransfer({
      targetAccountId: Number(account.wise_recipient_id),
      quoteId: quote.id,
      customerTransactionId,
      reference: batch.batch_number,
    });
  } catch (err: any) {
    await fail(err.message);
    throw err;
  }

  await supabase
    .from("payout_payment_attempts")
    .update({ provider_transfer_id: String(transfer.id), updated_at: new Date().toISOString() })
    .eq("id", attempt.id);

  await supabase
    .from("payout_batches")
    .update({
      status: "PROCESSING",
      metadata: {
        ...(batch.metadata || {}),
        wiseDisbursement: {
          initiatedBy: params.adminUserId,
          attemptId: attempt.id,
          transferId: String(transfer.id),
          initiatedAt: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", batch.id);

  // Funding can legitimately fail (SCA required, insufficient balance, approval needed). The transfer then stays
  // created-but-unfunded in Wise. The admin sees the reason and can fund it in Wise, retry here, or cancel it.
  const fundingError = await tryFundTransfer(transfer.id, attempt.id);

  await supabase.from("application_audit_logs").insert({
    action: "INITIATE_WISE_PAYOUT",
    performed_by_user_id: params.adminUserId,
    partner_id: batch.partner_id,
    source: "admin_portal",
    details: { batchId: batch.id, attemptId: attempt.id, transferId: String(transfer.id), amount, fundingError },
  });

  return { transferId: String(transfer.id), attemptId: attempt.id, fundingError };
}

/** Tries to fund a transfer from balance and records the outcome on the attempt row. Returns the error or null. */
async function tryFundTransfer(transferId: number | string, attemptId: string): Promise<string | null> {
  const supabase = createAdminClient();
  let fundingError: string | null = null;
  try {
    const funded = await fundTransferFromBalance(Number(transferId));
    if (funded.status === "REJECTED") fundingError = funded.errorCode || "Funding rejected by Wise.";
  } catch (err: any) {
    fundingError = err.message;
  }
  await supabase
    .from("payout_payment_attempts")
    .update({
      last_error: fundingError ? `FUNDING: ${fundingError}`.slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attemptId);
  return fundingError;
}

async function latestWiseAttempt(batchId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("payout_payment_attempts")
    .select("*")
    .eq("payout_batch_id", batchId)
    .eq("payment_provider", "WISE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Re-attempts funding for a transfer that was created but never funded. */
export async function retryWiseFunding(params: { batchId: string; adminUserId: string }) {
  const supabase = createAdminClient();
  const attempt = await latestWiseAttempt(params.batchId);
  if (!attempt?.provider_transfer_id) throw new Error("No Wise transfer exists for this batch.");
  if (attempt.status !== "PENDING") throw new Error(`Latest payment attempt is ${attempt.status}; nothing to fund.`);

  const transfer = await getTransfer(attempt.provider_transfer_id);
  if (!WISE_UNFUNDED_STATES.has(transfer.status)) {
    return { fundingError: null, wiseStatus: transfer.status, note: "Transfer is already funded. Use Refresh Wise status." };
  }
  const fundingError = await tryFundTransfer(transfer.id, attempt.id);
  await supabase.from("application_audit_logs").insert({
    action: "RETRY_WISE_FUNDING",
    performed_by_user_id: params.adminUserId,
    source: "admin_portal",
    details: { batchId: params.batchId, transferId: String(transfer.id), fundingError },
  });
  return { fundingError, wiseStatus: transfer.status };
}

/**
 * Abandons an unsent Wise payout so the batch can be retried or cancelled.
 * Refuses when the money has already left Wise: that case must settle, not roll back.
 */
export async function abandonWisePayout(params: { batchId: string; adminUserId: string; reason?: string }) {
  const supabase = createAdminClient();
  const { data: batch } = await supabase.from("payout_batches").select("*").eq("id", params.batchId).single();
  if (!batch) throw new Error("Batch not found.");
  if (batch.status !== "PROCESSING" && batch.status !== "REQUIRES_RECONCILIATION") {
    throw new Error(`Batch is ${batch.status}; there is no in-flight Wise payout to abandon.`);
  }
  const attempt = await latestWiseAttempt(params.batchId);
  if (!attempt) throw new Error("No Wise payment attempt found for this batch.");

  if (attempt.provider_transfer_id) {
    const transfer = await getTransfer(attempt.provider_transfer_id);
    if (WISE_SENT_STATES.has(transfer.status) || ["funds_converted", "processing"].includes(transfer.status)) {
      throw new Error(`Wise transfer is '${transfer.status}'; the money may already be moving. Refresh Wise status instead.`);
    }
    if (!WISE_FAILED_STATES.has(transfer.status)) {
      try {
        await cancelTransfer(transfer.id);
      } catch (err: any) {
        throw new Error(`Wise would not cancel the transfer (${err.message}). Cancel it in Wise first, then refresh.`);
      }
    }
  }

  await supabase
    .from("payout_payment_attempts")
    .update({ status: "FAILED", last_error: (params.reason || "Abandoned by admin").slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", attempt.id);
  await supabase
    .from("payout_batches")
    .update({ status: "APPROVED", updated_at: new Date().toISOString() })
    .eq("id", params.batchId);
  await supabase.from("application_audit_logs").insert({
    action: "ABANDON_WISE_PAYOUT",
    performed_by_user_id: params.adminUserId,
    partner_id: batch.partner_id,
    source: "admin_portal",
    details: { batchId: params.batchId, transferId: attempt.provider_transfer_id, reason: params.reason },
  });
  return { status: "APPROVED" };
}

/**
 * Applies a Wise transfer state to our records. Idempotent: safe for repeated webhooks and manual refreshes.
 */
export async function applyWiseTransferState(transferId: string, state: string) {
  const supabase = createAdminClient();

  const { data: attempt } = await supabase
    .from("payout_payment_attempts")
    .select("*")
    .eq("provider_transfer_id", transferId)
    .eq("payment_provider", "WISE")
    .maybeSingle();
  if (!attempt) return { handled: false, reason: "unknown transfer" };

  const { data: batch } = await supabase.from("payout_batches").select("*").eq("id", attempt.payout_batch_id).single();
  if (!batch) return { handled: false, reason: "batch missing" };

  if (WISE_SENT_STATES.has(state)) {
    if (batch.status === "SETTLED") return { handled: true, result: "already settled" };
    const adminUserId = batch.metadata?.wiseDisbursement?.initiatedBy || batch.approved_by || batch.created_by;
    try {
      await markPayoutBatchSettled({
        batchId: batch.id,
        adminUserId,
        transactionReference: transferId,
        notes: "Settled automatically from Wise transfer state 'outgoing_payment_sent'.",
      });
      return { handled: true, result: "settled" };
    } catch (err: any) {
      // E.g. PHASE6_SETTLEMENT_ENABLED=false. Money has left Wise, so flag for a human instead of losing it.
      await supabase
        .from("payout_batches")
        .update({
          status: "REQUIRES_RECONCILIATION",
          metadata: { ...(batch.metadata || {}), wiseSettlementError: String(err.message).slice(0, 300) },
          updated_at: new Date().toISOString(),
        })
        .eq("id", batch.id);
      return { handled: true, result: "needs reconciliation" };
    }
  }

  if (WISE_FAILED_STATES.has(state)) {
    if (batch.status === "SETTLED") {
      // Money was recorded as paid but Wise says it came back. Never ignore this silently.
      await supabase
        .from("payout_batches")
        .update({
          metadata: { ...(batch.metadata || {}), wiseAlert: `Transfer ${transferId} reported '${state}' after settlement. Manual review required.`, wiseAlertAt: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq("id", batch.id);
      await supabase.from("application_audit_logs").insert({
        action: "WISE_TRANSFER_FAILED_AFTER_SETTLEMENT",
        performed_by_user_id: batch.metadata?.wiseDisbursement?.initiatedBy || batch.approved_by || batch.created_by,
        partner_id: batch.partner_id,
        source: "wise_webhook",
        details: { batchId: batch.id, transferId, state },
      });
      return { handled: true, result: "ALERT: failed after settlement" };
    }
    await supabase
      .from("payout_payment_attempts")
      .update({ status: "FAILED", last_error: `Wise state: ${state}`, updated_at: new Date().toISOString() })
      .eq("id", attempt.id);
    // Not auto-released: an admin decides whether to retry or cancel.
    await supabase
      .from("payout_batches")
      .update({ status: "REQUIRES_RECONCILIATION", updated_at: new Date().toISOString() })
      .eq("id", batch.id);
    return { handled: true, result: "failed" };
  }

  return { handled: true, result: `no-op (${state})` };
}

/** Polls Wise for the batch's transfer. Fallback when webhooks are unavailable or missed. */
export async function refreshWisePayoutStatus(batchId: string) {
  const supabase = createAdminClient();
  const { data: attempt } = await supabase
    .from("payout_payment_attempts")
    .select("provider_transfer_id")
    .eq("payout_batch_id", batchId)
    .eq("payment_provider", "WISE")
    .not("provider_transfer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!attempt?.provider_transfer_id) throw new Error("No Wise transfer found for this batch.");

  const transfer = await getTransfer(attempt.provider_transfer_id);
  const result = await applyWiseTransferState(String(transfer.id), transfer.status);
  return { wiseStatus: transfer.status, ...result };
}
