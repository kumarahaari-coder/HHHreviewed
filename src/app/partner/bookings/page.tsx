"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/db/mockDb";
import { Reservation, Site } from "@/lib/db/schema";
import { Card, Badge, SlideOver } from "@/components/ui/custom";
import { CalendarDays, MapPin, Eye, Info } from "lucide-react";

export default function PartnerBookings() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);

  useEffect(() => {
    const user = db.currentUser;
    if (!user || !user.partnerId) return;

    // RLS: Scoped only to partner's websites
    const mySites = db.sites.filter(s => s.partnerId === user.partnerId);
    setSites(mySites);

    const myRes = db.reservations.filter(
      r => r.partnerId === user.partnerId && r.reservationStatus !== "CANCELLED"
    );
    setReservations(myRes);
  }, []);

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
              <tr className="bg-brand-blush/25 border-b border-brand-blush text-brand-plum text-xs uppercase tracking-wider font-bold">
                <th className="p-4">Confirmation</th>
                <th className="p-4">Retreat</th>
                <th className="p-4">Stay Dates</th>
                <th className="p-4">Source Website</th>
                <th className="p-4">Booking Amount</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-blush/60 text-sm">
              {reservations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-zinc-400 italic">
                    No stays referred yet.
                  </td>
                </tr>
              ) : (
                reservations.map(res => {
                  const site = sites.find(s => s.id === res.siteId);
                  const propName = res.propertyId === "prop-001"
                    ? "Uptown Retreat"
                    : res.propertyId === "prop-002"
                    ? "Downtown Retreat"
                    : res.propertyId === "prop-003"
                    ? "Ellsworth Retreat"
                    : "Beech Mountain";

                  return (
                    <tr key={res.id} className="hover:bg-brand-blush/10 transition-colors">
                      <td className="p-4 font-bold text-brand-plum">{res.confirmationCode}</td>
                      <td className="p-4 font-semibold">{propName}</td>
                      <td className="p-4">
                        <div className="text-xs">{res.checkInDate}</div>
                        <span className="text-[10px] text-zinc-400">to {res.checkOutDate}</span>
                      </td>
                      <td className="p-4 text-xs font-semibold text-brand-wine">
                        {site?.siteName}
                      </td>
                      <td className="p-4 font-bold text-brand-plum">${res.bookingAmount.toFixed(2)}</td>
                      <td className="p-4">
                        <Badge type={res.reservationStatus === "CHECKED_OUT" || res.reservationStatus === "COMPLETED" ? "success" : "plum"}>
                          {res.reservationStatus.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setSelectedRes(res)}
                          className="p-1.5 text-brand-plum hover:bg-brand-blush/40 rounded-lg transition-colors"
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

      {/* DETAILED DIALOG DRAWER */}
      <SlideOver
        isOpen={selectedRes !== null}
        onClose={() => setSelectedRes(null)}
        title={`Referred Booking Details`}
      >
        {selectedRes && (
          <div className="space-y-6 text-sm">
            {/* Property header */}
            <div className="border-b border-brand-blush pb-4">
              <h4 className="font-extrabold text-brand-plum text-base">
                {selectedRes.propertyId === "prop-001"
                  ? "Uptown Retreat"
                  : selectedRes.propertyId === "prop-002"
                  ? "Downtown Retreat"
                  : selectedRes.propertyId === "prop-003"
                  ? "Ellsworth Retreat"
                  : "Beech Mountain Retreat"}
              </h4>
              <p className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                <MapPin size={12} className="text-zinc-400" />
                St. Augustine, FL · Stay dates: {selectedRes.checkInDate} to {selectedRes.checkOutDate}
              </p>
            </div>

            {/* Redacted Guest details (data isolation compliance) */}
            <div className="space-y-3 bg-brand-cream border border-brand-blush rounded-xl p-4">
              <h5 className="text-xs font-bold uppercase tracking-widest text-brand-wine">Guest Credentials (Masked)</h5>
              <div className="space-y-1 text-xs text-zinc-600">
                <p><span className="font-semibold text-brand-plum">Guest Name:</span> Referred Guest</p>
                <p><span className="font-semibold text-brand-plum">Contact:</span> admin-redacted@hiddenhoneyhomes.com</p>
                <p><span className="font-semibold text-brand-plum">Nights:</span> {selectedRes.nights} nights</p>
                <p><span className="font-semibold text-brand-plum">Guests:</span> {selectedRes.guests} registered guests</p>
              </div>
              <div className="p-2 bg-brand-blush/20 border border-brand-blush/40 rounded text-[10px] text-brand-wine flex items-start gap-1.5 leading-relaxed mt-2">
                <Info size={12} className="shrink-0 mt-0.5" />
                <span>To comply with privacy standards, complete guest contact details are only visible to HHH Admins.</span>
              </div>
            </div>

            {/* Financial summaries */}
            <div className="grid grid-cols-2 gap-4 border-t border-brand-blush pt-4">
              <div>
                <span className="text-[10px] font-bold text-brand-wine uppercase block">Gross Booking Value</span>
                <span className="text-base font-extrabold text-brand-plum">${selectedRes.bookingAmount.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-brand-wine uppercase block">Referred Website</span>
                <span className="text-sm font-semibold text-brand-plum">
                  {sites.find(s => s.id === selectedRes.siteId)?.siteName}
                </span>
              </div>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
