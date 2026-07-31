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
  ArrowLeft,
  Loader2
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
  const [loading, setLoading] = useState(true);

  const { signOut } = useClerk();

  useEffect(() => {
    let isSubscribed = true;

    async function checkAuthSession() {
      try {
        console.log(`[Partner Layout Debug] Checking session for path: ${pathname}...`);
        const res = await fetch("/api/auth/session");
        const data = await res.json();

        if (!isSubscribed) return;

        console.log(`[Partner Layout Debug] Session result:`, data);

        if (data.status === "PENDING_ACCESS") {
          console.log(`[Partner Layout Debug] User pending approval. Redirecting to /pending-access.`);
          router.replace("/pending-access");
          return;
        }

        if (data.status === "UNAUTHENTICATED" || !data.authenticated) {
          console.log(`[Partner Layout Debug] Unauthenticated. Redirecting to /sign-in.`);
          router.replace("/sign-in");
          return;
        }

        if (data.status === "APPROVED" && data.user) {
          const authUser = data.user as UserType;
          db.currentUser = authUser;
          setCurrentUser(authUser);

          const partnerIdToUse = authUser.partnerId || "partner-001";
          const partnerData = db.partners.find(p => p.id === partnerIdToUse) || db.partners[0];
          if (partnerData) {
            setPartner(partnerData);
          }
          setLoading(false);
          return;
        }

        // Fallback safety
        router.replace("/pending-access");
      } catch (err) {
        console.error(`[Partner Layout Error]`, err);
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    checkAuthSession();

    return () => {
      isSubscribed = false;
    };
  }, [pathname, router]);

  const handleLogout = async () => {
    db.currentUser = null;
    await signOut({ redirectUrl: "/sign-in" });
  };

  const handleReturnToAdmin = () => {
    const admin = db.users.find(u => u.role === "SUPER_ADMIN");
    if (admin) {
      db.currentUser = admin;
      router.push("/admin");
    } else {
      router.push("/sign-in");
    }
  };

  if (loading || !currentUser || !partner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-plum" />
          <span className="text-xs font-serif italic text-zinc-500">Loading Partner Portal...</span>
        </div>
      </div>
    );
  }

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
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 ${
                  isActive
                    ? "bg-brand-plum text-brand-cream shadow-sm"
                    : "text-zinc-600 hover:bg-brand-blush/30 hover:text-brand-plum"
                }`}
              >
                <Icon size={16} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Partner Info Footer */}
        <div className="p-4 border-t border-brand-blush space-y-3">
          <div className="p-3 bg-brand-bg/60 rounded-xl border border-brand-blush/60">
            <div className="text-[10px] uppercase font-bold text-brand-wine tracking-wider">
              {partner.businessName}
            </div>
            <div className="text-xs font-bold text-brand-plum truncate mt-0.5">
              {currentUser.name}
            </div>
            <div className="text-[10px] text-zinc-400 font-mono truncate mt-0.5">
              {currentUser.email}
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 p-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-brand-blush bg-brand-cream/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0 no-print">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-bold text-brand-wine uppercase tracking-widest bg-brand-blush/40 px-2.5 py-1 rounded-full">
              Partner Portal
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {(currentUser.role === "SUPER_ADMIN" || currentUser.role === "ADMIN") && (
              <button
                onClick={handleReturnToAdmin}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-plum text-brand-cream hover:bg-brand-wine transition-all"
              >
                <ArrowLeft size={14} />
                <span>Return to Admin</span>
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Children */}
        <div className="flex-1 p-6 sm:p-8 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
