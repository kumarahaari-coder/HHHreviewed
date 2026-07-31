"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Payout, Reservation } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";
import { DollarSign, Landmark, CheckCircle, Clock, Loader2 } from "lucide-react";

function PartnerPayoutsContent() {
  const searchParams = useSearchParams();
  const previewPartnerId = searchParams.get("previewPartnerId");

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;

    async function loadData() {
      try {
        const url = previewPartnerId
          ? `/api/partner/dashboard?previewPartnerId=${encodeURIComponent(previewPartnerId)}`
          : "/api/partner/dashboard";

        const res = await fetch(url);
        const data = await res.json();

        if (!isSubscribed) return;

        if (data.success) {
          setPayouts(data.payouts || []);
          setReservations(data.reservations || []);
        }
      } catch (err) {
        console.error("[Partner Payouts Error]", err);
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isSubscribed = false;
    };
  }, [previewPartnerId]);

  if (loading) {
    return (
      <div className="flex py-16 justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-plum" />
      </div>
    );
  }

  const estimatedPayout = payouts
    .filter(p => p.status === "ESTIMATED")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const eligiblePayout = payouts
    .filter(p => p.status === "ELIGIBLE" || p.status === "APPROVED")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const totalPaidOut = payouts
    .filter(p => p.status === "PAID")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Payouts & Commission History</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Detailed log of generated commissions, eligible payout balances, and transaction references.
        </p>
      </div>

      {/* SUMMARY METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-purple-50 rounded-xl text-purple-700 shrink-0">
            <Clock size={24} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Estimated Balance</div>
            <div className="text-2xl font-extrabold text-brand-plum mt-0.5">${estimatedPayout.toLocaleString()}</div>
          </div>
        </Card>

        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-700 shrink-0">
            <Landmark size={24} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Approved / Eligible Balance</div>
            <div className="text-2xl font-extrabold text-emerald-700 mt-0.5">${eligiblePayout.toLocaleString()}</div>
          </div>
        </Card>

        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-700 shrink-0">
            <CheckCircle size={24} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Total Paid Out</div>
            <div className="text-2xl font-extrabold text-blue-800 mt-0.5">${totalPaidOut.toLocaleString()}</div>
          </div>
        </Card>
      </div>

      {/* PAYOUT HISTORY TABLE */}
      <div className="bg-brand-cream border border-brand-blush rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-cream border-b border-brand-blush text-[11px] font-bold uppercase tracking-wider text-brand-wine">
                <th className="py-3 px-4">Payout ID</th>
                <th className="py-3 px-4">Booking Ref</th>
                <th className="py-3 px-4">Gross Booking</th>
                <th className="py-3 px-4">Calculated Payout</th>
                <th className="py-3 px-4">Approval Date</th>
                <th className="py-3 px-4">Tx Reference</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-blush/40 text-xs">
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500 font-serif italic">
                    No payout records found.
                  </td>
                </tr>
              ) : (
                payouts.map(p => {
                  const res = reservations.find(r => r.id === p.reservationId);
                  return (
                    <tr key={p.id} className="hover:bg-brand-blush/10 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-brand-plum">{p.id}</td>
                      <td className="py-3.5 px-4 font-mono text-zinc-600">{p.reservationId}</td>
                      <td className="py-3.5 px-4 font-bold text-zinc-800">${p.payoutBaseAmount.toLocaleString()}</td>
                      <td className="py-3.5 px-4 font-bold text-emerald-700">${p.finalPayout.toLocaleString()}</td>
                      <td className="py-3.5 px-4 text-zinc-500">{p.approvalDate || "—"}</td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-zinc-500">{p.transactionReference || "—"}</td>
                      <td className="py-3.5 px-4">
                        <Badge type={p.status === "PAID" ? "success" : p.status === "ELIGIBLE" || p.status === "APPROVED" ? "info" : "warning"}>
                          {p.status}
                        </Badge>
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

export default function PartnerPayouts() {
  return (
    <Suspense fallback={<div className="flex py-16 justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-plum" /></div>}>
      <PartnerPayoutsContent />
    </Suspense>
  );
}
