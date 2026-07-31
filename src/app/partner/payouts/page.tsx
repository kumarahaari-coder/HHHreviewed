"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/db/mockDb";
import { Payout, Reservation } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";
import { DollarSign, Landmark, CheckCircle, Clock } from "lucide-react";

export default function PartnerPayouts() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    const user = db.currentUser;
    if (!user || !user.partnerId) return;

    // RLS: Scoped only to partner
    const myPayouts = db.payouts.filter(p => p.partnerId === user.partnerId);
    setPayouts(myPayouts);
    setReservations(db.reservations.filter(r => r.partnerId === user.partnerId));
  }, []);

  // Outstanding unpaid balance
  const outstandingBalance = payouts
    .filter(p => p.status === "APPROVED" || p.status === "ELIGIBLE")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const totalPaid = payouts
    .filter(p => p.status === "PAID")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Payouts & Earnings</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Track outstanding commissions, review payout adjustments, and view complete transaction references.
        </p>
      </div>

      {/* BALANCE CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <Card className="flex items-center space-x-4 bg-brand-blush/20 border border-brand-blush/60">
          <div className="p-3 bg-brand-plum text-brand-cream rounded-lg">
            <Clock size={20} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-wine">Outstanding Balance</span>
            <p className="text-2xl font-extrabold text-brand-plum">${outstandingBalance.toFixed(2)}</p>
          </div>
        </Card>

        <Card className="flex items-center space-x-4 bg-brand-cream border border-brand-blush">
          <div className="p-3 bg-brand-sage/20 text-brand-wine rounded-lg">
            <CheckCircle size={20} className="text-brand-wine" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand-wine">Completed Transfers</span>
            <p className="text-2xl font-extrabold text-brand-plum">${totalPaid.toFixed(2)}</p>
          </div>
        </Card>
      </div>

      {/* LEDGER TABLE */}
      <div className="bg-brand-cream border border-brand-blush rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-blush/25 border-b border-brand-blush text-brand-plum text-xs uppercase tracking-wider font-bold">
                <th className="p-4">Payout ID</th>
                <th className="p-4">Stay Code</th>
                <th className="p-4">Base Amount</th>
                <th className="p-4">Commission Rate</th>
                <th className="p-4">Adjustment</th>
                <th className="p-4">Final Earnings</th>
                <th className="p-4">Payment Date</th>
                <th className="p-4">Bank Ref</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-blush/60 text-sm">
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-zinc-400 italic">
                    No payouts recorded yet.
                  </td>
                </tr>
              ) : (
                payouts.map(p => {
                  const res = reservations.find(r => r.id === p.reservationId);
                  
                  let statusBadge = <Badge type="gray">Estimated</Badge>;
                  if (p.status === "ELIGIBLE") {
                    statusBadge = <Badge type="sage">Eligible</Badge>;
                  } else if (p.status === "APPROVED") {
                    statusBadge = <Badge type="plum">Approved</Badge>;
                  } else if (p.status === "ON_HOLD") {
                    statusBadge = <Badge type="warning">Hold</Badge>;
                  } else if (p.status === "PAID") {
                    statusBadge = <Badge type="success">Paid</Badge>;
                  } else if (p.status === "REJECTED") {
                    statusBadge = <Badge type="danger">Rejected</Badge>;
                  }

                  return (
                    <tr key={p.id} className="hover:bg-brand-blush/10 transition-colors">
                      <td className="p-4 font-mono text-xs text-zinc-500">{p.id}</td>
                      <td className="p-4 font-bold text-brand-plum">{res?.confirmationCode}</td>
                      <td className="p-4">${p.payoutBaseAmount.toFixed(2)}</td>
                      <td className="p-4">{p.commissionRate}%</td>
                      <td className="p-4 font-medium text-brand-wine">
                        {p.adjustment !== 0 ? `$${p.adjustment.toFixed(2)}` : "—"}
                      </td>
                      <td className="p-4 font-extrabold text-brand-plum">${p.finalPayout.toFixed(2)}</td>
                      <td className="p-4 text-xs text-zinc-500">
                        {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-4 font-mono text-xs text-zinc-600">
                        {p.transactionReference || <span className="text-zinc-400 italic">Pending ACH</span>}
                      </td>
                      <td className="p-4">{statusBadge}</td>
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
