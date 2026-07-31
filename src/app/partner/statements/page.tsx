"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/db/mockDb";
import { Reservation, Partner, Payout } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";
import { Printer, Calendar, FileText, CheckCircle2 } from "lucide-react";

export default function PartnerStatements() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("2026-07");

  useEffect(() => {
    const user = db.currentUser;
    if (!user || !user.partnerId) return;

    const partnerData = db.partners.find(p => p.id === user.partnerId);
    if (partnerData) {
      setPartner(partnerData);
    }

    setReservations(db.reservations.filter(r => r.partnerId === user.partnerId && r.reservationStatus !== "CANCELLED"));
    setPayouts(db.payouts.filter(p => p.partnerId === user.partnerId));
  }, []);

  if (!partner) return null;

  // Filter items by month
  const statementReservations = reservations.filter(r => r.bookingDate.startsWith(selectedMonth));
  const statementPayouts = payouts.filter(p => {
    const res = reservations.find(r => r.id === p.reservationId);
    return res && res.bookingDate.startsWith(selectedMonth);
  });

  const bookingsCount = statementReservations.length;
  const grossReferredValue = statementReservations.reduce((acc, r) => acc + r.bookingAmount, 0);
  const baselinePayout = statementPayouts.reduce((acc, p) => acc + p.calculatedPayout, 0);
  const adjustments = statementPayouts.reduce((acc, p) => acc + p.adjustment, 0);
  const totalPayoutVal = statementPayouts.reduce((acc, p) => acc + p.finalPayout, 0);

  // Check if all payouts in this month are paid
  const isFullyPaid = statementPayouts.length > 0 && statementPayouts.every(p => p.status === "PAID");
  const transactionRef = statementPayouts.find(p => p.transactionReference)?.transactionReference || "";

  const handlePrint = () => {
    window.print();
  };

  const months = [
    { value: "2026-07", label: "July 2026" },
    { value: "2026-06", label: "June 2026" },
    { value: "2026-05", label: "May 2026" }
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Title & Month Selector (No Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Statements</h1>
          <p className="text-zinc-500 font-serif italic text-sm mt-1">
            Generate and print monthly commission statements.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="bg-brand-cream border border-brand-blush rounded-lg text-xs font-bold text-brand-plum py-2 px-3 focus:outline-none"
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <button
            onClick={handlePrint}
            className="flex items-center space-x-1.5 bg-brand-plum hover:bg-brand-wine text-brand-cream px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm focus:outline-none"
          >
            <Printer size={14} />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {/* STATEMENT SHEET (INVOICE STYLE) */}
      <div className="bg-brand-cream border border-brand-blush rounded-2xl shadow-xl p-8 print:p-0 print:border-none print:shadow-none space-y-8 print-card">
        {/* Invoice Header */}
        <div className="flex justify-between items-start border-b border-brand-blush/60 pb-6">
          <div>
            <span className="text-[10px] text-brand-wine font-bold uppercase tracking-widest block mb-2">Commission Invoice Statement</span>
            <h2 className="text-2xl font-extrabold text-brand-plum">Hidden Honey Homes</h2>
            <p className="text-xs text-zinc-500 mt-1">Retreats Partnership Platform</p>
          </div>
          <div className="text-right">
            <h3 className="font-extrabold text-brand-plum text-lg">{partner.businessName}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Recipient: {partner.contactName}</p>
            <p className="text-xs text-zinc-500">{partner.email}</p>
          </div>
        </div>

        {/* Statement Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 bg-brand-blush/10 border border-brand-blush/55 p-4 rounded-xl text-xs">
          <div>
            <span className="text-zinc-400 block font-semibold mb-0.5">STATEMENT PERIOD</span>
            <span className="font-bold text-brand-plum">{months.find(m => m.value === selectedMonth)?.label || selectedMonth}</span>
          </div>
          <div>
            <span className="text-zinc-400 block font-semibold mb-0.5">STATEMENT ID</span>
            <span className="font-mono font-bold text-zinc-700">STMT-{selectedMonth}-{partner.id}</span>
          </div>
          <div>
            <span className="text-zinc-400 block font-semibold mb-0.5">TRANSFER METHOD</span>
            <span className="font-bold text-brand-wine">{partner.paymentMethod.replace("_", " ")}</span>
          </div>
          <div>
            <span className="text-zinc-400 block font-semibold mb-0.5">PAYMENT STATUS</span>
            <div className="mt-0.5">
              <Badge type={isFullyPaid ? "success" : bookingsCount > 0 ? "warning" : "gray"}>
                {isFullyPaid ? "TRANSFERRED" : bookingsCount > 0 ? "PENDING PROCESS" : "NO ACTIVITY"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Summary figures */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
          <div className="border border-brand-blush/60 p-4 rounded-xl space-y-1">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wide block">Referred Stays Count</span>
            <span className="text-2xl font-extrabold text-brand-plum">{bookingsCount} stays</span>
            <span className="text-[10px] text-zinc-400 block">Gross value: ${grossReferredValue.toFixed(2)}</span>
          </div>

          <div className="border border-brand-blush/60 p-4 rounded-xl space-y-1">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wide block">Baseline Commission</span>
            <span className="text-2xl font-extrabold text-brand-plum">${baselinePayout.toFixed(2)}</span>
            <span className="text-[10px] text-zinc-400 block">Adjustments: ${adjustments.toFixed(2)}</span>
          </div>

          <div className="bg-brand-plum text-brand-cream p-4 rounded-xl space-y-1 flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-brand-blush font-bold uppercase tracking-wide block">Total Payable</span>
              <span className="text-2xl font-extrabold">${totalPayoutVal.toFixed(2)}</span>
            </div>
            {isFullyPaid && (
              <span className="text-[9px] text-brand-blush font-mono truncate">Ref: {transactionRef}</span>
            )}
          </div>
        </div>

        {/* Itemized Stays list */}
        <div className="space-y-4 pt-4">
          <h4 className="text-xs font-bold uppercase tracking-widest text-brand-wine">Itemized Referred Bookings</h4>
          
          <div className="border border-brand-blush/60 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-blush/10 border-b border-brand-blush text-brand-plum font-bold">
                  <th className="p-3">Stay Code</th>
                  <th className="p-3">Check In</th>
                  <th className="p-3">Stay Value</th>
                  <th className="p-3">Commission Rate</th>
                  <th className="p-3">Adjustments</th>
                  <th className="p-3">Commission Earned</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-blush/40 text-zinc-600">
                {statementReservations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center italic text-zinc-400">
                      No referral stay activity recorded for this period.
                    </td>
                  </tr>
                ) : (
                  statementReservations.map(res => {
                    const pay = statementPayouts.find(p => p.reservationId === res.id);
                    return (
                      <tr key={res.id}>
                        <td className="p-3 font-bold text-brand-plum">{res.confirmationCode}</td>
                        <td className="p-3">{res.checkInDate}</td>
                        <td className="p-3">${res.bookingAmount.toFixed(2)}</td>
                        <td className="p-3">{pay ? `${pay.commissionRate}%` : "—"}</td>
                        <td className="p-3 font-medium text-brand-wine">
                          {pay && pay.adjustment !== 0 ? `$${pay.adjustment.toFixed(2)}` : "—"}
                        </td>
                        <td className="p-3 font-bold text-brand-plum">
                          {pay ? `$${pay.finalPayout.toFixed(2)}` : "—"}
                        </td>
                        <td className="p-3">
                          <span className="uppercase font-bold text-[9px]">
                            {pay?.status || "PENDING"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer print information */}
        <div className="hidden print:flex justify-between items-end border-t border-brand-blush/60 pt-8 text-[9px] text-zinc-400">
          <div>
            <p>Generated automatically on {new Date().toLocaleDateString()} via HHH Portal.</p>
            <p>Hidden Honey Homes LLC · St. Augustine, FL</p>
          </div>
          <div className="flex items-center space-x-1 font-bold text-brand-plum">
            <CheckCircle2 size={10} className="text-brand-sage" />
            <span>Audit Trail Verified Invoice</span>
          </div>
        </div>
      </div>
    </div>
  );
}
