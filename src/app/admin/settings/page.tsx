"use client";

import React, { useEffect, useState } from "react";
import {
  Settings,
  ClipboardList,
  ShieldCheck,
  User,
  Info,
  Calendar,
  Lock
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { AuditLog } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";

export default function SettingsAndAudits() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logFilter, setLogFilter] = useState("ALL");

  useEffect(() => {
    setLogs(db.auditLogs);
  }, []);

  const filteredLogs = logs.filter(log => {
    if (logFilter === "ALL") return true;
    return log.recordType === logFilter;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & Operational Controls"
        description="System configurations, security policy enforcement, and audit logs."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SECURITY & GOVERNANCE GROUP */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
              <ShieldCheck size={16} className="text-[var(--primary)]" />
              <h3 className="text-sm font-bold text-[var(--primary)]">Security & Governance</h3>
            </div>
            
            <div className="space-y-3 text-xs text-[var(--secondary)]">
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
                <span>Short-Lived Signed S3 Presigned URLs for Tax Documents</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                <span>Sensitive PII, Tax IDs & Bank Account Masking Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* AUDIT LOG TRAIL */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] pb-3 gap-3">
              <div className="flex items-center gap-2">
                <ClipboardList size={16} className="text-[var(--primary)]" />
                <h3 className="text-sm font-bold text-[var(--primary)]">Financial Audit Trail</h3>
              </div>
              
              <select
                value={logFilter}
                onChange={e => setLogFilter(e.target.value)}
                className="bg-[var(--canvas)] border border-[var(--border)] rounded-md text-xs font-medium text-[var(--primary)] py-1.5 px-3 focus:outline-none"
              >
                <option value="ALL">All Audit Trail Types</option>
                <option value="PARTNER">Partner Profiling</option>
                <option value="SITE">Site Configurations</option>
                <option value="RESERVATION">Stay Attributions</option>
                <option value="PAYOUT">Payout Approvals</option>
                <option value="PAYOUT_BATCH">Batch Submissions</option>
              </select>
            </div>

            {/* Audit Logs list */}
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {filteredLogs.length === 0 ? (
                <p className="text-center py-8 text-xs text-[var(--secondary)] italic">No audit trail records found.</p>
              ) : (
                filteredLogs.map(log => (
                  <div key={log.id} className="border border-[var(--border)] bg-[var(--canvas)] rounded-md p-3 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <User size={12} className="text-[var(--secondary)]" />
                        <span className="font-semibold text-[var(--primary)]">{log.userName}</span>
                        <StatusBadge variant="info">{log.action}</StatusBadge>
                      </div>
                      <span className="text-[10px] text-[var(--secondary)] font-mono">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] bg-[var(--surface)] border border-[var(--border)] p-2 rounded-md">
                      <div>
                        <span className="font-semibold block text-[var(--secondary)]">Target</span>
                        <span className="font-mono text-[var(--primary)]">{log.recordType}: {log.recordId}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="font-semibold block text-[var(--secondary)]">State Update</span>
                        {log.previousValue ? (
                          <div className="space-y-0.5 font-mono">
                            <span className="text-[var(--secondary)] block line-through">PREV: {log.previousValue}</span>
                            <span className="text-[var(--primary)] block font-semibold">UPD: {log.updatedValue}</span>
                          </div>
                        ) : (
                          <span className="text-[var(--primary)] font-mono block font-semibold truncate">{log.updatedValue}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
