"use client";

import React from "react";
import {
  ClipboardList,
  ShieldCheck,
  Info
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export default function SettingsAndAudits() {
  return (
    <div className="space-y-6 font-sans pb-8">
      <PageHeader
        title="Settings & Operational Controls"
        description="System configurations, security policy enforcement, and audit controls."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECURITY & GOVERNANCE GROUP */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border border-divider-soft bg-surface p-5 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 border-b border-divider-soft pb-3">
              <ShieldCheck size={16} className="text-primary" />
              <h3 className="text-sm font-bold text-primary">Security & Governance</h3>
            </div>
            
            <div className="space-y-3 text-xs text-secondary">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                <span>Clerk Session Authentication & Role Boundaries Enforced</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                <span>Supabase Row Level Security (RLS) Tenant Isolation Active</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                <span>Short-Lived Signed Presigned URLs for Tax Documents</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                <span>Sensitive PII, Tax IDs & Bank Account Masking Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* AUDIT TRAIL PANEL (TRUTHFUL READ-ONLY EMPTY STATE) */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-divider-soft bg-surface p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-divider-soft pb-3">
              <div className="flex items-center gap-2">
                <ClipboardList size={16} className="text-primary" />
                <h3 className="text-sm font-bold text-primary">System Audit Trail</h3>
              </div>
            </div>

            {/* Truthful Read-Only Empty State */}
            <div className="py-12 px-4 text-center space-y-3 bg-surface-subtle rounded-lg border border-divider-soft">
              <div className="w-10 h-10 rounded-full bg-surface border border-divider-soft flex items-center justify-center mx-auto text-tertiary">
                <Info size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-primary">No audit events available</h4>
                <p className="text-xs text-secondary max-w-sm mx-auto">
                  Audit history is not currently exposed in this interface. System logs and immutable datastore events remain active in background telemetry.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
