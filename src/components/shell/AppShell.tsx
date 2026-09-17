import React, { useState } from "react";
import { Sidebar, NavItem } from "./Sidebar";
import { AppHeader } from "./AppHeader";
import { MobileNavigation } from "./MobileNavigation";

export interface AppShellProps {
  brandVariant?: "clean" | "monogram";
  contextTag?: "Admin" | "Partner" | null;
  primaryNav: NavItem[];
  secondaryNav?: NavItem[];
  activeNavId: string;
  onNavigate: (id: string, href?: string) => void;
  headerTitle?: React.ReactNode;
  headerSubtitle?: React.ReactNode;
  user: {
    name: string;
    email: string;
    role: string;
  };
  isPreviewActive?: boolean;
  previewPartnerName?: string;
  onReturnFromPreview?: () => void;
  onSignOut?: () => void;
  initialMobileNavOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function AppShell({
  brandVariant = "clean",
  contextTag = null,
  primaryNav,
  secondaryNav = [],
  activeNavId,
  onNavigate,
  headerTitle,
  headerSubtitle,
  user,
  isPreviewActive = false,
  previewPartnerName = "Haari",
  onReturnFromPreview,
  onSignOut,
  initialMobileNavOpen = false,
  children,
  className = ""
}: AppShellProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(initialMobileNavOpen);

  return (
    <div className={`min-h-screen bg-canvas text-primary flex flex-col xl:flex-row font-sans ${className}`}>
      {/* 1. Persistent Desktop Sidebar (≥1200px / xl:flex) */}
      <div className="hidden xl:block shrink-0 h-screen sticky top-0 z-40">
        <Sidebar
          brandVariant={brandVariant}
          contextTag={contextTag}
          primaryNav={primaryNav}
          secondaryNav={secondaryNav}
          activeId={activeNavId}
          onNavigate={onNavigate}
          user={user}
          isPreviewActive={isPreviewActive}
          previewPartnerName={previewPartnerName}
          onReturnFromPreview={onReturnFromPreview}
          onSignOut={onSignOut}
        />
      </div>

      {/* 2. Mobile & Tablet SlideOver Navigation Drawer */}
      <div className="xl:hidden">
        <MobileNavigation
          isOpen={isMobileNavOpen}
          onClose={() => setIsMobileNavOpen(false)}
          brandVariant={brandVariant}
          contextTag={contextTag}
          primaryNav={primaryNav}
          secondaryNav={secondaryNav}
          activeId={activeNavId}
          onNavigate={onNavigate}
          user={user}
          isPreviewActive={isPreviewActive}
          previewPartnerName={previewPartnerName}
          onReturnFromPreview={onReturnFromPreview}
          onSignOut={onSignOut}
        />
      </div>

      {/* 3. Main Workspace Container */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Application Header */}
        <AppHeader
          title={headerTitle}
          subtitle={headerSubtitle}
          brandVariant={brandVariant}
          contextTag={contextTag}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
          user={user}
          isPreviewActive={isPreviewActive}
          previewPartnerName={previewPartnerName}
          onReturnFromPreview={onReturnFromPreview}
          onSignOut={onSignOut}
        />

        {/* Responsive Content Area (16px mobile, 24px tablet, 32px desktop) */}
        <main className="flex-1 p-4 sm:p-6 xl:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
