"use client";

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  Activity,
  CheckCircle2,
  Database,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Play
} from "lucide-react";
import { Card, Badge } from "@/components/ui/custom";
import { db } from "@/lib/db/mockDb";
import type { Property, Reservation } from "@/lib/db/schema";
import { runSystemPayoutRecalculation } from "@/lib/payouts";

type ConnectionStatus = {
  configured: boolean;
  baseUrl: string;
  tokenLocation: string;
};

type HealthReport = {
  status: "Healthy" | "Degraded" | "Unhealthy";
  reason: string;
  details: {
    lastSuccessfulSync: string | null;
    lastFailedSync: string | null;
    successRate7DaysPercent: number;
    successRate30DaysPercent: number;
    approvedPropertyCount: number;
    financialCoveragePercent: number;
    validationWarningCount: number;
    staleLeaseActive: boolean;
  };
  configuration: {
    lookbackDays: number;
    lookaheadDays: number;
    leaseSeconds: number;
    maxRetries: number;
    pageSize: number;
    maxPages: number;
  };
};

type SyncResponse = {
  success: boolean;
  error?: string;
  details?: unknown;
  syncedAt?: string;
  properties?: Property[];
  reservations?: Reservation[];
  summary?: {
    propertyCount: number;
    requestedPropertyCount?: number;
    livePropertyCount?: number;
    reservationCount: number;
    attributedReservationCount?: number;
    financialCoveragePercent: number;
    replaceExisting?: boolean;
  };
  validation?: {
    warningCount: number;
    skippedReservationCount: number;
  };
  warnings?: string[];
};

function defaultStartDate(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return date.toISOString().split("T")[0];
}

export default function IntegrationsPage() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [dryRun, setDryRun] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<SyncResponse | null>(null);

  const fetchHealth = () => {
    fetch("/api/hospitable/health", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: HealthReport) => setHealth(data))
      .catch((err) => console.warn("Failed to fetch health report:", err));
  };

  useEffect(() => {
    let active = true;
    void fetch("/api/hospitable/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: ConnectionStatus) => {
        if (active) setStatus(data);
      })
      .catch(() => {
        if (active)
          setStatus({
            configured: false,
            baseUrl: "Unavailable",
            tokenLocation: "server_environment_only",
          });
      });

    fetchHealth();
    return () => {
      active = false;
    };
  }, []);

  const addLog = (message: string) => {
    setLogs((previous) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...previous]);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setLastResult(null);
    addLog(`Starting secure Hospitable sync for ${startDate} to ${endDate}.`);

    try {
      const response = await fetch("/api/hospitable/sync-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = (await response.json()) as SyncResponse;
      setLastResult(data);

      if (!response.ok || !data.success) {
        addLog(`Sync failed: ${data.error || "Unknown API error"}`);
        return;
      }

      const properties = data.properties || [];
      const reservations = data.reservations || [];

      db.replaceProperties(properties);
      if (replaceExisting) db.replaceReservations(reservations);
      else db.upsertReservations(reservations);
      runSystemPayoutRecalculation();

      addLog(`Imported ${properties.length} properties and ${reservations.length} reservations.`);
      addLog("The Admin dashboard now uses this live Hospitable snapshot in the current browser.");
      db.addNotification("SUCCESS", `Hospitable sync imported ${reservations.length} reservations.`);
      fetchHealth();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to run sync";
      setLastResult({ success: false, error: message });
      addLog(`Sync failed: ${message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReconcile = async () => {
    setIsReconciling(true);
    addLog(`Starting admin reconciliation (dryRun=${dryRun}) for ${startDate} to ${endDate}.`);

    try {
      const response = await fetch("/api/admin/hospitable/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, dryRun }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        addLog(`Reconciliation failed: ${data.error || "Authorization or execution error"}`);
        return;
      }

      addLog(
        `Reconciliation completed (${data.reconciliationMode} mode). ` +
          `Would upsert ${data.summary?.propertyCount ?? 0} properties and ${data.summary?.reservationCount ?? 0} reservations.`
      );
      if (dryRun) {
        addLog("Preview complete. Zero business-data mutations occurred.");
      }
      fetchHealth();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reconciliation error";
      addLog(`Reconciliation failed: ${message}`);
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <div className="space-y-8 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">
          Hospitable Integration & Operations
        </h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Enterprise monitoring, health status, and administrative reconciliation for Hidden Honey Homes Stays.
        </p>
      </div>

      {/* Integration Health Status Banner */}
      {health && (
        <Card className="p-5 space-y-4 border-l-4 border-l-brand-plum">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-brand-wine flex items-center gap-2">
              <Activity size={16} /> Operational Health Status
            </h2>
            <Badge
              type={
                health.status === "Healthy"
                  ? "success"
                  : health.status === "Degraded"
                  ? "warning"
                  : "danger"
              }
            >
              {health.status} — {health.reason}
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                7-Day Success Rate
              </p>
              <p className="text-lg font-extrabold text-brand-plum mt-0.5">
                {health.details.successRate7DaysPercent}%
              </p>
            </div>
            <div>
              <p className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                30-Day Success Rate
              </p>
              <p className="text-lg font-extrabold text-brand-plum mt-0.5">
                {health.details.successRate30DaysPercent}%
              </p>
            </div>
            <div>
              <p className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                Financial Coverage
              </p>
              <p className="text-lg font-extrabold text-brand-plum mt-0.5">
                {health.details.financialCoveragePercent}%
              </p>
            </div>
            <div>
              <p className="text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                Configured Window
              </p>
              <p className="text-lg font-extrabold text-brand-plum mt-0.5">
                -{health.configuration.lookbackDays}d / +{health.configuration.lookaheadDays}d
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-brand-wine flex items-center gap-2">
              <KeyRound size={16} /> API Credential
            </h2>
            <Badge type={status?.configured ? "success" : "warning"}>
              {status?.configured ? "Configured" : "Setup Required"}
            </Badge>
          </div>

          <div className="rounded-xl bg-brand-bg/70 border border-brand-blush p-4 text-xs space-y-2">
            <div className="flex items-center gap-2 text-brand-plum font-semibold">
              <ShieldCheck size={15} /> Server-side only
            </div>
            <p className="text-zinc-600 leading-relaxed">
              Token managed strictly via <code className="font-mono">HOSPITABLE_PAT</code> in server environment variables. Zero browser exposure.
            </p>
          </div>

          <div className="text-[11px] text-zinc-500 space-y-1">
            <p>
              <span className="font-bold">API Base:</span> {status?.baseUrl || "Checking..."}
            </p>
            <p>
              <span className="font-bold">Scheduled Cron:</span> 0 0 * * * (UTC Daily)
            </p>
            <p>
              <span className="font-bold">Approved Properties:</span> 4 POC Stays
            </p>
          </div>
        </Card>

        <Card className="lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between border-b border-brand-blush/60 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-brand-wine flex items-center gap-2">
              <Database size={16} /> Live Data Import & Admin Reconciliation
            </h2>
            <Badge type="plum">Hospitable Public API v2</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs font-semibold text-brand-wine">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-1.5 w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm text-brand-text"
              />
            </label>
            <label className="text-xs font-semibold text-brand-wine">
              End date
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-1.5 w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm text-brand-text"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing || !status?.configured}
              className="w-full flex items-center justify-center gap-2 bg-brand-plum text-brand-cream hover:bg-brand-wine disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-lg text-xs font-bold transition-all"
            >
              <RefreshCw size={15} className={isSyncing ? "animate-spin" : ""} />
              {isSyncing ? "Syncing..." : "Run Manual Sync"}
            </button>

            <button
              type="button"
              onClick={handleReconcile}
              disabled={isReconciling || !status?.configured}
              className="w-full flex items-center justify-center gap-2 bg-zinc-800 text-white hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-lg text-xs font-bold transition-all"
            >
              <Play size={15} className={isReconciling ? "animate-spin" : ""} />
              {isReconciling ? "Reconciling..." : `Admin Reconcile (DryRun=${dryRun})`}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-600">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
            />
            <span>Enable DryRun preview for Admin Reconciliation (zero business-data mutations)</span>
          </label>
        </Card>
      </div>

      {lastResult?.success && lastResult.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            ["Properties", lastResult.summary.propertyCount],
            ["Requested", lastResult.summary.requestedPropertyCount],
            ["Reservations", lastResult.summary.reservationCount],
            ["Financial coverage", `${lastResult.summary.financialCoveragePercent}%`],
          ].map(([label, value]) => (
            <Card key={String(label)} className="p-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">{label}</p>
              <p className="text-2xl font-extrabold text-brand-plum mt-1">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {lastResult && !lastResult.success && (
        <Card className="border-rose-200 bg-rose-50/60">
          <h3 className="text-sm font-bold text-rose-800 flex items-center gap-2">
            <AlertCircle size={16} /> Sync Error
          </h3>
          <p className="text-xs text-rose-700 mt-2">{lastResult.error}</p>
        </Card>
      )}

      <Card className="bg-[#1e1721] border-transparent text-[#e3dae8] p-6 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#d5c3db] font-mono flex items-center gap-2">
          <Terminal size={14} /> Import & Operation Log
        </h3>
        <div className="h-44 overflow-y-auto font-mono text-[11px] space-y-1.5 pr-1">
          {logs.length === 0 ? (
            <p className="text-zinc-500 italic">No sync or reconciliation run in this session.</p>
          ) : (
            logs.map((log) => <p key={log} className="leading-relaxed">{log}</p>)
          )}
        </div>
      </Card>
    </div>
  );
}
