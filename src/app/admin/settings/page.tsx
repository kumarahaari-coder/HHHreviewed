"use client";

import React, { useEffect, useState } from "react";
import {
  Settings,
  ClipboardList,
  ShieldCheck,
  RotateCcw,
  User,
  Info,
  Calendar,
  AlertTriangle
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { AuditLog } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";

export default function SettingsAndAudits() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logFilter, setLogFilter] = useState("ALL");

  useEffect(() => {
    setLogs(db.auditLogs);
  }, []);

  const handleReset = () => {
    if (confirm("Are you sure you want to reset all simulation data to its default seed state? This will clear all added bookings, sites, partners, and payouts.")) {
      db.reset();
    }
  };

  const filteredLogs = logs.filter(log => {
    if (logFilter === "ALL") return true;
    return log.recordType === logFilter;
  });

  return (
    <div className="space-y-8 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Settings & Audits</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          System configurations, developer options, and transaction audit trails.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SIMULATION CONTROLS */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="space-y-4 border-rose-200 bg-rose-50/10">
            <h3 className="text-sm font-bold uppercase tracking-widest text-rose-800 flex items-center gap-2">
              <RotateCcw size={16} />
              Reset Demonstration
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Resets the browser's `localStorage` state, restoring the database to its pristine mock state containing 4 retreats, 3 partners, 5 websites, and 10 bookings.
            </p>
            <button
              onClick={handleReset}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 flex items-center justify-center space-x-2"
            >
              <RotateCcw size={14} />
              <span>Reset Database Simulation</span>
            </button>
          </Card>

          <Card className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-brand-wine flex items-center gap-2">
              <ShieldCheck size={16} />
              Security Settings
            </h3>
            <div className="space-y-3 text-xs text-zinc-600">
              <p className="flex items-start gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-sage mt-1.5 shrink-0" />
                <span>Session auto-expiration mock configured (20 min).</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-sage mt-1.5 shrink-0" />
                <span>Row Level Security (RLS) policies simulated for partner scopes.</span>
              </p>
              <p className="flex items-start gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-sage mt-1.5 shrink-0" />
                <span>Payment and guest credentials masked for partners.</span>
              </p>
            </div>
          </Card>
        </div>

        {/* AUDIT LOG TRAIL */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-brand-blush/60 pb-3 gap-3">
              <h3 className="text-sm font-bold uppercase tracking-widest text-brand-wine flex items-center gap-2">
                <ClipboardList size={16} />
                Financial Audit History
              </h3>
              
              {/* Filter */}
              <select
                value={logFilter}
                onChange={e => setLogFilter(e.target.value)}
                className="bg-brand-bg border border-brand-blush rounded-lg text-xs font-bold text-zinc-600 py-1.5 px-3 focus:outline-none"
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
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-200">
              {filteredLogs.length === 0 ? (
                <p className="text-center py-8 text-xs text-zinc-400 italic">No audit trail records found.</p>
              ) : (
                filteredLogs.map(log => (
                  <div key={log.id} className="border border-brand-blush/60 bg-brand-bg/25 rounded-lg p-3 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-1.5">
                        <User size={12} className="text-zinc-400" />
                        <span className="font-bold text-zinc-700">{log.userName}</span>
                        <span className="text-[10px] text-zinc-400 bg-brand-blush/30 border border-brand-blush/50 px-2 py-0.5 rounded uppercase font-bold tracking-wide">
                          {log.action}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[10px] bg-brand-cream border border-brand-blush/40 p-2 rounded">
                      <div>
                        <span className="font-bold block text-brand-wine">Scope Target</span>
                        <span className="font-semibold text-zinc-600 uppercase">{log.recordType}: {log.recordId}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="font-bold block text-brand-wine">Audit State Change</span>
                        {log.previousValue ? (
                          <div className="space-y-0.5">
                            <span className="text-zinc-400 block line-through">PREV: {log.previousValue}</span>
                            <span className="text-brand-plum block font-semibold">UPD: {log.updatedValue}</span>
                          </div>
                        ) : (
                          <span className="text-brand-plum block font-semibold truncate">{log.updatedValue}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
