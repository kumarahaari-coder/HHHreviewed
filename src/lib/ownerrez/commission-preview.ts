import { createAdminClient } from "@/lib/supabase/admin";

export interface CommissionRuleRecord {
  id: string;
  name: string;
  partner_id: string;
  site_id?: string | null;
  rule_type: string;
  percentage?: number | null;
  fixed_amount?: number | null;
  payout_base: string;
  status: string;
}

export interface ItemizedChargePreview {
  type: string;
  description: string;
  amount: number;
  isCommissionable: boolean;
  exclusionReason?: string;
}

export type CommissionLifecycleStatus =
  | "NOT_ATTRIBUTED"
  | "CANCELLED_REVIEW_REQUIRED"
  | "PENDING_PAYMENT"
  | "PARTIAL_PAYMENT_UNALLOCATED"
  | "ELIGIBLE_PENDING_STAY"
  | "ELIGIBLE_READY_FOR_PAYOUT"
  | "NO_ACTIVE_RULE";

export interface CommissionPreviewItem {
  reservationId: string;
  ownerrezBookingId: number;
  confirmationCode: string;
  propertyId: string;
  partnerId: string | null;
  siteId: string | null;
  stayDates: {
    arrival: string;
    departure: string;
    nights: number;
    isPastDeparture: boolean;
  };
  reservationStatus: string;
  paymentStatus: string;
  financialSummary: {
    grossAmount: number;
    amountReceived: number;
    refundAmount: number;
    taxesAmount: number;
    cleaningFee: number;
    serviceFee: number;
  };
  itemizedCharges: ItemizedChargePreview[];
  ruleResolution: {
    found: boolean;
    ruleId: string | null;
    ruleName: string | null;
    ruleType: string | null;
    percentage: number | null;
    payoutBase: string | null;
    scope: "site_specific" | "partner_default" | "none";
  };
  commissionCalculations: {
    contractedCommissionableBase: number;
    calculatedCommission: number;
    realizedCommission: number;
    payoutEligibleCommission: number;
  };
  lifecycle: {
    status: CommissionLifecycleStatus;
    reason: string;
    isPayoutEligible: boolean;
  };
  attribution: {
    status: string;
    method: string | null;
    confidenceScore: number;
    isDeterministic: boolean;
  };
}

/**
 * Resolves active commission rule for a given partner and site from public.commission_rules.
 * Precedence:
 *   1. Active site-specific rule (partner_id + site_id)
 *   2. Active partner-default rule (partner_id + site_id IS NULL)
 * Returns null if no rule exists. Never hardcodes rates.
 */
export async function resolveCommissionRule(
  partnerId: string,
  siteId?: string | null
): Promise<{ rule: CommissionRuleRecord | null; scope: "site_specific" | "partner_default" | "none" }> {
  const supabase = createAdminClient();

  // 1. Check active site-specific rule
  if (siteId) {
    const { data: siteRule, error: siteErr } = await supabase
      .from("commission_rules")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("site_id", siteId)
      .eq("status", "active")
      .maybeSingle();

    if (!siteErr && siteRule) {
      return {
        rule: siteRule as CommissionRuleRecord,
        scope: "site_specific",
      };
    }
  }

  // 2. Check active partner-level fallback rule
  const { data: partnerRule, error: partnerErr } = await supabase
    .from("commission_rules")
    .select("*")
    .eq("partner_id", partnerId)
    .is("site_id", null)
    .eq("status", "active")
    .maybeSingle();

  if (!partnerErr && partnerRule) {
    return {
      rule: partnerRule as CommissionRuleRecord,
      scope: "partner_default",
    };
  }

  return { rule: null, scope: "none" };
}

/**
 * Pure calculation function for evaluating an OwnerRez booking commission preview.
 * Strictly adheres to:
 * - Positive identification of 'rent' charges only
 * - Unknown charges default to non-commissionable
 * - Zero realized commission when unpaid or unallocated partial payment
 * - Cancelled stays set to CANCELLED_REVIEW_REQUIRED with 0 payout
 * - Future stays set to ELIGIBLE_PENDING_STAY with 0 payout eligibility
 */
export function calculateBookingCommissionPreview(
  reservation: any,
  attribution: any,
  ruleResolution: { rule: CommissionRuleRecord | null; scope: "site_specific" | "partner_default" | "none" }
): CommissionPreviewItem {
  const grossAmount = Number(reservation.gross_amount || 0);
  const amountReceived = Number(reservation.amount_received || 0);
  const refundAmount = Number(reservation.refund_amount || 0);
  const taxesAmount = Number(reservation.taxes_amount || 0);
  const cleaningFee = Number(reservation.cleaning_fee || 0);
  const serviceFee = Number(reservation.service_fee || 0);

  const rawData = reservation.raw_ownerrez_data || {};
  const chargesArray = Array.isArray(rawData.charges) ? rawData.charges : [];

  const itemizedCharges: ItemizedChargePreview[] = [];
  let contractedCommissionableBase = 0;

  if (chargesArray.length > 0) {
    for (const c of chargesArray) {
      const cType = String(c.type || "").toLowerCase();
      const cAmount = Number(c.amount || 0);
      const isRent = cType === "rent";

      if (isRent) {
        contractedCommissionableBase += cAmount;
        itemizedCharges.push({
          type: c.type,
          description: c.description || "Nightly Accommodation",
          amount: cAmount,
          isCommissionable: true,
        });
      } else {
        itemizedCharges.push({
          type: c.type,
          description: c.description || "Non-Accommodation Fee",
          amount: cAmount,
          isCommissionable: false,
          exclusionReason:
            cType === "clean" || c.description?.toLowerCase().includes("cleaning")
              ? "Pass-through turnover / cleaning expense"
              : cType === "tax"
              ? "Statutory lodging tax liability"
              : cType === "resort" || c.description?.toLowerCase().includes("incidentals")
              ? "Guest incidentals / damage waiver"
              : "Unknown/unapproved fee category (default non-commissionable)",
        });
      }
    }
  } else {
    // Fallback if raw charges array is absent: derive rent strictly from gross minus verified non-rent fees
    const derivedRent = Math.max(0, grossAmount - cleaningFee - serviceFee - taxesAmount);
    contractedCommissionableBase = derivedRent;
    itemizedCharges.push({
      type: "rent_derived",
      description: "Derived Net Accommodation",
      amount: derivedRent,
      isCommissionable: true,
    });
  }

  // Attribution Eligibility Gate
  const isAttributed = attribution?.status === "ATTRIBUTED";
  const isDeterministicMethod = attribution?.attribution_method === "OWNERREZ_LISTING_SITE";
  const confidenceScore = Number(attribution?.confidence_score || 0);
  const isAttributionEligible = isAttributed && isDeterministicMethod && confidenceScore === 100;

  // Rule Resolution
  const rule = ruleResolution.rule;
  const percentageRate = rule && rule.percentage != null ? Number(rule.percentage) : null;

  let calculatedCommission = 0;
  if (isAttributionEligible && rule) {
    if (rule.rule_type === "percentage" && percentageRate != null) {
      calculatedCommission = Math.round(contractedCommissionableBase * (percentageRate / 100) * 100) / 100;
    } else if (rule.rule_type === "fixed" && rule.fixed_amount != null) {
      calculatedCommission = Number(rule.fixed_amount);
    }
  }

  // Stay completion evaluation
  const nowIso = new Date().toISOString();
  const departureDate = reservation.check_out_date ? reservation.check_out_date.split("T")[0] : "";
  const isPastDeparture = Boolean(departureDate && departureDate < nowIso.split("T")[0]);

  // Lifecycle Determination
  let lifecycleStatus: CommissionLifecycleStatus = "NOT_ATTRIBUTED";
  let lifecycleReason = "";
  let realizedCommission = 0;
  let payoutEligibleCommission = 0;

  const resStatus = String(reservation.reservation_status || "").toUpperCase();
  const payStatus = String(reservation.payment_status || "").toUpperCase();

  if (!isAttributionEligible) {
    lifecycleStatus = "NOT_ATTRIBUTED";
    lifecycleReason = "Booking is not deterministically attributed to an active partner site.";
    calculatedCommission = 0;
    realizedCommission = 0;
    payoutEligibleCommission = 0;
  } else if (!rule) {
    lifecycleStatus = "NO_ACTIVE_RULE";
    lifecycleReason = "No active commission rule exists in public.commission_rules for this partner/site.";
    calculatedCommission = 0;
    realizedCommission = 0;
    payoutEligibleCommission = 0;
  } else if (resStatus === "CANCELLED" || refundAmount > 0) {
    lifecycleStatus = "CANCELLED_REVIEW_REQUIRED";
    lifecycleReason = "Booking is cancelled/refunded. Retained funds held for manual review. Zero payable commission.";
    realizedCommission = 0;
    payoutEligibleCommission = 0;
  } else if (payStatus === "UNPAID" || amountReceived <= 0) {
    lifecycleStatus = "PENDING_PAYMENT";
    lifecycleReason = "Guest payment has not been received (amount_received = $0.00). Realized commission remains $0.00.";
    realizedCommission = 0;
    payoutEligibleCommission = 0;
  } else if (amountReceived < grossAmount) {
    lifecycleStatus = "PARTIAL_PAYMENT_UNALLOCATED";
    lifecycleReason = `Partial payment received ($${amountReceived.toFixed(2)} of $${grossAmount.toFixed(2)}). Realized commission held at $0.00 until fully collected or allocation policy approved.`;
    realizedCommission = 0;
    payoutEligibleCommission = 0;
  } else {
    // 100% collected
    realizedCommission = calculatedCommission;

    if (!isPastDeparture) {
      lifecycleStatus = "ELIGIBLE_PENDING_STAY";
      lifecycleReason = `Booking fully paid and attributed. Commission realized ($${realizedCommission.toFixed(2)}), but departure date (${departureDate}) is in the future. Payout not yet eligible.`;
      payoutEligibleCommission = 0;
    } else {
      lifecycleStatus = "ELIGIBLE_READY_FOR_PAYOUT";
      lifecycleReason = `Stay completed on ${departureDate}. Fully paid with zero open disputes. Ready for payout batch inclusion.`;
      payoutEligibleCommission = realizedCommission;
    }
  }

  return {
    reservationId: reservation.id,
    ownerrezBookingId: reservation.ownerrez_booking_id,
    confirmationCode: reservation.confirmation_code,
    propertyId: reservation.property_id,
    partnerId: reservation.partner_id,
    siteId: reservation.site_id,
    stayDates: {
      arrival: reservation.check_in_date ? reservation.check_in_date.split("T")[0] : "",
      departure: departureDate,
      nights: Number(reservation.nights || 0),
      isPastDeparture,
    },
    reservationStatus: resStatus,
    paymentStatus: payStatus,
    financialSummary: {
      grossAmount,
      amountReceived,
      refundAmount,
      taxesAmount,
      cleaningFee,
      serviceFee,
    },
    itemizedCharges,
    ruleResolution: {
      found: Boolean(rule),
      ruleId: rule?.id || null,
      ruleName: rule?.name || null,
      ruleType: rule?.rule_type || null,
      percentage: percentageRate,
      payoutBase: rule?.payout_base || null,
      scope: ruleResolution.scope,
    },
    commissionCalculations: {
      contractedCommissionableBase: Math.round(contractedCommissionableBase * 100) / 100,
      calculatedCommission,
      realizedCommission,
      payoutEligibleCommission,
    },
    lifecycle: {
      status: lifecycleStatus,
      reason: lifecycleReason,
      isPayoutEligible: payoutEligibleCommission > 0,
    },
    attribution: {
      status: attribution?.status || "UNATTRIBUTED",
      method: attribution?.attribution_method || null,
      confidenceScore,
      isDeterministic: isAttributionEligible,
    },
  };
}

/**
 * Read-only generator that queries all OwnerRez reservations in production Supabase,
 * fetches their attributions and matching commission rules, and returns preview calculations.
 * Strict Phase 5 guarantee: ZERO database writes.
 */
export async function getOwnerRezCommissionPreviews(): Promise<{
  previews: CommissionPreviewItem[];
  summary: {
    totalOwnerRezReservations: number;
    attributedCount: number;
    totalCalculatedCommission: number;
    totalRealizedCommission: number;
    totalPayoutEligibleCommission: number;
  };
}> {
  const supabase = createAdminClient();

  // 1. Fetch all reservations originated or managed by OwnerRez
  const { data: reservations, error: resErr } = await supabase
    .from("reservations")
    .select("*")
    .not("ownerrez_booking_id", "is", null)
    .order("check_in_date", { ascending: false });

  if (resErr) {
    throw new Error(`Failed to fetch OwnerRez reservations: ${resErr.message}`);
  }

  // 2. Fetch attributions for these reservations
  const resIds = (reservations || []).map((r) => r.id);
  const { data: attributions, error: attrErr } = await supabase
    .from("reservation_attributions")
    .select("*")
    .in("reservation_id", resIds);

  if (attrErr) {
    throw new Error(`Failed to fetch attributions: ${attrErr.message}`);
  }

  const attrMap = new Map<string, any>();
  for (const a of attributions || []) {
    attrMap.set(a.reservation_id, a);
  }

  // 3. Resolve rules and compute previews
  const previews: CommissionPreviewItem[] = [];
  let totalCalculated = 0;
  let totalRealized = 0;
  let totalEligible = 0;
  let attributedCount = 0;

  for (const res of reservations || []) {
    const attr = attrMap.get(res.id) || null;
    let ruleResolution: { rule: CommissionRuleRecord | null; scope: "site_specific" | "partner_default" | "none" } = {
      rule: null,
      scope: "none",
    };

    if (res.partner_id) {
      ruleResolution = await resolveCommissionRule(res.partner_id, res.site_id);
    }

    const preview = calculateBookingCommissionPreview(res, attr, ruleResolution);
    previews.push(preview);

    if (preview.attribution.isDeterministic) {
      attributedCount++;
    }
    totalCalculated += preview.commissionCalculations.calculatedCommission;
    totalRealized += preview.commissionCalculations.realizedCommission;
    totalEligible += preview.commissionCalculations.payoutEligibleCommission;
  }

  return {
    previews,
    summary: {
      totalOwnerRezReservations: previews.length,
      attributedCount,
      totalCalculatedCommission: Math.round(totalCalculated * 100) / 100,
      totalRealizedCommission: Math.round(totalRealized * 100) / 100,
      totalPayoutEligibleCommission: Math.round(totalEligible * 100) / 100,
    },
  };
}
