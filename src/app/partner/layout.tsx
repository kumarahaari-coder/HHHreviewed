"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  CalendarDays,
  Globe2,
  DollarSign,
  FileText,
  User,
  LogOut,
  ChevronDown,
  ArrowLeft
} from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import { db } from "@/lib/db/mockDb";
import { User as UserType, Partner } from "@/lib/db/schema";
import { Badge } from "@/components/ui/custom";

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let user = db.currentUser;
    // Fallback partner mapping if user has no partnerId
    if (user && !user.partnerId) {
      user = { ...user, partnerId: "partner-001" };
      db.currentUser = user;
    }
    // Role protection for creator portal
    if (!user || (user.role !== "PARTNER_OWNER" && user.role !== "CREATOR" && user.role !== "SUPER_ADMIN" && user.role !== "ADMIN")) {
      router.push("/sign-in");
      return;
    }
    setCurrentUser(user);

    const partnerIdToUse = user.partnerId || "partner-001";
    const partnerData = db.partners.find(p => p.id === partnerIdToUse) || db.partners[0];
    if (partnerData) {
      setPartner(partnerData);
    }
  }, [router]);

  const { signOut } = useClerk();

  const handleLogout = async () => {
    db.currentUser = null;
    await signOut({ redirectUrl: "/sign-in" });
  };

  const handleReturnToAdmin = () => {
    // Return to the first admin user in db
    const admin = db.users.find(u => u.role === "SUPER_ADMIN");
    if (admin) {
      db.currentUser = admin;
      router.push("/admin");
    } else {
      router.push("/");
    }
  };

  if (!mounted || !currentUser || !partner) return null;

  const menuItems = [
    { name: "Dashboard", href: "/partner", icon: LayoutDashboard },
    { name: "My Bookings", href: "/partner/bookings", icon: CalendarDays },
    { name: "My Websites", href: "/partner/sites", icon: Globe2 },
    { name: "Payouts History", href: "/partner/payouts", icon: DollarSign },
    { name: "Monthly Statements", href: "/partner/statements", icon: FileText },
    { name: "Profile Settings", href: "/partner/profile", icon: User }
  ];

  return (
    <div className="flex min-h-screen bg-brand-bg text-brand-text font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-brand-blush bg-brand-cream shrink-0 flex flex-col no-print">
        {/* Brand HHH */}
        <div className="p-6 border-b border-brand-blush">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-brand-plum flex items-center justify-center text-brand-cream font-bold">
              H
            </div>
            <div>
              <h1 className="font-extrabold text-brand-plum tracking-tight leading-none text-base">
                Hidden Honey
              </h1>
              <span className="text-[10px] text-zinc-400 font-serif italic">
                Partner Portal
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map(item => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand-plum ${
                  isActive
                    ? "bg-brand-plum text-brand-cream"
                    : "text-zinc-600 hover:text-brand-plum hover:bg-brand-blush/30"
                }`}
              >
                <Icon size={18} className={isActive ? "text-brand-cream" : "text-zinc-400"} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Return to Admin switch (Evaluation Aid) */}
        <div className="p-4 border-t border-brand-blush bg-brand-blush/10 space-y-3">
          <button
            onClick={handleReturnToAdmin}
            className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 border border-brand-blush hover:border-brand-plum hover:bg-brand-cream text-xs font-bold text-brand-wine rounded-lg transition-colors"
          >
            <ArrowLeft size={12} />
            <span>Return to Admin View</span>
          </button>

          <div className="flex items-center space-x-3 pt-2">
            <div className="w-9 h-9 rounded-full bg-brand-blush flex items-center justify-center text-brand-wine font-bold text-sm border border-brand-blush">
              {partner.contactName[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate text-brand-plum leading-none mb-1">
                {partner.contactName}
              </p>
              <span className="text-[10px] text-zinc-400 font-bold uppercase truncate block">
                {partner.businessName}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 border border-brand-blush hover:border-brand-plum/40 hover:bg-brand-cream text-xs font-semibold text-zinc-500 rounded-lg transition-colors"
          >
            <LogOut size={12} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* HEADER */}
        <header className="h-16 border-b border-brand-blush bg-brand-cream flex items-center justify-between px-8 z-10 no-print">
          <div className="flex items-center space-x-4">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-wine font-serif">
              {partner.businessName}
            </span>
          </div>

          <div className="flex items-center space-x-3 text-xs text-zinc-500 font-serif">
            <span>Secure Partner Access</span>
            <Badge type="sage">RLS Active</Badge>
          </div>
        </header>

        {/* CONTENT BODY */}
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
