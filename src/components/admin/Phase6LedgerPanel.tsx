"use client";

import React, { useEffect, useState } from "react";
import {
  ShieldAlert,
  FileText,
  DollarSign,
  ArrowRight,
  CheckCircle,
  XCircle,
  Clock,
  Layers,
  RefreshCw,
  AlertCircle,
  Lock,
} from "lucide-react";
import {
  CommissionLedgerEvent,
  PartnerFinancialProjection,
  PayoutBatchRecord,
  PayoutRail,
} from "@/lib/commissions/types";

export function Phase6LedgerPanel() {
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [projection, setProjection] = useState<PartnerFinancialProjection | null>(null);
  const [ledgerEvents, setLedgerEvents] = useState<CommissionLedgerEvent[]>([]);
  const [batches, setBatches] = useState<PayoutBatchRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Draft batch modal states
  const [selectedRail, setSelectedRail] = useState<PayoutRail>("MANUAL_ACH");
  const [isCreatingBatch, setIsCreatingBatch] = useState<boolean>(false);

  // Load partners on mount
  useEffect(() => {
    async function loadPartners() {
      try {
        const res = await fetch("/api/admin/partners");
        const data = await res.json();
        if (data.partners && data.partners.length > 0) {
          const list = data.partners.map((p: any) => ({
            id: p.id,
            name: p.name || p.contactName || "Unnamed Partner",
          }));
          setPartners(list);
          setSelectedPartnerId(list[0].id);
        }
      } catch (err: any) {
        console.error("Failed to load partners:", err);
      }
    }
    loadPartners();
  }, []);

  // Fetch partner projection, ledger, and batches
  const fetchData = async () => {
    if (!selectedPartnerId) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // 1. Fetch ledger events & projection
      const ledgerRes = await fetch(`/api/admin/commissions/ledger?partnerId=${selectedPartnerId}`);
      const ledgerData = await ledgerRes.json();
      if (ledgerData.success) {
        setLedgerEvents(ledgerData.events || []);
        setProjection(ledgerData.projection || null);
      } else {
        setError(ledgerData.error || "Failed to load ledger data.");
      }

      // 2. Fetch payout batches
      const batchRes = await fetch(`/api/admin/commissions/payout-batches?partnerId=${selectedPartnerId}`);
      const batchData = await batchRes.json();
      if (batchData.success) {
        setBatches(batchData.batches || []);
      }
    } catch (err: any) {
      setError(err.message || "Network error loading data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedPartnerId]);

  // Create DRAFT batch
  const handleCreateDraftBatch = async () => {
    if (!selectedPartnerId) return;
    setIsCreatingBatch(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/admin/commissions/payout-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId: selectedPartnerId,
          payoutRail: selectedRail,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Failed to create draft batch.");
      } else {
        setSuccessMessage(`DRAFT Batch created: ${data.batch.batch_number} for $${data.batch.total_amount.toFixed(2)}`);
        await fetchData();
      }
    } catch (err: any) {
      setError(err.message || "Failed to create draft batch.");
    } finally {
      setIsCreatingBatch(false);
    }
  };

  // Transition batch state
  const handleTransitionBatch = async (batchId: string, action: "submit" | "approve" | "cancel" | "settle") => {
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/admin/commissions/payout-batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.error || `Action '${action}' failed.`);
      } else {
        setSuccessMessage(`Batch action '${action}' completed successfully.`);
        await fetchData();
      }
    } catch (err: any) {
      setError(err.message || `Failed to perform action '${action}'.`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Partner Selector Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-brand-cream border border-brand-blush p-4 rounded-xl shadow-xs gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="text-brand-plum" size={20} />
            <h2 className="text-lg font-bold text-brand-plum">Phase 6 Commission Ledger & Batches</h2>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Append-only event ledger, FIFO negative carry-forward recovery, and maker-checker batching.
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <select
            value={selectedPartnerId}
            onChange={(e) => setSelectedPartnerId(e.target.value)}
            className="bg-brand-bg border border-brand-blush text-brand-text text-xs rounded-lg px-3 py-2 font-medium focus:outline-hidden"
          >
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 border border-brand-blush bg-brand-bg hover:bg-brand-blush/20 rounded-lg text-brand-plum disabled:opacity-50 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center space-x-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center space-x-2">
          <CheckCircle size={16} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Financial Metrics Cards */}
      {projection && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-brand-cream border border-brand-blush p-4 rounded-xl">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold">
              Accounting Liability
            </div>
            <div className="text-2xl font-extrabold text-brand-plum mt-1">
              ${projection.partnerAccountingOutstanding.toFixed(2)}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">
              Total balance sheet payable (includes future stays)
            </div>
          </div>

          <div className="bg-brand-cream border border-brand-blush p-4 rounded-xl">
            <div className="text-[11px] uppercase tracking-wider text-emerald-600 font-bold">
              Completed Eligible
            </div>
            <div className="text-2xl font-extrabold text-emerald-700 mt-1">
              ${projection.eligiblePositive.toFixed(2)}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">
              Passed departure + hold, zero open disputes
            </div>
          </div>

          <div className="bg-brand-cream border border-brand-blush p-4 rounded-xl">
            <div className="text-[11px] uppercase tracking-wider text-rose-600 font-bold">
              Negative Carry-Forward
            </div>
            <div className="text-2xl font-extrabold text-rose-700 mt-1">
              -${projection.negativeCarryForward.toFixed(2)}
            </div>
            <div className="text-[10px] text-zinc-400 mt-1">
              Recoverable post-payout refund clawbacks
            </div>
          </div>

          <div className="bg-brand-plum text-brand-cream border border-brand-plum p-4 rounded-xl shadow-xs">
            <div className="text-[11px] uppercase tracking-wider text-brand-cream/70 font-bold">
              Payout Available
            </div>
            <div className="text-2xl font-extrabold text-brand-cream mt-1">
              ${projection.partnerPayoutAvailable.toFixed(2)}
            </div>
            <div className="text-[10px] text-brand-cream/70 mt-1">
              Net available = Max(0, Eligible - Recoverable)
            </div>
          </div>
        </div>
      )}

      {/* Batch Generator Control */}
      {projection && (
        <div className="bg-brand-cream border border-brand-blush p-5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="font-bold text-brand-plum text-sm">Generate Payout Batch</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Drafts a new payout batch with deterministic FIFO netting deduction.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={selectedRail}
              onChange={(e) => setSelectedRail(e.target.value as PayoutRail)}
              className="bg-brand-bg border border-brand-blush text-brand-text text-xs rounded-lg px-3 py-2 font-medium"
            >
              <option value="MANUAL_ACH">Manual ACH</option>
              <option value="BANK_WIRE">Bank Wire</option>
              <option value="CHECK">Paper Check</option>
              <option value="STRIPE_CONNECT">Stripe Connect (Future)</option>
            </select>

            <button
              onClick={handleCreateDraftBatch}
              disabled={isCreatingBatch || !projection || projection.partnerPayoutAvailable <= 0}
              className="bg-brand-plum text-brand-cream hover:bg-brand-wine disabled:opacity-40 px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5"
            >
              <DollarSign size={14} />
              <span>Draft Batch (${projection.partnerPayoutAvailable.toFixed(2)})</span>
            </button>
          </div>
        </div>
      )}

      {/* Batches Table */}
      <div className="bg-brand-cream border border-brand-blush rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-brand-blush bg-brand-blush/20 flex justify-between items-center">
          <h3 className="text-xs uppercase tracking-wider font-bold text-brand-plum">
            Payout Batches ({batches.length})
          </h3>
          <span className="text-[11px] text-zinc-500">Maker-Checker Approval Required</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-brand-blush/25 border-b border-brand-blush text-brand-plum font-bold">
                <th className="p-3">Batch Number</th>
                <th className="p-3">Rail</th>
                <th className="p-3">Gross</th>
                <th className="p-3">Netting Deduction</th>
                <th className="p-3">Disbursed Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-blush/60">
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-zinc-400 italic">
                    No payout batches found for this partner.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="hover:bg-brand-blush/10 transition-colors">
                    <td className="p-3 font-bold text-brand-plum">{b.batch_number}</td>
                    <td className="p-3 font-mono text-[11px]">{b.payout_rail}</td>
                    <td className="p-3">${Number(b.total_gross_amount).toFixed(2)}</td>
                    <td className="p-3 text-rose-600 font-medium">
                      {Number(b.total_netting_deduction) > 0
                        ? `-$${Number(b.total_netting_deduction).toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="p-3 font-extrabold text-brand-plum">
                      ${Number(b.total_amount).toFixed(2)}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        b.status === "SETTLED"
                          ? "bg-emerald-100 text-emerald-800"
                          : b.status === "APPROVED"
                          ? "bg-blue-100 text-blue-800"
                          : b.status === "PENDING_APPROVAL"
                          ? "bg-amber-100 text-amber-800"
                          : b.status === "CANCELLED"
                          ? "bg-zinc-100 text-zinc-600"
                          : "bg-purple-100 text-purple-800"
                      }`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="p-3 text-center space-x-1.5">
                      {b.status === "DRAFT" && (
                        <>
                          <button
                            onClick={() => handleTransitionBatch(b.id, "submit")}
                            className="px-2.5 py-1 bg-amber-600 text-white rounded-md text-[10px] font-bold hover:bg-amber-700 transition-colors"
                          >
                            Submit
                          </button>
                          <button
                            onClick={() => handleTransitionBatch(b.id, "cancel")}
                            className="px-2.5 py-1 bg-zinc-200 text-zinc-700 rounded-md text-[10px] font-bold hover:bg-zinc-300 transition-colors"
                          >
                            Discard
                          </button>
                        </>
                      )}

                      {b.status === "PENDING_APPROVAL" && (
                        <>
                          <button
                            onClick={() => handleTransitionBatch(b.id, "approve")}
                            className="px-2.5 py-1 bg-blue-600 text-white rounded-md text-[10px] font-bold hover:bg-blue-700 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleTransitionBatch(b.id, "cancel")}
                            className="px-2.5 py-1 bg-zinc-200 text-zinc-700 rounded-md text-[10px] font-bold hover:bg-zinc-300 transition-colors"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {b.status === "APPROVED" && (
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleTransitionBatch(b.id, "settle")}
                            className="px-2.5 py-1 bg-emerald-600 text-white rounded-md text-[10px] font-bold hover:bg-emerald-700 transition-colors"
                          >
                            Settle
                          </button>
                          <button
                            onClick={() => handleTransitionBatch(b.id, "cancel")}
                            className="px-2.5 py-1 bg-zinc-200 text-zinc-700 rounded-md text-[10px] font-bold hover:bg-zinc-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {b.status === "SETTLED" && (
                        <span className="text-[10px] text-zinc-400 font-serif italic">Settled & Locked</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Append-Only Event Ledger Table */}
      <div className="bg-brand-cream border border-brand-blush rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-brand-blush bg-brand-blush/20 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <FileText size={16} className="text-brand-plum" />
            <h3 className="text-xs uppercase tracking-wider font-bold text-brand-plum">
              Append-Only Commission Ledger ({ledgerEvents.length} Events)
            </h3>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">public.commission_ledger_events</span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-brand-blush/25 border-b border-brand-blush text-brand-plum font-bold sticky top-0 bg-brand-cream">
                <th className="p-3">Event Type</th>
                <th className="p-3">Reservation / Booking</th>
                <th className="p-3">Provider / Channel</th>
                <th className="p-3">Delta Amount</th>
                <th className="p-3">Idempotency Key</th>
                <th className="p-3">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-blush/60">
              {ledgerEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-zinc-400 italic">
                    Zero ledger events posted for this partner.
                  </td>
                </tr>
              ) : (
                ledgerEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-brand-blush/10 transition-colors">
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        ev.event_type === "INITIAL_ACCRUAL"
                          ? "bg-zinc-100 text-zinc-700"
                          : ev.event_type === "PAYMENT_REALIZED"
                          ? "bg-emerald-100 text-emerald-800"
                          : ev.event_type === "REFUND_CLAWBACK"
                          ? "bg-rose-100 text-rose-800"
                          : ev.event_type === "PAYOUT_SETTLEMENT"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {ev.event_type}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px]">{ev.provider_booking_id}</td>
                    <td className="p-3">
                      <span className="font-semibold">{ev.source_provider}</span> / {ev.booking_channel}
                    </td>
                    <td className={`p-3 font-extrabold ${
                      Number(ev.delta_amount) > 0
                        ? "text-emerald-700"
                        : Number(ev.delta_amount) < 0
                        ? "text-rose-700"
                        : "text-zinc-500"
                    }`}>
                      {Number(ev.delta_amount) > 0 ? "+" : ""}
                      ${Number(ev.delta_amount).toFixed(2)}
                    </td>
                    <td className="p-3 font-mono text-[10px] text-zinc-400 truncate max-w-xs" title={ev.idempotency_key}>
                      {ev.idempotency_key}
                    </td>
                    <td className="p-3 text-[10px] text-zinc-400 whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
