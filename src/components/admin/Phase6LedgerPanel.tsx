"use client";

import React, { useEffect, useState, useCallback } from "react";
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
  Calendar,
  UserCheck,
  TrendingDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  CommissionLedgerEvent,
  PayoutBatchRecord,
  PartnerFinancialProjection,
  PayoutRail,
} from "@/lib/commissions/types";
import { formatCurrency } from "@/lib/status-mapper";

export function Phase6LedgerPanel() {
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [ledgerEvents, setLedgerEvents] = useState<CommissionLedgerEvent[]>([]);
  const [batches, setBatches] = useState<PayoutBatchRecord[]>([]);
  const [projection, setProjection] = useState<PartnerFinancialProjection | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedRail, setSelectedRail] = useState<PayoutRail>("MANUAL_ACH");
  const [isCreatingBatch, setIsCreatingBatch] = useState<boolean>(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Fetch partner list on mount
  useEffect(() => {
    async function loadPartners() {
      try {
        const res = await fetch("/api/admin/partners");
        const data = await res.json();
        const rawList = (data.success && Array.isArray(data.partners) && data.partners.length > 0)
          ? data.partners
          : (require("@/lib/db/mockDb").db.partners || []);

        const formattedList = rawList.map((p: any) => {
          const bName = p.business_name || p.businessName;
          const cName = p.contact_name || p.contactName || p.name;
          const displayName = (bName && bName.trim()) ? bName.trim() : ((cName && cName.trim()) ? cName.trim() : "Unnamed Partner");
          return {
            id: p.id,
            name: displayName,
          };
        });

        setPartners(formattedList);
        if (formattedList.length > 0) {
          setSelectedPartnerId((prev) => prev || formattedList[0].id);
        }
      } catch (err: any) {
        console.error("Failed to load partners API, using db.partners:", err);
        const fallbackList = (require("@/lib/db/mockDb").db.partners || []).map((p: any) => ({
          id: p.id,
          name: (p.businessName && p.businessName.trim()) ? p.businessName.trim() : ((p.contactName && p.contactName.trim()) ? p.contactName.trim() : "Unnamed Partner"),
        }));
        setPartners(fallbackList);
        if (fallbackList.length > 0) {
          setSelectedPartnerId((prev) => prev || fallbackList[0].id);
        }
      }
    }
    loadPartners();
  }, []);

  // Fetch partner projection, ledger, and batches
  const fetchData = useCallback(async () => {
    if (!selectedPartnerId) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const ledgerRes = await fetch(`/api/admin/commissions/ledger?partnerId=${selectedPartnerId}`);
      const ledgerData = await ledgerRes.json();
      if (ledgerData.success) {
        setLedgerEvents(ledgerData.events || []);
        setProjection(ledgerData.projection || null);
      } else {
        setError(ledgerData.error || "Failed to load ledger data.");
      }

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
  }, [selectedPartnerId]);

  useEffect(() => {
    let isMounted = true;
    if (!selectedPartnerId) return;

    fetch(`/api/admin/commissions/ledger?partnerId=${selectedPartnerId}`)
      .then((res) => res.json())
      .then((ledgerData) => {
        if (!isMounted) return;
        if (ledgerData.success) {
          setLedgerEvents(ledgerData.events || []);
          setProjection(ledgerData.projection || null);
        } else {
          setError(ledgerData.error || "Failed to load ledger data.");
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Network error loading data.");
      });

    fetch(`/api/admin/commissions/payout-batches?partnerId=${selectedPartnerId}`)
      .then((res) => res.json())
      .then((batchData) => {
        if (!isMounted) return;
        if (batchData.success) {
          setBatches(batchData.batches || []);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-surface border border-divider-soft p-4 rounded-lg gap-4 shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="text-primary" size={18} />
            <h2 className="text-sm font-bold text-primary">Commission Ledger & Payout Batches</h2>
          </div>
          <p className="text-xs text-secondary mt-0.5">
            Review commission activity and prepare eligible balances for payout.
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <select
            value={selectedPartnerId}
            onChange={(e) => setSelectedPartnerId(e.target.value)}
            className="bg-surface border border-divider-soft text-primary text-xs rounded-md px-3 py-2 font-medium focus:outline-none focus:ring-1 focus:ring-primary min-w-[200px] cursor-pointer"
          >
            {(!selectedPartnerId || partners.length === 0) && (
              <option value="">Select partner</option>
            )}
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || "Select partner"}
              </option>
            ))}
          </select>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 border border-divider-soft bg-surface hover:bg-surface-subtle rounded-md text-primary disabled:opacity-50 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-danger-surface border border-danger-border rounded-md text-danger text-xs flex items-center space-x-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-success-surface border border-success-border rounded-md text-success text-xs flex items-center space-x-2">
          <CheckCircle size={16} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Financial Metrics Cards */}
      {projection && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface border border-divider-soft p-4 rounded-lg shadow-xs">
            <div className="text-[11px] uppercase tracking-wider text-secondary font-semibold">
              Accounting Liability
            </div>
            <div className="text-xl font-bold tabular-nums font-mono text-primary mt-1">
              {formatCurrency(projection.partnerAccountingOutstanding)}
            </div>
            <div className="text-[10px] text-tertiary mt-1">
              Total balance sheet payable (includes future stays)
            </div>
          </div>

          <div className="bg-surface border border-divider-soft p-4 rounded-lg shadow-xs">
            <div className="text-[11px] uppercase tracking-wider text-success font-semibold">
              Completed Eligible
            </div>
            <div className="text-xl font-bold tabular-nums font-mono text-primary mt-1">
              {formatCurrency(projection.eligiblePositive)}
            </div>
            <div className="text-[10px] text-tertiary mt-1">
              Passed departure + hold, zero open disputes
            </div>
          </div>

          <div className="bg-surface border border-divider-soft p-4 rounded-lg shadow-xs">
            <div className="text-[11px] uppercase tracking-wider text-danger font-semibold">
              Negative Carry-Forward
            </div>
            <div className="text-xl font-bold tabular-nums font-mono text-danger mt-1">
              {formatCurrency(projection.negativeCarryForward, true)}
            </div>
            <div className="text-[10px] text-tertiary mt-1">
              Recoverable post-payout refund clawbacks
            </div>
          </div>

          <div className="bg-surface border border-divider-soft p-4 rounded-lg shadow-xs">
            <div className="text-[11px] uppercase tracking-wider text-primary font-semibold">
              Payout Available
            </div>
            <div className="text-xl font-bold tabular-nums font-mono text-primary mt-1">
              {formatCurrency(projection.partnerPayoutAvailable)}
            </div>
            <div className="text-[10px] text-tertiary mt-1">
              Net available = Max(0, Eligible - Recoverable)
            </div>
          </div>
        </div>
      )}

      {/* Batch Generator Control */}
      {projection && (
        <div className="bg-surface border border-divider-soft p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xs">
          <div>
            <h3 className="font-bold text-primary text-sm">Generate Payout Batch</h3>
            <p className="text-xs text-secondary mt-0.5">
              Snapshots and locks currently eligible liabilities into a new payout batch with deterministic FIFO netting deduction.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <select
              value={selectedRail}
              onChange={(e) => setSelectedRail(e.target.value as PayoutRail)}
              className="bg-surface border border-divider-soft text-primary text-xs rounded-md px-3 py-2 font-medium focus:outline-none"
            >
              <option value="MANUAL_ACH">Manual ACH</option>
              <option value="BANK_WIRE">Bank Wire</option>
              <option value="CHECK">Paper Check</option>
              <option value="STRIPE_CONNECT">Stripe Connect (Future)</option>
            </select>

            <button
              onClick={handleCreateDraftBatch}
              disabled={isCreatingBatch || !projection || projection.partnerPayoutAvailable <= 0}
              className="bg-primary text-surface hover:bg-primary/90 disabled:opacity-50 px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs"
            >
              <DollarSign size={14} />
              <span>Draft Batch (${projection.partnerPayoutAvailable.toFixed(2)})</span>
            </button>
          </div>
        </div>
      )}

      {/* Batches Table */}
      <div className="bg-surface border border-divider-soft rounded-lg overflow-hidden shadow-xs">
        <div className="p-3.5 border-b border-divider-soft bg-surface-subtle flex justify-between items-center">
          <h3 className="text-xs font-semibold text-secondary">
            Payout Batches ({batches.length})
          </h3>
          <span className="text-[11px] text-tertiary">Maker-Checker Approval Required</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-subtle/50 border-b border-divider-soft text-secondary font-semibold">
                <th className="py-3 px-4">Batch Number</th>
                <th className="py-3 px-4">Rail</th>
                <th className="py-3 px-4">Gross</th>
                <th className="py-3 px-4">Netting Deduction</th>
                <th className="py-3 px-4">Disbursed Amount</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider-soft">
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-secondary">
                    No payout batches yet. Eligible liabilities will appear here when a batch is created.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="hover:bg-surface-subtle/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold font-mono text-primary">{b.batch_number}</td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-secondary">{b.payout_rail}</td>
                    <td className="py-3.5 px-4 tabular-nums font-mono text-primary">${Number(b.total_gross_amount).toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-danger font-medium tabular-nums font-mono">
                      {Number(b.total_netting_deduction) > 0
                        ? `-$${Number(b.total_netting_deduction).toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="py-3.5 px-4 font-bold tabular-nums font-mono text-primary">
                      ${Number(b.total_amount).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        b.status === "SETTLED"
                          ? "bg-success-surface text-success border-success-border"
                          : b.status === "APPROVED"
                          ? "bg-info-surface text-info border-info-border"
                          : b.status === "PENDING_APPROVAL"
                          ? "bg-warning-surface text-warning border-warning-border"
                          : b.status === "CANCELLED"
                          ? "bg-surface-muted text-secondary border-divider-soft"
                          : "bg-accent-subtle text-accent-hover border-accent/20"
                      }`}>
                        {b.status === "PENDING_APPROVAL" ? "Pending Approval" : b.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center space-x-1.5">
                      {b.status === "DRAFT" && (
                        <>
                          <button
                            onClick={() => handleTransitionBatch(b.id, "submit")}
                            className="px-2.5 py-1 bg-warning text-surface rounded-md text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            Submit
                          </button>
                          <button
                            onClick={() => handleTransitionBatch(b.id, "cancel")}
                            className="px-2.5 py-1 bg-surface-muted text-secondary rounded-md text-xs font-medium hover:bg-surface-subtle transition-colors cursor-pointer"
                          >
                            Discard
                          </button>
                        </>
                      )}

                      {b.status === "PENDING_APPROVAL" && (
                        <>
                          <button
                            onClick={() => handleTransitionBatch(b.id, "approve")}
                            className="px-2.5 py-1 bg-info text-surface rounded-md text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleTransitionBatch(b.id, "cancel")}
                            className="px-2.5 py-1 bg-surface-muted text-secondary rounded-md text-xs font-medium hover:bg-surface-subtle transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {b.status === "APPROVED" && (
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleTransitionBatch(b.id, "settle")}
                            className="px-2.5 py-1 bg-success text-surface rounded-md text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
                          >
                            Settle
                          </button>
                          <button
                            onClick={() => handleTransitionBatch(b.id, "cancel")}
                            className="px-2.5 py-1 bg-surface-muted text-secondary rounded-md text-xs font-medium hover:bg-surface-subtle transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {b.status === "SETTLED" && (
                        <span className="text-xs text-secondary font-medium">Settled & Locked</span>
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
      <div className="bg-surface border border-divider-soft rounded-lg overflow-hidden shadow-xs">
        <div className="p-3.5 border-b border-divider-soft bg-surface-subtle flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <FileText size={16} className="text-primary" />
            <h3 className="text-xs font-semibold text-secondary">
              Append-Only Commission Ledger ({ledgerEvents.length} Events)
            </h3>
          </div>
          <span className="text-[11px] text-tertiary">Ledger Invariant Audit</span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-surface-subtle/50 border-b border-divider-soft text-secondary font-semibold sticky top-0 bg-surface">
                <th className="py-3 px-4">Event Type</th>
                <th className="py-3 px-4">Booking Ref</th>
                <th className="py-3 px-4">Provider / Channel</th>
                <th className="py-3 px-4">Delta Amount</th>
                <th className="py-3 px-4">Idempotency Key</th>
                <th className="py-3 px-4">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider-soft">
              {ledgerEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-secondary">
                    No commission ledger events posted yet for this partner.
                  </td>
                </tr>
              ) : (
                ledgerEvents.map((ev) => {
                  const eventLabels: Record<string, { label: string; style: string }> = {
                    INITIAL_ACCRUAL: { label: "Initial Accrual", style: "bg-surface-muted text-secondary border-divider-soft" },
                    PAYMENT_REALIZED: { label: "Payment Realized", style: "bg-success-surface text-success border-success-border" },
                    REFUND_CLAWBACK: { label: "Refund Clawback", style: "bg-danger-surface text-danger border-danger-border" },
                    MANUAL_ADJUSTMENT: { label: "Manual Adjustment", style: "bg-warning-surface text-warning border-warning-border" },
                    ELIGIBILITY_RELEASE: { label: "Eligibility Released", style: "bg-info-surface text-info border-info-border" },
                    PAYOUT_SETTLEMENT: { label: "Payout Settled", style: "bg-accent-subtle text-accent-hover border-accent/20" },
                  };
                  const eventConfig = eventLabels[ev.event_type] || { label: ev.event_type, style: "bg-surface-muted text-secondary border-divider-soft" };
                  const providerName = ev.source_provider === "ownerrez" ? "OwnerRez" : (ev.source_provider === "hospitable" ? "Hospitable" : ev.source_provider);
                  const channelName = ev.booking_channel?.toUpperCase() === "DIRECT" ? "Direct" : (ev.booking_channel || "Direct");

                  return (
                    <tr key={ev.id} className="hover:bg-surface-subtle/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${eventConfig.style}`}>
                          {eventConfig.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-primary font-semibold">REZ-{ev.provider_booking_id}</td>
                      <td className="py-3.5 px-4 text-secondary">
                        <span className="font-semibold text-primary">{providerName}</span> · {channelName}
                      </td>
                      <td className={`py-3.5 px-4 font-bold tabular-nums font-mono ${
                        Number(ev.delta_amount) > 0
                          ? "text-success"
                          : Number(ev.delta_amount) < 0
                          ? "text-danger"
                          : "text-secondary"
                      }`}>
                        {Number(ev.delta_amount) > 0 ? "+" : ""}
                        ${Number(ev.delta_amount).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[10px] text-tertiary truncate max-w-xs" title={ev.idempotency_key}>
                        {ev.idempotency_key}
                      </td>
                      <td className="py-3.5 px-4 text-[11px] text-tertiary whitespace-nowrap">
                        {new Date(ev.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
