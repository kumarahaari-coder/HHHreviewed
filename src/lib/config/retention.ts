/**
 * Tax Document Data Retention Configuration
 * Configurable defaults that can be set via environment variables.
 */

export interface RetentionPolicyConfig {
  approvedTaxDocRetentionYears: number; // IRS compliance standard (7 years)
  supersededVersionRetentionYears: number; // Historical audit retention (3 years)
  deletedAccountLegalHoldYears: number; // Legal hold retention upon account deletion (7 years)
  requireDualAdminApprovalForPermanentDeletion: boolean; // Security control
}

export function getRetentionPolicyConfig(): RetentionPolicyConfig {
  const approvedYears = parseInt(process.env.TAX_DOC_RETENTION_YEARS || "7", 10);
  const supersededYears = parseInt(process.env.TAX_DOC_SUPERSEDED_RETENTION_YEARS || "3", 10);
  const legalHoldYears = parseInt(process.env.TAX_DOC_LEGAL_HOLD_YEARS || "7", 10);

  return {
    approvedTaxDocRetentionYears: isNaN(approvedYears) ? 7 : approvedYears,
    supersededVersionRetentionYears: isNaN(supersededYears) ? 3 : supersededYears,
    deletedAccountLegalHoldYears: isNaN(legalHoldYears) ? 7 : legalHoldYears,
    requireDualAdminApprovalForPermanentDeletion: true
  };
}

export const retentionPolicy = getRetentionPolicyConfig();
