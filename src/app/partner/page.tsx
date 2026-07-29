"use client";

import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  Calendar,
  DollarSign,
  Globe,
  Clock,
  CheckCircle,
  FileSpreadsheet
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { Reservation, Partner, Site } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";
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

export default function PartnerOverview() {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);

  useEffect(() => {
    const user = db.currentUser;
    if (!user || !user.partnerId) return;

    const partnerData = db.partners.find(p => p.id === user.partnerId);
    if (partnerData) {
      setPartner(partnerData);
    }

    // Row Level Security (RLS) data isolation filters
    const mySites = db.sites.filter(s => s.partnerId === user.partnerId);
    const mySitesIds = mySites.map(s => s.id);
    
    setSites(mySites);
    setReservations(db.reservations.filter(r => r.partnerId === user.partnerId && r.reservationStatus !== "CANCELLED"));
    setPayouts(db.payouts.filter(p => p.partnerId === user.partnerId));
  }, []);

  if (!partner) return null;

  // Calculations scoped to current partner
  const totalBookings = reservations.length;
  
  const totalRevenue = reservations.reduce((acc, r) => acc + r.bookingAmount, 0);

  const estimatedPayout = payouts
    .filter(p => p.status === "ESTIMATED")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const eligiblePayout = payouts
    .filter(p => p.status === "ELIGIBLE")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const approvedPayout = payouts
    .filter(p => p.status === "APPROVED")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  const paidPayout = payouts
    .filter(p => p.status === "PAID")
    .reduce((acc, p) => acc + p.finalPayout, 0);

  // 1. Monthly Stays & Payouts trend
  const monthlyDataMap: Record<string, { month: string; Bookings: number; Revenue: number; Payouts: number }> = {};
  
  reservations.forEach(res => {
    const month = new Date(res.bookingDate).toLocaleString("default", { month: "short", year: "2-digit" });
    if (!monthlyDataMap[month]) {
      monthlyDataMap[month] = { month, Bookings: 0, Revenue: 0, Payouts: 0 };
    }
    monthlyDataMap[month].Bookings += 1;
    monthlyDataMap[month].Revenue += res.bookingAmount;

    const p = payouts.find(pay => pay.reservationId === res.id);
    if (p) {
      monthlyDataMap[month].Payouts += p.finalPayout;
    }
  });

  const chartData = Object.values(monthlyDataMap).reverse();

  return (
    <div className="space-y-8 font-sans">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">
          Welcome back, {partner.contactName}
        </h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Review referral stays, commission totals, and outstanding payouts for {partner.businessName}.
        </p>
      </div>

      {/* METRIC GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-wine">Bookings Referred</span>
              <h3 className="text-3xl font-extrabold text-brand-plum mt-1">{totalBookings}</h3>
            </div>
            <div className="p-2 bg-brand-blush/40 text-brand-plum rounded-lg">
              <Calendar size={20} />
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-4">
            Referred stays from your {sites.length} sites
          </p>
        </Card>

        <Card>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-wine">Gross Stays Value</span>
              <h3 className="text-3xl font-extrabold text-brand-plum mt-1">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-2 bg-brand-blush/40 text-brand-plum rounded-lg">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-4">
            Total USD booking revenue generated
          </p>
        </Card>

        <Card>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-wine">Eligible Payouts</span>
              <h3 className="text-3xl font-extrabold text-brand-plum mt-1">${eligiblePayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-2 bg-brand-blush/40 text-brand-plum rounded-lg">
              <DollarSign size={20} />
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-4">
            Ready to be batched and processed
          </p>
        </Card>

        <Card>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-brand-wine">Total Paid Payouts</span>
              <h3 className="text-3xl font-extrabold text-brand-plum mt-1">${paidPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
            </div>
            <div className="p-2 bg-brand-blush/40 text-brand-plum rounded-lg">
              <CheckCircle size={20} />
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-4">
            Earnings wired to your bank account
          </p>
        </Card>
      </div>

      {/* LIABILITIES BREAKDOWN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Outstanding details */}
        <Card className="lg:col-span-1 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-brand-wine">
            Earnings Summary
          </h3>
          <div className="space-y-4">
            <div className="border-b border-brand-blush/60 pb-3 flex justify-between items-end">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">Estimated Payouts</span>
                <span className="text-xl font-bold text-brand-plum block">${estimatedPayout.toFixed(2)}</span>
              </div>
              <span className="text-[10px] text-zinc-400 italic">Stay dates upcoming</span>
            </div>

            <div className="border-b border-brand-blush/60 pb-3 flex justify-between items-end">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">Eligible (Checked In)</span>
                <span className="text-xl font-bold text-brand-plum block">${eligiblePayout.toFixed(2)}</span>
              </div>
              <span className="text-[10px] text-brand-wine font-bold">Unpaid</span>
            </div>

            <div className="border-b border-brand-blush/60 pb-3 flex justify-between items-end">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">Approved by Admin</span>
                <span className="text-xl font-bold text-brand-plum block">${approvedPayout.toFixed(2)}</span>
              </div>
              <span className="text-[10px] text-brand-wine font-bold">Awaiting Batch</span>
            </div>

            <div className="flex justify-between items-end">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">Paid History</span>
                <span className="text-xl font-bold text-brand-plum block">${paidPayout.toFixed(2)}</span>
              </div>
              <Badge type="success">Transferred</Badge>
            </div>
          </div>
        </Card>

        {/* Chart */}
        <Card className="lg:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-brand-wine mb-6">
            Earnings and Referrals Performance
          </h3>
          <div className="h-64">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-zinc-400 italic">
                No referral stay metrics.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPayout" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F2352" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#4F2352" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tickLine={false} axisLine={false} style={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#FFF7F2", border: "1px solid #EFDFD2" }} />
                  <Area type="monotone" dataKey="Payouts" stroke="#4F2352" strokeWidth={2} fillOpacity={1} fill="url(#colorPayout)" name="Earnings (USD)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* MY WEBSITES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sites.map(site => {
          const siteRes = reservations.filter(r => r.siteId === site.id);
          const siteRev = siteRes.reduce((acc, r) => acc + r.bookingAmount, 0);
          
          return (
            <Card key={site.id} className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Globe size={16} className="text-brand-plum" />
                  <h4 className="font-bold text-brand-plum text-sm">{site.siteName}</h4>
                </div>
                <p className="text-[10px] text-zinc-400 font-mono truncate max-w-xs">{site.websiteUrl}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">Generated</span>
                <span className="text-sm font-extrabold text-brand-wine">${siteRev.toFixed(2)}</span>
                <span className="text-[10px] text-zinc-400 block">({siteRes.length} stays)</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
