import { createAdminClient } from "@/lib/supabase/admin";
import {
  PartnerFinancialProjection,
  ReservationFinancialSummary,
} from "./types";

/**
 * Calculates the exact financial summaries for all reservations of a partner.
 * 
 * Strict working capital model:
 *   netRealized = SUM(delta_amount) FILTER ('PAYMENT_REALIZED', 'REFUND_CLAWBACK', 'MANUAL_ADJUSTMENT')
 *   settled     = SUM(disbursed_amount) FROM payout_items WHERE status = 'SETTLED'
 *   locked      = SUM(disbursed_amount) FROM payout_items WHERE status = 'PENDING'
 *   outstanding = netRealized - settled - locked
 * 
 * Notice: PAYOUT_SETTLEMENT is strictly excluded from netRealized to prevent double-subtraction.
 */
export async function getReservationFinancialSummaries(
  partnerId: string,
  supabaseClient?: any
): Promise<ReservationFinancialSummary[]> {
  const supabase = supabaseClient || createAdminClient();

  // 1. Fetch all commission ledger events for this partner
  const { data: ledgerEvents, error: ledgerErr } = await supabase
    .from("commission_ledger_events")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: true });

  if (ledgerErr) {
    throw new Error(`Failed to load commission ledger events: ${ledgerErr.message}`);
  }

  // 2. Fetch all active and settled payout items for this partner
  const { data: payoutItems, error: itemsErr } = await supabase
    .from("payout_items")
    .select("reservation_id, disbursed_amount, status")
    .eq("partner_id", partnerId)
    .in("status", ["SETTLED", "PENDING"]);

  if (itemsErr) {
    throw new Error(`Failed to load payout items: ${itemsErr.message}`);
  }

  // Group payout items by reservation_id
  const settledMap = new Map<string, number>();
  const lockedMap = new Map<string, number>();

  for (const item of payoutItems || []) {
    const resId = item.reservation_id;
    const amount = Number(item.disbursed_amount || 0);
    if (item.status === "SETTLED") {
      settledMap.set(resId, (settledMap.get(resId) || 0) + amount);
    } else if (item.status === "PENDING") {
      lockedMap.set(resId, (lockedMap.get(resId) || 0) + amount);
    }
  }

  // Group ledger events by reservation_id
  const eventsByRes = new Map<string, typeof ledgerEvents>();
  for (const ev of ledgerEvents || []) {
    const list = eventsByRes.get(ev.reservation_id) || [];
    list.push(ev);
    eventsByRes.set(ev.reservation_id, list);
  }

  // Fetch reservation details (check_in_date, check_out_date, site_id)
  const resIds = Array.from(eventsByRes.keys());
  if (resIds.length === 0) {
    return [];
  }

  const { data: reservations, error: resErr } = await supabase
    .from("reservations")
    .select("id, partner_id, site_id, check_in_date, check_out_date")
    .in("id", resIds);

  if (resErr) {
    throw new Error(`Failed to load reservations: ${resErr.message}`);
  }

  const resMetaMap = new Map<string, (typeof reservations)[0]>();
  for (const r of reservations || []) {
    resMetaMap.set(r.id, r);
  }

  const results: ReservationFinancialSummary[] = [];

  for (const [resId, events] of eventsByRes.entries()) {
    let netRealized = 0;
    let hasEligibilityRelease = false;
    let latestDisputeHoldTime: string | null = null;
    let latestDisputeReleaseTime: string | null = null;
    let qualifyingLedgerEventId: string | null = null;

    for (const ev of events) {
      const type = ev.event_type;
      const delta = Number(ev.delta_amount || 0);

      if (type === "PAYMENT_REALIZED" || type === "REFUND_CLAWBACK" || type === "MANUAL_ADJUSTMENT") {
        netRealized += delta;
      }

      if ((type === "PAYMENT_REALIZED" || type === "MANUAL_ADJUSTMENT") && delta > 0) {
        qualifyingLedgerEventId = ev.id;
      }

      if (type === "ELIGIBILITY_RELEASE") {
        hasEligibilityRelease = true;
      }

      if (type === "DISPUTE_HOLD") {
        if (!latestDisputeHoldTime || ev.created_at > latestDisputeHoldTime) {
          latestDisputeHoldTime = ev.created_at;
        }
      }

      if (type === "DISPUTE_RELEASE") {
        if (!latestDisputeReleaseTime || ev.created_at > latestDisputeReleaseTime) {
          latestDisputeReleaseTime = ev.created_at;
        }
      }
    }

    netRealized = Math.round(netRealized * 100) / 100;
    const settledAmount = Math.round((settledMap.get(resId) || 0) * 100) / 100;
    const lockedAmount = Math.round((lockedMap.get(resId) || 0) * 100) / 100;
    const outstandingAmount = Math.round((netRealized - settledAmount - lockedAmount) * 100) / 100;

    // Dispute evaluation
    const isDisputeFree =
      !latestDisputeHoldTime ||
      Boolean(latestDisputeReleaseTime && latestDisputeReleaseTime > latestDisputeHoldTime);

    const isStayEligible = hasEligibilityRelease && isDisputeFree;

    const meta = resMetaMap.get(resId);
    const checkInDate = meta?.check_in_date ? meta.check_in_date.split("T")[0] : "";
    const checkOutDate = meta?.check_out_date ? meta.check_out_date.split("T")[0] : null;

    results.push({
      reservation_id: resId,
      partner_id: partnerId,
      site_id: meta?.site_id || null,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      net_realized: netRealized,
      settled_amount: settledAmount,
      locked_amount: lockedAmount,
      outstanding_amount: outstandingAmount,
      has_eligibility_release: hasEligibilityRelease,
      is_dispute_free: isDisputeFree,
      is_stay_eligible: isStayEligible,
      qualifying_ledger_event_id: qualifyingLedgerEventId,
    });
  }

  return results;
}

/**
 * Computes the authoritative partner financial projection.
 * 
 * Guarantees separation:
 *   partnerAccountingOutstanding = SUM(outstanding_amount across all reservations)
 *   eligiblePositive = SUM(outstanding_amount WHERE outstanding_amount > 0 AND is_stay_eligible)
 *   negativeCarryForward = ABS(SUM(outstanding_amount WHERE outstanding_amount < 0))
 *   partnerPayoutAvailable = MAX(0, eligiblePositive - negativeCarryForward)
 */
export async function getPartnerFinancialProjection(
  partnerId: string,
  supabaseClient?: any
): Promise<PartnerFinancialProjection> {
  const summaries = await getReservationFinancialSummaries(partnerId, supabaseClient);

  let partnerAccountingOutstanding = 0;
  let eligiblePositive = 0;
  let negativeSum = 0;

  for (const s of summaries) {
    partnerAccountingOutstanding += s.outstanding_amount;

    if (s.outstanding_amount > 0) {
      if (s.is_stay_eligible) {
        eligiblePositive += s.outstanding_amount;
      }
    } else if (s.outstanding_amount < 0) {
      negativeSum += s.outstanding_amount;
    }
  }

  partnerAccountingOutstanding = Math.round(partnerAccountingOutstanding * 100) / 100;
  eligiblePositive = Math.round(eligiblePositive * 100) / 100;
  const negativeCarryForward = Math.round(Math.abs(negativeSum) * 100) / 100;
  const partnerPayoutAvailable = Math.round(Math.max(0, eligiblePositive - negativeCarryForward) * 100) / 100;

  return {
    partner_id: partnerId,
    partnerAccountingOutstanding,
    eligiblePositive,
    negativeCarryForward,
    partnerPayoutAvailable,
    reservations: summaries,
  };
}
