"use client";

import React from "react";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Phase6LedgerPanel } from "@/components/admin/Phase6LedgerPanel";

export default function PayoutProcessing() {
  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Payout Operations"
        description="Manage partner commission ledger, approve eligible balances, and review payout batch lifecycles."
      />

      {/* Operational Mode Alert */}
      <div className="rounded-xl border border-divider-soft bg-surface-subtle p-4 flex items-center gap-3 shadow-xs">
        <div className="p-2 rounded-lg bg-surface border border-divider-soft text-primary shrink-0">
          <Lock size={18} />
        </div>
        <div>
          <div className="text-xs font-bold text-primary">Settlement controlled by server flags</div>
          <div className="text-xs text-secondary mt-0.5">
            External payout execution and settlement run only when PHASE6_SETTLEMENT_ENABLED and PHASE6_EXTERNAL_PAYOUTS_ENABLED are true on the server. Review and batch preparation are always available.
          </div>
        </div>
      </div>

      <Phase6LedgerPanel />
    </div>
  );
}
