import React from "react";
import { Menu, Bell, ShieldAlert, ArrowLeft } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { UserMenu } from "./UserMenu";
import { Button } from "../ui/button";

export interface AppHeaderProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  brandVariant?: "clean" | "monogram";
  contextTag?: "Admin" | "Partner" | null;
  onOpenMobileNav: () => void;
  user: {
    name: string;
    email: string;
    role: string;
  };
  isPreviewActive?: boolean;
  previewPartnerName?: string;
  onReturnFromPreview?: () => void;
  onSignOut?: () => void;
  className?: string;
}

export function AppHeader({
  title,
  subtitle,
  brandVariant = "clean",
  contextTag = null,
  onOpenMobileNav,
  user,
  isPreviewActive = false,
  previewPartnerName = "Haari",
  onReturnFromPreview,
  onSignOut,
  className = ""
}: AppHeaderProps) {
  return (
    <header className={`bg-surface border-b border-divider font-sans sticky top-0 z-30 ${className}`}>
      {/* Admin Partner Preview Banner (Clean display derived from validated preview partner record) */}
      {isPreviewActive && (
        <div className="bg-accent-subtle border-b border-accent/20 px-4 py-2 text-xs flex items-center justify-between gap-4 font-sans">
          <div className="flex items-center gap-2 text-accent-hover font-medium">
            <ShieldAlert size={14} className="shrink-0 text-accent" />
            <span>
              Viewing partner experience: <strong className="font-semibold text-primary">{previewPartnerName}</strong>
            </span>
          </div>
          <Button
            variant="tertiary"
            size="sm"
            icon={ArrowLeft}
            onClick={onReturnFromPreview}
            className="text-xs py-1 h-7 text-accent-hover hover:text-accent font-medium"
          >
            Return to Admin
          </Button>
        </div>
      )}

      {/* Main Header Bar (56px) */}
      <div className="h-14 px-4 sm:px-6 xl:px-8 flex items-center justify-between gap-4">
        {/* Left Side: Mobile Menu Trigger + Brand/Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile & Tablet Drawer Trigger */}
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="xl:hidden p-2 rounded-lg text-secondary hover:text-primary hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          {/* Mobile Brand Mark */}
          <div className="xl:hidden flex items-center">
            <BrandMark variant={brandVariant} contextTag={contextTag} subtitle={false} />
          </div>

          {/* Desktop Section Header Title */}
          {title && (
            <div className="hidden xl:block min-w-0">
              <h2 className="text-sm font-semibold text-primary truncate leading-tight">
                {title}
              </h2>
              {subtitle && (
                <p className="text-[11px] text-secondary truncate mt-0.5 leading-tight">
                  {subtitle}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Notifications + User Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-surface-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer relative min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent" />
          </button>

          <div className="xl:hidden">
            <UserMenu
              user={user}
              isPreviewActive={isPreviewActive}
              previewPartnerName={previewPartnerName}
              onReturnFromPreview={onReturnFromPreview}
              onSignOut={onSignOut}
              align="bottom"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
