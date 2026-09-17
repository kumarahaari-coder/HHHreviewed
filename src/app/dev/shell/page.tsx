"use client";

import React, { useState, useEffect, Suspense } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { AppShell, NavItem } from "@/components/shell";
import {
  Button,
  Card,
  StatusBadge,
  PageHeader,
  FilterToolbar,
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableMobileCard
} from "@/components/ui";
import { formatStatusLabel, getStatusTypeForState } from "@/lib/status-mapper";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Globe,
  Building2,
  Wallet,
  Blocks,
  FileSpreadsheet,
  Settings,
  FileText,
  User,
  RefreshCw,
  Filter,
  MoreVertical,
  CheckCircle2
} from "lucide-react";

function ShellPreviewContent() {
  const searchParams = useSearchParams();

  // URL query state overrides for screenshot automation
  const initialPortal = (searchParams.get("portal") as "admin" | "partner" | "admin_preview") || "admin";
  const initialWordmark = (searchParams.get("wordmark") as "clean" | "monogram") || "clean";
  const initialDrawerOpen = searchParams.get("drawer") === "open";

  // Preview controls state
  const [portalMode, setPortalMode] = useState<"admin" | "partner" | "admin_preview">(initialPortal);
  const [wordmarkVariant, setWordmarkVariant] = useState<"clean" | "monogram">(initialWordmark);
  const [activeNavId, setActiveNavId] = useState("bookings");
  const [searchValue, setSearchValue] = useState("");

  useEffect(() => {
    if (searchParams.get("portal")) {
      setPortalMode(searchParams.get("portal") as any);
    }
    if (searchParams.get("wordmark")) {
      setWordmarkVariant(searchParams.get("wordmark") as any);
    }
  }, [searchParams]);

  // Admin Navigation Architecture
  const adminPrimaryNav: NavItem[] = [
    { id: "overview", label: "Overview", href: "#", icon: LayoutDashboard },
    { id: "bookings", label: "Bookings", href: "#", icon: CalendarDays, count: 42 },
    { id: "partners", label: "Partners", href: "#", icon: Users, count: 8 },
    { id: "sites", label: "Sites", href: "#", icon: Globe, count: 14 },
    { id: "properties", label: "Properties", href: "#", icon: Building2, count: 26 },
    { id: "payouts", label: "Payouts", href: "#", icon: Wallet, count: 3 },
    { id: "integrations", label: "Integrations", href: "#", icon: Blocks }
  ];

  const adminSecondaryNav: NavItem[] = [
    { id: "tax_documents", label: "Tax documents", href: "#", icon: FileText },
    { id: "settings", label: "Settings", href: "#", icon: Settings }
  ];

  // Partner Navigation Architecture
  const partnerPrimaryNav: NavItem[] = [
    { id: "overview", label: "Overview", href: "/partner", icon: LayoutDashboard },
    { id: "bookings", label: "Bookings", href: "/partner/bookings", icon: CalendarDays, count: 12 },
    { id: "sites", label: "Websites", href: "/partner/sites", icon: Globe, count: 2 },
    { id: "payouts", label: "Payouts", href: "/partner/payouts", icon: Wallet, count: 1 },
    { id: "statements", label: "Statements", href: "/partner/statements", icon: FileSpreadsheet },
    { id: "profile", label: "Profile", href: "/partner/profile", icon: User }
  ];

  // Static sample showcase bookings
  const sampleBookings = [
    {
      id: "ORB19198303",
      guest: "Emily Robinson",
      site: "Megs Brass Direct",
      amount: "$1,450.00",
      status: "ATTRIBUTED",
      date: "2026-09-15"
    },
    {
      id: "ORB19198304",
      guest: "Clarence Jackson",
      site: "Hidden Honey Main",
      amount: "$2,200.00",
      status: "UNPAID_PENDING_PAYMENT",
      date: "2026-09-14"
    },
    {
      id: "ORB19198305",
      guest: "Sarah Jenkins",
      site: "Escapes Referral",
      amount: "$850.00",
      status: "REVIEW_REQUIRED",
      date: "2026-09-12"
    },
    {
      id: "ORB19198306",
      guest: "Marcus Vance",
      site: "Megs Brass Direct",
      amount: "$3,100.00",
      status: "ELIGIBILITY_RELEASE",
      date: "2026-09-10"
    }
  ];

  // Configure portal-specific settings
  const isPartner = portalMode === "partner";
  const isAdminPreview = portalMode === "admin_preview";

  const primaryNav = isPartner ? partnerPrimaryNav : adminPrimaryNav;
  const secondaryNav = isPartner ? [] : adminSecondaryNav;
  const contextTag = isPartner ? "Partner" : "Admin";

  const activeUser = isPartner
    ? { name: "Megan Brass", email: "megan@megsbrass.com", role: "Partner Owner" }
    : { name: "Hidden Honey Admin", email: "hiddenhoneyace@gmail.com", role: "Super Admin" };

  return (
    <AppShell
      brandVariant={wordmarkVariant}
      contextTag={contextTag}
      primaryNav={primaryNav}
      secondaryNav={secondaryNav}
      activeNavId={activeNavId}
      onNavigate={setActiveNavId}
      headerTitle={activeNavId.toUpperCase()}
      user={activeUser}
      isPreviewActive={isAdminPreview}
      previewPartnerName="Haari"
      onReturnFromPreview={() => setPortalMode("admin")}
      onSignOut={() => alert("Signed out successfully")}
      initialMobileNavOpen={initialDrawerOpen}
    >
      <div className="space-y-8 font-sans">
        {/* 0. Developer Controls Toolbar */}
        <div className="bg-surface border border-divider rounded-xl p-4 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-divider-soft pb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-secondary">
                Developer AppShell Preview Controls
              </h2>
              <p className="text-[11px] text-tertiary mt-0.5">
                Development-only environment testing Phase C HHH identity, AppShell, and responsive navigation drawer.
              </p>
            </div>
            <StatusBadge variant="neutral">Dev-Only Preview (/dev/shell)</StatusBadge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Mode Switcher */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-secondary uppercase tracking-wider">
                Portal Mode / Role Context:
              </label>
              <div className="flex items-center gap-1.5 p-1 bg-surface-muted border border-divider-soft rounded-md">
                <button
                  type="button"
                  onClick={() => setPortalMode("admin")}
                  className={`flex-1 py-1 px-2 rounded text-xs font-medium cursor-pointer transition-colors ${
                    portalMode === "admin" ? "bg-surface text-primary font-semibold shadow-xs" : "text-secondary hover:text-primary"
                  }`}
                >
                  Admin Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPortalMode("partner")}
                  className={`flex-1 py-1 px-2 rounded text-xs font-medium cursor-pointer transition-colors ${
                    portalMode === "partner" ? "bg-surface text-primary font-semibold shadow-xs" : "text-secondary hover:text-primary"
                  }`}
                >
                  Partner Portal
                </button>
                <button
                  type="button"
                  onClick={() => setPortalMode("admin_preview")}
                  className={`flex-1 py-1 px-2 rounded text-xs font-medium cursor-pointer transition-colors ${
                    portalMode === "admin_preview" ? "bg-accent-subtle text-accent-hover font-semibold shadow-xs" : "text-secondary hover:text-primary"
                  }`}
                >
                  Admin Preview
                </button>
              </div>
            </div>

            {/* HHH Wordmark Typographic Direction Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-secondary uppercase tracking-wider">
                HHH Wordmark Direction:
              </label>
              <div className="flex items-center gap-1.5 p-1 bg-surface-muted border border-divider-soft rounded-md">
                <button
                  type="button"
                  onClick={() => setWordmarkVariant("clean")}
                  className={`flex-1 py-1 px-2 rounded text-xs font-medium cursor-pointer transition-colors ${
                    wordmarkVariant === "clean" ? "bg-surface text-primary font-semibold shadow-xs" : "text-secondary hover:text-primary"
                  }`}
                >
                  Option A (Clean)
                </button>
                <button
                  type="button"
                  onClick={() => setWordmarkVariant("monogram")}
                  className={`flex-1 py-1 px-2 rounded text-xs font-medium cursor-pointer transition-colors ${
                    wordmarkVariant === "monogram" ? "bg-surface text-primary font-semibold shadow-xs" : "text-secondary hover:text-primary"
                  }`}
                >
                  Option B (Monogram)
                </button>
              </div>
            </div>

            {/* Responsive Viewport Guide */}
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <label className="text-[11px] font-semibold text-secondary uppercase tracking-wider">
                Responsive Viewport Standards:
              </label>
              <div className="text-[11px] text-secondary bg-surface-subtle p-2 border border-divider-soft rounded-md space-y-0.5">
                <p><strong className="text-primary font-semibold">Desktop (≥1200px):</strong> Persistent 240px sidebar, 32px gutters</p>
                <p><strong className="text-primary font-semibold">Tablet (768–1199px):</strong> Top bar + SlideOver drawer, 20–24px gutters</p>
                <p><strong className="text-primary font-semibold">Mobile (&lt;768px):</strong> Compact bar, bottom-sheets, 16px gutters</p>
              </div>
            </div>
          </div>
        </div>

        {/* Integrated Phase B PageHeader */}
        <PageHeader
          title={
            activeNavId === "bookings" ? "Bookings" :
            activeNavId === "partners" ? "Partner Directory" :
            activeNavId === "websites" ? "Websites & Referral Channels" :
            activeNavId === "payouts" ? "Payout Ledger" :
            activeNavId === "statements" ? "Monthly Statements" :
            "Operational Workspace"
          }
          description="Reservations, attribution status, and commission settlement tracking across verified referral channels."
          breadcrumbs={[
            { label: contextTag || "Portal", href: "#" },
            { label: activeNavId.charAt(0).toUpperCase() + activeNavId.slice(1) }
          ]}
          action={
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
              <Button variant="secondary" icon={RefreshCw} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                Refresh Sync
              </Button>
              <Button variant="primary" icon={CheckCircle2} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                Reconcile Ledger
              </Button>
            </div>
          }
        />

        {/* Operational Overview Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card variant="default" title="Total Reservations" action={<StatusBadge variant="neutral">30 Days</StatusBadge>}>
            <div className="text-2xl font-bold text-primary tabular-nums mt-1">42</div>
            <p className="text-[11px] text-secondary mt-1">100% OwnerRez verified sync</p>
          </Card>

          <Card variant="default" title="Attributed Gross Volume" action={<StatusBadge variant="success">Attributed</StatusBadge>}>
            <div className="text-2xl font-bold text-primary tabular-nums mt-1">$48,250.00</div>
            <p className="text-[11px] text-secondary mt-1">across 14 active referral sites</p>
          </Card>

          <Card variant="default" title="Estimated Commission" action={<StatusBadge variant="warning">Accrued</StatusBadge>}>
            <div className="text-2xl font-bold text-primary tabular-nums mt-1">$4,825.00</div>
            <p className="text-[11px] text-secondary mt-1">Average 10.0% partner rate</p>
          </Card>

          <Card variant="default" title="Eligible Payout Release" action={<StatusBadge variant="accent">Phase 5 Simulation</StatusBadge>}>
            <div className="text-2xl font-bold text-primary tabular-nums mt-1">$1,450.00</div>
            <p className="text-[11px] text-secondary mt-1">Settlement switch: OFF (false)</p>
          </Card>
        </div>

        {/* Integrated FilterToolbar & Responsive Table */}
        <div className="space-y-4">
          <FilterToolbar
            search={{
              value: searchValue,
              onChange: setSearchValue,
              placeholder: "Filter reservations..."
            }}
            resultsCount={sampleBookings.length}
            actions={
              <Button variant="secondary" size="sm" icon={Filter}>
                Filter Status
              </Button>
            }
          />

          {/* Desktop Operational Table (≥768px) */}
          <div className="hidden md:block">
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking ID</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead>Referred Source</TableHead>
                    <TableHead align="right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead align="right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sampleBookings.map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-secondary">{b.id}</TableCell>
                      <TableCell className="font-semibold text-primary">{b.guest}</TableCell>
                      <TableCell>{b.site}</TableCell>
                      <TableCell align="right" numeric className="font-medium">{b.amount}</TableCell>
                      <TableCell>
                        <StatusBadge variant={getStatusTypeForState(b.status)} dot>
                          {formatStatusLabel(b.status)}
                        </StatusBadge>
                      </TableCell>
                      <TableCell align="right">
                        <Button variant="tertiary" size="sm" icon={MoreVertical} aria-label="Actions" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </div>

          {/* Mobile Stacked Card List (<768px) */}
          <div className="block md:hidden space-y-3">
            {sampleBookings.map(b => (
              <TableMobileCard
                key={b.id}
                title={<span className="font-mono text-primary">{b.id}</span>}
                subtitle={b.guest}
                badge={
                  <StatusBadge variant={getStatusTypeForState(b.status)} dot>
                    {formatStatusLabel(b.status)}
                  </StatusBadge>
                }
                action={<Button variant="tertiary" size="sm" icon={MoreVertical} aria-label="Actions" className="min-h-[44px] min-w-[44px] flex items-center justify-center p-0" />}
                details={[
                  { label: "Referred Source", value: b.site },
                  { label: "Stay Date", value: b.date, numeric: true },
                  { label: "Gross Amount", value: b.amount, numeric: true }
                ]}
              />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function DevShellPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-secondary">Loading AppShell Preview...</div>}>
      <ShellPreviewContent />
    </Suspense>
  );
}
