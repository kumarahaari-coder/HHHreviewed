"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  Filter,
  FileSpreadsheet,
  AlertCircle,
  Link as LinkIcon,
  Eye,
  PlusCircle,
  CheckCircle,
  AlertTriangle,
  Info,
  RefreshCw
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Reservation, Partner, Site, ReservationAttribution, ReconciliationStatus } from "@/lib/db/schema";
import { Card, Badge, SlideOver } from "@/components/ui/custom";
import { runSystemPayoutRecalculation } from "@/lib/payouts";

function BookingsListContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Seed db data states
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [attributions, setAttributions] = useState<ReservationAttribution[]>([]);
  
  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("ALL");
  const [selectedChannel, setSelectedChannel] = useState("ALL");
  const [selectedPartner, setSelectedPartner] = useState("ALL");
  const [selectedSite, setSelectedSite] = useState("ALL");
  const [selectedProperty, setSelectedProperty] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState("ALL");
  const [selectedPayoutStatus, setSelectedPayoutStatus] = useState("ALL");
  const [selectedAttribution, setSelectedAttribution] = useState("ALL");

  // Selection/Detail drawer state
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState("");
  
  // Reassignment state (manual reconciliation)
  const [showReassignPanel, setShowReassignPanel] = useState(false);
  const [reassignPartnerId, setReassignPartnerId] = useState("");
  const [reassignSiteId, setReassignSiteId] = useState("");

  const refreshData = async () => {
    try {
      const [resRes, attrRes, sitesRes, partnersRes] = await Promise.all([
        fetch("/api/admin/reservations"),
        fetch("/api/admin/attributions"),
        fetch("/api/admin/sites"),
        fetch("/api/admin/partners"),
      ]);

      if (resRes.ok) {
        const rData = await resRes.json();
        if (rData.success && Array.isArray(rData.reservations)) {
          setReservations(rData.reservations);
        } else {
          setReservations([...db.reservations]);
        }
      } else {
        setReservations([...db.reservations]);
      }

      if (attrRes.ok) {
        const aData = await attrRes.json();
        setAttributions(aData.attributions || []);
      } else {
        setAttributions(db.reservationAttributions);
      }

      if (sitesRes.ok) {
        const sData = await sitesRes.json();
        if (sData.success && Array.isArray(sData.sites)) {
          setSites(sData.sites);
        } else {
          setSites(db.sites);
        }
      } else {
        setSites(db.sites);
      }

      if (partnersRes.ok) {
        const pData = await partnersRes.json();
        if (pData.success && Array.isArray(pData.partners)) {
          setPartners(pData.partners);
        } else {
          setPartners(db.partners);
        }
      } else {
        setPartners(db.partners);
      }

    } catch {
      setReservations([...db.reservations]);
      setPartners(db.partners);
      setSites(db.sites);
      setAttributions(db.reservationAttributions);
    }
  };

  const handleAttributionReview = async (attributionId: string, newStatus: ReconciliationStatus) => {
    try {
      const res = await fetch(`/api/admin/attributions/${attributionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, reviewedBy: "Super Admin" })
      });

      if (res.ok) {
        const data = await res.json();
        db.addNotification("SUCCESS", `Attribution status updated to ${newStatus}.`);
        await refreshData();
      }
    } catch (err: any) {
      console.error("Failed to review attribution:", err);
    }
  };

  useEffect(() => {
    refreshData();
    
    // Check for query parameters from Overview cards
    const attrFilter = searchParams.get("attribution");
    const reviewFilter = searchParams.get("review");
    
    if (attrFilter) {
      setSelectedAttribution(attrFilter);
    }
    if (reviewFilter === "true") {
      setSelectedPayoutStatus("ON_HOLD");
    }
  }, [searchParams]);

  // Recalculate all payouts globally
  const handleRecalculate = () => {
    runSystemPayoutRecalculation();
    refreshData();
    if (selectedRes) {
      const updated = db.reservations.find(r => r.id === selectedRes.id);
      if (updated) setSelectedRes(updated);
    }
    db.addNotification("SUCCESS", "System payout values and eligibility criteria successfully recalculated.");
  };

  // Toggle payout hold
  const handleToggleHold = (resId: string) => {
    const res = reservations.find(r => r.id === resId);
    if (!res) return;
    const newStatus = res.payoutStatus === "ON_HOLD" ? "ELIGIBLE" : "ON_HOLD";
    db.updateReservation(resId, { payoutStatus: newStatus });
    refreshData();
    // Refresh active selected view
    const updated = db.reservations.find(r => r.id === resId);
    if (updated) setSelectedRes(updated);
  };

  // Save admin note
  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRes) return;
    db.updateReservation(selectedRes.id, { adminNotes: adminNoteInput });
    refreshData();
    setSelectedRes({ ...selectedRes, adminNotes: adminNoteInput });
    setAdminNoteInput("");
  };

  // Process manual attribution reassignment
  const handleReassignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRes || !reassignPartnerId || !reassignSiteId) return;

    db.updateReservation(selectedRes.id, {
      partnerId: reassignPartnerId,
      siteId: reassignSiteId,
      attributionStatus: "RECONCILED",
      attributionSource: "Manual Reconciliation"
    });

    // Run calculation
    runSystemPayoutRecalculation();
    
    refreshData();
    
    // Refresh selected panel
    const updated = db.reservations.find(r => r.id === selectedRes.id);
    if (updated) setSelectedRes(updated);

    setShowReassignPanel(false);
    setReassignPartnerId("");
    setReassignSiteId("");
    db.addNotification("SUCCESS", `Booking ${selectedRes.confirmationCode} manually reconciled and attributed successfully.`);
  };

  // Filter logic
  const filteredList = reservations.filter(res => {
    // Search query
    if (searchQuery && !res.confirmationCode.toLowerCase().includes(searchQuery.toLowerCase()) && !res.id.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Integration Provider filter
    if (selectedProvider !== "ALL") {
      const isOwnerRez = Boolean(res.ownerrezBookingId || res.paymentConfirmationSource === "OWNERREZ");
      if (selectedProvider === "OWNERREZ" && !isOwnerRez) return false;
      if (selectedProvider === "HOSPITABLE" && isOwnerRez) return false;
    }
    // Booking Channel filter
    if (selectedChannel !== "ALL") {
      const channel = (res.platform || "DIRECT").toUpperCase();
      if (channel !== selectedChannel) return false;
    }
    // Filters
    if (selectedPartner !== "ALL" && res.partnerId !== selectedPartner) return false;
    if (selectedSite !== "ALL" && res.siteId !== selectedSite) return false;
    if (selectedProperty !== "ALL" && res.propertyId !== selectedProperty) return false;
    if (selectedStatus !== "ALL" && res.reservationStatus !== selectedStatus) return false;
    if (selectedPaymentStatus !== "ALL" && res.paymentStatus !== selectedPaymentStatus) return false;
    if (selectedPayoutStatus !== "ALL" && res.payoutStatus !== selectedPayoutStatus) return false;
    if (selectedAttribution !== "ALL" && res.attributionStatus !== selectedAttribution) return false;

    return true;
  });

  // Export report simulator
  const handleExportReport = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Reservation ID,Confirmation,Provider,Channel,Source Site,Property,Check In,Checkout,Gross Amount,Payment Status,Payout Status\n";
    filteredList.forEach(r => {
      const site = sites.find(s => s.id === r.siteId)?.siteName || "Unattributed";
      const provider = (r.ownerrezBookingId || r.paymentConfirmationSource === "OWNERREZ") ? "OwnerRez" : "Hospitable";
      csvContent += `${r.id},${r.confirmationCode},${provider},${r.platform || "direct"},${site},${r.propertyId},${r.checkInDate},${r.checkOutDate},${r.bookingAmount},${r.paymentStatus},${r.payoutStatus}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `HHH_Bookings_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Title & Top actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Booking Management</h1>
          <p className="text-zinc-500 font-serif italic text-sm mt-1">
            Track multi-provider reservations (OwnerRez & Hospitable), verify source attribution, and manage payout locks.
          </p>
        </div>
        
        <div className="flex space-x-3 self-end sm:self-auto">
          <button
            onClick={handleRecalculate}
            className="flex items-center space-x-1.5 bg-brand-cream border border-brand-blush hover:border-brand-plum text-brand-plum px-3 py-2 rounded-lg text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-brand-plum cursor-pointer"
          >
            <RefreshCw size={14} className="animate-hover-spin" />
            <span>Recalculate Payouts</span>
          </button>
          
          <button
            onClick={handleExportReport}
            className="flex items-center space-x-1.5 bg-brand-blush hover:bg-brand-blush/80 text-brand-plum border border-brand-blush/60 px-3 py-2 rounded-lg text-xs font-bold transition-all focus:outline-none cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            <span>Export Bookings</span>
          </button>
        </div>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          {/* Search bar */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search confirmation code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-brand-bg/50 border border-brand-blush rounded-lg text-sm text-brand-text placeholder-zinc-400 focus:outline-none focus:border-brand-plum"
            />
          </div>

          {/* Quick Filters Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedAttribution}
              onChange={e => setSelectedAttribution(e.target.value)}
              className="bg-brand-bg border border-brand-blush rounded-lg text-xs font-bold text-zinc-600 py-2 px-3 focus:outline-none"
            >
              <option value="ALL">All Attributions</option>
              <option value="ATTRIBUTED">Attributed</option>
              <option value="UNATTRIBUTED">Unattributed</option>
              <option value="RECONCILED">Manually Reconciled</option>
            </select>

            <select
              value={selectedPayoutStatus}
              onChange={e => setSelectedPayoutStatus(e.target.value)}
              className="bg-brand-bg border border-brand-blush rounded-lg text-xs font-bold text-zinc-600 py-2 px-3 focus:outline-none"
            >
              <option value="ALL">All Payout Statuses</option>
              <option value="ESTIMATED">Estimated</option>
              <option value="ELIGIBLE">Eligible</option>
              <option value="APPROVED">Approved</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="PAID">Paid</option>
            </select>
          </div>
        </div>

        {/* Collapsible/Extended Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 pt-3 border-t border-brand-blush/60">
          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Provider</label>
            <select
              value={selectedProvider}
              onChange={e => setSelectedProvider(e.target.value)}
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-1.5 px-2 focus:outline-none font-bold text-brand-plum"
            >
              <option value="ALL">All Providers</option>
              <option value="OWNERREZ">OwnerRez</option>
              <option value="HOSPITABLE">Hospitable</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Channel</label>
            <select
              value={selectedChannel}
              onChange={e => setSelectedChannel(e.target.value)}
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-1.5 px-2 focus:outline-none"
            >
              <option value="ALL">All Channels</option>
              <option value="DIRECT">Direct</option>
              <option value="AIRBNB">Airbnb</option>
              <option value="VRBO">Vrbo</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Partner</label>
            <select
              value={selectedPartner}
              onChange={e => setSelectedPartner(e.target.value)}
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-1.5 px-2 focus:outline-none"
            >
              <option value="ALL">All Partners</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.contactName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Referrer Site</label>
            <select
              value={selectedSite}
              onChange={e => setSelectedSite(e.target.value)}
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-1.5 px-2 focus:outline-none"
            >
              <option value="ALL">All Sites</option>
              {sites.map(s => (
                <option key={s.id} value={s.id}>{s.siteName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">HHH Retreat</label>
            <select
              value={selectedProperty}
              onChange={e => setSelectedProperty(e.target.value)}
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-1.5 px-2 focus:outline-none"
            >
              <option value="ALL">All Properties</option>
              <option value="55791a54-b1a3-459e-bbd5-9073a418b774">Beech Mountain</option>
              <option value="38d9159e-a35d-405e-826e-7381ad3c3197">Uptown Retreat</option>
              <option value="f0fb867d-47cd-47d4-afa6-c4bf226c1768">Downtown (Lincoln)</option>
              <option value="51be6158-268d-4c96-8f0b-9968f544ddfa">Ellsworth Retreat</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Stay Status</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-1.5 px-2 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="CHECKED_OUT">Checked Out</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Payment Status</label>
            <select
              value={selectedPaymentStatus}
              onChange={e => setSelectedPaymentStatus(e.target.value)}
              className="w-full bg-brand-bg border border-brand-blush rounded-lg text-xs py-1.5 px-2 focus:outline-none"
            >
              <option value="ALL">All Payments</option>
              <option value="PAID">Fully Paid</option>
              <option value="UNPAID">Unpaid</option>
              <option value="REFUNDED">Refunded</option>
              <option value="DISPUTED">Disputed</option>
            </select>
          </div>
        </div>
      </Card>

      {/* TABLE */}
      <div className="bg-brand-cream border border-brand-blush rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-brand-blush/25 border-b border-brand-blush text-brand-plum text-xs uppercase tracking-wider font-bold">
                <th className="p-4">Confirmation / Provider</th>
                <th className="p-4">Retreat</th>
                <th className="p-4">Stay Dates</th>
                <th className="p-4">Source Site</th>
                <th className="p-4">Gross Value</th>
                <th className="p-4">Attribution</th>
                <th className="p-4">Payout status</th>
                <th className="p-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-blush/60 text-sm">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-400 italic">
                    No reservations found matching active filters.
                  </td>
                </tr>
              ) : (
                filteredList.map(res => {
                  const site = sites.find(s => s.id === res.siteId);
                  const isOwnerRez = Boolean(res.ownerrezBookingId || res.paymentConfirmationSource === "OWNERREZ");
                  
                  // Property Name Resolver (supports canonical UUIDs)
                  let propName = "Unknown Property";
                  if (res.propertyId === "55791a54-b1a3-459e-bbd5-9073a418b774" || res.propertyId === "prop-004") {
                    propName = "Beech Mountain, NC";
                  } else if (res.propertyId === "38d9159e-a35d-405e-826e-7381ad3c3197" || res.propertyId === "prop-001") {
                    propName = "Uptown St. Augustine";
                  } else if (res.propertyId === "f0fb867d-47cd-47d4-afa6-c4bf226c1768" || res.propertyId === "prop-002") {
                    propName = "Downtown (Lincoln)";
                  } else if (res.propertyId === "51be6158-268d-4c96-8f0b-9968f544ddfa" || res.propertyId === "prop-003") {
                    propName = "Ellsworth, Maine";
                  }

                  // Check reconciliation attribution
                  const attr = attributions.find(a => a.reservationId === res.id || a.reservationId === res.hospitableReservationId);
                  
                  let attrBadge = <Badge type="gray">Unattributed</Badge>;
                  if (attr) {
                    if (attr.status === "ATTRIBUTED") {
                      attrBadge = (
                        <div className="flex flex-col gap-0.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 w-fit">
                            <CheckCircle className="w-3 h-3" />
                            Attributed ({attr.confidenceScore}%)
                          </span>
                          <span className="text-[10px] font-medium text-emerald-700">
                            {attr.attributionMethod === "OWNERREZ_LISTING_SITE" ? "Deterministic (OwnerRez)" : attr.attributionMethod}
                          </span>
                        </div>
                      );
                    } else if (attr.status === "REVIEW_REQUIRED") {
                      attrBadge = (
                        <div className="flex flex-col gap-0.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 w-fit">
                            <AlertTriangle className="w-3 h-3" />
                            Review Required
                          </span>
                          <span className="text-[10px] text-amber-700">Unmapped Source</span>
                        </div>
                      );
                    } else if (attr.status === "REJECTED") {
                      attrBadge = (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          Rejected
                        </span>
                      );
                    }
                  } else if ((res.attributionStatus as string) === "ATTRIBUTED" || (res.attributionStatus as string) === "automatic") {
                    attrBadge = (
                      <div className="flex flex-col gap-0.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 w-fit">
                          <CheckCircle className="w-3 h-3" />
                          Attributed (100%)
                        </span>
                        <span className="text-[10px] font-medium text-emerald-700">Deterministic</span>
                      </div>
                    );
                  } else if (res.attributionStatus === "RECONCILED") {
                    attrBadge = <Badge type="info">Reconciled</Badge>;
                  }

                  let payoutBadge = <Badge type="gray">Estimated</Badge>;
                  if (res.payoutStatus === "ELIGIBLE") {
                    payoutBadge = <Badge type="sage">Eligible</Badge>;
                  } else if (res.payoutStatus === "APPROVED") {
                    payoutBadge = <Badge type="plum">Approved</Badge>;
                  } else if (res.payoutStatus === "ON_HOLD") {
                    payoutBadge = <Badge type="warning">Hold</Badge>;
                  } else if (res.payoutStatus === "PAID") {
                    payoutBadge = <Badge type="success">Paid</Badge>;
                  } else if (res.payoutStatus === "REJECTED") {
                    payoutBadge = <Badge type="danger">Rejected</Badge>;
                  }

                  return (
                    <tr key={res.id} className="hover:bg-brand-blush/10 transition-colors">
                      <td className="p-4 font-bold text-brand-plum">
                        <div className="flex items-center gap-1.5">
                          <span>{res.confirmationCode}</span>
                          {isOwnerRez ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-purple-100 text-purple-800 border border-purple-300 uppercase tracking-wider">
                              OwnerRez
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 text-sky-800 border border-sky-300 uppercase tracking-wider">
                              Hospitable
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-normal mt-0.5">
                          Channel: <span className="uppercase font-semibold text-zinc-500">{res.platform || "direct"}</span>
                          {res.ownerrezBookingId && <span className="ml-1 text-zinc-400">· OR #{res.ownerrezBookingId}</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold">{propName}</div>
                        <span className="text-[10px] text-zinc-400">Nights: {res.nights} · Guests: {res.guests || 1}</span>
                      </td>
                      <td className="p-4">
                        <div className="text-xs">{res.checkInDate ? res.checkInDate.slice(0, 10) : ""}</div>
                        <span className="text-[10px] text-zinc-400">to {res.checkOutDate ? res.checkOutDate.slice(0, 10) : ""}</span>
                      </td>
                      <td className="p-4 text-xs font-medium">
                        {site ? site.siteName : (attr?.siteId ? (sites.find(s => s.id === attr.siteId)?.siteName || "Candidate Site") : <span className="text-zinc-400 italic">Direct Booking</span>)}
                      </td>
                      <td className="p-4 font-bold text-brand-plum">${(res.bookingAmount || res.grossAmount || 0).toFixed(2)}</td>
                      <td className="p-4">{attrBadge}</td>
                      <td className="p-4">{payoutBadge}</td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedRes(res);
                            setAdminNoteInput(res.adminNotes || "");
                          }}
                          className="p-1.5 text-brand-plum hover:bg-brand-blush/40 rounded-lg transition-colors focus:outline-none"
                          title="View stay details"
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

      {/* DETAIL SIDE SLIDE-OVER */}
      <SlideOver
        isOpen={selectedRes !== null}
        onClose={() => {
          setSelectedRes(null);
          setShowReassignPanel(false);
        }}
        title={`Booking Detail: ${selectedRes?.confirmationCode || ""}`}
      >
        {selectedRes && (
          <div className="space-y-6 text-sm">
            {/* Property details */}
            <div className="flex items-center space-x-4 border-b border-brand-blush pb-4">
              <div className="w-16 h-12 rounded bg-zinc-200 overflow-hidden relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    selectedRes.propertyId === "prop-001"
                      ? "https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-updown-img1-scaled.webp"
                      : selectedRes.propertyId === "prop-002"
                      ? "https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-down-img1-scaled.webp"
                      : selectedRes.propertyId === "prop-003"
                      ? "https://hiddenhoneyhomes.com/wp-content/uploads/2026/03/image1.jpg"
                      : "https://hiddenhoneyhomes.com/wp-content/uploads/2026/05/hhh-beeach-img1-scaled.webp"
                  }
                  alt="Property image"
                  className="object-cover w-full h-full"
                />
              </div>
              <div>
                <h4 className="font-bold text-brand-plum">
                  {selectedRes.propertyId === "prop-001"
                    ? "Uptown Retreat"
                    : selectedRes.propertyId === "prop-002"
                    ? "Downtown Retreat"
                    : selectedRes.propertyId === "prop-003"
                    ? "Ellsworth Retreat"
                    : "Beech Mountain Retreat"}
                </h4>
                <p className="text-xs text-zinc-500">Stay dates: {selectedRes.checkInDate ? selectedRes.checkInDate.slice(0, 10) : ""} to {selectedRes.checkOutDate ? selectedRes.checkOutDate.slice(0, 10) : ""}</p>
              </div>
            </div>

            {/* Integration Provider & Booking Channel Breakdown */}
            <div className="bg-brand-cream border border-brand-blush/60 rounded-xl p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-brand-plum">Integration Provider:</span>
                {selectedRes.ownerrezBookingId || selectedRes.paymentConfirmationSource === "OWNERREZ" ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-300">
                    OwnerRez API v2
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
                    Hospitable API v2
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-zinc-600">
                <span>Booking Channel:</span>
                <span className="font-semibold uppercase text-brand-wine">{selectedRes.platform || "direct"}</span>
              </div>
              {selectedRes.ownerrezBookingId && (
                <div className="flex items-center justify-between text-zinc-600 font-mono text-[11px]">
                  <span>OwnerRez Booking ID:</span>
                  <span className="font-bold">#{selectedRes.ownerrezBookingId}</span>
                </div>
              )}
              {selectedRes.quoteId && (
                <div className="flex items-center justify-between text-zinc-600 font-mono text-[11px]">
                  <span>OwnerRez Quote ID:</span>
                  <span>#{selectedRes.quoteId}</span>
                </div>
              )}
            </div>

            {/* Financials & Status Info */}
            <div className="grid grid-cols-2 gap-4 bg-brand-blush/20 p-4 rounded-xl border border-brand-blush/40">
              <div>
                <span className="text-[10px] text-brand-wine block font-bold uppercase tracking-wider">Gross Booking Value</span>
                <span className="text-base font-extrabold text-brand-plum">${(selectedRes.bookingAmount || selectedRes.grossAmount || 0).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-brand-wine block font-bold uppercase tracking-wider">Net HHH Received</span>
                <span className="text-base font-extrabold text-brand-plum">${(selectedRes.amountReceived || 0).toFixed(2)}</span>
              </div>
              <div className="col-span-2 border-t border-brand-blush/40 pt-2">
                <span className="text-[10px] text-brand-wine block font-bold uppercase tracking-wider mb-1">Status Variables</span>
                <div className="flex flex-wrap gap-1.5">
                  <Badge type={selectedRes.reservationStatus === "CANCELLED" ? "danger" : "plum"}>
                    {selectedRes.reservationStatus}
                  </Badge>
                  <Badge type={selectedRes.paymentStatus === "PAID" ? "success" : selectedRes.paymentStatus === "DISPUTED" ? "danger" : "warning"}>
                    Payment: {selectedRes.paymentStatus}
                  </Badge>
                  <Badge type={selectedRes.payoutStatus === "PAID" ? "success" : selectedRes.payoutStatus === "ON_HOLD" ? "warning" : "gray"}>
                    Payout: {selectedRes.payoutStatus}
                  </Badge>
                </div>
              </div>
            </div>


            {/* Reconciliation & Attribution Details */}
            {(() => {
              const resAttr = attributions.find(a => a.reservationId === selectedRes.id || a.reservationId === selectedRes.hospitableReservationId);
              const candidatePartner = resAttr?.partnerId ? partners.find(p => p.id === resAttr.partnerId) : null;
              const candidateSite = resAttr?.siteId ? sites.find(s => s.id === resAttr.siteId) : null;

              return (
                <div className="space-y-3 border-t border-brand-blush pt-4">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold uppercase tracking-widest text-brand-wine">Reconciliation & Attribution</h5>
                    {resAttr && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        resAttr.status === "ATTRIBUTED" ? "bg-emerald-100 text-emerald-800" :
                        resAttr.status === "REVIEW_REQUIRED" ? "bg-amber-100 text-amber-800" :
                        resAttr.status === "REJECTED" ? "bg-rose-100 text-rose-800" : "bg-zinc-100 text-zinc-600"
                      }`}>
                        {resAttr.status} ({resAttr.confidenceScore}%)
                      </span>
                    )}
                  </div>

                  {resAttr ? (
                    <div className="space-y-3 bg-brand-cream border border-brand-blush rounded-xl p-4 text-xs">
                      <div className="grid grid-cols-2 gap-2 text-zinc-600 border-b border-brand-blush/40 pb-3">
                        <div>
                          <span className="font-semibold text-brand-plum block">Method:</span>
                          <span className="font-mono text-[11px]">{resAttr.attributionMethod}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-brand-plum block">Confidence:</span>
                          <span className="font-bold text-brand-wine">{resAttr.confidenceScore}%</span>
                        </div>
                        <div>
                          <span className="font-semibold text-brand-plum block">Candidate Partner:</span>
                          <span>{candidatePartner?.businessName || candidatePartner?.contactName || "Unassigned"}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-brand-plum block">Candidate Site:</span>
                          <span>{candidateSite?.siteName || "Unassigned"}</span>
                        </div>
                      </div>

                      {/* Matched Signals */}
                      <div>
                        <span className="font-semibold text-brand-plum block text-[10px] uppercase mb-1">Matched Signals:</span>
                        <div className="flex flex-wrap gap-1">
                          {resAttr.matchedSignals.map((sig, idx) => (
                            <span key={idx} className="bg-brand-blush/50 text-brand-plum text-[10px] font-mono px-1.5 py-0.5 rounded">
                              {sig}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Competing Candidates (if any) */}
                      {resAttr.competingCandidates && resAttr.competingCandidates.length > 1 && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                          <span className="font-bold text-[11px] block flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            Multi-Partner Click Collision ({resAttr.competingCandidates.length} competing sources)
                          </span>
                          <div className="space-y-1 text-[10px]">
                            {resAttr.competingCandidates.map((cc, i) => (
                              <div key={i} className="flex justify-between font-mono">
                                <span>{sites.find(s => s.id === cc.siteId)?.siteName || cc.siteId}</span>
                                <span>{cc.elapsedHours}h before booking</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Review Actions */}
                      {resAttr.status === "REVIEW_REQUIRED" && (
                        <div className="pt-2 border-t border-brand-blush/40 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleAttributionReview(resAttr.id, "REJECTED")}
                            className="px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors"
                          >
                            Reject Attribution
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAttributionReview(resAttr.id, "ATTRIBUTED")}
                            className="px-3 py-1.5 text-xs font-bold bg-brand-plum text-brand-cream hover:bg-brand-wine rounded-lg shadow-sm transition-all"
                          >
                            Confirm & Approve Attribution
                          </button>
                        </div>
                      )}

                      {resAttr.status === "ATTRIBUTED" && (
                        <div className="text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Approved by {resAttr.reviewedBy || "Super Admin"}</span>
                        </div>
                      )}
                    </div>
                  ) : selectedRes.attributionStatus === "UNATTRIBUTED" ? (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-3">
                      <p className="flex items-center gap-1.5">
                        <AlertCircle size={14} />
                        This direct booking has not been matched with any partner click in the last 72 hours.
                      </p>
                      <button
                        onClick={() => {
                          setReassignPartnerId(partners[0]?.id || "");
                          const firstSite = sites.find(s => s.partnerId === partners[0]?.id);
                          setReassignSiteId(firstSite?.id || "");
                          setShowReassignPanel(true);
                        }}
                        className="flex items-center space-x-1 bg-brand-plum text-brand-cream px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-brand-wine transition-all"
                      >
                        <LinkIcon size={12} />
                        <span>Manually Attribute Now</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-xs text-zinc-600 bg-brand-cream border border-brand-blush rounded-lg p-3">
                      <div>
                        <span className="font-semibold text-brand-plum">Partner Owner:</span>{" "}
                        {partners.find(p => p.id === selectedRes.partnerId)?.contactName || "Unknown"}
                      </div>
                      <div>
                        <span className="font-semibold text-brand-plum">Source Website:</span>{" "}
                        {sites.find(s => s.id === selectedRes.siteId)?.siteName || "Unknown"}
                      </div>
                      <div>
                        <span className="font-semibold text-brand-plum">Attribution Match:</span>{" "}
                        {selectedRes.attributionSource || "Unknown"}
                      </div>
                      <button
                        onClick={() => {
                          setReassignPartnerId(selectedRes.partnerId || partners[0]?.id || "");
                          setReassignSiteId(selectedRes.siteId || "");
                          setShowReassignPanel(true);
                        }}
                        className="text-brand-wine hover:underline font-semibold mt-2 block"
                      >
                        Reassign / Edit Attribution →
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Manual Reconciliation Sub-panel */}
            {showReassignPanel && (
              <form onSubmit={handleReassignSubmit} className="p-4 bg-brand-blush/30 border border-brand-blush rounded-xl space-y-4 animate-scale-up">
                <h6 className="font-bold text-brand-plum text-xs">Configure Referral Attribution</h6>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Select Partner</label>
                    <select
                      value={reassignPartnerId}
                      onChange={e => {
                        setReassignPartnerId(e.target.value);
                        const firstSite = sites.find(s => s.partnerId === e.target.value);
                        setReassignSiteId(firstSite?.id || "");
                      }}
                      className="w-full bg-brand-cream border border-brand-blush rounded-lg text-xs py-1.5 px-2 focus:outline-none"
                    >
                      {partners.map(p => (
                        <option key={p.id} value={p.id}>{p.businessName} ({p.contactName})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-brand-wine uppercase mb-1">Select Referrer Site</label>
                    <select
                      value={reassignSiteId}
                      onChange={e => setReassignSiteId(e.target.value)}
                      className="w-full bg-brand-cream border border-brand-blush rounded-lg text-xs py-1.5 px-2 focus:outline-none"
                    >
                      {sites
                        .filter(s => s.partnerId === reassignPartnerId)
                        .map(s => (
                          <option key={s.id} value={s.id}>{s.siteName}</option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="flex space-x-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReassignPanel(false)}
                    className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-brand-plum text-brand-cream px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-brand-wine transition-all"
                  >
                    Confirm Attribution
                  </button>
                </div>
              </form>
            )}

            {/* Payout Hold toggling */}
            {selectedRes.attributionStatus !== "UNATTRIBUTED" && (
              <div className="border-t border-brand-blush pt-4 space-y-2">
                <h5 className="text-xs font-bold uppercase tracking-widest text-brand-wine font-sans">Payout Security Lock</h5>
                <div className="flex items-center justify-between p-3 bg-brand-cream border border-brand-blush rounded-lg">
                  <div className="flex items-start space-x-2">
                    <Info size={14} className="text-brand-plum mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-brand-plum">
                        {selectedRes.payoutStatus === "ON_HOLD" ? "Payout Locked" : "Payout Active"}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {selectedRes.payoutStatus === "ON_HOLD" 
                          ? "This payout is locked and won't enter the approval queue."
                          : "This payout is active and will proceed to queue when check-in completes."}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleHold(selectedRes.id)}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors focus:outline-none ${
                      selectedRes.payoutStatus === "ON_HOLD"
                        ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {selectedRes.payoutStatus === "ON_HOLD" ? "Release Hold" : "Place Hold"}
                  </button>
                </div>
              </div>
            )}

            {/* Notes Section */}
            <div className="border-t border-brand-blush pt-4 space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-widest text-brand-wine">Internal Admin Notes</h5>
              {selectedRes.adminNotes ? (
                <div className="p-3 bg-brand-blush/10 rounded-lg text-xs italic border border-brand-blush/30">
                  "{selectedRes.adminNotes}"
                </div>
              ) : (
                <p className="text-xs text-zinc-400 italic">No notes recorded.</p>
              )}
              <form onSubmit={handleSaveNote} className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Add a new internal note..."
                  value={adminNoteInput}
                  onChange={e => setAdminNoteInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-brand-bg border border-brand-blush rounded-lg text-xs focus:outline-none"
                />
                <button
                  type="submit"
                  className="bg-brand-blush text-brand-plum hover:bg-brand-blush/80 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-brand-blush/60"
                >
                  Save Note
                </button>
              </form>
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}

export default function BookingsList() {
  return (
    <Suspense fallback={<div className="text-center py-10 text-sm text-zinc-400">Loading bookings dashboard...</div>}>
      <BookingsListContent />
    </Suspense>
  );
}
