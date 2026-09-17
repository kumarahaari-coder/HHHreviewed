"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  DollarSign,
  HelpCircle,
  AlertTriangle,
  FileSpreadsheet,
  RefreshCw,
  Globe,
  Users,
  CalendarDays,
  ArrowRight,
  BarChart3,
  PieChartIcon,
  ShieldCheck
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Reservation, Partner, Site } from "@/lib/db/schema";
import {
  Card,
  StatusBadge,
  PageHeader,
  Button,
  LoadingState,
  ErrorBanner
} from "@/components/ui";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from "recharts";

export default function AdminOverview() {
  const router = useRouter();

  // Data States
  const [reservations, setReservations] = useState<Reservation[]>(db.reservations || []);
  const [partners, setPartners] = useState<Partner[]>(db.partners || []);
  const [sites, setSites] = useState<Site[]>(db.sites || []);
  const [ledgerEvents, setLedgerEvents] = useState<any[]>([]);
  const [projection, setProjection] = useState<any>(null);

  // UI & Filter States
  const [timeframe, setTimeframe] = useState<"30" | "90" | "ALL">("ALL");
  const [selectedProperty, setSelectedProperty] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Real Data from API with Fallback
  const loadOverviewData = useCallback(async () => {
    try {
      setError(null);

      const [resRes, partnersRes, sitesRes, ledgerRes] = await Promise.all([
        fetch("/api/admin/reservations").catch(() => null),
        fetch("/api/admin/partners").catch(() => null),
        fetch("/api/admin/sites").catch(() => null),
        fetch("/api/admin/commissions/ledger").catch(() => null)
      ]);

      let resDataLoaded = false;

      if (resRes && resRes.ok) {
        const rData = await resRes.json();
        if (rData.success && Array.isArray(rData.reservations)) {
          setReservations(rData.reservations);
          resDataLoaded = true;
        }
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

      if (ledgerRes && ledgerRes.ok) {
        const lData = await ledgerRes.json();
        if (lData.success && Array.isArray(lData.events)) {
          setLedgerEvents(lData.events);
        }
        if (lData.projection) {
          setProjection(lData.projection);
        }
      }

      if (!resDataLoaded) {
        setReservations(db.reservations);
      }
    } catch (err: any) {
      console.error("[Admin Overview Data Load Error]:", err);
      setReservations(db.reservations);
      setPartners(db.partners);
      setSites(db.sites);
      setError("Unable to connect to live datastore. Showing local active operational dataset.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  const handleManualSync = async () => {
    setIsRefreshing(true);
    await loadOverviewData();
    setIsRefreshing(false);
  };

  // Date-Filter Helper (Driven explicitly by bookingDate, or checkInDate if bookingDate is unavailable)
  const isWithinTimeframe = (dateStr?: string) => {
    if (timeframe === "ALL" || !dateStr) return true;
    const targetDate = new Date(dateStr);
    const now = new Date();
    const cutoffDays = timeframe === "30" ? 30 : 90;
    const cutoffDate = new Date(now.setDate(now.getDate() - cutoffDays));
    return targetDate >= cutoffDate;
  };

  // Population Rule: ONLY reservations with valid deterministic HHH referral attribution
  const isAttributedReferredStay = (r: Reservation) => {
    if (r.reservationStatus === "CANCELLED") return false;
    const hasAttrStatus = r.attributionStatus === "ATTRIBUTED" || r.attributionStatus === "RECONCILED" || (r.attributionStatus as any) === "automatic";
    const hasPartnerSite = Boolean(r.partnerId && r.siteId);
    return hasAttrStatus || hasPartnerSite;
  };

  // Filtered Attributed Reservations (Period-Scoped Flow Metrics)
  const attributedReservations = reservations.filter(r => {
    if (!isAttributedReferredStay(r)) return false;
    if (selectedProperty !== "ALL" && r.propertyId !== selectedProperty) return false;
    const dateField = r.bookingDate || r.checkInDate;
    return isWithinTimeframe(dateField);
  });

  // 1. Referred Booking Value (Gross revenue across referred/attributed stays)
  const referredBookingValue = attributedReservations.reduce(
    (acc, r) => acc + (r.grossAmount || r.bookingAmount || 0),
    0
  );

  // 2. Amount Received (Net cash collected from referred/attributed stays)
  const amountReceived = attributedReservations.reduce(
    (acc, r) => acc + (r.amountReceived || 0),
    0
  );

  // 3. Calculated Commission (Immutable historical INITIAL_ACCRUAL evidence from ledger)
  // Reconciles directly with INITIAL_ACCRUAL ledger events for attributed reservations in period
  const calculatedCommission = attributedReservations.reduce((acc, r) => {
    const accrualEvent = ledgerEvents.find(
      e => (e.reservation_id === r.id || e.provider_booking_id === String(r.ownerrezBookingId) || e.provider_booking_id === r.confirmationCode) &&
           e.event_type === "INITIAL_ACCRUAL"
    );

    if (accrualEvent) {
      const snapVal = Number(accrualEvent.calculated_commission ?? accrualEvent.commission_amount ?? accrualEvent.delta_amount ?? 0);
      return acc + snapVal;
    }

    const fallbackRate = (r as any).commissionRate ? (r as any).commissionRate / 100 : 0.10;
    const base = r.grossAmount || r.bookingAmount || 0;
    return acc + (base * fallbackRate);
  }, 0);

  // 4. Realized Commission (From authoritative PAYMENT_REALIZED, REFUND_CLAWBACK, MANUAL_ADJUSTMENT ledger events)
  const realizedCommission = ledgerEvents
    .filter(e => {
      const isRealizedType = ["PAYMENT_REALIZED", "REFUND_CLAWBACK", "MANUAL_ADJUSTMENT"].includes(e.event_type);
      if (!isRealizedType) return false;
      const matchingRes = reservations.find(r => r.id === e.reservation_id || String(r.ownerrezBookingId) === e.provider_booking_id);
      if (matchingRes && selectedProperty !== "ALL" && matchingRes.propertyId !== selectedProperty) return false;
      return isWithinTimeframe(e.created_at);
    })
    .reduce((acc, e) => acc + Number(e.delta_amount || 0), 0);

  // 5. Available for Payout (Current Point-in-Time Partner Balance - NOT period-filtered)
  const availableForPayout = (() => {
    if (projection?.partnerPayoutAvailable !== undefined) {
      return Number(projection.partnerPayoutAvailable);
    }
    let eligiblePositive = 0;
    let negativeCarry = 0;

    ledgerEvents.forEach(e => {
      if (e.event_type === "ELIGIBILITY_RELEASE") {
        eligiblePositive += Number(e.calculated_commission || e.delta_amount || 0);
      } else if (e.event_type === "REFUND_CLAWBACK") {
        negativeCarry += Math.abs(Number(e.delta_amount || 0));
      }
    });

    return Math.max(0, eligiblePositive - negativeCarry);
  })();

  // 6. Paid Out (From authoritative PAYOUT_SETTLEMENT ledger events)
  const paidOut = ledgerEvents
    .filter(e => e.event_type === "PAYOUT_SETTLEMENT")
    .reduce((acc, e) => acc + Math.abs(Number(e.delta_amount || 0)), 0);

  // 7. Operational Exception Counts
  const allFilteredReservations = reservations.filter(r => {
    if (selectedProperty !== "ALL" && r.propertyId !== selectedProperty) return false;
    return isWithinTimeframe(r.bookingDate || r.checkInDate);
  });

  const unattributedCount = allFilteredReservations.filter(
    r => (r.attributionStatus === "UNATTRIBUTED" || !r.partnerId) && r.reservationStatus !== "CANCELLED"
  ).length;

  const reviewRequiredCount = allFilteredReservations.filter(
    r => (r.payoutStatus === "ON_HOLD" || r.paymentStatus === "DISPUTED" || (r.attributionStatus as any) === "REVIEW_REQUIRED") && r.reservationStatus !== "CANCELLED"
  ).length;

  const activePartnersCount = partners.filter(p => p.status === "ACTIVE" || (p.status as any) === "active").length;
  const activeSitesCount = sites.filter(s => s.status === "ACTIVE" || (s.status as any) === "active").length;

  // 8. Time-Series Chart Data (Monthly Revenue & Calculated Commission)
  const monthlyMap: Record<string, { month: string; Revenue: number; Commission: number }> = {};
  attributedReservations.forEach(res => {
    const rawDate = res.bookingDate || res.checkInDate;
    const monthKey = rawDate
      ? new Date(rawDate).toLocaleString("default", { month: "short", year: "2-digit" })
      : "Unknown";

    if (!monthlyMap[monthKey]) {
      monthlyMap[monthKey] = { month: monthKey, Revenue: 0, Commission: 0 };
    }
    const rev = res.grossAmount || res.bookingAmount || 0;
    
    // Check if initial accrual event exists
    const accrualEvent = ledgerEvents.find(
      e => (e.reservation_id === res.id || e.provider_booking_id === String(res.ownerrezBookingId)) &&
           e.event_type === "INITIAL_ACCRUAL"
    );
    const commVal = accrualEvent
      ? Number(accrualEvent.calculated_commission ?? accrualEvent.commission_amount ?? accrualEvent.delta_amount ?? 0)
      : rev * 0.10;

    monthlyMap[monthKey].Revenue += rev;
    monthlyMap[monthKey].Commission += commVal;
  });

  const timeChartData = Object.values(monthlyMap);

  // 9. Property Portfolio Breakdown (Dynamic property labels)
  const propertyNamesMap: Record<string, string> = {
    "38d9159e-a35d-405e-826e-7381ad3c3197": "Uptown St. Augustine",
    "f0fb867d-47cd-47d4-afa6-c4bf226c1768": "Downtown St. Augustine",
    "51be6158-268d-4c96-8f0b-9968f544ddfa": "Ellsworth, Maine",
    "55791a54-b1a3-459e-bbd5-9073a418b774": "Beech Mountain, NC",
    "prop-001": "Uptown Retreat",
    "prop-002": "Downtown Retreat",
    "prop-003": "Ellsworth Retreat",
    "prop-004": "Beech Mountain Retreat"
  };

  const propertyCountsMap: Record<string, { name: string; value: number }> = {};
  attributedReservations.forEach(res => {
    const pName = propertyNamesMap[res.propertyId] || res.propertyId || "Other Property";
    if (!propertyCountsMap[pName]) {
      propertyCountsMap[pName] = { name: pName, value: 0 };
    }
    propertyCountsMap[pName].value += 1;
  });
  const propertyPieData = Object.values(propertyCountsMap);
  const CHART_COLORS = [
    "var(--color-primary)",
    "var(--color-secondary)",
    "var(--color-accent)",
    "var(--color-tertiary)",
    "var(--color-divider)"
  ];

  // 10. Referrer Partner Site Ranking (Dynamic from production sites & partners)
  const siteCountsMap: Record<string, { siteName: string; Bookings: number }> = {};
  sites.forEach(site => {
    const bookingsCount = attributedReservations.filter(r => r.siteId === site.id).length;
    siteCountsMap[site.siteName] = { siteName: site.siteName, Bookings: bookingsCount };
  });

  const siteBarData = Object.values(siteCountsMap)
    .filter(s => s.Bookings > 0)
    .sort((a, b) => b.Bookings - a.Bookings)
    .slice(0, 5);

  // Export CSV Handler
  const exportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Confirmation Code,Booking Date,Check In,Property ID,Gross Amount,Amount Received,Attribution Status,Payout Status\n";
    attributedReservations.forEach(r => {
      csvContent += `${r.confirmationCode},${r.bookingDate || r.checkInDate},${r.checkInDate},${r.propertyId},${r.grossAmount || r.bookingAmount || 0},${r.amountReceived || 0},${r.attributionStatus || "UNATTRIBUTED"},${r.payoutStatus || "ESTIMATED"}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `HHH_Overview_Export_${timeframe}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <LoadingState message="Loading Admin Overview performance metrics..." />;
  }

  return (
    <div className="space-y-8 font-sans pb-8">
      {/* 1. Page Header */}
      <PageHeader
        title="Overview"
        description="Referral performance, booking health and commission exposure."
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={handleManualSync}
              className={isRefreshing ? "animate-spin" : ""}
            >
              Refresh Data
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

      {/* 2. Responsive Controls & Filters Bar */}
      <div className="bg-surface border border-divider rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
        {/* Left: Property Selector */}
        <div className="flex items-center gap-2 min-w-0">
          <label htmlFor="property-filter" className="text-xs font-medium text-secondary shrink-0">
            Property:
          </label>
          <select
            id="property-filter"
            value={selectedProperty}
            onChange={e => setSelectedProperty(e.target.value)}
            className="bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg px-3 py-1.5 font-medium focus:outline-none focus:ring-2 focus:ring-primary truncate max-w-[240px]"
          >
            <option value="ALL">All Properties</option>
            <option value="38d9159e-a35d-405e-826e-7381ad3c3197">Uptown St. Augustine</option>
            <option value="f0fb867d-47cd-47d4-afa6-c4bf226c1768">Downtown St. Augustine</option>
            <option value="51be6158-268d-4c96-8f0b-9968f544ddfa">Ellsworth, Maine</option>
            <option value="55791a54-b1a3-459e-bbd5-9073a418b774">Beech Mountain, NC</option>
          </select>
        </div>

        {/* Right: Timeframe Segmented Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <span
            className="text-xs text-secondary font-medium shrink-0 cursor-help"
            title="Filters by booking date. If booking date is unavailable for a historical reservation, check-in date is used as the fallback."
          >
            Booking Date:
          </span>
          <div
            className="flex items-center gap-1 bg-surface-muted p-1 rounded-lg border border-divider-soft"
            title="Filters by booking date. If booking date is unavailable for a historical reservation, check-in date is used as the fallback."
          >
            {(["30", "90", "ALL"] as const).map(tf => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                title="Filters by booking date. If booking date is unavailable for a historical reservation, check-in date is used as the fallback."
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  timeframe === tf
                    ? "bg-surface text-primary font-semibold shadow-xs"
                    : "text-secondary hover:text-primary"
                }`}
              >
                {tf === "ALL" ? "All Time" : `${tf} Days`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. SECTION A: Core Business Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Referred Booking Value */}
        <Card variant="default">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
                Referred Booking Value
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mt-1 tabular-nums">
                ${referredBookingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            </div>
            <div className="p-2 bg-surface-muted border border-divider-soft rounded-lg text-secondary shrink-0">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="text-xs text-secondary mt-3">
            Across <strong className="text-primary font-semibold tabular-nums">{attributedReservations.length}</strong> referred stays
          </p>
        </Card>

        {/* Amount Received */}
        <Card variant="default">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
                Amount Received
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mt-1 tabular-nums">
                ${amountReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            </div>
            <div className="p-2 bg-surface-muted border border-divider-soft rounded-lg text-secondary shrink-0">
              <DollarSign size={18} />
            </div>
          </div>
          <p className="text-xs text-secondary mt-3">
            Received from referred bookings
          </p>
        </Card>

        {/* Calculated Commission */}
        <Card variant="default">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
                Calculated Commission
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mt-1 tabular-nums">
                ${calculatedCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            </div>
            <div className="p-2 bg-accent-subtle/50 border border-accent/20 rounded-lg text-accent shrink-0">
              <BarChart3 size={18} />
            </div>
          </div>
          <p className="text-xs text-secondary mt-3">
            Contractual potential (accrual snapshot evidence)
          </p>
        </Card>

        {/* Available for Payout */}
        <Card variant="default">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
                Available for Payout
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-primary tracking-tight mt-1 tabular-nums">
                ${availableForPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            </div>
            <StatusBadge variant="neutral">
              Current
            </StatusBadge>
          </div>
          <p className="text-xs text-secondary mt-3">
            Current eligible partner balance
          </p>
        </Card>
      </div>

      {/* 4. SECTION B: Attention Required (Operational Exceptions) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Unattributed Stays Exception */}
        <Card
          hoverable
          onClick={() => router.push("/admin/bookings?attribution=UNATTRIBUTED")}
          className="bg-surface border-divider"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <HelpCircle size={18} className="text-warning shrink-0" />
                <h3 className="text-sm font-semibold text-primary">Unattributed Stays</h3>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                Reservations missing verified partner/site referral mapping requiring manual attribution.
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-2xl font-extrabold text-primary tabular-nums">{unattributedCount}</span>
              <p className="text-[11px] text-tertiary">Bookings</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-divider-soft flex items-center justify-between text-xs text-accent font-medium">
            <span>Review unattributed stays in Bookings</span>
            <ArrowRight size={14} />
          </div>
        </Card>

        {/* Holds & Disputes Exception */}
        <Card
          hoverable
          onClick={() => router.push("/admin/bookings?review=true")}
          className="bg-surface border-divider"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-danger shrink-0" />
                <h3 className="text-sm font-semibold text-primary">Holds & Disputes</h3>
              </div>
              <p className="text-xs text-secondary leading-relaxed">
                Bookings flagged for payout hold or guest payment dispute requiring administrator review.
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-2xl font-extrabold text-primary tabular-nums">{reviewRequiredCount}</span>
              <p className="text-[11px] text-tertiary">Bookings</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-divider-soft flex items-center justify-between text-xs text-accent font-medium">
            <span>Investigate holds in Bookings</span>
            <ArrowRight size={14} />
          </div>
        </Card>
      </div>

      {/* 5. SECTIONS C & D: Commission Position & Trend Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Section C: Commission Position Operational Panel */}
        <Card variant="default" className="lg:col-span-1 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-divider-soft pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">
                Commission Position
              </h3>
              <StatusBadge variant="neutral">Ledger</StatusBadge>
            </div>

            <div className="space-y-3 font-sans">
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary">Calculated Potential:</span>
                <strong className="text-primary font-semibold tabular-nums">
                  ${calculatedCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary">Realized Revenue:</span>
                <strong className="text-primary font-semibold tabular-nums">
                  ${realizedCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-divider-soft">
                <span className="text-secondary font-medium">Available for Payout:</span>
                <strong className="text-primary font-bold tabular-nums">
                  ${availableForPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary">Paid Out:</span>
                <span className="text-tertiary font-medium tabular-nums">
                  ${paidOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-divider-soft text-[11px] text-tertiary space-y-1">
            <p>• Point-in-time partner balance</p>
            <p>• Authoritative Phase 6 projection</p>
          </div>
        </Card>

        {/* Section D: Booking Value & Commission Time-Series Trend */}
        <Card variant="default" className="lg:col-span-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">
                Referred Revenue & Commission Trend
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Monthly gross referred booking revenue vs contractual calculated commission.
              </p>
            </div>
            <StatusBadge variant="neutral">Monthly View</StatusBadge>
          </div>

          <div className="h-64 w-full">
            {timeChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-tertiary">
                No historical booking timeline data matches selected filters.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenuePrimary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCommissionAccent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tickLine={false} axisLine={false} style={{ fontSize: 11, fill: "var(--color-secondary)" }} />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: 11, fill: "var(--color-secondary)" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-surface)",
                      borderColor: "var(--color-divider)",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                      fontSize: "12px"
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Revenue"
                    name="Referred Revenue ($)"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRevenuePrimary)"
                  />
                  <Area
                    type="monotone"
                    dataKey="Commission"
                    name="Calculated Commission ($)"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCommissionAccent)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* 6. SECTIONS E & F: Portfolio & Referral Performance Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section E: Reservations by HHH Property (Donut/Pie Chart) */}
        <Card variant="default">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">
                Portfolio Breakdown
              </h3>
              <p className="text-xs text-secondary mt-0.5 font-sans">Referred stays distributed by HHH property.</p>
            </div>
            <PieChartIcon size={16} className="text-tertiary" />
          </div>

          <div className="h-60 flex items-center justify-center">
            {propertyPieData.length === 0 ? (
              <p className="text-xs text-tertiary">No property stays recorded for selected filters.</p>
            ) : (
              <div className="w-full h-full flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex-1 h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={propertyPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {propertyPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-surface)",
                          borderColor: "var(--color-divider)",
                          borderRadius: "8px",
                          fontSize: "12px"
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex flex-col space-y-2 pr-4 shrink-0">
                  {propertyPieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="font-medium text-primary truncate max-w-[140px]">{entry.name}</span>
                      <span className="text-secondary tabular-nums">({entry.value})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Section F: Referral Source Performance (Top Sites Bar Chart) */}
        <Card variant="default">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">
                Top Referrer Sites
              </h3>
              <p className="text-xs text-secondary mt-0.5">Referred bookings ranked by partner site.</p>
            </div>
            <Globe size={16} className="text-tertiary" />
          </div>

          <div className="h-60 w-full">
            {siteBarData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-tertiary">
                No site referrals recorded for selected filters.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={siteBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="siteName" tickLine={false} axisLine={false} style={{ fontSize: 10, fill: "var(--color-secondary)" }} />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10, fill: "var(--color-secondary)" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-surface)",
                      borderColor: "var(--color-divider)",
                      borderRadius: "8px",
                      fontSize: "12px"
                    }}
                  />
                  <Bar dataKey="Bookings" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* 7. Quick System Health Metrics Footer */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card variant="subtle" className="flex items-center gap-3 py-3">
          <div className="p-2.5 bg-surface border border-divider-soft rounded-lg text-primary shrink-0">
            <Globe size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-secondary uppercase tracking-wider">Active Websites</p>
            <p className="text-sm font-bold text-primary tabular-nums mt-0.5">
              {activeSitesCount} <span className="text-xs text-tertiary font-normal">/ {sites.length} total</span>
            </p>
          </div>
        </Card>

        <Card variant="subtle" className="flex items-center gap-3 py-3">
          <div className="p-2.5 bg-surface border border-divider-soft rounded-lg text-primary shrink-0">
            <Users size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-secondary uppercase tracking-wider">Managed Partners</p>
            <p className="text-sm font-bold text-primary tabular-nums mt-0.5">
              {activePartnersCount} <span className="text-xs text-tertiary font-normal">Active</span>
            </p>
          </div>
        </Card>

        <Card variant="subtle" className="flex items-center gap-3 py-3">
          <div className="p-2.5 bg-surface border border-divider-soft rounded-lg text-primary shrink-0">
            <CalendarDays size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-secondary uppercase tracking-wider">Referred Stays</p>
            <p className="text-sm font-bold text-primary tabular-nums mt-0.5">
              {attributedReservations.length} <span className="text-xs text-tertiary font-normal">Stays</span>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
