"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  TrendingUp,
  Calendar,
  DollarSign,
  Globe,
  Clock,
  CheckCircle,
  Loader2
} from "lucide-react";
import { Reservation, Partner, Site, Payout } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableMobileCard } from "@/components/ui/table";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar
} from "recharts";

function PartnerOverviewContent() {
  const searchParams = useSearchParams();
  const previewPartnerId = searchParams.get("previewPartnerId");

  const [partner, setPartner] = useState<Partner | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;

    async function fetchDashboard() {
      try {
        const url = previewPartnerId
          ? `/api/partner/dashboard?previewPartnerId=${encodeURIComponent(previewPartnerId)}`
          : "/api/partner/dashboard";

        const res = await fetch(url);
        const data = await res.json();

        if (!isSubscribed) return;

        if (data.success && data.partner) {
          setPartner(data.partner);
          setSites(data.sites || []);
          setReservations((data.reservations || []).filter((r: Reservation) => r.reservationStatus !== "CANCELLED"));
          setPayouts(data.payouts || []);
        }
      } catch (err) {
        console.error("[Partner Overview Error]", err);
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    fetchDashboard();

    return () => {
      isSubscribed = false;
    };
  }, [previewPartnerId]);

  if (loading) {
    return (
      <div className="flex py-16 justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!partner) return null;

  const totalBookings = reservations.length;
  const totalRevenue = reservations.reduce((acc, r) => acc + r.bookingAmount, 0);

  const eligiblePayout = payouts
    .filter(p => p.status === "ELIGIBLE" || p.status === "APPROVED")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const totalPaidOut = payouts
    .filter(p => p.status === "PAID")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const monthlyData = [
    { month: "Jan", revenue: Math.round(totalRevenue * 0.1), bookings: Math.max(1, Math.floor(totalBookings * 0.1)) },
    { month: "Feb", revenue: Math.round(totalRevenue * 0.15), bookings: Math.max(1, Math.floor(totalBookings * 0.15)) },
    { month: "Mar", revenue: Math.round(totalRevenue * 0.2), bookings: Math.max(1, Math.floor(totalBookings * 0.2)) },
    { month: "Apr", revenue: Math.round(totalRevenue * 0.25), bookings: Math.max(1, Math.floor(totalBookings * 0.25)) },
    { month: "May", revenue: Math.round(totalRevenue * 0.3), bookings: Math.max(1, Math.floor(totalBookings * 0.3)) }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${partner.contactName}`}
        description={`Performance summary for ${partner.businessName}. Track referred bookings, website metrics, and payout status.`}
      />

      {/* KPI METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center space-x-3">
          <div className="p-2.5 rounded-md bg-[var(--canvas)] text-[var(--primary)] shrink-0">
            <DollarSign size={20} />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[var(--secondary)] uppercase tracking-wider">
              Referred Revenue
            </div>
            <div className="text-xl font-bold tabular-nums font-mono text-[var(--primary)] mt-0.5">
              ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center space-x-3">
          <div className="p-2.5 rounded-md bg-[var(--canvas)] text-[var(--primary)] shrink-0">
            <Calendar size={20} />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[var(--secondary)] uppercase tracking-wider">
              Referred Stays
            </div>
            <div className="text-xl font-bold tabular-nums font-mono text-[var(--primary)] mt-0.5">
              {totalBookings}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center space-x-3">
          <div className="p-2.5 rounded-md bg-emerald-50 text-emerald-700 shrink-0">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[var(--secondary)] uppercase tracking-wider">
              Available Balance
            </div>
            <div className="text-xl font-bold tabular-nums font-mono text-emerald-700 mt-0.5">
              ${eligiblePayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center space-x-3">
          <div className="p-2.5 rounded-md bg-[var(--canvas)] text-[var(--primary)] shrink-0">
            <CheckCircle size={20} />
          </div>
          <div>
            <div className="text-[10px] font-semibold text-[var(--secondary)] uppercase tracking-wider">
              Total Settled
            </div>
            <div className="text-xl font-bold tabular-nums font-mono text-[var(--primary)] mt-0.5">
              ${totalPaidOut.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <h3 className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">
            Referred Revenue Trend (USD)
          </h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <XAxis dataKey="month" stroke="#6E6E73" fontSize={11} />
                <YAxis stroke="#6E6E73" fontSize={11} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#1D1D1F" fill="#E8E8ED" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <h3 className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">
            Referred Stays Volume
          </h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <XAxis dataKey="month" stroke="#6E6E73" fontSize={11} />
                <YAxis stroke="#6E6E73" fontSize={11} />
                <Tooltip />
                <Bar dataKey="bookings" fill="#1D1D1F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* RECENT RESERVATIONS TABLE */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
          <h3 className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">
            Recent Referred Bookings
          </h3>
          <StatusBadge variant="info">{reservations.length} Total</StatusBadge>
        </div>

        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead>Stay Code</TableHead>
              <TableHead>Stay Dates</TableHead>
              <TableHead>Booking Value</TableHead>
              <TableHead>Commission Earned</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-[var(--secondary)] text-xs">
                  No referred stays recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              reservations.slice(0, 5).map(res => (
                <TableRow key={res.id}>
                  <TableCell className="font-mono font-medium text-[var(--primary)]">{res.confirmationCode || res.id}</TableCell>
                  <TableCell className="text-xs text-[var(--secondary)]">{res.checkInDate} to {res.checkOutDate}</TableCell>
                  <TableCell className="tabular-nums font-mono font-semibold">${res.bookingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                  <TableCell className="tabular-nums font-mono font-bold text-emerald-700">${(res.partnerPayoutAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                  <TableCell>
                    <StatusBadge variant={res.reservationStatus === "CHECKED_OUT" || res.reservationStatus === "COMPLETED" ? "success" : "info"}>
                      {res.reservationStatus}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="md:hidden divide-y divide-[var(--border)]">
          {reservations.slice(0, 5).map(res => (
            <TableMobileCard
              key={res.id}
              title={res.confirmationCode || res.id}
              subtitle={`${res.checkInDate} - ${res.checkOutDate}`}
              badge={
                <StatusBadge variant={res.reservationStatus === "CHECKED_OUT" ? "success" : "info"}>
                  {res.reservationStatus}
                </StatusBadge>
              }
              details={[
                { label: "Booking Value", value: `$${res.bookingAmount.toFixed(2)}`, numeric: true },
                { label: "Commission", value: `$${(res.partnerPayoutAmount || 0).toFixed(2)}`, numeric: true }
              ]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


export default function PartnerOverview() {
  return (
    <Suspense fallback={<div className="flex py-16 justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" /></div>}>
      <PartnerOverviewContent />
    </Suspense>
  );
}
