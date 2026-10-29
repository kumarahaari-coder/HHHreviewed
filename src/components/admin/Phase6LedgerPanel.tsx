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
  Loader2,
} from "lucide-react";
import {
  CommissionLedgerEvent,
  PayoutBatchRecord,
  PartnerFinancialProjection,
  PayoutRail,
} from "@/lib/commissions/types";
import { formatCurrency } from "@/lib/status-mapper";

type BatchAction =
  | "submit"
  | "approve"
  | "cancel"
  | "settle"
  | "pay-via-wise"
  | "refresh-wise-status"
  | "retry-wise-funding"
  | "abandon-wise-payout";

const ACTION_DONE: Record<BatchAction, string> = {
  submit: "Batch submitted for approval.",
  approve: "Batch approved.",
  cancel: "Batch cancelled and its items released.",
  settle: "Batch settled.",
  "pay-via-wise": "Wise transfer created.",
  "refresh-wise-status": "Wise status refreshed.",
  "retry-wise-funding": "Funding retried.",
  "abandon-wise-payout": "Wise payout abandoned. The batch is back to Approved and can be retried or cancelled.",
};

/** Turns raw server/database errors into something an admin can act on. */
function friendlyError(raw: string): string {
  const m = raw || "";
  if (/chk_maker_checker_separation|Maker-checker violation/i.test(m)) {
    return "You can't approve this batch because you created or submitted it. A different Super Admin must approve it (maker-checker rule).";
  }
  if (/Super Admin role required/i.test(m)) return "Only a Super Admin can do this.";
  if (/not been verified/i.test(m)) return "The partner's payout account isn't verified yet. Verify it first.";
  if (/disabled in this environment/i.test(m)) return "Payouts are switched off on the server (PHASE6_* flags).";
  return m;
}

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
  const [payoutAccount, setPayoutAccount] = useState<{
    accountHolderName: string;
    accountType: string;
    last4: string;
    verified: boolean;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [busy, setBusy] = useState<Record<string, BatchAction>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<{
    wise: {
      environment: "sandbox" | "production";
      configured: boolean;
      externalPayoutsEnabled: boolean;
      settlementEnabled: boolean;
      webhookKeyConfigured: boolean;
    };
    me: { userId: string; role: string };
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/wise/status")
      .then((r) => r.json())
      .then((d) => d.success && setRuntime(d))
      .catch(() => {});
  }, []);

  // Fetch partner list on mount
  useEffect(() => {
    async function loadPartners() {
      try {
        const res = await fetch("/api/admin/partners");
        const data = await res.json();
        const rawList = (data.success && Array.isArray(data.partners) && data.partners.length > 0)
          ? data.partners
          : [];

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
        console.error("Failed to load partners:", err);
        setPartners([]);
      }
    }
    loadPartners();
  }, []);

  // Fetch partner projection, ledger, and batches
  const fetchData = useCallback(async () => {
    if (!selectedPartnerId) return;
    setLoading(true);

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

      const acctRes = await fetch(`/api/admin/payout-accounts/verify?partnerId=${selectedPartnerId}`);
      const acctData = await acctRes.json();
      setPayoutAccount(acctData.success ? acctData.account : null);
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

    fetch(`/api/admin/payout-accounts/verify?partnerId=${selectedPartnerId}`)
      .then((res) => res.json())
      .then((acctData) => {
        if (isMounted) setPayoutAccount(acctData.success ? acctData.account : null);
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

  // Verify the partner's payout account (required before a Wise payout)
  const handleVerifyAccount = async () => {
    if (!selectedPartnerId) return;
    setIsVerifying(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/admin/payout-accounts/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: selectedPartnerId }),
      });
      const data = await res.json();
      if (!data.success) setError(data.error || "Failed to verify payout account.");
      else {
        setSuccessMessage("Payout account verified.");
        await fetchData();
      }
    } catch (err: any) {
      setError(err.message || "Failed to verify payout account.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Transition batch state
  const handleTransitionBatch = async (batchId: string, action: BatchAction) => {
    if (busy[batchId]) return; // ignore double clicks while a call is in flight
    setError(null);
    setSuccessMessage(null);
    setWarning(null);
    setBusy((b) => ({ ...b, [batchId]: action }));

    try {
      const res = await fetch(`/api/admin/commissions/payout-batches/${batchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(friendlyError(data.error || `Action '${action}' failed.`));
      } else {
        if (data.fundingError) {
          setWarning(
            `The Wise transfer was created but not funded: ${data.fundingError}. Fund it in Wise, or use Retry funding. If funding can't be automated, use Abandon.`
          );
        } else if (action === "refresh-wise-status" && data.result === "needs reconciliation") {
          setWarning("Wise reports the money as sent, but settling it in our ledger failed. The batch needs reconciliation; check the details and retry.");
        } else {
          setSuccessMessage(ACTION_DONE[action]);
        }
        await fetchData();
      }
    } catch (err: any) {
      setError(err.message || `Failed to perform action '${action}'.`);
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[batchId];
        return next;
      });
    }
  };

  const isOwnBatch = (b: PayoutBatchRecord) =>
    Boolean(runtime && (b.created_by === runtime.me.userId || b.submitted_by === runtime.me.userId));
  const isSuper = runtime?.me.role === "SUPER_ADMIN";

  function ActionBtn(props: {
    batchId: string;
    action: BatchAction;
    label: string;
    busyLabel: string;
    tone: "primary" | "success" | "muted" | "info" | "warning";
    disabledReason?: string | null;
    confirm?: string;
  }) {
    const active = busy[props.batchId] === props.action;
    const anyBusy = Boolean(busy[props.batchId]);
    const disabled = anyBusy || Boolean(props.disabledReason);
    const tones: Record<string, string> = {
      primary: "bg-warning text-surface hover:opacity-90",
      success: "bg-success text-surface hover:opacity-90",
      info: "bg-info text-surface hover:opacity-90",
      warning: "bg-warning text-surface hover:opacity-90",
      muted: "bg-surface-muted text-secondary hover:bg-surface-subtle",
    };
    return (
      <button
        type="button"
        disabled={disabled}
        title={props.disabledReason || undefined}
        onClick={() => {
          if (props.confirm && !window.confirm(props.confirm)) return;
          handleTransitionBatch(props.batchId, props.action);
        }}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${tones[props.tone]} ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        {active && <Loader2 size={12} className="animate-spin" />}
        {active ? props.busyLabel : props.label}
      </button>
    );
  }

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
            onClick={() => {
              setError(null);
              setSuccessMessage(null);
              setWarning(null);
              fetchData();
            }}
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

      {warning && (
        <div className="p-3 bg-warning-surface border border-warning-border rounded-md text-warning text-xs flex items-center space-x-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{warning}</span>
        </div>
      )}

      {runtime && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={`px-2 py-0.5 rounded-full font-semibold border ${
              runtime.wise.environment === "production"
                ? "bg-danger-surface text-danger border-danger-border"
                : "bg-info-surface text-info border-info-border"
            }`}
          >
            Wise {runtime.wise.environment === "production" ? "LIVE" : "SANDBOX"}
          </span>
          {!runtime.wise.configured && <span className="text-danger">Wise credentials missing</span>}
          {!runtime.wise.externalPayoutsEnabled && <span className="text-amber-700">Wise payouts switched off (PHASE6_EXTERNAL_PAYOUTS_ENABLED)</span>}
          {!runtime.wise.settlementEnabled && <span className="text-amber-700">Settlement switched off (PHASE6_SETTLEMENT_ENABLED)</span>}
          {!runtime.wise.webhookKeyConfigured && (
            <span className="text-amber-700">Webhook key not set: use Refresh Wise status to settle sent transfers</span>
          )}
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

      {/* Payout Account (Wise) */}
      {selectedPartnerId && (
        <div className="bg-surface border border-divider-soft p-4 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xs">
          <div>
            <h3 className="font-bold text-primary text-sm">Partner Payout Account</h3>
            {payoutAccount ? (
              <p className="text-xs text-secondary mt-0.5">
                {payoutAccount.accountHolderName} · {payoutAccount.accountType} ····{payoutAccount.last4} ·{" "}
                <span className={payoutAccount.verified ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>
                  {payoutAccount.verified ? "Verified" : "Pending verification"}
                </span>
              </p>
            ) : (
              <p className="text-xs text-secondary mt-0.5">This partner has not added a payout account yet.</p>
            )}
          </div>
          <div className="flex items-center space-x-3 shrink-0">
            {payoutAccount && !payoutAccount.verified && (
              <button
                onClick={handleVerifyAccount}
                disabled={isVerifying}
                className="bg-primary text-surface hover:bg-primary/90 disabled:opacity-50 px-4 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer shadow-xs"
              >
                {isVerifying ? "Verifying..." : "Verify account"}
              </button>
            )}
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
              <option value="WISE">Wise</option>
              <option value="STRIPE_CONNECT">Stripe Connect (Future)</option>
            </select>

            <button
              onClick={handleCreateDraftBatch}
              disabled={
                isCreatingBatch ||
                !projection ||
                projection.partnerPayoutAvailable <= 0 ||
                (selectedRail === "WISE" && !payoutAccount?.verified)
              }
              title={
                selectedRail === "WISE" && !payoutAccount?.verified
                  ? "Verify the partner's payout account first."
                  : projection && projection.partnerPayoutAvailable <= 0
                  ? "Nothing is eligible for payout yet."
                  : undefined
              }
              className="bg-primary text-surface hover:bg-primary/90 disabled:opacity-50 px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer shadow-xs"
            >
              {isCreatingBatch ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
              <span>{isCreatingBatch ? "Drafting..." : `Draft Batch ($${projection.partnerPayoutAvailable.toFixed(2)})`}</span>
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
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          {b.status === "DRAFT" && (
                            <>
                              <ActionBtn batchId={b.id} action="submit" label="Submit" busyLabel="Submitting..." tone="primary"
                                confirm={`Submit ${b.batch_number} ($${Number(b.total_amount).toFixed(2)}) for approval? Its contents can't be changed afterwards.`} />
                              <ActionBtn batchId={b.id} action="cancel" label="Discard" busyLabel="Discarding..." tone="muted" />
                            </>
                          )}

                          {b.status === "PENDING_APPROVAL" && (
                            <>
                              <ActionBtn batchId={b.id} action="approve" label="Approve" busyLabel="Approving..." tone="info"
                                disabledReason={
                                  runtime && !isSuper
                                    ? "Only a Super Admin can approve payout batches."
                                    : isOwnBatch(b)
                                    ? "You created or submitted this batch. A different Super Admin must approve it."
                                    : null
                                }
                                confirm={`Approve ${b.batch_number} for $${Number(b.total_amount).toFixed(2)}?`} />
                              <ActionBtn batchId={b.id} action="cancel" label="Reject" busyLabel="Rejecting..." tone="muted" />
                            </>
                          )}

                          {b.status === "APPROVED" && (
                            <>
                              {b.payout_rail === "WISE" ? (
                                <ActionBtn batchId={b.id} action="pay-via-wise" label="Pay via Wise" busyLabel="Sending..." tone="info"
                                  disabledReason={
                                    runtime && !runtime.wise.externalPayoutsEnabled
                                      ? "External payouts are switched off on the server (PHASE6_EXTERNAL_PAYOUTS_ENABLED)."
                                      : null
                                  }
                                  confirm={
                                    runtime?.wise.environment === "production"
                                      ? `Send $${Number(b.total_amount).toFixed(2)} to the partner via Wise? This moves REAL money.`
                                      : `Send $${Number(b.total_amount).toFixed(2)} via Wise SANDBOX? (Test money only.)`
                                  } />
                              ) : (
                                <ActionBtn batchId={b.id} action="settle" label="Settle" busyLabel="Settling..." tone="success" />
                              )}
                              <ActionBtn batchId={b.id} action="cancel" label="Cancel" busyLabel="Cancelling..." tone="muted" />
                            </>
                          )}

                          {b.status === "PROCESSING" && b.payout_rail === "WISE" && (
                            <>
                              <ActionBtn batchId={b.id} action="refresh-wise-status" label="Refresh Wise status" busyLabel="Checking..." tone="muted" />
                              {b.wise_attempt?.last_error?.startsWith("FUNDING:") && (
                                <>
                                  <ActionBtn batchId={b.id} action="retry-wise-funding" label="Retry funding" busyLabel="Funding..." tone="info" />
                                  <ActionBtn batchId={b.id} action="abandon-wise-payout" label="Abandon" busyLabel="Abandoning..." tone="warning"
                                    confirm="Cancel the unfunded Wise transfer and return this batch to Approved?" />
                                </>
                              )}
                            </>
                          )}

                          {b.status === "REQUIRES_RECONCILIATION" && (
                            <>
                              <ActionBtn batchId={b.id} action="refresh-wise-status" label="Re-check Wise" busyLabel="Checking..." tone="muted" />
                              <ActionBtn batchId={b.id} action="abandon-wise-payout" label="Reopen for retry" busyLabel="Reopening..." tone="warning"
                                confirm="Wise did not send this money. Reopen the batch so it can be paid again?" />
                              <ActionBtn batchId={b.id} action="cancel" label="Cancel batch" busyLabel="Cancelling..." tone="muted"
                                confirm="Cancel this batch and release its items back to the partner's available balance?" />
                            </>
                          )}

                          {b.status === "SETTLED" && (
                            <span className="text-xs text-secondary font-medium">Settled & Locked</span>
                          )}
                        </div>
                        {b.status === "PENDING_APPROVAL" && isOwnBatch(b) && (
                          <span className="text-[11px] text-amber-700">You created this batch. Another Super Admin must approve it.</span>
                        )}
                        {b.wise_attempt?.last_error && b.status !== "SETTLED" && (
                          <span className="text-[11px] text-danger max-w-[260px]">{b.wise_attempt.last_error}</span>
                        )}
                        {b.wise_attempt?.provider_transfer_id && b.status !== "SETTLED" && (
                          <span className="text-[11px] text-tertiary font-mono">Wise transfer {b.wise_attempt.provider_transfer_id}</span>
                        )}
                        {(b as any).metadata?.wiseAlert && (
                          <span className="text-[11px] text-danger font-semibold max-w-[260px]">{(b as any).metadata.wiseAlert}</span>
                        )}
                      </div>
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
                  const providerName = ev.source_provider === "hostaway" ? "Hostaway" : ev.source_provider === "ownerrez" ? "OwnerRez" : (ev.source_provider === "hospitable" ? "Hospitable" : ev.source_provider);
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
