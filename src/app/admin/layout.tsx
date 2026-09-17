"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Globe,
  Building2,
  Wallet,
  Blocks,
  FileText,
  Settings,
  Loader2
} from "lucide-react";
import { AppShell, NavItem } from "@/components/shell";
import { db } from "@/lib/db/mockDb";
import { User } from "@/lib/db/schema";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isSubscribed = true;

    async function checkAdminAuthSession() {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();

        if (!isSubscribed) return;

        if (data.user) {
          const authUser = data.user as User;
          if (authUser.role === "SUPER_ADMIN" || authUser.role === "FINANCE_ADMIN" || authUser.role === "ADMIN") {
            db.currentUser = authUser;
            setCurrentUser(authUser);
            setLoading(false);
            return;
          }
        } else if (process.env.NODE_ENV !== "production") {
          const devUser: User = {
            id: "user-admin-1",
            email: "hiddenhoneyace@gmail.com",
            name: "Hidden Honey Admin",
            role: "SUPER_ADMIN",
            status: "ACTIVE",
            createdAt: new Date().toISOString()
          };
          db.currentUser = devUser;
          setCurrentUser(devUser);
          setLoading(false);
          return;
        }

        // Unauthenticated or unauthorized role -> Redirect to sign-in
        router.push("/sign-in");
      } catch (err) {
        console.error(`[Admin Layout Error]`, err);
        if (isSubscribed) {
          router.push("/sign-in");
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
    router.push("/login");
  };

  if (loading || !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center space-y-3 font-sans">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs text-secondary font-medium">Loading Admin Portal...</span>
        </div>
      </div>
    );
  }

  // Canonical Admin Navigation Architecture
  const adminPrimaryNav: NavItem[] = [
    { id: "overview", label: "Overview", href: "/admin", icon: LayoutDashboard },
    { id: "bookings", label: "Bookings", href: "/admin/bookings", icon: CalendarDays },
    { id: "partners", label: "Partners", href: "/admin/partners", icon: Users },
    { id: "sites", label: "Sites", href: "/admin/sites", icon: Globe },
    { id: "properties", label: "Properties", href: "/admin/properties", icon: Building2 },
    { id: "payouts", label: "Payouts", href: "/admin/payouts", icon: Wallet },
    { id: "integrations", label: "Integrations", href: "/admin/integrations", icon: Blocks }
  ];

  const adminSecondaryNav: NavItem[] = [
    { id: "tax_documents", label: "Tax documents", href: "/admin/tax-documents", icon: FileText },
    { id: "settings", label: "Settings", href: "/admin/settings", icon: Settings }
  ];

  const getActiveNavId = (path: string) => {
    if (path === "/admin") return "overview";
    if (path.startsWith("/admin/bookings")) return "bookings";
    if (path.startsWith("/admin/partners")) return "partners";
    if (path.startsWith("/admin/sites")) return "sites";
    if (path.startsWith("/admin/properties")) return "properties";
    if (path.startsWith("/admin/payouts")) return "payouts";
    if (path.startsWith("/admin/integrations")) return "integrations";
    if (path.startsWith("/admin/tax-documents")) return "tax_documents";
    if (path.startsWith("/admin/settings")) return "settings";
    return "overview";
  };

  const getHeaderTitle = (path: string) => {
    if (path === "/admin") return "Overview";
    if (path.startsWith("/admin/bookings")) return "Bookings";
    if (path.startsWith("/admin/partners")) return "Partner Directory";
    if (path.startsWith("/admin/sites")) return "Sites & Referral Channels";
    if (path.startsWith("/admin/properties")) return "Properties";
    if (path.startsWith("/admin/payouts")) return "Payouts Queue";
    if (path.startsWith("/admin/integrations")) return "Integrations & Simulator";
    if (path.startsWith("/admin/tax-documents")) return "Tax Documents";
    if (path.startsWith("/admin/settings")) return "Settings & Audits";
    return "Admin Portal";
  };

  return (
    <AppShell
      brandVariant="clean"
      contextTag="Admin"
      primaryNav={adminPrimaryNav}
      secondaryNav={adminSecondaryNav}
      activeNavId={getActiveNavId(pathname)}
      onNavigate={(id, href) => {
        if (href) router.push(href);
      }}
      headerTitle={getHeaderTitle(pathname)}
      user={{
        name: currentUser.name || "Admin User",
        email: currentUser.email || "",
        role: currentUser.role || "ADMIN"
      }}
      onSignOut={handleLogout}
    >
      {children}
    </AppShell>
  );
}
