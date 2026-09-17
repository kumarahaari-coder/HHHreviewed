import { StatusType } from "@/components/ui/badge";

/**
 * Maps raw backend state enums (e.g. ATTRIBUTED, UNPAID_PENDING_PAYMENT, REVIEW_REQUIRED)
 * into clean, sentence-case human display labels without modifying backend API values.
 */
export function formatStatusLabel(rawState: string): string {
  if (!rawState) return "";

  const mappings: Record<string, string> = {
    ATTRIBUTED: "Attributed",
    UNPAID_PENDING_PAYMENT: "Awaiting payment",
    REVIEW_REQUIRED: "Needs review",
    ELIGIBILITY_RELEASE: "Eligible for payout",
    MISSING_ACCRUAL_REVIEW_REQUIRED: "Missing accrual review",
    PENDING_REVIEW: "Pending review",
    CONFIRMED: "Confirmed",
    CANCELLED: "Cancelled",
    CHECKED_IN: "Checked in",
    CHECKED_OUT: "Checked out",
    COMPLETED: "Completed",
    PAID: "Paid",
    UNPAID: "Unpaid",
    PARTIAL: "Partially paid",
    REFUNDED: "Refunded",
    DISPUTED: "Disputed",
    ESTIMATED: "Estimated",
    ELIGIBLE: "Eligible",
    ON_HOLD: "On hold",
    REJECTED: "Rejected",
    ACTIVE: "Active",
    INVITED: "Invited",
    SUSPENDED: "Suspended",
    ARCHIVED: "Archived",
    PROCESSING: "Processing",
    SETTLED: "Settled",
    FAILED: "Failed",
    SUCCESS: "Success",
    WARNING: "Warning",
    DANGER: "Danger",
    INFO: "Information"
  };

  return mappings[rawState] || rawState.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Maps raw backend state enums to standard generic StatusBadge visual variants.
 */
export function getStatusTypeForState(rawState: string): StatusType {
  const upper = (rawState || "").toUpperCase();

  if (["ATTRIBUTED", "CONFIRMED", "COMPLETED", "CHECKED_IN", "CHECKED_OUT", "PAID", "ELIGIBLE", "ELIGIBILITY_RELEASE", "ACTIVE", "SETTLED", "SUCCESS"].includes(upper)) {
    return "success";
  }
  if (["UNPAID_PENDING_PAYMENT", "REVIEW_REQUIRED", "MISSING_ACCRUAL_REVIEW_REQUIRED", "PENDING_REVIEW", "ESTIMATED", "ON_HOLD", "WARNING", "INVITED", "PROCESSING"].includes(upper)) {
    return "warning";
  }
  if (["CANCELLED", "REFUNDED", "DISPUTED", "REJECTED", "SUSPENDED", "FAILED", "DANGER"].includes(upper)) {
    return "danger";
  }
  if (["INFO", "INFORMATION"].includes(upper)) {
    return "info";
  }

  return "neutral";
}

/**
 * Maps raw backend role enums (e.g. SUPER_ADMIN, PARTNER_OWNER)
 * into human-friendly presentation labels without altering stored DB or auth values.
 */
export function formatRoleLabel(role?: string): string {
  if (!role) return "";
  const mappings: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    FINANCE_ADMIN: "Finance Admin",
    ADMIN: "Admin",
    PARTNER_OWNER: "Partner Owner",
    CREATOR: "Creator"
  };

  return mappings[role] || role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}
