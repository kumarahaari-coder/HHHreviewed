"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  Globe,
  Users,
  DollarSign,
  AlertTriangle,
  HelpCircle,
  FileSpreadsheet,
  CalendarDays
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Reservation, Partner, Site, Property, Payout } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";
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
  
  // States
  const [reservations] = useState<Reservation[]>(() => db.reservations);
  const [partners] = useState<Partner[]>(() => db.partners);
  const [sites] = useState<Site[]>(() => db.sites);
  const [payouts] = useState<Payout[]>(() => db.payouts);
  const [properties] = useState<Property[]>(() => db.properties);
  const [timeframe, setTimeframe] = useState<"30" | "90" | "ALL">("ALL");
  const [selectedProperty, setSelectedProperty] = useState<string>("ALL");



  // Filter reservations based on timeframe & property
  const filteredReservations = reservations.filter(res => {
    if (selectedProperty !== "ALL" && res.propertyId !== selectedProperty) return false;
    
    if (timeframe === "30") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return new Date(res.bookingDate) >= thirtyDaysAgo;
    }
    if (timeframe === "90") {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      return new Date(res.bookingDate) >= ninetyDaysAgo;
    }
    return true;
  });

  // Calculate Metrics
  const totalBookings = filteredReservations.length;
  const activePartnersCount = partners.filter(p => p.status === "ACTIVE").length;
  const activeSitesCount = sites.filter(s => s.status === "ACTIVE").length;

  const grossBookingValue = filteredReservations
    .filter(r => r.reservationStatus !== "CANCELLED")
    .reduce((acc, r) => acc + r.bookingAmount, 0);

  const amountReceivedByHHH = filteredReservations
    .filter(r => r.reservationStatus !== "CANCELLED")
    .reduce((acc, r) => acc + r.amountReceived, 0);

  const unattributedCount = filteredReservations.filter(
    r => r.attributionStatus === "UNATTRIBUTED" && r.reservationStatus !== "CANCELLED"
  ).length;

  const reviewRequiredCount = filteredReservations.filter(
    r => (r.payoutStatus === "ON_HOLD" || r.paymentStatus === "DISPUTED") && r.reservationStatus !== "CANCELLED"
  ).length;

  // Payout aggregations based on payouts list
  const totalPaidPayout = payouts
    .filter(p => p.status === "PAID")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const approvedUnpaidPayout = payouts
    .filter(p => p.status === "APPROVED")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const awaitingApprovalPayout = payouts
    .filter(p => p.status === "ELIGIBLE")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const estimatedPayout = payouts
    .filter(p => p.status === "ESTIMATED")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  // --- RECHARTS DATA PREPARATION ---

  // 1. Bookings & Payouts Over Time (Line Chart)
  // Let's aggregate by booking month
  const monthlyDataMap: Record<string, { month: string; Bookings: number; Revenue: number; Payouts: number }> = {};
  
  filteredReservations
    .filter(r => r.reservationStatus !== "CANCELLED")
    .forEach(res => {
      const month = new Date(res.bookingDate).toLocaleString("default", { month: "short", year: "2-digit" });
      if (!monthlyDataMap[month]) {
        monthlyDataMap[month] = { month, Bookings: 0, Revenue: 0, Payouts: 0 };
      }
      monthlyDataMap[month].Bookings += 1;
      monthlyDataMap[month].Revenue += res.bookingAmount;
      
      // Add corresponding payout
      const p = payouts.find(pay => pay.reservationId === res.id);
      if (p) {
        monthlyDataMap[month].Payouts += p.finalPayout;
      }
    });

  // Sort monthly data chronologically
  const timeChartData = Object.values(monthlyDataMap).reverse();

  // 2. Bookings by HHH Property (Pie Chart)
  const propertyDataMap: Record<string, { name: string; value: number }> = {};
  filteredReservations
    .filter(r => r.reservationStatus !== "CANCELLED")
    .forEach(res => {
      const propName = properties.find(property => property.id === res.propertyId)?.name || "Unknown stay";
        
      if (!propertyDataMap[propName]) {
        propertyDataMap[propName] = { name: propName, value: 0 };
      }
      propertyDataMap[propName].value += 1;
    });
  const propertyPieData = Object.values(propertyDataMap);

  // Hidden Honey Homes dashboard palette
  const COLORS = ["#4F2352", "#6D3745", "#98A496", "#EFDFD2"];

  // 3. Bookings by Partner Website (Bar Chart)
  const siteBarData = sites.map(site => {
    const bookingsCount = reservations.filter(r => r.siteId === site.id && r.reservationStatus !== "CANCELLED").length;
    const partner = partners.find(p => p.id === site.partnerId);
    return {
      siteName: site.siteName,
      partnerName: partner?.contactName || "Unknown",
      Bookings: bookingsCount
    };
  }).sort((a, b) => b.Bookings - a.Bookings).slice(0, 5); // top 5

  const exportCSV = () => {
    // Simple CSV export download simulator
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Confirmation Code,Booking Date,Check In,Property,Gross Amount,Net HHH,Payout Status\n";
    filteredReservations.forEach(r => {
      csvContent += `${r.confirmationCode},${r.bookingDate.split("T")[0]},${r.checkInDate},${r.propertyId},${r.bookingAmount},${r.amountReceived},${r.payoutStatus}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `HHH_Overview_Export_${timeframe}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Page Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">Overview</h1>
          <p className="text-zinc-500 font-serif italic text-sm mt-1">
            Performance analytics, referred stays, and partner payouts liability.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Property Select */}
          <select
            value={selectedProperty}
            onChange={e => setSelectedProperty(e.target.value)}
            className="bg-brand-cream border border-brand-blush rounded-lg text-xs font-bold text-brand-plum py-2 px-3 focus:outline-none focus:border-brand-plum"
          >
            <option value="ALL">All Properties</option>
            {properties.map(property => (
              <option key={property.id} value={property.id}>{property.name}</option>
            ))}
          </select>

          {/* Timeframe Select */}
          <div className="flex bg-brand-cream border border-brand-blush rounded-lg p-1">
            {(["30", "90", "ALL"] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                  timeframe === tf
                    ? "bg-brand-plum text-brand-cream"
                    : "text-zinc-500 hover:text-brand-plum"
                }`}
              >
                {tf === "ALL" ? "All Time" : `${tf} Days`}
              </button>
            ))}
          </div>

          {/* CSV Export Button */}
          <button
            onClick={exportCSV}
            className="flex items-center space-x-1.5 bg-brand-blush hover:bg-brand-blush/80 text-brand-plum border border-brand-blush/60 px-3 py-2 rounded-lg text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-brand-plum"
          >
            <FileSpreadsheet size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* METRIC CARD GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Core Stats */}
        <Card className="flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-wine">Gross Referrals</span>
              <h3 className="text-3xl font-extrabold text-brand-plum mt-1">${grossBookingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-2 bg-brand-plum/10 text-brand-plum rounded-lg">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-4 flex items-center gap-1">
            <span className="font-bold text-brand-wine">{totalBookings}</span> bookings recorded
          </p>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-wine">Amount Received</span>
              <h3 className="text-3xl font-extrabold text-brand-plum mt-1">${amountReceivedByHHH.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-2 bg-brand-plum/10 text-brand-plum rounded-lg">
              <DollarSign size={20} />
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-4">
            Net received from Hospitable bookings
          </p>
        </Card>

        {/* Action Items Clickable Cards */}
        <Card
          onClick={() => router.push("/admin/bookings?attribution=UNATTRIBUTED")}
          className="flex flex-col justify-between border-amber-200 bg-amber-50/40 hover:bg-amber-50 transition-colors cursor-pointer"
        >
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-800">Unattributed Stays</span>
              <h3 className="text-3xl font-extrabold text-amber-700 mt-1">{unattributedCount}</h3>
            </div>
            <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
              <HelpCircle size={20} />
            </div>
          </div>
          <p className="text-xs text-amber-800/80 mt-4 font-bold flex items-center gap-1">
            Requires manual attribution review →
          </p>
        </Card>

        <Card
          onClick={() => router.push("/admin/bookings?review=true")}
          className="flex flex-col justify-between border-rose-200 bg-rose-50/40 hover:bg-rose-50 transition-colors cursor-pointer"
        >
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-rose-800">Holds / Disputes</span>
              <h3 className="text-3xl font-extrabold text-rose-700 mt-1">{reviewRequiredCount}</h3>
            </div>
            <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
              <AlertTriangle size={20} />
            </div>
          </div>
          <p className="text-xs text-rose-800/80 mt-4 font-bold flex items-center gap-1">
            Bookings requiring investigation →
          </p>
        </Card>
      </div>

      {/* LIABILITIES GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 bg-brand-plum text-brand-cream border-transparent">
          <h4 className="text-xs font-bold uppercase tracking-widest text-brand-blush mb-6">
            Payout Breakdown
          </h4>
          <div className="space-y-4">
            <div className="border-b border-brand-cream/10 pb-2">
              <span className="text-[10px] text-brand-blush block uppercase font-medium">Awaiting Approval</span>
              <span className="text-2xl font-bold">${awaitingApprovalPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="border-b border-brand-cream/10 pb-2">
              <span className="text-[10px] text-brand-blush block uppercase font-medium">Approved but Unpaid</span>
              <span className="text-2xl font-bold">${approvedUnpaidPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="border-b border-brand-cream/10 pb-2">
              <span className="text-[10px] text-brand-blush block uppercase font-medium">Estimated Upcoming</span>
              <span className="text-2xl font-bold">${estimatedPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="text-[10px] text-brand-blush block uppercase font-medium">Total Paid out</span>
              <span className="text-2xl font-bold">${totalPaidPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </Card>

        {/* Time trends Area Chart */}
        <Card className="lg:col-span-3">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-brand-wine">
                Booking Value & Payout Liability Over Time
              </h4>
              <p className="text-[11px] text-zinc-400">Monthly gross revenues compared to calculated partner payouts.</p>
            </div>
            <Badge type="plum">Monthly Trend</Badge>
          </div>
          <div className="h-64">
            {timeChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-zinc-400 italic">No historical timeline data matches current filters.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeChartData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F2352" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#4F2352" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPayouts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#98A496" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#98A496" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tickLine={false} axisLine={false} style={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#FFF7F2", border: "1px solid #EFDFD2" }} />
                  <Area type="monotone" dataKey="Revenue" stroke="#4F2352" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                  <Area type="monotone" dataKey="Payouts" stroke="#98A496" strokeWidth={2} fillOpacity={1} fill="url(#colorPayouts)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* DOUBLE GRAPHS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bookings by HHH Property (Pie Chart) */}
        <Card>
          <h4 className="text-xs font-bold uppercase tracking-widest text-brand-wine mb-6">
            Reservations by HHH Retreat
          </h4>
          <div className="h-60 flex items-center justify-center">
            {propertyPieData.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No bookings matching filters</p>
            ) : (
              <div className="w-full h-full flex flex-col sm:flex-row items-center justify-between">
                <div className="flex-1 h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={propertyPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {propertyPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#FFF7F2", border: "1px solid #EFDFD2" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col space-y-2 pr-8 mt-4 sm:mt-0">
                  {propertyPieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center space-x-2 text-xs">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="font-semibold text-zinc-700">{entry.name}</span>
                      <span className="text-zinc-400">({entry.value} stays)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Referred Bookings by Site (Bar Chart) */}
        <Card>
          <h4 className="text-xs font-bold uppercase tracking-widest text-brand-wine mb-6">
            Top Referrer Partner Sites
          </h4>
          <div className="h-60">
            {siteBarData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-zinc-400 italic">No site referrals recorded</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={siteBarData} margin={{ left: -20, right: 10 }}>
                  <XAxis dataKey="siteName" tickLine={false} axisLine={false} style={{ fontSize: 9 }} />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#FFF7F2", border: "1px solid #EFDFD2" }} />
                  <Bar dataKey="Bookings" fill="#6D3745" radius={[4, 4, 0, 0]}>
                    {siteBarData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="#6D3745" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* QUICK SYSTEM METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-brand-blush/40 text-brand-wine rounded-lg">
            <Globe size={20} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Active Websites</span>
            <p className="text-xl font-bold text-brand-plum">{activeSitesCount} / {sites.length}</p>
          </div>
        </Card>
        
        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-brand-blush/40 text-brand-wine rounded-lg">
            <Users size={20} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Managed Partners</span>
            <p className="text-xl font-bold text-brand-plum">{activePartnersCount} Active</p>
          </div>
        </Card>

        <Card className="flex items-center space-x-4">
          <div className="p-3 bg-brand-blush/40 text-brand-wine rounded-lg">
            <CalendarDays size={20} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Upcoming Check-ins</span>
            <p className="text-xl font-bold text-brand-plum">
              {reservations.filter(r => r.reservationStatus === "CONFIRMED").length} Stays
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
