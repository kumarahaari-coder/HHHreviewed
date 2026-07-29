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
  AlertCircle
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Reservation, Partner, Payout, PayoutBatch } from "@/lib/db/schema";
import { Card, Badge, Tabs, Dialog } from "@/components/ui/custom";
import { runSystemPayoutRecalculation } from "@/lib/payouts";
import confetti from "canvas-confetti";

export default function PayoutProcessing() {
  // Data states
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [batches, setBatches] = useState<PayoutBatch[]>([]);

  // UI Control states
  const [activeTab, setActiveTab] = useState("eligible");
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
    // Run recalculation first to ensure states align
    runSystemPayoutRecalculation();
    setReservations([...db.reservations]);
    setPartners(db.partners);
    setPayouts([...db.payouts]);
    setBatches([...db.batches]);
  };

  useEffect(() => {
    refreshData();
  }, []);

  // --- SELECTION HELPERS ---
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

  // --- ACTIONS ---

  // Approve a single payout
  const handleApprove = (payoutId: string) => {
    db.updatePayout(payoutId, { status: "APPROVED", approvalDate: new Date().toISOString() });
    
    // Also update reservation payoutStatus
    const p = db.payouts.find(pay => pay.id === payoutId);
    if (p) {
      db.updateReservation(p.reservationId, { payoutStatus: "APPROVED" });
    }
    
    setSelectedPayoutIds(prev => prev.filter(id => id !== payoutId));
    refreshData();
    db.addNotification("SUCCESS", `Payout ID ${payoutId} approved successfully.`);
  };

  // Approve multiple selected payouts
  const handleBulkApprove = (eligiblePayouts: Payout[]) => {
    const targets = eligiblePayouts.filter(p => selectedPayoutIds.includes(p.id));
    targets.forEach(t => {
      db.updatePayout(t.id, { status: "APPROVED", approvalDate: new Date().toISOString() });
      db.updateReservation(t.reservationId, { payoutStatus: "APPROVED" });
    });
    
    setSelectedPayoutIds([]);
    refreshData();
    db.addNotification("SUCCESS", `Bulk Approved: ${targets.length} payouts approved and moved to the approved queue.`);
  };

  // Place payout on hold
  const handleHold = (payoutId: string) => {
    db.updatePayout(payoutId, { status: "ON_HOLD" });
    const p = db.payouts.find(pay => pay.id === payoutId);
    if (p) {
      db.updateReservation(p.reservationId, { payoutStatus: "ON_HOLD" });
    }
    refreshData();
    db.addNotification("WARNING", `Payout ID ${payoutId} placed on administrative hold.`);
  };

  // Reject payout
  const handleReject = (payoutId: string) => {
    db.updatePayout(payoutId, { status: "REJECTED" });
    const p = db.payouts.find(pay => pay.id === payoutId);
    if (p) {
      db.updateReservation(p.reservationId, { payoutStatus: "REJECTED" });
    }
    refreshData();
    db.addNotification("danger" as any, `Payout ID ${payoutId} rejected.`);
  };

  // Open adjustment dialog
  const handleOpenAdjust = (payout: Payout) => {
    setAdjustPayout(payout);
    setAdjustAmount(payout.adjustment.toString());
    setAdjustNotes(payout.notes || "");
    setShowAdjustDialog(true);
  };

  // Save adjustment
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
    db.addNotification("INFO", `Adjustment of $${val.toFixed(2)} applied to Payout ID ${adjustPayout.id}.`);
  };

  // Create batch for a partner
  const handleCreateBatch = (partnerId: string, approvedPayoutsForPartner: Payout[]) => {
    const totalAmount = approvedPayoutsForPartner.reduce((acc, p) => acc + p.finalPayout, 0);
    const payoutIds = approvedPayoutsForPartner.map(p => p.id);

    // Create batch in db
    const newBatch = db.addPayoutBatch({
      partnerId,
      periodStart: new Date(new Date().setDate(1)).toISOString().split("T")[0], // start of month
      periodEnd: new Date().toISOString().split("T")[0], // today
      bookingCount: approvedPayoutsForPartner.length,
      totalPayout: totalAmount,
      status: "PENDING",
      payoutIds
    });

    // Update statuses of grouped payouts to PAID (associated with batch)
    payoutIds.forEach(pId => {
      db.updatePayout(pId, { status: "PAID", paymentDate: new Date().toISOString() });
      const p = db.payouts.find(pay => pay.id === pId);
      if (p) {
        db.updateReservation(p.reservationId, { payoutStatus: "PAID" });
      }
    });

    refreshData();
    db.addNotification("SUCCESS", `Payout Batch ${newBatch.id} created for partner. Total Amount: $${totalAmount.toFixed(2)}.`);
  };

  // Mark batch as paid (simulate banking export reference)
  const handleMarkBatchPaid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingBatch) return;

    db.updatePayoutBatch(payingBatch.id, {
      status: "PAID",
      paymentDate: new Date().toISOString(),
      transactionReference: txnRef,
      approvalDate: new Date().toISOString()
    });

    // Update associated payouts transaction refs
    payingBatch.payoutIds.forEach(pId => {
      db.updatePayout(pId, { transactionReference: txnRef });
    });

    // Confetti celebration!
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#4F2352", "#FFF7F2", "#EFDFD2", "#98A496"]
    });

    refreshData();
    setShowPayDialog(false);
    setPayingBatch(null);
    setTxnRef("");

    db.addNotification("SUCCESS", `Batch ${payingBatch.id} marked as PAID. Reference: ${txnRef}.`);
  };

  // Cancel pending batch
  const handleCancelBatch = (batch: PayoutBatch) => {
    db.updatePayoutBatch(batch.id, { status: "CANCELLED" });
    
    // Revert associated payouts back to APPROVED status
    batch.payoutIds.forEach(pId => {
      db.updatePayout(pId, { status: "APPROVED", paymentDate: undefined });
      const p = db.payouts.find(pay => pay.id === pId);
      if (p) {
        db.updateReservation(p.reservationId, { payoutStatus: "APPROVED" });
      }
    });

    refreshData();
    db.addNotification("WARNING", `Payout Batch ${batch.id} cancelled. Payouts returned to approved queue.`);
  };

  // --- QUEUES FILTERING ---
  
  // 1. Eligible queue (calculated, checked-in, unpaid)
  const eligiblePayouts = payouts.filter(p => p.status === "ELIGIBLE");
  
  // 2. Holds queue
  const holdPayouts = payouts.filter(p => p.status === "ON_HOLD");

  // 3. Approved payouts (grouped by partner)
  const approvedPayouts = payouts.filter(p => p.status === "APPROVED");
  // Group by partnerId
  const approvedGroupedByPartner: Record<string, Payout[]> = {};
  approvedPayouts.forEach(p => {
    if (!approvedGroupedByPartner[p.partnerId]) {
      approvedGroupedByPartner[p.partnerId] = [];
    }
    approvedGroupedByPartner[p.partnerId].push(p);
  });

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Payouts Processing</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Approve calculated partner payouts, apply adjustments, and bundle stays into batches for payment.
        </p>
      </div>

      {/* Tabs Menu */}
      <Tabs
        tabs={[
          { id: "eligible", label: `Eligible Queue (${eligiblePayouts.length})` },
          { id: "holds", label: `Admin Holds (${holdPayouts.length})` },
          { id: "approved", label: `Approved Queue (${approvedPayouts.length})` },
          { id: "batches", label: `Payment Batches (${batches.filter(b => b.status === "PENDING").length} pending)` },
          { id: "history", label: `Payout History` }
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* TAB CONTENTS */}

      {/* 1. ELIGIBLE QUEUE */}
      {activeTab === "eligible" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-brand-blush/20 p-4 rounded-xl border border-brand-blush/40">
            <span className="text-xs font-semibold text-brand-plum">
              {selectedPayoutIds.length} payout(s) selected for bulk approval
            </span>
            <button
              onClick={() => handleBulkApprove(eligiblePayouts)}
              disabled={selectedPayoutIds.length === 0}
              className="bg-brand-plum text-brand-cream hover:bg-brand-wine disabled:opacity-40 px-4 py-2 rounded-lg text-xs font-bold transition-all"
            >
              Approve Selected
            </button>
          </div>

          <div className="bg-brand-cream border border-brand-blush rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-brand-blush/25 border-b border-brand-blush text-brand-plum text-xs uppercase tracking-wider font-bold">
                    <th className="p-4 w-12 text-center">
                      <button onClick={() => handleSelectAll(eligiblePayouts)} className="text-brand-plum">
                        {selectedPayoutIds.length === eligiblePayouts.length && eligiblePayouts.length > 0 ? (
                          <CheckSquare size={16} />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </th>
                    <th className="p-4">Stay Code</th>
                    <th className="p-4">Partner</th>
                    <th className="p-4">Base Amount</th>
                    <th className="p-4">Commission Rate</th>
                    <th className="p-4">Calculated</th>
                    <th className="p-4">Adjustment</th>
                    <th className="p-4">Final Payout</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-blush/60 text-sm">
                  {eligiblePayouts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-zinc-400 italic">
                        No payout-eligible stays. Verify that reservation check-ins and payments are completed.
                      </td>
                    </tr>
                  ) : (
                    eligiblePayouts.map(p => {
                      const res = reservations.find(r => r.id === p.reservationId);
                      const partner = partners.find(part => part.id === p.partnerId);
                      const isSelected = selectedPayoutIds.includes(p.id);

                      return (
                        <tr key={p.id} className="hover:bg-brand-blush/10 transition-colors">
                          <td className="p-4 text-center">
                            <button onClick={() => handleToggleSelect(p.id)} className="text-zinc-400 hover:text-brand-plum">
                              {isSelected ? <CheckSquare size={16} className="text-brand-plum" /> : <Square size={16} />}
                            </button>
                          </td>
                          <td className="p-4 font-bold text-brand-plum">{res?.confirmationCode}</td>
                          <td className="p-4">
                            <div className="font-semibold text-zinc-700">{partner?.contactName}</div>
                            <span className="text-[10px] text-zinc-400">{partner?.businessName}</span>
                          </td>
                          <td className="p-4">${p.payoutBaseAmount.toFixed(2)}</td>
                          <td className="p-4">{p.commissionRate}%</td>
                          <td className="p-4 font-semibold">${p.calculatedPayout.toFixed(2)}</td>
                          <td className="p-4 text-brand-wine font-medium">
                            {p.adjustment !== 0 ? `$${p.adjustment.toFixed(2)}` : "—"}
                          </td>
                          <td className="p-4 font-extrabold text-brand-plum">${p.finalPayout.toFixed(2)}</td>
                          <td className="p-4 text-center flex items-center justify-center space-x-1.5">
                            <button
                              onClick={() => handleApprove(p.id)}
                              className="bg-brand-plum text-brand-cream hover:bg-brand-wine px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleOpenAdjust(p)}
                              className="text-xs text-brand-plum hover:bg-brand-blush/40 px-2 py-1.5 rounded-lg border border-brand-blush/60"
                            >
                              Adjust
                            </button>
                            <button
                              onClick={() => handleHold(p.id)}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg border border-transparent hover:border-amber-200"
                              title="Place administrative hold"
                            >
                              <AlertTriangle size={14} />
                            </button>
                            <button
                              onClick={() => handleReject(p.id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200"
                              title="Reject payout"
                            >
                              <Trash2 size={14} />
                            </button>
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
      )}

      {/* 2. ADMIN HOLDS */}
      {activeTab === "holds" && (
        <div className="bg-brand-cream border border-brand-blush rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-blush/25 border-b border-brand-blush text-brand-plum text-xs uppercase tracking-wider font-bold">
                  <th className="p-4">Stay Code</th>
                  <th className="p-4">Partner</th>
                  <th className="p-4">Base Amount</th>
                  <th className="p-4">Rate</th>
                  <th className="p-4">Adjustment</th>
                  <th className="p-4">Final Value</th>
                  <th className="p-4">Locked reason / Notes</th>
                  <th className="p-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-blush/60 text-sm">
                {holdPayouts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-zinc-400 italic">
                      No payouts currently on administrative hold.
                    </td>
                  </tr>
                ) : (
                  holdPayouts.map(p => {
                    const res = reservations.find(r => r.id === p.reservationId);
                    const partner = partners.find(part => part.id === p.partnerId);

                    return (
                      <tr key={p.id} className="hover:bg-brand-blush/10 transition-colors">
                        <td className="p-4 font-bold text-brand-plum">{res?.confirmationCode}</td>
                        <td className="p-4">
                          <div className="font-semibold">{partner?.contactName}</div>
                          <span className="text-[10px] text-zinc-400">{partner?.businessName}</span>
                        </td>
                        <td className="p-4">${p.payoutBaseAmount.toFixed(2)}</td>
                        <td className="p-4">{p.commissionRate}%</td>
                        <td className="p-4">${p.adjustment.toFixed(2)}</td>
                        <td className="p-4 font-bold">${p.finalPayout.toFixed(2)}</td>
                        <td className="p-4 text-rose-700 font-medium">
                          <span className="flex items-center gap-1">
                            <AlertCircle size={14} />
                            {res?.adminNotes || "Placed on hold by operations."}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => {
                              db.updatePayout(p.id, { status: "ELIGIBLE" });
                              db.updateReservation(p.reservationId, { payoutStatus: "ELIGIBLE" });
                              refreshData();
                            }}
                            className="bg-brand-blush hover:bg-brand-blush/80 text-brand-plum border border-brand-blush/60 px-3 py-1.5 rounded-lg text-xs font-bold"
                          >
                            Release Hold
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. APPROVED QUEUE */}
      {activeTab === "approved" && (
        <div className="space-y-6">
          {approvedPayouts.length === 0 ? (
            <Card className="py-12 text-center text-zinc-400 italic">
              No approved payouts awaiting batch creation.
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(approvedGroupedByPartner).map(([pId, partnerPayouts]) => {
                const partner = partners.find(p => p.id === pId);
                const totalBatchAmount = partnerPayouts.reduce((acc, p) => acc + p.finalPayout, 0);

                return (
                  <Card key={pId} className="border border-brand-blush shadow-xs p-6 space-y-4">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-brand-blush/60 pb-3 gap-3">
                      <div>
                        <h3 className="font-extrabold text-brand-plum text-lg">{partner?.businessName}</h3>
                        <p className="text-xs text-zinc-500">Contact: {partner?.contactName} · Payout Frequency: {partner?.payoutFrequency}</p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <span className="text-[10px] text-zinc-400 block uppercase font-bold tracking-wider">Group Total</span>
                          <span className="text-lg font-extrabold text-brand-plum">${totalBatchAmount.toFixed(2)}</span>
                        </div>
                        <button
                          onClick={() => handleCreateBatch(pId, partnerPayouts)}
                          className="bg-brand-plum text-brand-cream hover:bg-brand-wine px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md"
                        >
                          Create Payout Batch ({partnerPayouts.length} stays)
                        </button>
                      </div>
                    </div>

                    {/* Table of items */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="text-brand-wine font-bold border-b border-brand-blush/60">
                            <th className="pb-2">Stay Code</th>
                            <th className="pb-2">Check In</th>
                            <th className="pb-2">Base Value</th>
                            <th className="pb-2">Rate</th>
                            <th className="pb-2">Adjustment</th>
                            <th className="pb-2">Payout Amount</th>
                            <th className="pb-2">Approved Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-blush/30">
                          {partnerPayouts.map(p => {
                            const res = reservations.find(r => r.id === p.reservationId);
                            return (
                              <tr key={p.id} className="text-zinc-600">
                                <td className="py-2.5 font-bold text-brand-plum">{res?.confirmationCode}</td>
                                <td className="py-2.5">{res?.checkInDate}</td>
                                <td className="py-2.5">${p.payoutBaseAmount.toFixed(2)}</td>
                                <td className="py-2.5">{p.commissionRate}%</td>
                                <td className="py-2.5">${p.adjustment.toFixed(2)}</td>
                                <td className="py-2.5 font-bold text-brand-plum">${p.finalPayout.toFixed(2)}</td>
                                <td className="py-2.5 text-zinc-400">
                                  {p.approvalDate ? new Date(p.approvalDate).toLocaleDateString() : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. PAYMENT BATCHES */}
      {activeTab === "batches" && (
        <div className="bg-brand-cream border border-brand-blush rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-blush/25 border-b border-brand-blush text-brand-plum text-xs uppercase tracking-wider font-bold">
                  <th className="p-4">Batch ID</th>
                  <th className="p-4">Partner</th>
                  <th className="p-4">Date Range</th>
                  <th className="p-4">Stays Count</th>
                  <th className="p-4">Total Amount</th>
                  <th className="p-4">Method</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-blush/60 text-sm">
                {batches.filter(b => b.status === "PENDING").length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-zinc-400 italic">
                      No pending payment batches. Create a batch from the Approved queue first.
                    </td>
                  </tr>
                ) : (
                  batches
                    .filter(b => b.status === "PENDING")
                    .map(b => {
                      const partner = partners.find(p => p.id === b.partnerId);

                      return (
                        <tr key={b.id} className="hover:bg-brand-blush/10 transition-colors">
                          <td className="p-4 font-bold text-brand-plum">{b.id}</td>
                          <td className="p-4">
                            <div className="font-semibold">{partner?.businessName}</div>
                            <span className="text-[10px] text-zinc-400">Contact: {partner?.contactName}</span>
                          </td>
                          <td className="p-4 text-xs">
                            <div>{b.periodStart}</div>
                            <span className="text-[10px] text-zinc-400">to {b.periodEnd}</span>
                          </td>
                          <td className="p-4 font-semibold">{b.bookingCount} stays</td>
                          <td className="p-4 font-extrabold text-brand-plum">${b.totalPayout.toFixed(2)}</td>
                          <td className="p-4 text-xs font-semibold text-brand-wine">{partner?.paymentMethod.replace("_", " ")}</td>
                          <td className="p-4">
                            <Badge type="warning">Pending Bank</Badge>
                          </td>
                          <td className="p-4 text-center flex items-center justify-center space-x-2">
                            <button
                              onClick={() => {
                                setPayingBatch(b);
                                setTxnRef("");
                                setShowPayDialog(true);
                              }}
                              className="flex items-center space-x-1 bg-brand-plum hover:bg-brand-wine text-brand-cream px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm"
                            >
                              <CreditCard size={12} />
                              <span>Record Payment</span>
                            </button>
                            <button
                              onClick={() => handleCancelBatch(b)}
                              className="text-xs text-rose-600 hover:bg-rose-50 border border-rose-100 hover:border-rose-200 px-3 py-1.5 rounded-lg font-bold"
                            >
                              Cancel Batch
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. PAYOUT HISTORY */}
      {activeTab === "history" && (
        <div className="bg-brand-cream border border-brand-blush rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-blush/25 border-b border-brand-blush text-brand-plum text-xs uppercase tracking-wider font-bold">
                  <th className="p-4">Payout ID</th>
                  <th className="p-4">Stay Code</th>
                  <th className="p-4">Partner</th>
                  <th className="p-4">Base Payout</th>
                  <th className="p-4">Adjustment</th>
                  <th className="p-4">Final Paid</th>
                  <th className="p-4">Paid Date</th>
                  <th className="p-4">Bank Reference</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-blush/60 text-sm">
                {payouts.filter(p => p.status === "PAID").length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-zinc-400 italic">
                      No historical payout records. Record payment for a pending batch to seed history.
                    </td>
                  </tr>
                ) : (
                  payouts
                    .filter(p => p.status === "PAID")
                    .map(p => {
                      const res = reservations.find(r => r.id === p.reservationId);
                      const partner = partners.find(part => part.id === p.partnerId);

                      return (
                        <tr key={p.id} className="hover:bg-brand-blush/10 transition-colors">
                          <td className="p-4 font-mono text-xs text-zinc-500">{p.id}</td>
                          <td className="p-4 font-bold text-brand-plum">{res?.confirmationCode}</td>
                          <td className="p-4">
                            <div className="font-semibold">{partner?.contactName}</div>
                            <span className="text-[10px] text-zinc-400">{partner?.businessName}</span>
                          </td>
                          <td className="p-4">${p.payoutBaseAmount.toFixed(2)}</td>
                          <td className="p-4">${p.adjustment.toFixed(2)}</td>
                          <td className="p-4 font-extrabold text-brand-plum">${p.finalPayout.toFixed(2)}</td>
                          <td className="p-4 text-xs text-zinc-500">
                            {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="p-4 font-mono text-xs text-brand-wine font-bold">
                            {p.transactionReference || "Direct ACH"}
                          </td>
                          <td className="p-4">
                            <Badge type="success">Paid</Badge>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DIALOG: APPLY ADJUSTMENTS */}
      <Dialog isOpen={showAdjustDialog} onClose={() => setShowAdjustDialog(false)} title="Adjust Payout Value">
        {adjustPayout && (
          <form onSubmit={handleSaveAdjustment} className="space-y-4">
            <div className="p-3 bg-brand-blush/20 border border-brand-blush/40 rounded-xl space-y-1 text-xs">
              <p className="font-semibold text-brand-plum">Payout Calculation Baseline:</p>
              <p>Base amount: <span className="font-bold">${adjustPayout.payoutBaseAmount.toFixed(2)}</span></p>
              <p>Calculated commission rate: <span className="font-bold">{adjustPayout.commissionRate}%</span></p>
              <p>Baseline Payout: <span className="font-bold text-brand-wine">${adjustPayout.calculatedPayout.toFixed(2)}</span></p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">
                Adjustment Value (USD)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                placeholder="e.g. 25.00 or -15.00"
                className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none"
              />
              <span className="text-[10px] text-zinc-400 block mt-1 italic">
                (Use positive numbers for bonuses, negative numbers for manual deductions)
              </span>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">
                Adjustment Reason / Notes
              </label>
              <textarea
                required
                rows={3}
                value={adjustNotes}
                onChange={e => setAdjustNotes(e.target.value)}
                placeholder="Provide auditing context for this change..."
                className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-brand-plum text-brand-cream hover:bg-brand-wine py-2.5 rounded-lg text-xs font-bold transition-all shadow-md mt-4"
            >
              Save Adjustment
            </button>
          </form>
        )}
      </Dialog>

      {/* DIALOG: RECORD TRANSACTION REFERENCE */}
      <Dialog isOpen={showPayDialog} onClose={() => setShowPayDialog(false)} title="Record Payment Transaction">
        {payingBatch && (
          <form onSubmit={handleMarkBatchPaid} className="space-y-4">
            <div className="p-3 bg-brand-blush/25 border border-brand-blush rounded-xl space-y-1 text-xs text-brand-wine">
              <p className="font-bold">Batch Details:</p>
              <p>Batch ID: <span className="font-mono">{payingBatch.id}</span></p>
              <p>Recipient: <span className="font-semibold">{partners.find(p => p.id === payingBatch.partnerId)?.businessName}</span></p>
              <p>Stays Count: <span className="font-bold">{payingBatch.bookingCount}</span></p>
              <p>Total Payout: <span className="font-extrabold text-brand-plum text-sm">${payingBatch.totalPayout.toFixed(2)}</span></p>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">
                Transaction Reference / Confirmation Code
              </label>
              <input
                type="text"
                required
                value={txnRef}
                onChange={e => setTxnRef(e.target.value)}
                placeholder="e.g. TXN-9023485 or ACH-REF-100293"
                className="w-full px-3 py-2 bg-brand-bg border border-brand-blush rounded-lg text-sm focus:outline-none"
              />
              <span className="text-[10px] text-zinc-400 block mt-1">
                Record the bank wire or payment transaction code. This will be stored for audit logs.
              </span>
            </div>

            <button
              type="submit"
              className="w-full bg-brand-plum text-brand-cream hover:bg-brand-wine py-2.5 rounded-lg text-xs font-bold transition-all shadow-md"
            >
              Process Batch & Mark Paid
            </button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
