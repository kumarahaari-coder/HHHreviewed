"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/db/mockDb";
import { Reservation, Partner, Payout } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Printer, CheckCircle2 } from "lucide-react";

export default function PartnerStatements() {
  const [partner] = useState<Partner | null>(() => {
    const user = db.currentUser;
    return user?.partnerId ? db.partners.find(p => p.id === user.partnerId) || null : null;
  });
  const [reservations] = useState<Reservation[]>(() => {
    const user = db.currentUser;
    return user?.partnerId ? db.reservations.filter(r => r.partnerId === user.partnerId && r.reservationStatus !== "CANCELLED") : [];
  });
  const [payouts] = useState<Payout[]>(() => {
    const user = db.currentUser;
    return user?.partnerId ? db.payouts.filter(p => p.partnerId === user.partnerId) : [];
  });
  const [selectedMonth, setSelectedMonth] = useState("2026-07");

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

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  return (
    <div className="space-y-6">
      {/* Title & Month Selector (No Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <PageHeader
          title="Statements"
          description="Generate and print monthly commission statements."
        />


        <div className="flex items-center space-x-3 shrink-0">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="bg-[#FFFFFF] border border-[#D2D2D7] rounded-lg text-xs font-semibold text-[#1D1D1F] py-2 px-3 focus:outline-none"
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <button
            onClick={handlePrint}
            className="flex items-center space-x-1.5 bg-[#1D1D1F] hover:bg-[#6E6E73] text-[#FFFFFF] px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-2xs focus:outline-none"
          >
            <Printer size={14} />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {/* STATEMENT SHEET (INVOICE STYLE) */}
      <div className="bg-[#FFFFFF] border border-[#D2D2D7] rounded-2xl shadow-2xs p-8 print:p-0 print:border-none print:shadow-none space-y-8 print-card text-[#1D1D1F]">
        {/* Invoice Header */}
        <div className="flex justify-between items-start border-b border-[#E8E8ED] pb-6">
          <div>
            <span className="text-[10px] text-[#6E6E73] font-semibold uppercase tracking-wider block mb-1">Commission Invoice Statement</span>
            <h2 className="text-2xl font-bold text-[#1D1D1F]">Hidden Honey Homes</h2>
            <p className="text-xs text-[#6E6E73] mt-0.5">Retreats Partnership Platform</p>
          </div>
          <div className="text-right">
            <h3 className="font-bold text-[#1D1D1F] text-base">{partner.businessName}</h3>
            <p className="text-xs text-[#6E6E73] mt-0.5">Recipient: {partner.contactName}</p>
            <p className="text-xs text-[#6E6E73]">{partner.email}</p>
          </div>
        </div>

        {/* Statement Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 bg-[#F5F5F7] border border-[#E8E8ED] p-4 rounded-xl text-xs">
          <div>
            <span className="text-[#6E6E73] block font-semibold mb-0.5">STATEMENT PERIOD</span>
            <span className="font-bold text-[#1D1D1F]">{months.find(m => m.value === selectedMonth)?.label || selectedMonth}</span>
          </div>
          <div>
            <span className="text-[#6E6E73] block font-semibold mb-0.5">STATEMENT ID</span>
            <span className="font-mono font-bold text-[#1D1D1F]">STMT-{selectedMonth}-{partner.id}</span>
          </div>
          <div>
            <span className="text-[#6E6E73] block font-semibold mb-0.5">TRANSFER METHOD</span>
            <span className="font-semibold text-[#1D1D1F]">{partner.paymentMethod.replace("_", " ")}</span>
          </div>
          <div>
            <span className="text-[#6E6E73] block font-semibold mb-0.5">PAYMENT STATUS</span>
            <div className="mt-0.5">
              <StatusBadge variant={isFullyPaid ? "success" : bookingsCount > 0 ? "warning" : "neutral"}>
                {isFullyPaid ? "TRANSFERRED" : bookingsCount > 0 ? "PENDING PROCESS" : "NO ACTIVITY"}
              </StatusBadge>
            </div>
          </div>
        </div>

        {/* Summary figures */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
          <div className="border border-[#E8E8ED] p-4 rounded-xl space-y-1">
            <span className="text-[10px] text-[#6E6E73] font-semibold uppercase tracking-wider block">Referred Stays Count</span>
            <span className="text-2xl font-bold text-[#1D1D1F]">{bookingsCount} stays</span>
            <span className="text-[10px] text-[#6E6E73] font-mono block">Gross value: {formatCurrency(grossReferredValue)}</span>
          </div>

          <div className="border border-[#E8E8ED] p-4 rounded-xl space-y-1">
            <span className="text-[10px] text-[#6E6E73] font-semibold uppercase tracking-wider block">Baseline Commission</span>
            <span className="text-2xl font-bold text-[#1D1D1F] font-mono tabular-nums">{formatCurrency(baselinePayout)}</span>
            <span className="text-[10px] text-[#6E6E73] font-mono block">Adjustments: {formatCurrency(adjustments)}</span>
          </div>

          <div className="bg-[#1D1D1F] text-[#FFFFFF] p-4 rounded-xl space-y-1 flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-[#D2D2D7] font-semibold uppercase tracking-wider block">Total Payable</span>
              <span className="text-2xl font-bold font-mono tabular-nums">{formatCurrency(totalPayoutVal)}</span>
            </div>
            {isFullyPaid && (
              <span className="text-[9px] text-[#D2D2D7] font-mono truncate">Ref: {transactionRef}</span>
            )}
          </div>
        </div>

        {/* Itemized Stays list */}
        <div className="space-y-4 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6E6E73]">Itemized Referred Bookings</h4>
          
          <div className="border border-[#D2D2D7] rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F5F5F7] border-b border-[#D2D2D7] text-[#1D1D1F] font-semibold">
                  <th className="p-3">Stay Code</th>
                  <th className="p-3">Check In</th>
                  <th className="p-3 text-right">Stay Value</th>
                  <th className="p-3 text-right">Commission Rate</th>
                  <th className="p-3 text-right">Adjustments</th>
                  <th className="p-3 text-right">Commission Earned</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E8ED] text-[#1D1D1F]">
                {statementReservations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-[#6E6E73]">
                      No referral stay activity recorded for this period.
                    </td>
                  </tr>
                ) : (
                  statementReservations.map(res => {
                    const pay = statementPayouts.find(p => p.reservationId === res.id);
                    return (
                      <tr key={res.id}>
                        <td className="p-3 font-mono font-medium text-[#1D1D1F]">{res.confirmationCode}</td>
                        <td className="p-3 text-[#6E6E73]">{res.checkInDate}</td>
                        <td className="p-3 text-right font-mono tabular-nums">{formatCurrency(res.bookingAmount)}</td>
                        <td className="p-3 text-right font-mono">{pay ? `${pay.commissionRate}%` : "—"}</td>
                        <td className="p-3 text-right font-mono font-medium text-[#6E6E73]">
                          {pay && pay.adjustment !== 0 ? formatCurrency(pay.adjustment) : "—"}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-[#1D1D1F] tabular-nums">
                          {pay ? formatCurrency(pay.finalPayout) : "—"}
                        </td>
                        <td className="p-3">
                          <StatusBadge variant={pay?.status === "PAID" ? "success" : "neutral"}>
                            {pay?.status || "PENDING"}
                          </StatusBadge>
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
        <div className="hidden print:flex justify-between items-end border-t border-[#E8E8ED] pt-8 text-[9px] text-[#6E6E73]">
          <div>
            <p>Generated automatically on {new Date().toLocaleDateString()} via HHH Portal.</p>
            <p>Hidden Honey Homes LLC · St. Augustine, FL</p>
          </div>
          <div className="flex items-center space-x-1 font-semibold text-[#1D1D1F]">
            <CheckCircle2 size={10} className="text-[#1D1D1F]" />
            <span>Audit Trail Verified Invoice</span>
          </div>
        </div>
      </div>
    </div>
  );
}

