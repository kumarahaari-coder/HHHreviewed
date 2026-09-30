/**
 * PMS Integration Mode Manager
 * 
 * Tracks whether Hostaway has been cut over to Primary PMS,
 * and maintains the lifecycle status of legacy providers (OwnerRez, Hospitable).
 */

export type PmsProviderState = "PRIMARY" | "CANDIDATE_PRIMARY" | "LEGACY_ACTIVE" | "LEGACY_READ_ONLY" | "LEGACY_FALLBACK";

export interface PmsSystemStatus {
  hostaway: {
    state: PmsProviderState;
    label: string;
    isPrimary: boolean;
    syncEnabled: boolean;
    ingestionEnabled: boolean;
    commissionAttributionEnabled: boolean;
    webhooksActive: boolean;
  };
  ownerrez: {
    state: PmsProviderState;
    label: string;
    isPrimary: boolean;
    isReadOnly: boolean;
    syncEnabled: boolean;
  };
  hospitable: {
    state: PmsProviderState;
    label: string;
    isFallback: boolean;
  };
  cutoverCompleted: boolean;
  cutoverTimestamp?: string;
}

// Ingestion readiness is decoupled from financial commission readiness
export function isHostawayIngestionEnabled(): boolean {
  return process.env.HOSTAWAY_INGESTION_ENABLED === "true";
}

export function isHostawayCommissionAttributionEnabled(): boolean {
  // Fail-closed: only enabled when explicitly proven with live booking evidence
  return process.env.HOSTAWAY_COMMISSION_ATTRIBUTION_ENABLED === "true";
}

// Ingestion and cutover remain disabled until live connection and verification pass
let cutoverActive = process.env.HOSTAWAY_CUTOVER_ACTIVE === "true";
let cutoverTime: string | undefined = undefined;

export function isHostawayPrimary(): boolean {
  return cutoverActive && process.env.HOSTAWAY_CUTOVER_ACTIVE === "true";
}

export function setHostawayCutover(active: boolean): void {
  cutoverActive = active;
  if (active && !cutoverTime) {
    cutoverTime = new Date().toISOString();
  }
}

export function getPmsSystemStatus(): PmsSystemStatus {
  const primary = isHostawayPrimary();
  const ingestionEnabled = isHostawayIngestionEnabled();
  const commissionEnabled = isHostawayCommissionAttributionEnabled();

  return {
    hostaway: {
      state: primary ? "PRIMARY" : "CANDIDATE_PRIMARY",
      label: primary ? "Primary PMS" : "Candidate Primary",
      isPrimary: primary,
      syncEnabled: ingestionEnabled,
      ingestionEnabled,
      commissionAttributionEnabled: commissionEnabled,
      webhooksActive: true,
    },
    ownerrez: {
      state: primary ? "LEGACY_READ_ONLY" : "LEGACY_ACTIVE",
      label: primary ? "Legacy / Read-only" : "Legacy Active",
      isPrimary: !primary,
      isReadOnly: primary,
      syncEnabled: !primary,
    },
    hospitable: {
      state: "LEGACY_FALLBACK",
      label: "Legacy / Fallback",
      isFallback: true,
    },
    cutoverCompleted: primary,
    cutoverTimestamp: cutoverTime,
  };
}
