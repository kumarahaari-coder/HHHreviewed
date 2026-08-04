"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
  Loader2,
  Eye,
  ShieldAlert
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { User as UserType, Partner } from "@/lib/db/schema";
import { Badge } from "@/components/ui/custom";
import { RoleSwitcher } from "@/components/RoleSwitcher";

function PartnerLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const previewPartnerId = searchParams.get("previewPartnerId");

  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isAdminWithoutPartner, setIsAdminWithoutPartner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;

    async function loadPartnerData() {
      try {
        setLoading(true);
        const url = previewPartnerId
          ? `/api/partner/dashboard?previewPartnerId=${encodeURIComponent(previewPartnerId)}`
          : "/api/partner/dashboard";

        console.log(`[Partner Layout] Fetching dashboard from ${url}...`);
        const res = await fetch(url);
        const data = await res.json();

        if (!isSubscribed) return;

        console.log("[Partner Layout] Dashboard API response:", data);

        if (data.isAdminWithoutPartner) {
          setIsAdminWithoutPartner(true);
          setLoading(false);
          return;
        }

        if (data.partner) {
          setPartner(data.partner);
          setIsPreviewMode(!!data.isPreviewMode);
          setIsAdminWithoutPartner(false);
        } else {
          // Fallback default partner
          setPartner({
            id: "00000000-0000-0000-0000-000000000001",
            businessName: "Hidden Honey Partner",
            contactName: "Partner Owner",
            email: "kumarahaari@gmail.com",
            phone: "",
            paymentMethod: "BANK_TRANSFER",
            currency: "USD",
            payoutFrequency: "MONTHLY",
            status: "ACTIVE",
            createdAt: new Date().toISOString()
          });
        }

        const sessionRes = await fetch("/api/auth/session");
        const sessionData = await sessionRes.json();
        if (sessionData.user) {
          setCurrentUser(sessionData.user);
        }
      } catch (err) {
        console.error("[Partner Layout Error]", err);
      } finally {
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    loadPartnerData();

    return () => {
      isSubscribed = false;
    };
  }, [pathname, previewPartnerId, router]);

  const handleLogout = async () => {
    db.currentUser = null;
    router.push("/login");
  };

  const handleReturnToAdmin = () => {
    router.push("/admin/partners");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-plum" />
          <span className="text-xs font-serif italic text-zinc-500">Loading Partner Portal...</span>
        </div>
      </div>
    );
  }

  // Admin visiting /partner without selecting a partner -> Show prompt to select partner
  if (isAdminWithoutPartner) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-bg px-4 font-sans">
        <div className="max-w-md bg-brand-cream border border-brand-blush shadow-xl rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-purple-100 border border-purple-200 text-purple-700 rounded-full flex items-center justify-center mx-auto">
            <Eye size={24} />
          </div>
          <h2 className="text-2xl font-extrabold text-brand-plum">Select a Partner to Preview</h2>
          <p className="text-zinc-600 text-xs font-serif italic">
            You are signed in as an Administrator. Please select a partner from the Admin Partners directory to preview their dashboard view.
          </p>
          <button
            onClick={handleReturnToAdmin}
            className="w-full bg-brand-plum hover:bg-brand-wine text-brand-cream py-2.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center space-x-2"
          >
            <ArrowLeft size={16} />
            <span>Go to Admin Partners Directory</span>
          </button>
        </div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg px-4">
        <div className="text-center">
          <ShieldAlert className="h-10 w-10 text-amber-600 mx-auto mb-2" />
          <h2 className="text-lg font-bold text-brand-plum">Partner Profile Not Found</h2>
          <p className="text-xs text-zinc-500 mt-1">Please contact your administrator to assign your partner profile.</p>
        </div>
      </div>
    );
  }

  const querySuffix = previewPartnerId ? `?previewPartnerId=${encodeURIComponent(previewPartnerId)}` : "";

  const menuItems = [
    { name: "Dashboard", href: `/partner${querySuffix}`, icon: LayoutDashboard },
    { name: "My Bookings", href: `/partner/bookings${querySuffix}`, icon: CalendarDays },
    { name: "My Websites", href: `/partner/sites${querySuffix}`, icon: Globe2 },
    { name: "Payouts History", href: `/partner/payouts${querySuffix}`, icon: DollarSign },
    { name: "Monthly Statements", href: `/partner/statements${querySuffix}`, icon: FileText },
    { name: "Profile Settings", href: `/partner/profile${querySuffix}`, icon: User }
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
            const isActive = pathname === item.href.split("?")[0];
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
            <div className="text-[10px] uppercase font-bold text-brand-wine tracking-wider truncate">
              {partner.businessName}
            </div>
            <div className="text-xs font-bold text-brand-plum truncate mt-0.5">
              {partner.contactName}
            </div>
            <div className="text-[10px] text-zinc-400 font-mono truncate mt-0.5">
              {partner.email}
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
        {/* Admin Preview Banner if active */}
        {isPreviewMode && (
          <div className="bg-purple-900 text-purple-100 px-6 py-2.5 flex items-center justify-between shadow-inner text-xs font-bold no-print">
            <div className="flex items-center space-x-2">
              <Eye size={16} className="text-purple-300 animate-pulse" />
              <span>Admin Preview Mode — Previewing partner account: <strong className="text-white underline">{partner.businessName}</strong> ({partner.contactName})</span>
            </div>

            <button
              onClick={handleReturnToAdmin}
              className="bg-brand-cream text-brand-plum hover:bg-white px-3 py-1 rounded-lg text-[11px] font-bold shadow-sm transition-all flex items-center space-x-1"
            >
              <ArrowLeft size={12} />
              <span>Return to Admin Partners Directory</span>
            </button>
          </div>
        )}

        {/* Top Header */}
        <header className="h-16 border-b border-brand-blush bg-brand-cream/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0 no-print">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-bold text-brand-wine uppercase tracking-widest bg-brand-blush/40 px-2.5 py-1 rounded-full">
              Partner Portal
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <RoleSwitcher />
            {currentUser && (currentUser.role === "SUPER_ADMIN" || currentUser.role === "ADMIN" || currentUser.role === "FINANCE_ADMIN") && (
              <button
                onClick={handleReturnToAdmin}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-plum text-brand-cream hover:bg-brand-wine transition-all"
              >
                <ArrowLeft size={14} />
                <span>Return to Admin Directory</span>
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

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-brand-bg"><Loader2 className="h-8 w-8 animate-spin text-brand-plum" /></div>}>
      <PartnerLayoutContent>{children}</PartnerLayoutContent>
    </Suspense>
  );
}
