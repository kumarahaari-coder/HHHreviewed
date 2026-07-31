"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Reservation, Site } from "@/lib/db/schema";
import { Card, Badge, SlideOver } from "@/components/ui/custom";
import { CalendarDays, MapPin, Eye, Info, Loader2 } from "lucide-react";

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
        <Loader2 className="h-8 w-8 animate-spin text-brand-plum" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">My Referred Stays</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Review bookings generated from your websites. Guest identities are masked for data compliance.
        </p>
      </div>

      {/* BOOKINGS TABLE */}
      <div className="bg-brand-cream border border-brand-blush rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-cream border-b border-brand-blush text-[11px] font-bold uppercase tracking-wider text-brand-wine">
                <th className="py-3 px-4">Booking ID</th>
                <th className="py-3 px-4">Guest</th>
                <th className="py-3 px-4">Dates</th>
                <th className="py-3 px-4">Property</th>
                <th className="py-3 px-4">Booking Value</th>
                <th className="py-3 px-4">Estimated Payout</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-blush/40 text-xs">
              {reservations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500 font-serif italic">
                    No referred stays recorded yet.
                  </td>
                </tr>
              ) : (
                reservations.map(res => {
                  const site = sites.find(s => s.id === res.siteId);
                  return (
                    <tr key={res.id} className="hover:bg-brand-blush/10 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-brand-plum">{res.id}</td>
                      <td className="py-3.5 px-4 font-bold text-zinc-800">{res.guestName || "Referral Guest"}</td>
                      <td className="py-3.5 px-4 text-zinc-600">{res.checkInDate} to {res.checkOutDate}</td>
                      <td className="py-3.5 px-4 text-zinc-600">{res.propertyId}</td>
                      <td className="py-3.5 px-4 font-bold">${res.bookingAmount.toLocaleString()}</td>
                      <td className="py-3.5 px-4 font-bold text-emerald-700">${(res.partnerPayoutAmount || 0).toLocaleString()}</td>
                      <td className="py-3.5 px-4">
                        <Badge type={res.reservationStatus === "CHECKED_OUT" || res.reservationStatus === "COMPLETED" ? "success" : "info"}>
                          {res.reservationStatus}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedRes(res)}
                          className="p-1.5 rounded-lg text-brand-plum hover:bg-brand-blush/30 transition-colors"
                          title="View Stay Details"
                        >
                          <Eye size={16} />
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

      {/* DETAIL SLIDEOVER */}
      <SlideOver
        isOpen={!!selectedRes}
        onClose={() => setSelectedRes(null)}
        title={`Stay Details: ${selectedRes?.id}`}
      >
        {selectedRes && (
          <div className="space-y-6 text-xs font-sans">
            <div className="p-4 bg-brand-bg/50 border border-brand-blush rounded-xl space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-brand-plum text-sm">{selectedRes.guestName || "Referral Guest"}</span>
                <Badge type={selectedRes.reservationStatus === "CHECKED_OUT" ? "success" : "info"}>
                  {selectedRes.reservationStatus}
                </Badge>
              </div>
              <div className="text-zinc-500 flex items-center space-x-1">
                <CalendarDays size={12} />
                <span>{selectedRes.checkInDate} — {selectedRes.checkOutDate}</span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-brand-wine uppercase tracking-wider text-[11px]">Financial Breakdown</h4>
              <div className="p-3 bg-brand-cream border border-brand-blush/80 rounded-xl space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Gross Booking Amount</span>
                  <span className="font-bold text-zinc-800">${selectedRes.bookingAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Calculated Creator Commission</span>
                  <span className="font-bold text-emerald-700">${(selectedRes.partnerPayoutAmount || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}

export default function PartnerBookings() {
  return (
    <Suspense fallback={<div className="flex py-16 justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-plum" /></div>}>
      <PartnerBookingsContent />
    </Suspense>
  );
}
