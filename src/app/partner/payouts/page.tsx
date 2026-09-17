"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Payout, Reservation } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableMobileCard,
} from "@/components/ui/table";
import { Clock, Landmark, CheckCircle, Loader2, Info } from "lucide-react";

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
        <Loader2 className="h-8 w-8 animate-spin text-[#1D1D1F]" />
      </div>
    );
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const calculatedCommission = payouts
    .filter(p => p.status === "ON_HOLD" || p.status === "ELIGIBLE" || p.status === "APPROVED")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const eligiblePayout = payouts
    .filter(p => p.status === "ELIGIBLE" || p.status === "APPROVED")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const totalPaidOut = payouts
    .filter(p => p.status === "PAID")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "PAID":
        return "success";
      case "ELIGIBLE":
      case "APPROVED":
        return "info";
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payouts & Commission History"
        description="Detailed record of calculated commissions, eligible payout balances, and transaction history."
      />

      {/* SUMMARY METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-[#F5F5F7] rounded-xl text-[#1D1D1F] shrink-0 border border-[#E8E8ED]">
            <Clock size={22} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">Calculated Balance</div>
            <div className="text-2xl font-semibold text-[#1D1D1F] mt-0.5 font-mono tabular-nums">
              {formatCurrency(calculatedCommission)}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-[#F5F5F7] rounded-xl text-[#1D1D1F] shrink-0 border border-[#E8E8ED]">
            <Landmark size={22} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">Available for Payout</div>
            <div className="text-2xl font-semibold text-[#1D1D1F] mt-0.5 font-mono tabular-nums">
              {formatCurrency(eligiblePayout)}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 bg-[#F5F5F7] rounded-xl text-[#1D1D1F] shrink-0 border border-[#E8E8ED]">
            <CheckCircle size={22} />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6E6E73] uppercase tracking-wider">Total Paid Out</div>
            <div className="text-2xl font-semibold text-[#1D1D1F] mt-0.5 font-mono tabular-nums">
              {formatCurrency(totalPaidOut)}
            </div>
          </div>
        </Card>
      </div>

      {/* READ-ONLY SETTLEMENT STATUS BANNER */}
      <div className="bg-[#F5F5F7] border border-[#D2D2D7] rounded-xl p-4 text-xs text-[#6E6E73] flex items-center gap-3">
        <Info size={18} className="shrink-0 text-[#1D1D1F]" />
        <span>
          Payout settlement is managed through scheduled administrative batches. Balances become available automatically once stay completion eligibility rules are met.
        </span>
      </div>

      {/* PAYOUT HISTORY TABLE */}
      <div className="bg-[#FFFFFF] border border-[#D2D2D7] rounded-xl overflow-hidden shadow-2xs">
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payout Reference</TableHead>
                <TableHead>Booking Ref</TableHead>
                <TableHead className="text-right">Booking Base</TableHead>
                <TableHead className="text-right">Commission Amount</TableHead>
                <TableHead>Approval Date</TableHead>
                <TableHead>Tx Reference</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-[#6E6E73] text-sm">
                    No payout records found.
                  </TableCell>
                </TableRow>
              ) : (
                payouts.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-medium text-[#1D1D1F]">{p.id}</TableCell>
                    <TableCell className="font-mono text-[#6E6E73]">{p.reservationId}</TableCell>
                    <TableCell className="text-right font-mono font-medium text-[#1D1D1F] tabular-nums">
                      {formatCurrency(p.payoutBaseAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-[#1D1D1F] tabular-nums">
                      {formatCurrency(p.finalPayout)}
                    </TableCell>
                    <TableCell className="text-[#6E6E73]">{p.approvalDate || "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-[#6E6E73]">{p.transactionReference || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge variant={getStatusVariant(p.status)}>{p.status}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-[#E8E8ED]">
          {payouts.length === 0 ? (
            <div className="py-12 text-center text-[#6E6E73] text-sm">
              No payout records found.
            </div>
          ) : (
            payouts.map((p) => (
              <TableMobileCard
                key={p.id}
                title={p.id}
                subtitle={`Booking: ${p.reservationId}`}
                badge={<StatusBadge variant={getStatusVariant(p.status)}>{p.status}</StatusBadge>}
                details={[
                  { label: "Base Amount", value: formatCurrency(p.payoutBaseAmount), numeric: true },
                  { label: "Commission", value: formatCurrency(p.finalPayout), numeric: true }
                ]}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function PartnerPayouts() {
  return (
    <Suspense fallback={<div className="flex py-16 justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#1D1D1F]" /></div>}>
      <PartnerPayoutsContent />
    </Suspense>
  );
}

