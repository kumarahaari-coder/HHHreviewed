"use client";

import React, { useState } from "react";
import { notFound } from "next/navigation";
import {
  Button,
  Input,
  Textarea,
  Select,
  Checkbox,
  Card,
  StatusBadge,
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableMobileCard,
  Dialog,
  SlideOver,
  Dropdown,
  Tabs,
  PageHeader,
  FilterToolbar,
  LoadingState,
  EmptyState,
  ErrorBanner
} from "@/components/ui";
import { formatStatusLabel, getStatusTypeForState } from "@/lib/status-mapper";
import {
  Plus,
  Download,
  Filter,
  Search,
  MoreVertical,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Trash2,
  Eye,
  Building2,
  Users,
  ShieldCheck,
  Calendar,
  DollarSign,
  SlidersHorizontal
} from "lucide-react";

export default function ComponentShowcasePage() {
  // Gated in production environment
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  // Interactive demo states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [searchValue, setSearchValue] = useState("");
  const [checkboxState, setCheckboxState] = useState(true);
  const [selectValue, setSelectValue] = useState("usd");
  const [showErrorBanner, setShowErrorBanner] = useState(true);

  // Mock static showcase table data
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

  const colorSwatches = [
    { name: "Canvas", token: "bg-canvas", hex: "#F5F5F7", text: "text-primary", border: "border-divider" },
    { name: "Surface", token: "bg-surface", hex: "#FFFFFF", text: "text-primary", border: "border-divider" },
    { name: "Surface Subtle", token: "bg-surface-subtle", hex: "#FBFBFD", text: "text-primary", border: "border-divider-soft" },
    { name: "Primary", token: "bg-primary", hex: "#1D1D1F", text: "text-surface", border: "border-transparent" },
    { name: "Secondary", token: "bg-secondary", hex: "#6E6E73", text: "text-surface", border: "border-transparent" },
    { name: "Tertiary", token: "bg-tertiary", hex: "#86868B", text: "text-surface", border: "border-transparent" },
    { name: "Divider", token: "bg-divider", hex: "#D2D2D7", text: "text-primary", border: "border-transparent" },
    { name: "Divider Soft", token: "bg-divider-soft", hex: "#E8E8ED", text: "text-primary", border: "border-transparent" },
    { name: "HHH Honey Accent", token: "bg-accent", hex: "#B7791F", text: "text-surface", border: "border-transparent" },
    { name: "Success", token: "bg-success-surface", hex: "#EAF7ED", text: "text-success", border: "border-success-border" },
    { name: "Warning", token: "bg-warning-surface", hex: "#FEF7E6", text: "text-warning", border: "border-warning-border" },
    { name: "Danger", token: "bg-danger-surface", hex: "#FDEDED", text: "text-danger", border: "border-danger-border" },
    { name: "Info", token: "bg-info-surface", hex: "#EBF3FE", text: "text-info", border: "border-info-border" }
  ];

  return (
    <div className="min-h-screen bg-canvas text-primary p-4 sm:p-6 md:p-8 lg:p-12 font-sans max-w-7xl mx-auto space-y-8 sm:space-y-12">
      {/* 0. Brand Foundation Header */}
      <div className="bg-surface border border-divider rounded-xl p-4 sm:p-6 lg:p-8 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-divider-soft pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary text-surface flex items-center justify-center font-bold tracking-wider text-base font-sans shrink-0 shadow-xs">
              HHH
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-primary tracking-tight">
                HHH <span className="text-secondary font-normal text-xs sm:text-sm ml-1.5 sm:ml-2">Hidden Honey Homes</span>
              </h1>
              <p className="text-xs text-secondary mt-0.5">
                Canonical DESIGN.md Visual Contract & Mobile-First Responsive Showcase
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge variant="accent" dot>DESIGN.md Phase A + B Authorized</StatusBadge>
            <StatusBadge variant="neutral">Dev-Only Showcase</StatusBadge>
          </div>
        </div>
        <p className="text-xs text-secondary leading-relaxed">
          Operational design principles: <strong className="text-primary font-medium">calm / precise / trustworthy / premium / operational</strong>.
          Mobile-first responsive architecture: 16px page gutter on mobile, single-column stacked controls, minimum 44px touch targets, mobile bottom-sheets for dialogs, full-width slide-overs, and stacked operational cards for mobile tables.
        </p>
      </div>

      {/* Page Header Component */}
      <PageHeader
        title="Design Primitives Showcase"
        description="Development-only visual QA environment demonstrating canonical DESIGN.md tokens, mobile-first responsive primitives, typography, form controls, and overlay components."
        breadcrumbs={[
          { label: "Developer Tools", href: "#" },
          { label: "Component Showcase" }
        ]}
        action={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
            <Button variant="secondary" icon={Download} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
              Export Audit
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
              Test Modal
            </Button>
          </div>
        }
      />

      {/* 1. Typography & Scale */}
      <section className="space-y-3 sm:space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-secondary border-b border-divider pb-2">
          1. Typography Scale & Font Stack
        </h2>
        <div className="bg-surface border border-divider rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-xs">
          <div>
            <span className="text-[10px] text-tertiary font-mono uppercase">Display (28px / 1.2 / -0.02em)</span>
            <p className="text-2xl sm:text-display font-semibold text-primary leading-tight">28px Operational Display Heading</p>
          </div>
          <div>
            <span className="text-[10px] text-tertiary font-mono uppercase">Title Large (22px / 1.25 / -0.015em)</span>
            <p className="text-xl sm:text-title-lg font-semibold text-primary leading-tight">22px Section Title Large</p>
          </div>
          <div>
            <span className="text-[10px] text-tertiary font-mono uppercase">Title Medium (18px / 1.3 / -0.01em)</span>
            <p className="text-lg sm:text-title-md font-semibold text-primary leading-tight">18px Section Title Medium</p>
          </div>
          <div>
            <span className="text-[10px] text-tertiary font-mono uppercase">Title Small (15px / 1.35 / -0.005em)</span>
            <p className="text-base sm:text-title-sm font-semibold text-primary">15px Section Title Small</p>
          </div>
          <div>
            <span className="text-[10px] text-tertiary font-mono uppercase">Body Medium (14px / 1.45)</span>
            <p className="text-xs sm:text-body-md text-primary">14px Body text standard. Clean, legible native system typography stack.</p>
          </div>
          <div>
            <span className="text-[10px] text-tertiary font-mono uppercase">Body Small (13px / 1.4)</span>
            <p className="text-[12px] sm:text-body-sm text-secondary">13px Secondary body description text for subtitles and metadata.</p>
          </div>
          <div>
            <span className="text-[10px] text-tertiary font-mono uppercase">Caption (11px / 1.35)</span>
            <p className="text-caption text-tertiary uppercase tracking-wider font-semibold">11px Operational Caption / Eyebrow Text</p>
          </div>
          <div>
            <span className="text-[10px] text-tertiary font-mono uppercase">Tabular Numbers (.tabular-nums)</span>
            <p className="text-xs sm:text-body-md tabular-nums font-medium text-primary break-all sm:break-normal">
              $1,450.00 | $23,890.50 | 12.5% | 2026-09-16 | ORB19198303
            </p>
          </div>
        </div>
      </section>

      {/* 2. Color System */}
      <section className="space-y-3 sm:space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-secondary border-b border-divider pb-2">
          2. Canonical Color Swatches & Tokens
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-3">
          {colorSwatches.map(swatch => (
            <div key={swatch.name} className="bg-surface border border-divider rounded-lg p-2.5 sm:p-3 space-y-2 shadow-xs">
              <div className={`w-full h-8 sm:h-10 rounded-md ${swatch.token} ${swatch.border} border flex items-center justify-center text-[10px] font-mono font-medium ${swatch.text}`}>
                {swatch.hex}
              </div>
              <div>
                <p className="text-xs font-semibold text-primary leading-tight truncate">{swatch.name}</p>
                <p className="text-[10px] text-tertiary font-mono truncate mt-0.5">{swatch.token}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Buttons */}
      <section className="space-y-3 sm:space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-secondary border-b border-divider pb-2">
          3. Button Primitives (Graphite-First Primary, Touch-Target Compliant)
        </h2>
        <div className="bg-surface border border-divider rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6 shadow-xs">
          <div className="space-y-2">
            <span className="text-xs text-secondary font-medium">Variants (Primary action is graphite `#1D1D1F`):</span>
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <Button variant="primary" className="min-h-[44px] sm:min-h-0">Primary Graphite</Button>
              <Button variant="secondary" className="min-h-[44px] sm:min-h-0">Secondary Surface</Button>
              <Button variant="tertiary" className="min-h-[44px] sm:min-h-0">Tertiary Quiet</Button>
              <Button variant="destructive" className="min-h-[44px] sm:min-h-0">Destructive Action</Button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs text-secondary font-medium">Sizing Standards (Compact 32px, Standard 40px, Mobile 44px):</span>
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <Button size="sm" icon={Plus}>Small (32px)</Button>
              <Button size="md" icon={Download}>Standard (40px)</Button>
              <Button size="lg" icon={CheckCircle2}>Mobile Primary (44px)</Button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs text-secondary font-medium">States & Touch Targets (Loading, Disabled, Icon-Only):</span>
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              <Button size="md" icon={Search}>Icon + Text</Button>
              <Button size="md" icon={MoreVertical} aria-label="More actions" className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0" />
              <Button size="md" loading>Loading State</Button>
              <Button size="md" disabled>Disabled State</Button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Form Controls */}
      <section className="space-y-3 sm:space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-secondary border-b border-divider pb-2">
          4. Form Controls (Stacked Single-Column Mobile, Grid Desktop)
        </h2>
        <div className="bg-surface border border-divider rounded-xl p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 shadow-xs">
          <Input
            label="Standard Input"
            placeholder="Enter reservation code..."
            helperText="Format: ORB followed by digits"
            iconLeading={Search}
          />
          <Input
            label="Input with Error Validation"
            defaultValue="invalid-code"
            error="Reservation format invalid. Must match ORB-[0-9]+"
          />
          <Input
            label="Disabled Input"
            defaultValue="READONLY_KEY_1919"
            disabled
            helperText="Managed by system configuration"
          />
          <Select
            label="Currency Select"
            options={[
              { value: "usd", label: "USD — United States Dollar" },
              { value: "cad", label: "CAD — Canadian Dollar" },
              { value: "eur", label: "EUR — Euro" }
            ]}
            value={selectValue}
            onChange={e => setSelectValue(e.target.value)}
          />
          <div className="md:col-span-2 pt-1">
            <Checkbox
              label="Require manual partner verification before payout release"
              description="Forces missing accrual inspection if stay check-in dates shift."
              checked={checkboxState}
              onChange={setCheckboxState}
            />
          </div>
          <div className="md:col-span-2">
            <Textarea
              label="Audit Review Notes"
              placeholder="Provide reason for manual financial adjustment..."
              helperText="Logged in permanent transaction audit history."
            />
          </div>
        </div>
      </section>

      {/* 5. Cards */}
      <section className="space-y-3 sm:space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-secondary border-b border-divider pb-2">
          5. Card Treatments (Default White Surface, Subtle, Elevated)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <Card
            variant="default"
            title="Default Surface Card"
            description="12px corner radius, white surface, divider border."
            action={<StatusBadge variant="neutral">Default</StatusBadge>}
          >
            <p className="text-xs text-secondary leading-relaxed">
              Standard container for administrative sections, tables, and settings blocks.
            </p>
          </Card>

          <Card
            variant="subtle"
            title="Subtle Flat Surface"
            description="Light canvas surface background for quiet content."
            action={<StatusBadge variant="neutral">Subtle</StatusBadge>}
          >
            <p className="text-xs text-secondary leading-relaxed">
              Used for contextual notes, quiet summaries, and secondary fieldsets.
            </p>
          </Card>

          <Card
            variant="elevated"
            title="Elevated Card Variant"
            description="Restrained shadow for functional layer depth."
            action={<StatusBadge variant="accent">Elevated</StatusBadge>}
          >
            <p className="text-xs text-secondary leading-relaxed">
              Reserved for floating toolbars, active drop regions, and modal containers.
            </p>
          </Card>
        </div>
      </section>

      {/* 6. Status Language & Badges */}
      <section className="space-y-3 sm:space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-secondary border-b border-divider pb-2">
          6. Status Badges & Domain Status Mapper
        </h2>
        <div className="bg-surface border border-divider rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6 shadow-xs">
          <div className="space-y-2">
            <span className="text-xs text-secondary font-medium">Standard Visual Variants:</span>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <StatusBadge variant="success" dot>Success</StatusBadge>
              <StatusBadge variant="warning" dot>Warning</StatusBadge>
              <StatusBadge variant="danger" dot>Danger</StatusBadge>
              <StatusBadge variant="info" dot>Information</StatusBadge>
              <StatusBadge variant="accent" dot>Accent</StatusBadge>
              <StatusBadge variant="neutral" dot>Neutral</StatusBadge>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs text-secondary font-medium">Domain Status Mapper (`@/lib/status-mapper`):</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {[
                "ATTRIBUTED",
                "UNPAID_PENDING_PAYMENT",
                "REVIEW_REQUIRED",
                "ELIGIBILITY_RELEASE"
              ].map(rawEnum => {
                const variant = getStatusTypeForState(rawEnum);
                const label = formatStatusLabel(rawEnum);
                return (
                  <div key={rawEnum} className="p-3 bg-surface-subtle border border-divider-soft rounded-lg space-y-1">
                    <span className="text-[10px] text-tertiary font-mono">{rawEnum}</span>
                    <div>
                      <StatusBadge variant={variant} dot>
                        {label}
                      </StatusBadge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 7. Responsive Operational Table */}
      <section className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between border-b border-divider pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-secondary">
            7. Operational Table (Desktop Table vs Mobile Stacked Cards)
          </h2>
          <span className="text-[11px] text-tertiary font-mono hidden sm:inline">Adaptive Representation</span>
        </div>

        <FilterToolbar
          search={{
            value: searchValue,
            onChange: setSearchValue,
            placeholder: "Filter bookings..."
          }}
          resultsCount={sampleBookings.length}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setIsFilterSheetOpen(true)} className="sm:hidden">
                Filters
              </Button>
              <Button variant="secondary" size="sm" icon={Filter} className="hidden sm:inline-flex">
                Filter Status
              </Button>
            </div>
          }
        />

        {/* Desktop Table View (Hidden on mobile <768px) */}
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
                      <Dropdown
                        trigger={
                          <Button variant="tertiary" size="sm" icon={MoreVertical} aria-label="Booking actions" />
                        }
                        items={[
                          { id: "view", label: "View Details", icon: Eye, onClick: () => setIsDrawerOpen(true) },
                          { id: "pdf", label: "Download Statement", icon: FileText, onClick: () => {} },
                          { id: "delete", label: "Hold Payout", icon: Trash2, destructive: true, onClick: () => {} }
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>

        {/* Mobile Stacked Card View (Visible on mobile <768px) */}
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
              action={
                <Dropdown
                  trigger={
                    <Button variant="tertiary" size="sm" icon={MoreVertical} aria-label="Actions" className="min-h-[44px] min-w-[44px] flex items-center justify-center p-0" />
                  }
                  items={[
                    { id: "view", label: "View Details", icon: Eye, onClick: () => setIsDrawerOpen(true) },
                    { id: "pdf", label: "Download Statement", icon: FileText, onClick: () => {} },
                    { id: "delete", label: "Hold Payout", icon: Trash2, destructive: true, onClick: () => {} }
                  ]}
                />
              }
              details={[
                { label: "Referred Source", value: b.site },
                { label: "Stay Date", value: b.date, numeric: true },
                { label: "Gross Amount", value: b.amount, numeric: true }
              ]}
            />
          ))}
        </div>
      </section>

      {/* 8. Tabs & Segmented Control */}
      <section className="space-y-3 sm:space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-secondary border-b border-divider pb-2">
          8. Tabs & Segmented Controls (Scrollable on Narrow Viewports)
        </h2>
        <div className="bg-surface border border-divider rounded-xl p-4 sm:p-6 space-y-5 sm:space-y-6 shadow-xs">
          <div>
            <span className="text-xs text-secondary font-medium block mb-2.5">Underline Variant (Standard Navigation):</span>
            <Tabs
              tabs={[
                { id: "all", label: "All Reservations", count: 42 },
                { id: "pending", label: "Needs Review", count: 3 },
                { id: "eligible", label: "Eligible for Payout", count: 18 }
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
          </div>

          <div>
            <span className="text-xs text-secondary font-medium block mb-2.5">Segmented Variant (In-Page Mode Switcher):</span>
            <Tabs
              variant="segmented"
              tabs={[
                { id: "all", label: "Overview" },
                { id: "pending", label: "Analytics" },
                { id: "eligible", label: "Audit Logs" }
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
          </div>
        </div>
      </section>

      {/* 9. Feedback & Overlay Components */}
      <section className="space-y-3 sm:space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-secondary border-b border-divider pb-2">
          9. Feedback & Overlay Components
        </h2>

        {showErrorBanner && (
          <ErrorBanner
            title="Operational Notice"
            message="Settlement engine is operating in Phase 5 read-only simulation mode. Financial kill switch is active."
            onDismiss={() => setShowErrorBanner(false)}
            onRetry={() => alert("Re-testing connections...")}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <Card
            title="Modal & Drawer Controls"
            description="Click below to open responsive accessibility-hardened dialogs."
            footer={
              <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 justify-end w-full">
                <Button variant="secondary" onClick={() => setIsDrawerOpen(true)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                  Open SlideOver
                </Button>
                <Button variant="primary" onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                  Open Dialog Modal
                </Button>
              </div>
            }
          >
            <p className="text-xs text-secondary leading-relaxed">
              Dialogs transform into mobile bottom-sheets on small viewports and centered modals on desktop.
            </p>
          </Card>

          <Card title="Loading Primitive" description="Clean operational loading indicators.">
            <LoadingState variant="inline" message="Syncing OwnerRez stays..." />
          </Card>
        </div>

        <EmptyState
          icon={Building2}
          title="No Unattributed Sites Found"
          description="All referral channels and website widgets are properly linked to verified partners."
          action={
            <Button variant="secondary" icon={Plus} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
              Register New Website
            </Button>
          }
        />
      </section>

      {/* Responsive Filter Sheet for Mobile */}
      <SlideOver
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title="Filter Bookings"
        description="Select operational status or date range filters."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsFilterSheetOpen(false)} className="w-full sm:w-auto">
              Reset Filters
            </Button>
            <Button variant="primary" onClick={() => setIsFilterSheetOpen(false)} className="w-full sm:w-auto">
              Apply Filters
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Attribution Status"
            options={[
              { value: "all", label: "All Statuses" },
              { value: "attributed", label: "Attributed Only" },
              { value: "review", label: "Needs Review" },
              { value: "unpaid", label: "Awaiting Payment" }
            ]}
          />
          <Input label="Date From" type="date" />
          <Input label="Date To" type="date" />
        </div>
      </SlideOver>

      {/* Interactive Dialog Modal (Bottom-sheet on mobile) */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Interactive Dialog Modal"
        description="Demonstrates mobile bottom-sheet adaptation, focus management, and keyboard ESC dismiss."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
              Confirm Action
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-secondary leading-relaxed">
            This dialog modal adapts to a full-width bottom sheet on mobile viewports (under 768px) and a centered operational dialog on desktop.
          </p>
          <Input label="Verification Code" placeholder="Enter confirmation PIN" />
        </div>
      </Dialog>

      {/* Interactive SlideOver Drawer */}
      <SlideOver
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Reservation Details — ORB19198303"
        description="Targeted booking inspection & partner attribution metadata."
        footer={
          <Button variant="primary" onClick={() => setIsDrawerOpen(false)} className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
            Close Drawer
          </Button>
        }
      >
        <div className="space-y-6 font-sans">
          <div className="p-3.5 bg-surface-subtle border border-divider-soft rounded-lg space-y-2.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-secondary">Guest Name:</span>
              <span className="font-semibold text-primary">Emily Robinson</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-secondary">Gross Amount:</span>
              <span className="font-mono font-medium text-primary">$1,450.00</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-secondary">Attribution Status:</span>
              <StatusBadge variant="success" dot>Attributed</StatusBadge>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">
              Commission Ledger Snapshot
            </h4>
            <p className="text-xs text-secondary leading-relaxed">
              Initial accrual recorded on 2026-09-15. Net payout estimated at $145.00 (10% rate).
            </p>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
