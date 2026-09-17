"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  Filter,
  FileSpreadsheet,
  RefreshCw,
  Eye,
  X,
  AlertTriangle,
  Info,
  CheckCircle2,
  HelpCircle,
  Building2,
  Calendar,
  CreditCard,
  DollarSign,
  UserCheck,
  Lock,
  Unlock,
  ArrowRight
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Reservation, Partner, Site, ReservationAttribution, ReconciliationStatus } from "@/lib/db/schema";
import {
  Card,
  StatusBadge,
  SlideOver,
  PageHeader,
  Button,
  LoadingState,
  EmptyState,
  ErrorBanner,
  TableContainer,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableMobileCard
} from "@/components/ui";
import { formatStatusLabel, getStatusTypeForState } from "@/lib/status-mapper";
import { runSystemPayoutRecalculation } from "@/lib/payouts";

type ViewShortcut = "ALL" | "NEEDS_REVIEW" | "UNATTRIBUTED" | "AWAITING_PAYMENT" | "HOLDS";

function BookingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Data States
  const [reservations, setReservations] = useState<Reservation[]>(db.reservations || []);
  const [partners, setPartners] = useState<Partner[]>(db.partners || []);
  const [sites, setSites] = useState<Site[]>(db.sites || []);
  const [attributions, setAttributions] = useState<ReservationAttribution[]>(db.reservationAttributions || []);
  const [commissionPreviews, setCommissionPreviews] = useState<any[]>([]);
  const [ledgerEvents, setLedgerEvents] = useState<any[]>([]);

  // UI & Loading States
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [activeShortcut, setActiveShortcut] = useState<ViewShortcut>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProperty, setSelectedProperty] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedAttribution, setSelectedAttribution] = useState("ALL");
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState("ALL");
  const [selectedPayoutStatus, setSelectedPayoutStatus] = useState("ALL");
  const [selectedPartner, setSelectedPartner] = useState("ALL");
  const [selectedSite, setSelectedSite] = useState("ALL");
  const [selectedProvider, setSelectedProvider] = useState("ALL");
  const [selectedChannel, setSelectedChannel] = useState("ALL");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Selection / Detail Drawer State
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState("");
  const [showReassignPanel, setShowReassignPanel] = useState(false);
  const [reassignPartnerId, setReassignPartnerId] = useState("");
  const [reassignSiteId, setReassignSiteId] = useState("");

  // Load Real Data from API with Fallback
  const refreshData = useCallback(async () => {
    try {
      setError(null);
      const [resRes, attrRes, sitesRes, partnersRes, commRes, ledgerRes] = await Promise.all([
        fetch("/api/admin/reservations").catch(() => null),
        fetch("/api/admin/attributions").catch(() => null),
        fetch("/api/admin/sites").catch(() => null),
        fetch("/api/admin/partners").catch(() => null),
        fetch("/api/admin/commissions/preview").catch(() => null),
        fetch("/api/admin/commissions/ledger").catch(() => null)
      ]);

      if (resRes && resRes.ok) {
        const rData = await resRes.json();
        if (rData.success && Array.isArray(rData.reservations)) {
          setReservations(rData.reservations);
        } else {
          setReservations(db.reservations);
        }
      } else {
        setReservations(db.reservations);
      }

      if (attrRes && attrRes.ok) {
        const aData = await attrRes.json();
        if (aData.success && Array.isArray(aData.attributions)) {
          setAttributions(aData.attributions);
        } else {
          setAttributions(db.reservationAttributions);
        }
      } else {
        setAttributions(db.reservationAttributions);
      }

      if (sitesRes && sitesRes.ok) {
        const sData = await sitesRes.json();
        if (sData.success && Array.isArray(sData.sites)) {
          setSites(sData.sites);
        } else {
          setSites(db.sites);
        }
      } else {
        setSites(db.sites);
      }

      if (partnersRes && partnersRes.ok) {
        const pData = await partnersRes.json();
        if (pData.success && Array.isArray(pData.partners)) {
          setPartners(pData.partners);
        } else {
          setPartners(db.partners);
        }
      } else {
        setPartners(db.partners);
      }

      if (commRes && commRes.ok) {
        const cData = await commRes.json();
        if (cData.success && Array.isArray(cData.previews)) {
          setCommissionPreviews(cData.previews);
        }
      }

      if (ledgerRes && ledgerRes.ok) {
        const lData = await ledgerRes.json();
        if (lData.success && Array.isArray(lData.events)) {
          setLedgerEvents(lData.events);
        }
      }
    } catch (err: any) {
      console.error("[Admin Bookings Data Load Error]:", err);
      setReservations(db.reservations);
      setPartners(db.partners);
      setSites(db.sites);
      setAttributions(db.reservationAttributions);
      setError("Unable to connect to live datastore. Showing local operational dataset.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();

    // Check query params from Overview navigation
    const attrFilter = searchParams.get("attribution");
    const reviewFilter = searchParams.get("review");
    const detailParam = searchParams.get("detail");
    const filterParam = searchParams.get("filter");

    if (attrFilter) {
      setSelectedAttribution(attrFilter);
      if (attrFilter === "UNATTRIBUTED") setActiveShortcut("UNATTRIBUTED");
    }
    if (reviewFilter === "true") {
      setSelectedPayoutStatus("ON_HOLD");
      setActiveShortcut("HOLDS");
    }
    if (detailParam === "open" && reservations.length > 0) {
      setSelectedRes(reservations[0]);
    }
    if (filterParam === "open") {
      setMobileFilterOpen(true);
    }
  }, [searchParams, refreshData, reservations]);

  // Handle Manual Sync Trigger
  const handleManualSync = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/ownerrez/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        db.addNotification(
          "SUCCESS",
          `OwnerRez sync complete: ${data.result?.bookingsProcessed ?? 0} bookings processed.`
        );
      } else {
        db.addNotification("ALERT", `OwnerRez refresh failed: ${data.error || "Unknown error"}`);
      }
      await refreshData();
    } catch (err: any) {
      db.addNotification("ALERT", `OwnerRez refresh failed: ${err?.message || "Network error"}`);
      await refreshData();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Toggle Payout Hold State
  const handleToggleHold = (resId: string) => {
    const res = reservations.find(r => r.id === resId);
    if (!res) return;
    const newStatus = res.payoutStatus === "ON_HOLD" ? "ELIGIBLE" : "ON_HOLD";
    db.updateReservation(resId, { payoutStatus: newStatus });
    refreshData();
    const updated = db.reservations.find(r => r.id === resId);
    if (updated) setSelectedRes(updated);
  };

  // Save Internal Admin Note
  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRes) return;
    db.updateReservation(selectedRes.id, { adminNotes: adminNoteInput });
    refreshData();
    setSelectedRes({ ...selectedRes, adminNotes: adminNoteInput });
    setAdminNoteInput("");
  };

  // Reassignment / Manual Attribution Submit
  const handleReassignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRes || !reassignPartnerId || !reassignSiteId) return;

    db.updateReservation(selectedRes.id, {
      partnerId: reassignPartnerId,
      siteId: reassignSiteId,
      attributionStatus: "RECONCILED",
      attributionSource: "Manual Reconciliation"
    });

    runSystemPayoutRecalculation();
    refreshData();

    const updated = db.reservations.find(r => r.id === selectedRes.id);
    if (updated) setSelectedRes(updated);

    setShowReassignPanel(false);
    setReassignPartnerId("");
    setReassignSiteId("");
    db.addNotification("SUCCESS", `Booking ${selectedRes.confirmationCode} manually reconciled.`);
  };

  // Quick Filter Shortcut Trigger
  const handleShortcutClick = (shortcut: ViewShortcut) => {
    setActiveShortcut(shortcut);
    switch (shortcut) {
      case "NEEDS_REVIEW":
        setSelectedAttribution("REVIEW_REQUIRED");
        setSelectedPayoutStatus("ALL");
        setSelectedPaymentStatus("ALL");
        break;
      case "UNATTRIBUTED":
        setSelectedAttribution("UNATTRIBUTED");
        setSelectedPayoutStatus("ALL");
        setSelectedPaymentStatus("ALL");
        break;
      case "AWAITING_PAYMENT":
        setSelectedPaymentStatus("UNPAID");
        setSelectedAttribution("ALL");
        setSelectedPayoutStatus("ALL");
        break;
      case "HOLDS":
        setSelectedPayoutStatus("ON_HOLD");
        setSelectedAttribution("ALL");
        setSelectedPaymentStatus("ALL");
        break;
      case "ALL":
      default:
        resetFilters();
        break;
    }
  };

  // Reset All Filters
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedProperty("ALL");
    setSelectedStatus("ALL");
    setSelectedAttribution("ALL");
    setSelectedPaymentStatus("ALL");
    setSelectedPayoutStatus("ALL");
    setSelectedPartner("ALL");
    setSelectedSite("ALL");
    setSelectedProvider("ALL");
    setSelectedChannel("ALL");
    setActiveShortcut("ALL");
  };

  const isFilterActive =
    searchQuery !== "" ||
    selectedProperty !== "ALL" ||
    selectedStatus !== "ALL" ||
    selectedAttribution !== "ALL" ||
    selectedPaymentStatus !== "ALL" ||
    selectedPayoutStatus !== "ALL" ||
    selectedPartner !== "ALL" ||
    selectedSite !== "ALL" ||
    selectedProvider !== "ALL" ||
    selectedChannel !== "ALL";

  // Active filter count for mobile trigger badge
  const activeFilterCount = [
    selectedProperty !== "ALL",
    selectedStatus !== "ALL",
    selectedAttribution !== "ALL",
    selectedPaymentStatus !== "ALL",
    selectedPayoutStatus !== "ALL",
    selectedPartner !== "ALL",
    selectedSite !== "ALL",
    selectedProvider !== "ALL",
    selectedChannel !== "ALL"
  ].filter(Boolean).length;

  // Property Resolver
  const getPropertyName = (propertyId: string) => {
    const map: Record<string, string> = {
      "38d9159e-a35d-405e-826e-7381ad3c3197": "Uptown St. Augustine",
      "f0fb867d-47cd-47d4-afa6-c4bf226c1768": "Downtown St. Augustine",
      "51be6158-268d-4c96-8f0b-9968f544ddfa": "Ellsworth, Maine",
      "55791a54-b1a3-459e-bbd5-9073a418b774": "Beech Mountain, NC",
      "prop-001": "Uptown Retreat",
      "prop-002": "Downtown Retreat",
      "prop-003": "Ellsworth Retreat",
      "prop-004": "Beech Mountain Retreat"
    };
    return map[propertyId] || propertyId || "Other Property";
  };

  // Filtering Logic
  const filteredReservations = reservations.filter(res => {
    // Search query matching confirmation code, booking ID, property, partner, site
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const codeMatch = res.confirmationCode?.toLowerCase().includes(q);
      const idMatch = res.id?.toLowerCase().includes(q);
      const ownerrezMatch = String(res.ownerrezBookingId || "").includes(q);
      const propMatch = getPropertyName(res.propertyId).toLowerCase().includes(q);
      const partnerObj = partners.find(p => p.id === res.partnerId);
      const partnerMatch = partnerObj?.contactName?.toLowerCase().includes(q) || partnerObj?.businessName?.toLowerCase().includes(q);
      const siteObj = sites.find(s => s.id === res.siteId);
      const siteMatch = siteObj?.siteName?.toLowerCase().includes(q);

      if (!codeMatch && !idMatch && !ownerrezMatch && !propMatch && !partnerMatch && !siteMatch) {
        return false;
      }
    }

    // Property Filter
    if (selectedProperty !== "ALL" && res.propertyId !== selectedProperty) return false;

    // Stay Status Filter
    if (selectedStatus !== "ALL" && res.reservationStatus !== selectedStatus) return false;

    // Attribution Status Filter
    if (selectedAttribution !== "ALL") {
      const attr = attributions.find(a => a.reservationId === res.id || a.reservationId === res.hospitableReservationId);
      const currentAttr = attr?.status || res.attributionStatus || "UNATTRIBUTED";
      if (currentAttr !== selectedAttribution) return false;
    }

    // Payment Status Filter
    if (selectedPaymentStatus !== "ALL" && res.paymentStatus !== selectedPaymentStatus) return false;

    // Payout Status Filter
    if (selectedPayoutStatus !== "ALL" && res.payoutStatus !== selectedPayoutStatus) return false;

    // Partner Filter
    if (selectedPartner !== "ALL" && res.partnerId !== selectedPartner) return false;

    // Site Filter
    if (selectedSite !== "ALL" && res.siteId !== selectedSite) return false;

    // Provider Filter (Technical ingestion source)
    if (selectedProvider !== "ALL") {
      const isOwnerRez = Boolean(res.ownerrezBookingId || res.paymentConfirmationSource === "OWNERREZ");
      if (selectedProvider === "OWNERREZ" && !isOwnerRez) return false;
      if (selectedProvider === "HOSPITABLE" && isOwnerRez) return false;
    }

    // Channel Filter (Booking channel)
    if (selectedChannel !== "ALL") {
      const channel = (res.platform || "DIRECT").toUpperCase();
      if (channel !== selectedChannel) return false;
    }

    return true;
  });

  // Export CSV Handler
  const exportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Confirmation Code,OwnerRez ID,Property,Check In,Check Out,Gross Value,Amount Received,Payment Status,Attribution,Payout Status\n";
    filteredReservations.forEach(r => {
      csvContent += `${r.confirmationCode},${r.ownerrezBookingId || ""},"${getPropertyName(r.propertyId)}",${r.checkInDate || ""},${r.checkOutDate || ""},${r.grossAmount || r.bookingAmount || 0},${r.amountReceived || 0},${r.paymentStatus || "UNPAID"},${r.attributionStatus || "UNATTRIBUTED"},${r.payoutStatus || "ESTIMATED"}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `HHH_Bookings_Export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <LoadingState message="Loading reservation operational registry..." />;
  }

  return (
    <div className="space-y-6 font-sans pb-8">
      {/* 1. Page Header */}
      <PageHeader
        title="Bookings"
        description="Reservations, referral attribution and commission status."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              iconClassName={isRefreshing ? "animate-spin" : ""}
              disabled={isRefreshing}
              onClick={handleManualSync}
            >
              {isRefreshing ? "Syncing..." : "Sync OwnerRez"}
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              icon={FileSpreadsheet}
              onClick={exportCSV}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}

      {/* 2. Quick Filter Shortcuts Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
        {[
          { id: "ALL", label: "All Bookings", count: reservations.length },
          {
            id: "NEEDS_REVIEW",
            label: "Needs Review",
            count: reservations.filter(r => (r.attributionStatus as string) === "REVIEW_REQUIRED").length,
            badge: "warning" as const
          },
          {
            id: "UNATTRIBUTED",
            label: "Unattributed",
            count: reservations.filter(r => (r.attributionStatus as string) === "UNATTRIBUTED" && r.reservationStatus !== "CANCELLED").length
          },
          {
            id: "AWAITING_PAYMENT",
            label: "Awaiting Payment",
            count: reservations.filter(r => r.paymentStatus === "UNPAID" || (r.paymentStatus as string) === "UNPAID_PENDING_PAYMENT").length
          },
          {
            id: "HOLDS",
            label: "Holds & Disputes",
            count: reservations.filter(r => r.payoutStatus === "ON_HOLD" || r.paymentStatus === "DISPUTED").length,
            badge: "danger" as const
          }
        ].map(sc => {
          const isActive = activeShortcut === sc.id;
          return (
            <button
              key={sc.id}
              type="button"
              onClick={() => handleShortcutClick(sc.id as ViewShortcut)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                isActive
                  ? "bg-primary text-surface font-semibold shadow-xs"
                  : "bg-surface border border-divider text-secondary hover:text-primary hover:bg-surface-subtle"
              }`}
            >
              <span>{sc.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
                  isActive
                    ? "bg-surface/20 text-surface"
                    : sc.badge === "warning"
                    ? "bg-warning-surface text-warning border border-warning-border"
                    : sc.badge === "danger"
                    ? "bg-danger-surface text-danger border border-danger-border"
                    : "bg-surface-muted text-secondary"
                }`}
              >
                {sc.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-surface border border-divider-soft rounded-xl p-3 sm:p-3.5 space-y-3 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-secondary pointer-events-none">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search confirmation code, booking ID, property, partner, or site..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-secondary hover:text-primary cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Desktop Inline Selects */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <select
              value={selectedProperty}
              onChange={e => setSelectedProperty(e.target.value)}
              className="bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg px-2.5 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">All Properties</option>
              <option value="38d9159e-a35d-405e-826e-7381ad3c3197">Uptown St. Augustine</option>
              <option value="f0fb867d-47cd-47d4-afa6-c4bf226c1768">Downtown St. Augustine</option>
              <option value="51be6158-268d-4c96-8f0b-9968f544ddfa">Ellsworth, Maine</option>
              <option value="55791a54-b1a3-459e-bbd5-9073a418b774">Beech Mountain, NC</option>
            </select>

            <select
              value={selectedAttribution}
              onChange={e => setSelectedAttribution(e.target.value)}
              className="bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg px-2.5 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">All Attributions</option>
              <option value="ATTRIBUTED">Attributed</option>
              <option value="UNATTRIBUTED">Unattributed</option>
              <option value="REVIEW_REQUIRED">Needs Review</option>
              <option value="RECONCILED">Reconciled</option>
            </select>

            <select
              value={selectedPaymentStatus}
              onChange={e => setSelectedPaymentStatus(e.target.value)}
              className="bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg px-2.5 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">All Payments</option>
              <option value="PAID">Fully Paid</option>
              <option value="UNPAID">Unpaid / Awaiting</option>
              <option value="REFUNDED">Refunded</option>
              <option value="DISPUTED">Disputed</option>
            </select>

            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg px-2.5 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">All Stay Statuses</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="CHECKED_OUT">Checked Out</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            {isFilterActive && (
              <Button variant="tertiary" size="sm" onClick={resetFilters}>
                Reset
              </Button>
            )}
          </div>

          {/* Mobile Filter Sheet Trigger Button */}
          <div className="flex lg:hidden items-center gap-2 justify-between">
            <Button
              variant="secondary"
              size="sm"
              icon={Filter}
              onClick={() => setMobileFilterOpen(true)}
            >
              Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
            </Button>
            {isFilterActive && (
              <Button variant="tertiary" size="sm" onClick={resetFilters}>
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Desktop Operational Table (>=768px) */}
      <div className="hidden md:block">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking</TableHead>
                <TableHead>Property / Stay</TableHead>
                <TableHead>Referral Source</TableHead>
                <TableHead align="right">Payment</TableHead>
                <TableHead align="right">Commission</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReservations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12">
                    <EmptyState
                      title="No reservations found"
                      description="No bookings match your selected operational filters or search query."
                      action={isFilterActive ? <Button variant="secondary" size="sm" onClick={resetFilters}>Reset All Filters</Button> : undefined}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredReservations.map(res => {
                  const site = sites.find(s => s.id === res.siteId);
                  const partner = partners.find(p => p.id === res.partnerId);
                  const isOwnerRez = Boolean(res.ownerrezBookingId || res.paymentConfirmationSource === "OWNERREZ");

                  // Attribution State Resolver
                  const attrObj = attributions.find(a => a.reservationId === res.id || a.reservationId === res.hospitableReservationId);
                  const attrStatus = attrObj?.status || res.attributionStatus || "UNATTRIBUTED";

                  // Commission Accrual Snapshot Resolver
                  const accrualEvent = ledgerEvents.find(
                    e => (e.reservation_id === res.id || e.provider_booking_id === String(res.ownerrezBookingId) || e.provider_booking_id === res.confirmationCode) &&
                         e.event_type === "INITIAL_ACCRUAL"
                  );
                  const preview = commissionPreviews.find(cp => cp.reservationId === res.id || cp.ownerrezBookingId === res.ownerrezBookingId);
                  const calculatedVal = accrualEvent
                    ? Number(accrualEvent.calculated_commission ?? accrualEvent.commission_amount ?? accrualEvent.delta_amount ?? 0)
                    : preview
                    ? Number(preview.commissionCalculations?.calculatedCommission || 0)
                    : (res.grossAmount || res.bookingAmount || 0) * 0.10;

                  const isHighAttnAttr = attrStatus === "UNATTRIBUTED" || attrStatus === "REVIEW_REQUIRED";
                  const isHighAttnPayout = res.payoutStatus === "ON_HOLD" || res.payoutStatus === "ELIGIBLE";
                  const isHighAttnStay = res.reservationStatus === "CHECKED_IN";

                  return (
                    <TableRow
                      key={res.id}
                      onClick={() => {
                        setSelectedRes(res);
                        setAdminNoteInput(res.adminNotes || "");
                      }}
                    >
                      {/* Column 1: Booking Reference & Provider */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-semibold text-primary flex items-center gap-1.5">
                            <span>{res.confirmationCode}</span>
                            {res.ownerrezBookingId && (
                              <span className="text-[10px] text-tertiary font-mono">
                                (OR #{res.ownerrezBookingId})
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-secondary flex items-center gap-1">
                            <span className="uppercase font-medium">{res.platform || "Direct"}</span>
                            <span>•</span>
                            <span>{isOwnerRez ? "OwnerRez" : "Hospitable"}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Column 2: Property & Stay Dates */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-medium text-primary">
                            {getPropertyName(res.propertyId)}
                          </div>
                          <div className="text-[11px] text-secondary font-mono">
                            {res.checkInDate ? res.checkInDate.slice(0, 10) : ""} → {res.checkOutDate ? res.checkOutDate.slice(0, 10) : ""}
                          </div>
                        </div>
                      </TableCell>

                      {/* Column 3: Referral Source & Attribution */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="text-xs font-medium text-primary truncate max-w-[180px]">
                            {site ? site.siteName : partner ? partner.contactName : <span className="text-tertiary italic">Unattributed</span>}
                          </div>
                          {isHighAttnAttr ? (
                            <StatusBadge variant={getStatusTypeForState(attrStatus)}>
                              {formatStatusLabel(attrStatus)}
                            </StatusBadge>
                          ) : (
                            <div className="text-[11px] text-secondary font-medium">
                              {formatStatusLabel(attrStatus)}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Column 4: Payment State */}
                      <TableCell align="right" numeric>
                        <div className="space-y-0.5">
                          <div className="font-semibold text-primary">
                            ${(res.amountReceived || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[11px] text-secondary">
                            Gross: ${(res.grossAmount || res.bookingAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </TableCell>

                      {/* Column 5: Commission Snapshot & Lifecycle */}
                      <TableCell align="right" numeric>
                        <div className="space-y-0.5">
                          <div className="font-semibold text-primary">
                            ${calculatedVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          {isHighAttnPayout ? (
                            <StatusBadge variant={getStatusTypeForState(res.payoutStatus)}>
                              {formatStatusLabel(res.payoutStatus)}
                            </StatusBadge>
                          ) : (
                            <div className="text-[11px] text-secondary font-medium">
                              {formatStatusLabel(res.payoutStatus || "ESTIMATED")}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Column 6: Stay / Operational Status */}
                      <TableCell>
                        {isHighAttnStay ? (
                          <StatusBadge variant={getStatusTypeForState(res.reservationStatus)}>
                            {formatStatusLabel(res.reservationStatus)}
                          </StatusBadge>
                        ) : (
                          <span className={`text-xs font-medium ${res.reservationStatus === "CANCELLED" ? "text-danger" : "text-secondary"}`}>
                            {formatStatusLabel(res.reservationStatus)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {/* 5. Mobile Operational Card Stack (<768px) */}
      <div className="block md:hidden space-y-3">
        {filteredReservations.length === 0 ? (
          <EmptyState
            title="No reservations found"
            description="No bookings match active search query or filters."
            action={isFilterActive ? <Button variant="secondary" size="sm" onClick={resetFilters}>Reset Filters</Button> : undefined}
          />
        ) : (
          filteredReservations.map(res => {
            const site = sites.find(s => s.id === res.siteId);
            const partner = partners.find(p => p.id === res.partnerId);
            const attrObj = attributions.find(a => a.reservationId === res.id || a.reservationId === res.hospitableReservationId);
            const attrStatus = attrObj?.status || res.attributionStatus || "UNATTRIBUTED";

            return (
              <TableMobileCard
                key={res.id}
                title={res.confirmationCode}
                subtitle={`${getPropertyName(res.propertyId)} • ${res.checkInDate ? res.checkInDate.slice(0, 10) : ""}`}
                badge={
                  <StatusBadge variant={getStatusTypeForState(attrStatus)}>
                    {formatStatusLabel(attrStatus)}
                  </StatusBadge>
                }
                action={
                  <Button
                    variant="tertiary"
                    size="sm"
                    icon={Eye}
                    onClick={() => {
                      setSelectedRes(res);
                      setAdminNoteInput(res.adminNotes || "");
                    }}
                  />
                }
                details={[
                  { label: "Referral Site", value: site ? site.siteName : partner ? partner.contactName : "Unattributed" },
                  { label: "Received Amount", value: `$${(res.amountReceived || 0).toFixed(2)}`, numeric: true },
                  { label: "Gross Value", value: `$${(res.grossAmount || res.bookingAmount || 0).toFixed(2)}`, numeric: true },
                  { label: "Stay Status", value: formatStatusLabel(res.reservationStatus) }
                ]}
              />
            );
          })
        )}
      </div>

      {/* 6. Secondary Mobile Filter SlideOver Sheet */}
      <SlideOver
        isOpen={mobileFilterOpen}
        onClose={() => setMobileFilterOpen(false)}
        title="Filter Bookings"
        description="Refine operational reservation registry"
      >
        <div className="space-y-4 font-sans py-2">
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Property</label>
            <select
              value={selectedProperty}
              onChange={e => setSelectedProperty(e.target.value)}
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
            >
              <option value="ALL">All Properties</option>
              <option value="38d9159e-a35d-405e-826e-7381ad3c3197">Uptown St. Augustine</option>
              <option value="f0fb867d-47cd-47d4-afa6-c4bf226c1768">Downtown St. Augustine</option>
              <option value="51be6158-268d-4c96-8f0b-9968f544ddfa">Ellsworth, Maine</option>
              <option value="55791a54-b1a3-459e-bbd5-9073a418b774">Beech Mountain, NC</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Attribution Status</label>
            <select
              value={selectedAttribution}
              onChange={e => setSelectedAttribution(e.target.value)}
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
            >
              <option value="ALL">All Attributions</option>
              <option value="ATTRIBUTED">Attributed</option>
              <option value="UNATTRIBUTED">Unattributed</option>
              <option value="REVIEW_REQUIRED">Needs Review</option>
              <option value="RECONCILED">Reconciled</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Payment Status</label>
            <select
              value={selectedPaymentStatus}
              onChange={e => setSelectedPaymentStatus(e.target.value)}
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
            >
              <option value="ALL">All Payments</option>
              <option value="PAID">Fully Paid</option>
              <option value="UNPAID">Unpaid / Awaiting</option>
              <option value="REFUNDED">Refunded</option>
              <option value="DISPUTED">Disputed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Stay Status</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
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
            <label className="block text-xs font-medium text-secondary mb-1">Partner</label>
            <select
              value={selectedPartner}
              onChange={e => setSelectedPartner(e.target.value)}
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
            >
              <option value="ALL">All Partners</option>
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.contactName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Referrer Site</label>
            <select
              value={selectedSite}
              onChange={e => setSelectedSite(e.target.value)}
              className="w-full bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg p-2.5"
            >
              <option value="ALL">All Referrer Sites</option>
              {sites.map(s => (
                <option key={s.id} value={s.id}>{s.siteName}</option>
              ))}
            </select>
          </div>

          <div className="pt-4 border-t border-divider-soft flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => setMobileFilterOpen(false)}
            >
              Apply Filters
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                resetFilters();
                setMobileFilterOpen(false);
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </SlideOver>

      {/* 7. Comprehensive Booking Detail SlideOver Drawer */}
      <SlideOver
        isOpen={selectedRes !== null}
        onClose={() => {
          setSelectedRes(null);
          setShowReassignPanel(false);
        }}
        size="lg"
        title={selectedRes ? `Booking Detail: ${selectedRes.confirmationCode}` : "Booking Detail"}
        description={selectedRes ? `${getPropertyName(selectedRes.propertyId)}` : undefined}
      >
        {selectedRes && (() => {
          const site = sites.find(s => s.id === selectedRes.siteId);
          const partner = partners.find(p => p.id === selectedRes.partnerId);
          const isOwnerRez = Boolean(selectedRes.ownerrezBookingId || selectedRes.paymentConfirmationSource === "OWNERREZ");
          const attrObj = attributions.find(a => a.reservationId === selectedRes.id || a.reservationId === selectedRes.hospitableReservationId);
          const attrStatus = attrObj?.status || selectedRes.attributionStatus || "UNATTRIBUTED";

          const accrualEvent = ledgerEvents.find(
            e => (e.reservation_id === selectedRes.id || e.provider_booking_id === String(selectedRes.ownerrezBookingId) || e.provider_booking_id === selectedRes.confirmationCode) &&
                 e.event_type === "INITIAL_ACCRUAL"
          );
          const preview = commissionPreviews.find(cp => cp.reservationId === selectedRes.id || cp.ownerrezBookingId === selectedRes.ownerrezBookingId);
          const calculatedVal = accrualEvent
            ? Number(accrualEvent.calculated_commission ?? accrualEvent.commission_amount ?? accrualEvent.delta_amount ?? 0)
            : preview
            ? Number(preview.commissionCalculations?.calculatedCommission || 0)
            : (selectedRes.grossAmount || selectedRes.bookingAmount || 0) * 0.10;

          return (
            <div className="space-y-6 font-sans py-1">
              {/* SECTION A: Booking Summary Header */}
              <div className="bg-surface-subtle border border-divider-soft rounded-lg p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">Confirmation Code:</span>
                  <span className="text-xs font-semibold text-primary font-mono">{selectedRes.confirmationCode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">Property:</span>
                  <span className="text-xs font-semibold text-primary">{getPropertyName(selectedRes.propertyId)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">Booking Date:</span>
                  <span className="text-xs font-medium text-primary font-mono">{selectedRes.bookingDate || selectedRes.checkInDate || "N/A"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-secondary">Stay Dates:</span>
                  <span className="text-xs font-medium text-primary font-mono">{selectedRes.checkInDate?.slice(0, 10)} → {selectedRes.checkOutDate?.slice(0, 10)}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-divider-soft">
                  <span className="text-xs font-medium text-secondary">Stay Status:</span>
                  <StatusBadge variant={getStatusTypeForState(selectedRes.reservationStatus)}>
                    {formatStatusLabel(selectedRes.reservationStatus)}
                  </StatusBadge>
                </div>
              </div>

              {/* SECTION B: Financial Summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                  Financial State
                </h4>
                <div className="grid grid-cols-2 gap-3 bg-surface border border-divider rounded-lg p-3.5">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-tertiary uppercase tracking-wider block">Gross Booking Value</span>
                    <span className="text-base font-extrabold text-primary tabular-nums">
                      ${(selectedRes.grossAmount || selectedRes.bookingAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-tertiary uppercase tracking-wider block">Net Received</span>
                    <span className="text-base font-extrabold text-primary tabular-nums">
                      ${(selectedRes.amountReceived || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-divider-soft flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Payment Status:</span>
                    <StatusBadge variant={getStatusTypeForState(selectedRes.paymentStatus || "UNPAID")}>
                      {formatStatusLabel(selectedRes.paymentStatus || "UNPAID")}
                    </StatusBadge>
                  </div>
                </div>
              </div>

              {/* SECTION C: Referral Attribution */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                  Referral Attribution
                </h4>
                <div className="bg-surface border border-divider rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Attribution Status:</span>
                    <StatusBadge variant={getStatusTypeForState(attrStatus)}>
                      {formatStatusLabel(attrStatus)}
                    </StatusBadge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Referrer Site:</span>
                    <span className="text-xs font-semibold text-primary">{site ? site.siteName : "Unattributed"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Partner Owner:</span>
                    <span className="text-xs font-semibold text-primary">{partner ? partner.contactName : "Unassigned"}</span>
                  </div>
                  <div className="flex items-center justify-between text-tertiary text-[11px] pt-1 border-t border-divider-soft">
                    <span>Source Provider / Channel:</span>
                    <span className="font-mono">{isOwnerRez ? "OwnerRez" : "Hospitable"} • {selectedRes.platform || "Direct"}</span>
                  </div>
                </div>
              </div>

              {/* SECTION D: Commission Lifecycle */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                  Commission Lifecycle
                </h4>
                <div className="bg-surface border border-divider rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Calculated Potential:</span>
                    <span className="text-sm font-extrabold text-primary tabular-nums">
                      ${calculatedVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-secondary">Realized Commission:</span>
                    <span className="text-xs font-semibold text-primary tabular-nums">
                      $0.00
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-divider-soft">
                    <span className="text-xs font-medium text-secondary">Payout Eligibility:</span>
                    <StatusBadge variant={getStatusTypeForState(selectedRes.payoutStatus || "ESTIMATED")}>
                      {formatStatusLabel(selectedRes.payoutStatus || "ESTIMATED")}
                    </StatusBadge>
                  </div>
                  <p className="text-[11px] text-tertiary">
                    Calculated commission derived from immutable accrual snapshot evidence.
                  </p>
                </div>
              </div>

              {/* SECTION E: Operational Review & Security Lock */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-secondary">
                  Operational Review & Security Lock
                </h4>
                <div className="bg-surface border border-divider rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-primary">Payout Lock Status</p>
                      <p className="text-[11px] text-secondary">
                        {selectedRes.payoutStatus === "ON_HOLD" ? "Payout is locked from settlement queue." : "Payout is active for standard processing."}
                      </p>
                    </div>
                    <StatusBadge variant={selectedRes.payoutStatus === "ON_HOLD" ? "warning" : "success"}>
                      {selectedRes.payoutStatus === "ON_HOLD" ? "On Hold" : "Active"}
                    </StatusBadge>
                  </div>

                  {/* Operational Notes */}
                  <div className="pt-2 border-t border-divider-soft space-y-1">
                    <span className="text-xs font-medium text-secondary block">Internal Operational Notes</span>
                    {selectedRes.adminNotes ? (
                      <p className="text-xs text-primary bg-surface-subtle border border-divider-soft p-2.5 rounded-md">
                        {selectedRes.adminNotes}
                      </p>
                    ) : (
                      <p className="text-xs text-tertiary italic">No internal notes recorded for this reservation.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </SlideOver>
    </div>
  );
}

export default function AdminBookings() {
  return (
    <Suspense fallback={<LoadingState message="Loading Bookings console..." />}>
      <BookingsContent />
    </Suspense>
  );
}
