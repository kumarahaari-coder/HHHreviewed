import { Reservation, CommissionRule, Payout, PayoutStatus } from "./db/schema";
import { db } from "./db/mockDb";

export interface PayoutEvaluationResult {
  isEligible: boolean;
  ineligibilityReason?: string;
  payoutBaseAmount: number;
  commissionRate: number; // Percentage or fixed dollar amount
  calculatedPayout: number;
  status: PayoutStatus;
}

/**
 * Checks whether a booking is eligible for payout.
 * Rules:
 * - Must be attributed to a partner
 * - Must not be cancelled
 * - Guest must have checked in (CHECKED_IN, CHECKED_OUT, or COMPLETED status)
 * - HHH has received payment (PAID or PARTIALLY_REFUNDED status, not UNPAID)
 * - Not fully refunded
 * - Not disputed
 * - No active admin hold exists on the reservation
 * - No payout has already been completed
 */
export function evaluatePayoutEligibility(res: Reservation): { isEligible: boolean; reason?: string } {
  if (!res.partnerId || !res.siteId) {
    return { isEligible: false, reason: "Reservation is unattributed." };
  }
  if (res.reservationStatus === "CANCELLED") {
    return { isEligible: false, reason: "Booking is cancelled." };
  }
  if (res.payoutStatus === "PAID") {
    return { isEligible: false, reason: "Payout has already been completed." };
  }
  if (res.paymentStatus === "REFUNDED") {
    return { isEligible: false, reason: "Booking is fully refunded." };
  }
  if (res.paymentStatus === "DISPUTED") {
    return { isEligible: false, reason: "Payment is disputed." };
  }
  if (res.payoutStatus === "ON_HOLD") {
    return { isEligible: false, reason: "Admin payout hold exists." };
  }

  // Guest must have checked in
  const checkInStatuses: Reservation["reservationStatus"][] = ["CHECKED_IN", "CHECKED_OUT", "COMPLETED"];
  if (!checkInStatuses.includes(res.reservationStatus)) {
    return { isEligible: false, reason: "Guest has not checked in yet (Stay dates: " + res.checkInDate + ")." };
  }

  // Payment must be verified received
  if (!["PAID", "PARTIALLY_REFUNDED"].includes(res.paymentStatus)) {
    return { isEligible: false, reason: "Payment has not been confirmed as received by HHH." };
  }
  if (res.amountReceived <= 0) {
    return { isEligible: false, reason: "The amount received by HHH is missing or zero." };
  }

  return { isEligible: true };
}

/**
 * Calculate the estimated or eligible payout for a booking.
 */
export function calculatePayout(
  res: Reservation,
  rule: CommissionRule,
  partnerBookingsCountThisMonth: number = 0
): PayoutEvaluationResult {
  const eligibility = evaluatePayoutEligibility(res);
  
  // 1. Determine Payout Base Amount
  let baseAmount = 0;
  switch (rule.payoutBase) {
    case "GROSS":
      baseAmount = res.bookingAmount;
      break;
    case "EX_TAX":
      baseAmount = Math.max(0, res.bookingAmount - res.taxesAmount);
      break;
    case "NET_HHH":
      baseAmount = res.amountReceived;
      break;
    case "NET_AFTER_REFUNDS":
      baseAmount = Math.max(0, res.amountReceived - res.refundAmount);
      break;
    case "FIXED":
    default:
      baseAmount = 0; // Not proportional
      break;
  }

  // 2. Determine Commission Rate & Calculated Payout
  let rate = 0;
  let calculatedAmount = 0;

  if (rule.ruleType === "FIXED_PER_BOOKING") {
    rate = rule.fixedAmount || 0;
    calculatedAmount = rate;
  } else if (rule.ruleType === "PERCENTAGE_GROSS" || rule.ruleType === "PERCENTAGE_EX_TAX" || rule.ruleType === "PERCENTAGE_NET") {
    rate = rule.percentage || 0;
    calculatedAmount = baseAmount * (rate / 100);
  } else if (rule.ruleType === "TIERED") {
    // Tier thresholds are not part of the current data model. Do not invent rates.
    // Keep the payout at zero until HHH provides an approved tier configuration.
    void partnerBookingsCountThisMonth;
    rate = 0;
    calculatedAmount = 0;
  }

  // Round to 2 decimal places
  calculatedAmount = Math.round(calculatedAmount * 100) / 100;

  // 3. Determine Payout Status
  let status: PayoutStatus = "ESTIMATED";
  if (res.payoutStatus === "PAID") {
    status = "PAID";
  } else if (res.payoutStatus === "ON_HOLD") {
    status = "ON_HOLD";
  } else if (res.payoutStatus === "REJECTED" || res.reservationStatus === "CANCELLED") {
    status = "REJECTED";
  } else if (eligibility.isEligible) {
    status = "ELIGIBLE";
  }

  return {
    isEligible: eligibility.isEligible,
    ineligibilityReason: eligibility.reason,
    payoutBaseAmount: baseAmount,
    commissionRate: rate,
    calculatedPayout: calculatedAmount,
    status
  };
}

/**
 * Re-evaluates and updates the payout status of all reservations and payout records in db.
 */
export function runSystemPayoutRecalculation(): void {
  const reservations = db.reservations;
  const sites = db.sites;
  const rules = db.commissionRules;
  let payouts = db.payouts;

  const updatedReservations = reservations.map(res => {
    // If not attributed, keep as is
    if (!res.partnerId || !res.siteId) {
      return res;
    }

    const site = sites.find(s => s.id === res.siteId);
    const rule = rules.find(r => r.id === site?.commissionRuleId) || rules[0];
    
    // Count partner bookings in the same month for tiered rules
    const bookingDateStr = res.bookingDate.split("T")[0];
    const bookingMonth = bookingDateStr.substring(0, 7); // e.g. "2026-07"
    const partnerBookingsCount = reservations.filter(r => 
      r.partnerId === res.partnerId && 
      r.bookingDate.startsWith(bookingMonth) &&
      r.reservationStatus !== "CANCELLED"
    ).length;

    const evaluation = calculatePayout(res, rule, partnerBookingsCount);

    // Update reservation's payout status
    let newPayoutStatus = evaluation.status;
    
    // Maintain ON_HOLD, PAID, and REJECTED states unless overridden
    if (res.payoutStatus === "ON_HOLD" && evaluation.isEligible) {
      newPayoutStatus = "ON_HOLD";
    } else if (res.payoutStatus === "PAID") {
      newPayoutStatus = "PAID";
    } else if (res.payoutStatus === "REJECTED") {
      newPayoutStatus = "REJECTED";
    }

    // Sync corresponding Payout record
    const payout = payouts.find(p => p.reservationId === res.id);
    if (!payout) {
      // Create new payout entry
      const newPayout: Payout = {
        id: `payout-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        reservationId: res.id,
        partnerId: res.partnerId,
        siteId: res.siteId,
        payoutBaseAmount: evaluation.payoutBaseAmount,
        commissionRate: evaluation.commissionRate,
        calculatedPayout: evaluation.calculatedPayout,
        adjustment: 0,
        finalPayout: evaluation.calculatedPayout,
        status: newPayoutStatus
      };
      payouts.push(newPayout);
    } else {
      // Update existing payout entry
      payouts = payouts.map(p => {
        if (p.reservationId === res.id) {
          // If already paid, don't update amounts or status
          if (p.status === "PAID") return p;
          
          const finalVal = evaluation.calculatedPayout + p.adjustment;
          return {
            ...p,
            payoutBaseAmount: evaluation.payoutBaseAmount,
            commissionRate: evaluation.commissionRate,
            calculatedPayout: evaluation.calculatedPayout,
            finalPayout: Math.round(finalVal * 100) / 100,
            status: newPayoutStatus
          };
        }
        return p;
      });
    }

    return {
      ...res,
      payoutStatus: newPayoutStatus
    };
  });

  db.reservations = updatedReservations;
  db.payouts = payouts;
}
