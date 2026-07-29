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
  Activity
} from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { User, SystemNotification } from "@/lib/db/schema";
import { Badge } from "@/components/ui/custom";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Role protection
    const user = db.currentUser;
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "FINANCE_ADMIN")) {
      router.push("/");
      return;
    }
    setCurrentUser(user);
    setNotifications(db.notifications);
  }, [router]);

  const handleLogout = () => {
    db.currentUser = null;
    router.push("/");
  };

  const handlePersonaSwitch = (userId: string) => {
    const targetUser = db.users.find(u => u.id === userId);
    if (targetUser) {
      db.currentUser = targetUser;
      setCurrentUser(targetUser);
      // If switched to a partner, route to partner portal
      if (targetUser.role === "PARTNER_OWNER") {
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

  if (!mounted || !currentUser) return null;

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
                <Icon size={18} className={isActive ? "text-brand-cream" : "text-zinc-400 group-hover:text-brand-plum"} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User profile / Logout */}
        <div className="p-4 border-t border-brand-blush bg-brand-blush/10">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-brand-blush flex items-center justify-center text-brand-wine font-bold text-sm border border-brand-blush">
              {currentUser.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate text-brand-plum leading-none mb-1">
                {currentUser.name}
              </p>
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                {currentUser.role.replace("_", " ")}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 border border-brand-blush hover:border-brand-plum/40 hover:bg-brand-cream text-xs font-semibold text-zinc-600 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-brand-plum"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* HEADER */}
        <header className="h-16 border-b border-brand-blush bg-brand-cream flex items-center justify-between px-8 z-10 no-print">
          {/* Dashboard Title or Context */}
          <div className="flex items-center space-x-4">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-serif">
              Hidden Honey Homes Partner Dashboard
            </span>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-6">
            {/* Simulator Persona Switcher */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-zinc-500 font-serif italic flex items-center gap-1">
                <Activity size={12} className="text-brand-plum animate-pulse" />
                Simulate role:
              </span>
              <div className="relative">
                <select
                  value={currentUser.id}
                  onChange={e => handlePersonaSwitch(e.target.value)}
                  className="bg-brand-bg border border-brand-blush rounded-lg text-xs font-bold text-brand-plum py-1.5 pl-3 pr-8 focus:outline-none focus:border-brand-plum focus:ring-1 focus:ring-brand-plum appearance-none cursor-pointer"
                >
                  <optgroup label="Administrators">
                    {db.users
                      .filter(u => u.role !== "PARTNER_OWNER")
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Partners">
                    {db.users
                      .filter(u => u.role === "PARTNER_OWNER")
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} (Partner)
                        </option>
                      ))}
                  </optgroup>
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-plum pointer-events-none"
                />
              </div>
            </div>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-zinc-500 hover:text-brand-plum hover:bg-brand-blush/30 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-brand-plum"
                aria-label="Toggle notifications"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-brand-wine text-white rounded-full flex items-center justify-center text-[9px] font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-brand-cream border border-brand-blush rounded-xl shadow-xl z-20 py-2 animate-scale-up">
                  <div className="flex items-center justify-between px-4 pb-2 border-b border-brand-blush mb-2">
                    <span className="text-xs font-bold text-brand-plum uppercase tracking-wider">
                      System Notifications
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-[10px] text-brand-wine hover:underline font-semibold"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto px-2 space-y-1">
                    {notifications.length === 0 ? (
                      <p className="text-center py-6 text-xs text-zinc-400 italic">
                        No notifications
                      </p>
                    ) : (
                      notifications.map(notif => (
                        <div
                          key={notif.id}
                          className={`p-2.5 rounded-lg border text-xs transition-colors ${
                            notif.read
                              ? "bg-transparent border-transparent text-zinc-500"
                              : "bg-brand-blush/20 border-brand-blush/40 text-brand-text font-medium"
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <Badge
                              type={
                                notif.type === "WARNING"
                                  ? "danger"
                                  : notif.type === "SUCCESS"
                                  ? "success"
                                  : "plum"
                              }
                            >
                              {notif.type}
                            </Badge>
                            <span className="text-[9px] text-zinc-400">
                              {new Date(notif.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </span>
                          </div>
                          <p>{notif.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* CONTENT BODY */}
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
