"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Globe,
  Wallet,
  FileSpreadsheet,
  User as UserIcon,
  ArrowLeft,
  Loader2,
  Eye,
  ShieldAlert
} from "lucide-react";
import { AppShell, NavItem } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db/mockDb";
import { User as UserType, Partner } from "@/lib/db/schema";

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
        } else if (process.env.NODE_ENV !== "production") {
          const devPartner: Partner = {
            id: previewPartnerId || "c7a36c53-b26e-41a4-9467-fbb5f25ee2f2",
            businessName: "Haari",
            contactName: "Megan Brass",
            email: "megan@megsbrass.com",
            phone: "+15551234567",
            paymentMethod: "BANK_TRANSFER",
            currency: "USD",
            payoutFrequency: "MONTHLY",
            status: "ACTIVE",
            createdAt: new Date().toISOString()
          };
          setPartner(devPartner);
          setIsPreviewMode(Boolean(previewPartnerId));
          setIsAdminWithoutPartner(false);
        } else if (!data.isAdminWithoutPartner) {
          router.push("/sign-in");
          return;
        }

        const sessionRes = await fetch("/api/auth/session");
        const sessionData = await sessionRes.json();
        if (sessionData.user) {
          setCurrentUser(sessionData.user);
        } else if (process.env.NODE_ENV !== "production") {
          const devUser: UserType = {
            id: "user-partner-1",
            email: "megan@megsbrass.com",
            name: "Megan Brass",
            role: "PARTNER_OWNER",
            status: "ACTIVE",
            createdAt: new Date().toISOString()
          };
          setCurrentUser(devUser);
        } else {
          router.push("/sign-in");
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
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center space-y-3 font-sans">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs text-secondary font-medium">Loading Partner Portal...</span>
        </div>
      </div>
    );
  }

  // Admin visiting /partner without selecting a partner -> Show prompt to select partner
  if (isAdminWithoutPartner) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 font-sans">
        <div className="max-w-md bg-surface border border-divider shadow-xl rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-accent-subtle border border-accent/20 text-accent-hover rounded-full flex items-center justify-center mx-auto">
            <Eye size={24} />
          </div>
          <h2 className="text-xl font-bold text-primary">Select a Partner to Preview</h2>
          <p className="text-secondary text-xs">
            You are signed in as an Administrator. Please select a partner from the Admin Partners directory to preview their dashboard view.
          </p>
          <Button
            variant="primary"
            icon={ArrowLeft}
            onClick={handleReturnToAdmin}
            className="w-full justify-center min-h-[44px]"
          >
            Go to Admin Partners Directory
          </Button>
        </div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4 font-sans">
        <div className="text-center space-y-2">
          <ShieldAlert className="h-10 w-10 text-danger mx-auto" />
          <h2 className="text-lg font-bold text-primary">Partner Profile Not Found</h2>
          <p className="text-xs text-secondary">Please contact your administrator to assign your partner profile.</p>
        </div>
      </div>
    );
  }

  const querySuffix = previewPartnerId ? `?previewPartnerId=${encodeURIComponent(previewPartnerId)}` : "";

  // Canonical Partner Navigation Architecture
  const partnerPrimaryNav: NavItem[] = [
    { id: "overview", label: "Overview", href: `/partner${querySuffix}`, icon: LayoutDashboard },
    { id: "bookings", label: "Bookings", href: `/partner/bookings${querySuffix}`, icon: CalendarDays },
    { id: "sites", label: "Websites", href: `/partner/sites${querySuffix}`, icon: Globe },
    { id: "payouts", label: "Payouts", href: `/partner/payouts${querySuffix}`, icon: Wallet },
    { id: "statements", label: "Statements", href: `/partner/statements${querySuffix}`, icon: FileSpreadsheet },
    { id: "profile", label: "Profile", href: `/partner/profile${querySuffix}`, icon: UserIcon }
  ];

  const getPartnerActiveNavId = (path: string) => {
    if (path === "/partner") return "overview";
    if (path.startsWith("/partner/bookings")) return "bookings";
    if (path.startsWith("/partner/sites")) return "sites";
    if (path.startsWith("/partner/payouts")) return "payouts";
    if (path.startsWith("/partner/statements")) return "statements";
    if (path.startsWith("/partner/profile")) return "profile";
    return "overview";
  };

  const getPartnerHeaderTitle = (path: string) => {
    if (path === "/partner") return "Partner Overview";
    if (path.startsWith("/partner/bookings")) return "My Bookings";
    if (path.startsWith("/partner/sites")) return "My Websites";
    if (path.startsWith("/partner/payouts")) return "Payouts History";
    if (path.startsWith("/partner/statements")) return "Monthly Statements";
    if (path.startsWith("/partner/profile")) return "Profile Settings";
    return "Partner Portal";
  };

  return (
    <AppShell
      brandVariant="clean"
      contextTag="Partner"
      primaryNav={partnerPrimaryNav}
      secondaryNav={[]}
      activeNavId={getPartnerActiveNavId(pathname)}
      onNavigate={(id, href) => {
        if (href) router.push(href);
      }}
      headerTitle={getPartnerHeaderTitle(pathname)}
      headerSubtitle={partner ? partner.businessName : "Partner Portal"}
      user={{
        name: currentUser ? currentUser.name : partner ? partner.contactName : "Partner Owner",
        email: currentUser ? currentUser.email : partner ? partner.email : "",
        role: isPreviewMode ? "Admin Preview" : "Partner Owner"
      }}
      isPreviewActive={isPreviewMode}
      previewPartnerName={partner ? partner.businessName : "Partner"}
      onReturnFromPreview={handleReturnToAdmin}
      onSignOut={handleLogout}
    >
      {children}
    </AppShell>
  );
}

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-canvas"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <PartnerLayoutContent>{children}</PartnerLayoutContent>
    </Suspense>
  );
}
