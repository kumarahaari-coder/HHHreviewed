"use client";

import React, { useEffect, useState } from "react";
import {
  DollarSign,
  CheckSquare,
  Square,
  AlertTriangle,
  FolderOpen,
  Calendar,
  CreditCard,
  Trash2,
  FileSpreadsheet,
  Settings,
  AlertCircle,
  TrendingUp,
  Clock,
  CheckCircle2,
  Lock,
  Layers,
  ShieldAlert
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Reservation, Partner, Payout, PayoutBatch } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableMobileCard } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { runSystemPayoutRecalculation } from "@/lib/payouts";
import confetti from "canvas-confetti";
import { Phase6LedgerPanel } from "@/components/admin/Phase6LedgerPanel";

export default function PayoutProcessing() {
  // Data states
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [batches, setBatches] = useState<PayoutBatch[]>([]);

  // UI Control states
  const [activeTab, setActiveTab] = useState("phase6_ledger");
  const [selectedPayoutIds, setSelectedPayoutIds] = useState<string[]>([]);
  
  // Adjustment modal states
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [adjustPayout, setAdjustPayout] = useState<Payout | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("0");
  const [adjustNotes, setAdjustNotes] = useState("");

  // Payment modal states
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payingBatch, setPayingBatch] = useState<PayoutBatch | null>(null);
  const [txnRef, setTxnRef] = useState("");

  const refreshData = () => {
    runSystemPayoutRecalculation();
    setReservations([...db.reservations]);
    setPartners(db.partners);
    setPayouts([...db.payouts]);
    setBatches([...db.batches]);
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleSelectAll = (eligiblePayouts: Payout[]) => {
    if (selectedPayoutIds.length === eligiblePayouts.length) {
      setSelectedPayoutIds([]);
    } else {
      setSelectedPayoutIds(eligiblePayouts.map(p => p.id));
    }
  };

  const handleToggleSelect = (payoutId: string) => {
    setSelectedPayoutIds(prev =>
      prev.includes(payoutId) ? prev.filter(id => id !== payoutId) : [...prev, payoutId]
    );
  };

  const handleApprove = (payoutId: string) => {
    db.updatePayout(payoutId, { status: "APPROVED", approvalDate: new Date().toISOString() });
    const p = db.payouts.find(pay => pay.id === payoutId);
    if (p) {
      db.updateReservation(p.reservationId, { payoutStatus: "APPROVED" });
    }
    setSelectedPayoutIds(prev => prev.filter(id => id !== payoutId));
    refreshData();
    db.addNotification("SUCCESS", `Payout ID ${payoutId} approved successfully.`);
  };

  const handleBulkApprove = (eligiblePayouts: Payout[]) => {
    const targets = eligiblePayouts.filter(p => selectedPayoutIds.includes(p.id));
    targets.forEach(t => {
      db.updatePayout(t.id, { status: "APPROVED", approvalDate: new Date().toISOString() });
      db.updateReservation(t.reservationId, { payoutStatus: "APPROVED" });
    });
    setSelectedPayoutIds([]);
    refreshData();
    db.addNotification("SUCCESS", `Bulk Approved: ${targets.length} payouts approved.`);
  };

  const handleHold = (payoutId: string) => {
    db.updatePayout(payoutId, { status: "ON_HOLD" });
    const p = db.payouts.find(pay => pay.id === payoutId);
    if (p) {
      db.updateReservation(p.reservationId, { payoutStatus: "ON_HOLD" });
    }
    refreshData();
    db.addNotification("WARNING", `Payout ID ${payoutId} placed on hold.`);
  };

  const handleReject = (payoutId: string) => {
    db.updatePayout(payoutId, { status: "REJECTED" });
    const p = db.payouts.find(pay => pay.id === payoutId);
    if (p) {
      db.updateReservation(p.reservationId, { payoutStatus: "REJECTED" });
    }
    refreshData();
    db.addNotification("danger" as any, `Payout ID ${payoutId} rejected.`);
  };

  const handleOpenAdjust = (payout: Payout) => {
    setAdjustPayout(payout);
    setAdjustAmount(payout.adjustment.toString());
    setAdjustNotes(payout.notes || "");
    setShowAdjustDialog(true);
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustPayout) return;
    const val = parseFloat(adjustAmount) || 0;
    const finalVal = Math.round((adjustPayout.calculatedPayout + val) * 100) / 100;

    db.updatePayout(adjustPayout.id, {
      adjustment: val,
      finalPayout: finalVal,
      notes: adjustNotes
    });

    refreshData();
    setShowAdjustDialog(false);
    setAdjustPayout(null);
    db.addNotification("INFO", `Adjustment of $${val.toFixed(2)} applied.`);
  };

  const handleCreateBatch = (partnerId: string, approvedPayoutsForPartner: Payout[]) => {
    const totalAmount = approvedPayoutsForPartner.reduce((acc, p) => acc + p.finalPayout, 0);
    const payoutIds = approvedPayoutsForPartner.map(p => p.id);

    const newBatch = db.addPayoutBatch({
      partnerId,
      periodStart: new Date(new Date().setDate(1)).toISOString().split("T")[0],
      periodEnd: new Date().toISOString().split("T")[0],
      bookingCount: approvedPayoutsForPartner.length,
      totalPayout: totalAmount,
      status: "PENDING",
      payoutIds
    });

    payoutIds.forEach(pId => {
      db.updatePayout(pId, { status: "PAID", paymentDate: new Date().toISOString() });
      const p = db.payouts.find(pay => pay.id === pId);
      if (p) {
        db.updateReservation(p.reservationId, { payoutStatus: "PAID" });
      }
    });

    refreshData();
    db.addNotification("SUCCESS", `Payout Batch ${newBatch.id} created.`);
  };

  const handleMarkBatchPaid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingBatch) return;

    db.updatePayoutBatch(payingBatch.id, {
      status: "PAID",
      paymentDate: new Date().toISOString(),
      transactionReference: txnRef,
      approvalDate: new Date().toISOString()
    });

    payingBatch.payoutIds.forEach(pId => {
      db.updatePayout(pId, { transactionReference: txnRef });
    });

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    refreshData();
    setShowPayDialog(false);
    setPayingBatch(null);
    setTxnRef("");
    db.addNotification("SUCCESS", `Batch ${payingBatch.id} marked as PAID.`);
  };

  const handleCancelBatch = (batch: PayoutBatch) => {
    db.updatePayoutBatch(batch.id, { status: "CANCELLED" });
    batch.payoutIds.forEach(pId => {
      db.updatePayout(pId, { status: "APPROVED", paymentDate: undefined });
      const p = db.payouts.find(pay => pay.id === pId);
      if (p) {
        db.updateReservation(p.reservationId, { payoutStatus: "APPROVED" });
      }
    });
    refreshData();
    db.addNotification("WARNING", `Payout Batch ${batch.id} cancelled.`);
  };

  const eligiblePayouts = payouts.filter(p => p.status === "ELIGIBLE");
  const holdPayouts = payouts.filter(p => p.status === "ON_HOLD");
  const approvedPayouts = payouts.filter(p => p.status === "APPROVED");
  
  const approvedGroupedByPartner: Record<string, Payout[]> = {};
  approvedPayouts.forEach(p => {
    if (!approvedGroupedByPartner[p.partnerId]) {
      approvedGroupedByPartner[p.partnerId] = [];
    }
    approvedGroupedByPartner[p.partnerId].push(p);
  });

  const tabList = [
    { id: "phase6_ledger", title: "Ledger & Batches", count: null },
    { id: "eligible", title: "Eligible Queue", count: eligiblePayouts.length },
    { id: "holds", title: "Admin Holds", count: holdPayouts.length },
    { id: "approved", title: "Approved Queue", count: approvedPayouts.length },
    { id: "batches", title: "Payment Batches", count: batches.filter(b => b.status === "PENDING").length },
    { id: "history", title: "Payout History", count: null }
  ];

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
          <div className="text-xs font-bold text-primary">Settlement disabled</div>
          <div className="text-xs text-secondary mt-0.5">
            External payout execution and settlement are currently disabled. Internal review and batch preparation remain available.
          </div>
        </div>
      </div>

      {/* Quieter Horizontal Tabs */}
      <div className="border-b border-divider-soft flex items-center gap-6 overflow-x-auto pb-px">
        {tabList.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`py-2.5 text-xs whitespace-nowrap transition-colors border-b-2 font-medium cursor-pointer ${
              activeTab === t.id
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {t.title}
            {t.count !== null && (
              <span className="ml-1.5 text-tertiary font-normal">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* TAB CONTENTS */}
      {activeTab === "phase6_ledger" && <Phase6LedgerPanel />}

      {/* 1. ELIGIBLE QUEUE */}
      {activeTab === "eligible" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <span className="text-xs font-semibold text-[var(--primary)]">
              {selectedPayoutIds.length} payout(s) selected for bulk approval
            </span>
            <button
              onClick={() => handleBulkApprove(eligiblePayouts)}
              disabled={selectedPayoutIds.length === 0}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--primary)] text-white hover:bg-[#333336] disabled:opacity-40 transition-colors"
            >
              Approve Selected
            </button>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <button onClick={() => handleSelectAll(eligiblePayouts)}>
                      {selectedPayoutIds.length === eligiblePayouts.length && eligiblePayouts.length > 0 ? (
                        <CheckSquare size={16} className="text-[var(--primary)]" />
                      ) : (
                        <Square size={16} className="text-[var(--secondary)]" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead>Stay Code</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Base Amount</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Calculated</TableHead>
                  <TableHead>Adjustment</TableHead>
                  <TableHead>Final Payout</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligiblePayouts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-[var(--secondary)]">
                      No payout-eligible stays awaiting approval.
                    </TableCell>
                  </TableRow>
                ) : (
                  eligiblePayouts.map(p => {
                    const res = reservations.find(r => r.id === p.reservationId);
                    const partner = partners.find(part => part.id === p.partnerId);
                    const isSelected = selectedPayoutIds.includes(p.id);

                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-center">
                          <button onClick={() => handleToggleSelect(p.id)}>
                            {isSelected ? <CheckSquare size={16} className="text-[var(--primary)]" /> : <Square size={16} className="text-[var(--secondary)]" />}
                          </button>
                        </TableCell>
                        <TableCell className="font-mono font-medium text-[var(--primary)]">{res?.confirmationCode}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-[var(--primary)]">{partner?.contactName}</div>
                          <div className="text-xs text-[var(--secondary)]">{partner?.businessName}</div>
                        </TableCell>
                        <TableCell className="tabular-nums font-mono">${p.payoutBaseAmount.toFixed(2)}</TableCell>
                        <TableCell className="tabular-nums font-mono">{p.commissionRate}%</TableCell>
                        <TableCell className="tabular-nums font-mono font-medium">${p.calculatedPayout.toFixed(2)}</TableCell>
                        <TableCell className="tabular-nums font-mono text-[var(--secondary)]">
                          {p.adjustment !== 0 ? `$${p.adjustment.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="tabular-nums font-mono font-bold text-[var(--primary)]">${p.finalPayout.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleApprove(p.id)}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[var(--primary)] text-white hover:bg-[#333336]"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleOpenAdjust(p)}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold border border-[var(--border)] hover:bg-[var(--canvas)]"
                            >
                              Adjust
                            </button>
                            <button
                              onClick={() => handleHold(p.id)}
                              className="p-1 rounded-md text-amber-600 hover:bg-amber-50"
                              title="Place Hold"
                            >
                              <AlertTriangle size={14} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            <div className="md:hidden divide-y divide-[var(--border)]">
              {eligiblePayouts.map(p => {
                const res = reservations.find(r => r.id === p.reservationId);
                const partner = partners.find(part => part.id === p.partnerId);
                return (
                  <TableMobileCard
                    key={p.id}
                    title={res?.confirmationCode || p.id}
                    subtitle={partner?.businessName || partner?.contactName}
                    badge={<StatusBadge variant="warning">ELIGIBLE</StatusBadge>}
                    details={[
                      { label: "Base Amount", value: `$${p.payoutBaseAmount.toFixed(2)}`, numeric: true },
                      { label: "Final Payout", value: `$${p.finalPayout.toFixed(2)}`, numeric: true }
                    ]}
                    action={
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(p.id)}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--primary)] text-white"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleOpenAdjust(p)}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold border border-[var(--border)]"
                        >
                          Adjust
                        </button>
                      </div>
                    }
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. ADMIN HOLDS */}
      {activeTab === "holds" && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Stay Code</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Base Amount</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Final Payout</TableHead>
                <TableHead>Hold Reason</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdPayouts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-[var(--secondary)]">
                    No payouts currently on administrative hold.
                  </TableCell>
                </TableRow>
              ) : (
                holdPayouts.map(p => {
                  const res = reservations.find(r => r.id === p.reservationId);
                  const partner = partners.find(part => part.id === p.partnerId);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-medium text-[var(--primary)]">{res?.confirmationCode}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-[var(--primary)]">{partner?.contactName}</div>
                        <div className="text-xs text-[var(--secondary)]">{partner?.businessName}</div>
                      </TableCell>
                      <TableCell className="tabular-nums font-mono">${p.payoutBaseAmount.toFixed(2)}</TableCell>
                      <TableCell className="tabular-nums font-mono">{p.commissionRate}%</TableCell>
                      <TableCell className="tabular-nums font-mono font-bold text-[var(--primary)]">${p.finalPayout.toFixed(2)}</TableCell>
                      <TableCell className="text-amber-700 text-xs font-medium">
                        {res?.adminNotes || "Administrative hold applied."}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => {
                            db.updatePayout(p.id, { status: "ELIGIBLE" });
                            db.updateReservation(p.reservationId, { payoutStatus: "ELIGIBLE" });
                            refreshData();
                          }}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold border border-[var(--border)] hover:bg-[var(--canvas)]"
                        >
                          Release Hold
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 3. APPROVED QUEUE */}
      {activeTab === "approved" && (
        <div className="space-y-4">
          {Object.keys(approvedGroupedByPartner).length === 0 ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[var(--secondary)] text-sm">
              No approved payouts awaiting batch creation.
            </div>
          ) : (
            Object.entries(approvedGroupedByPartner).map(([pId, partnerPayouts]) => {
              const partner = partners.find(p => p.id === pId);
              const totalBatchAmount = partnerPayouts.reduce((acc, p) => acc + p.finalPayout, 0);

              return (
                <div key={pId} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-[var(--border)] pb-3 gap-3">
                    <div>
                      <h3 className="font-bold text-[var(--primary)] text-base">{partner?.businessName || partner?.contactName}</h3>
                      <div className="text-xs text-[var(--secondary)]">Contact: {partner?.contactName} · Payout Frequency: {partner?.payoutFrequency || "Monthly"}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-[var(--secondary)]">Batch Amount</div>
                        <div className="text-lg font-bold tabular-nums font-mono text-[var(--primary)]">${totalBatchAmount.toFixed(2)}</div>
                      </div>
                      <button
                        onClick={() => handleCreateBatch(pId, partnerPayouts)}
                        className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--primary)] text-white hover:bg-[#333336]"
                      >
                        Create Payout Batch ({partnerPayouts.length} stays)
                      </button>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Stay Code</TableHead>
                        <TableHead>Check In</TableHead>
                        <TableHead>Base Value</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Payout Amount</TableHead>
                        <TableHead>Approved Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerPayouts.map(p => {
                        const res = reservations.find(r => r.id === p.reservationId);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-mono font-medium text-[var(--primary)]">{res?.confirmationCode}</TableCell>
                            <TableCell className="text-xs text-[var(--secondary)]">{res?.checkInDate}</TableCell>
                            <TableCell className="tabular-nums font-mono">${p.payoutBaseAmount.toFixed(2)}</TableCell>
                            <TableCell className="tabular-nums font-mono">{p.commissionRate}%</TableCell>
                            <TableCell className="tabular-nums font-mono font-bold text-[var(--primary)]">${p.finalPayout.toFixed(2)}</TableCell>
                            <TableCell className="text-xs text-[var(--secondary)]">
                              {p.approvalDate ? new Date(p.approvalDate).toLocaleDateString() : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 4. PAYMENT BATCHES */}
      {activeTab === "batches" && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Batch ID</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Date Range</TableHead>
                <TableHead>Stays Count</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.filter(b => b.status === "PENDING").length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-[var(--secondary)]">
                    No pending payment batches.
                  </TableCell>
                </TableRow>
              ) : (
                batches
                  .filter(b => b.status === "PENDING")
                  .map(b => {
                    const partner = partners.find(p => p.id === b.partnerId);
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono font-bold text-[var(--primary)]">{b.id}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-[var(--primary)]">{partner?.businessName}</div>
                          <div className="text-xs text-[var(--secondary)]">{partner?.contactName}</div>
                        </TableCell>
                        <TableCell className="text-xs text-[var(--secondary)]">{b.periodStart} to {b.periodEnd}</TableCell>
                        <TableCell className="tabular-nums font-mono">{b.bookingCount}</TableCell>
                        <TableCell className="tabular-nums font-mono font-bold text-[var(--primary)]">${b.totalPayout.toFixed(2)}</TableCell>
                        <TableCell><StatusBadge variant="warning">PENDING</StatusBadge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setPayingBatch(b);
                                setTxnRef("");
                                setShowPayDialog(true);
                              }}
                              className="px-3 py-1 rounded-md text-xs font-semibold bg-[var(--primary)] text-white hover:bg-[#333336]"
                            >
                              Record Payment
                            </button>
                            <button
                              onClick={() => handleCancelBatch(b)}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold border border-[var(--border)] hover:bg-[var(--canvas)]"
                            >
                              Cancel
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 5. PAYOUT HISTORY */}
      {activeTab === "history" && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Payout ID</TableHead>
                <TableHead>Stay Code</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Base Payout</TableHead>
                <TableHead>Adjustment</TableHead>
                <TableHead>Final Paid</TableHead>
                <TableHead>Paid Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.filter(p => p.status === "PAID").length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-[var(--secondary)]">
                    No historical settled payout records found.
                  </TableCell>
                </TableRow>
              ) : (
                payouts
                  .filter(p => p.status === "PAID")
                  .map(p => {
                    const res = reservations.find(r => r.id === p.reservationId);
                    const partner = partners.find(part => part.id === p.partnerId);

                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs text-[var(--secondary)]">{p.id}</TableCell>
                        <TableCell className="font-mono font-medium text-[var(--primary)]">{res?.confirmationCode}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-[var(--primary)]">{partner?.contactName}</div>
                          <div className="text-xs text-[var(--secondary)]">{partner?.businessName}</div>
                        </TableCell>
                        <TableCell className="tabular-nums font-mono">${p.payoutBaseAmount.toFixed(2)}</TableCell>
                        <TableCell className="tabular-nums font-mono text-[var(--secondary)]">${p.adjustment.toFixed(2)}</TableCell>
                        <TableCell className="tabular-nums font-mono font-bold text-[var(--primary)]">${p.finalPayout.toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-[var(--secondary)]">
                          {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell><StatusBadge variant="success">PAID</StatusBadge></TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* DIALOG: APPLY ADJUSTMENT */}
      <Dialog
        isOpen={showAdjustDialog}
        onClose={() => setShowAdjustDialog(false)}
        title="Adjust Payout Value"
      >
        {adjustPayout && (
          <form onSubmit={handleSaveAdjustment} className="space-y-4 font-sans text-xs">
            <div className="p-3 bg-[var(--canvas)] border border-[var(--border)] rounded-md space-y-1">
              <div className="text-[var(--secondary)]">Base Amount: <span className="font-mono font-semibold text-[var(--primary)]">${adjustPayout.payoutBaseAmount.toFixed(2)}</span></div>
              <div className="text-[var(--secondary)]">Baseline Payout: <span className="font-mono font-semibold text-[var(--primary)]">${adjustPayout.calculatedPayout.toFixed(2)}</span></div>
            </div>

            <div>
              <label className="block font-semibold text-[var(--primary)] mb-1">Adjustment Value (USD)</label>
              <input
                type="number"
                step="0.01"
                required
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                placeholder="e.g. 25.00 or -15.00"
                className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--primary)] font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-[var(--primary)] mb-1">Adjustment Audit Reason</label>
              <textarea
                required
                rows={3}
                value={adjustNotes}
                onChange={e => setAdjustNotes(e.target.value)}
                placeholder="Provide rationale for auditing log..."
                className="w-full p-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAdjustDialog(false)}
                className="px-3 py-1.5 rounded-md border border-[var(--border)] text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[var(--primary)] text-white hover:bg-[#333336]"
              >
                Save Adjustment
              </button>
            </div>
          </form>
        )}
      </Dialog>

      {/* DIALOG: RECORD PAYMENT TRANSACTION */}
      <Dialog
        isOpen={showPayDialog}
        onClose={() => setShowPayDialog(false)}
        title="Record Payment Transaction"
      >
        {payingBatch && (
          <form onSubmit={handleMarkBatchPaid} className="space-y-4 font-sans text-xs">
            <div className="p-3 bg-[var(--canvas)] border border-[var(--border)] rounded-md space-y-1">
              <div>Batch ID: <span className="font-mono font-bold text-[var(--primary)]">{payingBatch.id}</span></div>
              <div>Recipient: <span className="font-semibold text-[var(--primary)]">{partners.find(p => p.id === payingBatch.partnerId)?.businessName}</span></div>
              <div>Total Payout: <span className="font-mono font-bold text-[var(--primary)]">${payingBatch.totalPayout.toFixed(2)}</span></div>
            </div>

            <div>
              <label className="block font-semibold text-[var(--primary)] mb-1">Transaction Reference Code</label>
              <input
                type="text"
                required
                value={txnRef}
                onChange={e => setTxnRef(e.target.value)}
                placeholder="e.g. TXN-9023485"
                className="w-full px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-md focus:outline-none focus:border-[var(--primary)] font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPayDialog(false)}
                className="px-3 py-1.5 rounded-md border border-[var(--border)] text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[var(--primary)] text-white hover:bg-[#333336]"
              >
                Record Payment
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
