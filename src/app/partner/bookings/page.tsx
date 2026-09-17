"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Reservation, Site } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { SlideOver } from "@/components/ui/slide-over";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableMobileCard,
} from "@/components/ui/table";
import { Eye, Loader2, Calendar, ShieldCheck } from "lucide-react";

function PartnerBookingsContent() {
  const searchParams = useSearchParams();
  const previewPartnerId = searchParams.get("previewPartnerId");

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
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
          setSites(data.sites || []);
          setReservations((data.reservations || []).filter((r: Reservation) => r.reservationStatus !== "CANCELLED"));
        }
      } catch (err) {
        console.error("[Partner Bookings Error]", err);
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

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "CHECKED_OUT":
      case "COMPLETED":
        return "success";
      case "CONFIRMED":
      case "CHECKED_IN":
        return "info";
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Referred Stays"
        description="Review bookings generated from your websites. Guest identities are protected."
      />

      <div className="bg-[#FFFFFF] border border-[#D2D2D7] rounded-xl overflow-hidden shadow-2xs">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking Code</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Stay Dates</TableHead>
                <TableHead>Property</TableHead>
                <TableHead className="text-right">Booking Value</TableHead>
                <TableHead className="text-right">Estimated Commission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-[#6E6E73] text-sm">
                    No referred stays recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                reservations.map((res) => (
                  <TableRow key={res.id}>
                    <TableCell className="font-mono font-medium text-[#1D1D1F]">
                      {res.confirmationCode || res.id}
                    </TableCell>
                    <TableCell className="font-medium text-[#1D1D1F]">
                      {res.guestName || "Referral Guest"}
                    </TableCell>
                    <TableCell className="text-[#6E6E73] whitespace-nowrap">
                      {res.checkInDate} to {res.checkOutDate}
                    </TableCell>
                    <TableCell className="text-[#6E6E73]">
                      {res.propertyId}
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium text-[#1D1D1F] tabular-nums">
                      {formatCurrency(res.bookingAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-[#1D1D1F] tabular-nums">
                      {formatCurrency(res.partnerPayoutAmount || 0)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={getStatusVariant(res.reservationStatus)}>{res.reservationStatus}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => setSelectedRes(res)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E8E8ED] transition-colors"
                        title="View Details"
                      >
                        <Eye size={14} />
                        <span>Details</span>
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Operational Card List */}
        <div className="md:hidden divide-y divide-[#E8E8ED]">
          {reservations.length === 0 ? (
            <div className="py-12 text-center text-[#6E6E73] text-sm">
              No referred stays recorded yet.
            </div>
          ) : (
            reservations.map((res) => (
              <TableMobileCard
                key={res.id}
                title={res.confirmationCode || res.id}
                subtitle={res.guestName || "Referral Guest"}
                badge={<StatusBadge variant={getStatusVariant(res.reservationStatus)}>{res.reservationStatus}</StatusBadge>}
                details={[
                  { label: "Dates", value: `${res.checkInDate} – ${res.checkOutDate}` },
                  { label: "Commission", value: formatCurrency(res.partnerPayoutAmount || 0), numeric: true }
                ]}
              />
            ))
          )}
        </div>
      </div>

      {/* READ-ONLY DETAIL SLIDEOVER */}
      <SlideOver
        isOpen={!!selectedRes}
        onClose={() => setSelectedRes(null)}
        title={`Stay Details — ${selectedRes?.confirmationCode || selectedRes?.id}`}
      >
        {selectedRes && (
          <div className="space-y-6 text-sm text-[#1D1D1F]">
            {/* Header summary */}
            <div className="bg-[#F5F5F7] p-4 rounded-xl space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-medium text-[#1D1D1F]">Status</span>
                <StatusBadge variant={getStatusVariant(selectedRes.reservationStatus)}>{selectedRes.reservationStatus}</StatusBadge>
              </div>
              <div className="flex items-center gap-2 text-[#6E6E73] text-xs">
                <Calendar size={14} className="shrink-0 text-[#6E6E73]" />
                <span>{selectedRes.checkInDate} to {selectedRes.checkOutDate}</span>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6E6E73]">Financial Overview</h4>
              <div className="bg-[#FFFFFF] border border-[#D2D2D7] rounded-xl p-4 space-y-2 text-xs">
                <div className="flex justify-between py-1">
                  <span className="text-[#6E6E73]">Gross Booking Value</span>
                  <span className="font-mono font-semibold text-[#1D1D1F] tabular-nums">
                    {formatCurrency(selectedRes.bookingAmount)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-t border-[#E8E8ED]">
                  <span className="text-[#6E6E73]">Calculated Commission</span>
                  <span className="font-mono font-semibold text-[#1D1D1F] tabular-nums">
                    {formatCurrency(selectedRes.partnerPayoutAmount || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Privacy notice */}
            <div className="bg-[#F5F5F7] p-3 rounded-lg border border-[#E8E8ED] flex items-center gap-2 text-xs text-[#6E6E73]">
              <ShieldCheck size={16} className="shrink-0 text-[#6E6E73]" />
              <span>Guest identities are masked for privacy & security compliance.</span>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}

export default function PartnerBookings() {
  return (
    <Suspense fallback={<div className="flex py-16 justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#1D1D1F]" /></div>}>
      <PartnerBookingsContent />
    </Suspense>
  );
}


