"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  CalendarDays,
  Users2,
  Globe2,
  Home,
  DollarSign,
  Cpu,
  Settings,
  Bell,
  LogOut,
  ChevronDown,
  Activity,
  Loader2
} from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import { db } from "@/lib/db/mockDb";
import { User, SystemNotification } from "@/lib/db/schema";
import { Badge } from "@/components/ui/custom";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(true);

  const { signOut } = useClerk();

  useEffect(() => {
    let isSubscribed = true;

    async function checkAdminAuthSession() {
      try {
        console.log(`[Admin Layout Debug] Checking session for path: ${pathname}...`);
        const res = await fetch("/api/auth/session");
        const data = await res.json();

        if (!isSubscribed) return;

        console.log(`[Admin Layout Debug] Session result:`, data);

        if (data.status === "PENDING_ACCESS") {
          console.log(`[Admin Layout Debug] User pending access. Redirecting to /pending-access.`);
          router.replace("/pending-access");
          return;
        }

        if (data.status === "UNAUTHENTICATED" || !data.authenticated) {
          console.log(`[Admin Layout Debug] Unauthenticated. Redirecting to /sign-in.`);
          router.replace("/sign-in");
          return;
        }

        if (data.status === "APPROVED" && data.user) {
          const authUser = data.user as User;
          const role = authUser.role;

          if (role === "SUPER_ADMIN" || role === "FINANCE_ADMIN" || role === "ADMIN") {
            db.currentUser = authUser;
            setCurrentUser(authUser);
            setNotifications(db.notifications);
            setLoading(false);
            return;
          } else {
            // Non-admin creator trying to access /admin -> Redirect to /partner (NEVER /sign-in!)
            console.log(`[Admin Layout Debug] Creator user (${authUser.email}) denied access to /admin. Redirecting to /partner.`);
            router.replace("/partner");
            return;
          }
        }

        router.replace("/pending-access");
      } catch (err) {
        console.error(`[Admin Layout Error]`, err);
        if (isSubscribed) {
          setLoading(false);
        }
      }
    }

    checkAdminAuthSession();

    return () => {
      isSubscribed = false;
    };
  }, [pathname, router]);

  const handleLogout = async () => {
    db.currentUser = null;
    await signOut({ redirectUrl: "/sign-in" });
  };

  const handlePersonaSwitch = (userId: string) => {
    const targetUser = db.users.find(u => u.id === userId);
    if (targetUser) {
      db.currentUser = targetUser;
      setCurrentUser(targetUser);
      if (targetUser.role === "PARTNER_OWNER" || targetUser.role === "CREATOR") {
        router.push("/partner");
      } else {
        router.refresh();
      }
    }
  };

  const markAllRead = () => {
    notifications.forEach(n => db.markNotificationRead(n.id));
    setNotifications(db.notifications);
  };

  if (loading || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-bg">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-plum" />
          <span className="text-xs font-serif italic text-zinc-500">Loading Admin Portal...</span>
        </div>
      </div>
    );
  }

  const menuItems = [
    { name: "Overview", href: "/admin", icon: LayoutDashboard },
    { name: "Bookings", href: "/admin/bookings", icon: CalendarDays },
    { name: "Partners", href: "/admin/partners", icon: Users2 },
    { name: "Sites & Widgets", href: "/admin/sites", icon: Globe2 },
    { name: "Properties", href: "/admin/properties", icon: Home },
    { name: "Payouts Queue", href: "/admin/payouts", icon: DollarSign },
    { name: "Integrations & Simulator", href: "/admin/integrations", icon: Cpu },
    { name: "Settings & Audits", href: "/admin/settings", icon: Settings }
  ];

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="flex min-h-screen bg-brand-bg text-brand-text font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-brand-blush bg-brand-cream shrink-0 flex flex-col no-print">
        {/* Brand */}
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
                Dashboard Portal
              </span>
            </div>
          </div>
        </div>

        {/* Menu Items */}
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

        {/* User Info & Switcher */}
        <div className="p-4 border-t border-brand-blush space-y-3">
          <div className="p-3 bg-brand-bg/60 rounded-xl border border-brand-blush/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-plum truncate">
                {currentUser.name}
              </span>
              <Badge type={currentUser.role === "SUPER_ADMIN" ? "success" : "info"}>
                {currentUser.role}
              </Badge>
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
              HHH Admin Management
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-xl border border-brand-blush hover:bg-brand-blush/20 text-zinc-600 relative transition-colors"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-brand-cream border border-brand-blush shadow-2xl rounded-2xl p-4 z-50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-sm text-brand-plum">Notifications</h4>
                    <button
                      onClick={markAllRead}
                      className="text-[10px] text-brand-wine font-bold hover:underline"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-zinc-400 italic text-center py-4">No notifications</p>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className={`p-2.5 rounded-xl border text-xs ${
                            n.read
                              ? "bg-brand-bg/30 border-brand-blush/40 text-zinc-500"
                              : "bg-brand-cream border-brand-blush text-brand-plum font-medium"
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-bold uppercase text-[9px] text-brand-wine">
                              {n.type}
                            </span>
                            <span className="text-[9px] text-zinc-400">{n.createdAt ? n.createdAt.split("T")[1]?.slice(0, 5) : "Just now"}</span>
                          </div>
                          <p className="mt-1 leading-snug">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Children */}
        <div className="flex-1 p-6 sm:p-8 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
