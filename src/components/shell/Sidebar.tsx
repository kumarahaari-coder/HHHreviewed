import React from "react";
import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { UserMenu } from "./UserMenu";
import { LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  count?: number;
}

export interface SidebarProps {
  brandVariant?: "clean" | "monogram";
  contextTag?: "Admin" | "Partner" | null;
  primaryNav: NavItem[];
  secondaryNav?: NavItem[];
  activeId: string;
  onNavigate?: (id: string, href?: string) => void;
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

export function Sidebar({
  brandVariant = "clean",
  contextTag = null,
  primaryNav,
  secondaryNav = [],
  activeId,
  onNavigate,
  user,
  isPreviewActive = false,
  previewPartnerName = "Haari",
  onReturnFromPreview,
  onSignOut,
  className = ""
}: SidebarProps) {
  const renderNavGroup = (items: NavItem[]) => (
    <nav aria-label="Navigation Links" className="space-y-0.5">
      {items.map(item => {
        const Icon = item.icon;
        const isActive = item.id === activeId;
        const navClass = `w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer select-none text-left relative ${
          isActive
            ? "bg-surface-subtle text-primary font-semibold border-l-2 border-accent pl-2.5 shadow-xs"
            : "text-secondary hover:text-primary hover:bg-surface-subtle/60"
        }`;

        const innerContent = (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <Icon size={20} className={`shrink-0 ${isActive ? "text-primary" : "text-tertiary"}`} />
              <span className="truncate">{item.label}</span>
            </div>
            {item.count !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-medium tabular-nums ${
                  isActive ? "bg-primary/10 text-primary" : "bg-surface-muted text-secondary"
                }`}
              >
                {item.count}
              </span>
            )}
          </>
        );

        if (item.href && item.href !== "#") {
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => onNavigate && onNavigate(item.id, item.href)}
              className={navClass}
            >
              {innerContent}
            </Link>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate && onNavigate(item.id, item.href)}
            className={navClass}
          >
            {innerContent}
          </button>
        );
      })}
    </nav>
  );

  return (
    <aside
      className={`w-60 bg-surface border-r border-divider flex flex-col justify-between h-full font-sans select-none shrink-0 ${className}`}
    >
      {/* Top Section */}
      <div className="p-4 space-y-6">
        {/* Brand Mark */}
        <div className="px-1 py-1">
          <BrandMark variant={brandVariant} contextTag={contextTag} />
        </div>

        {/* Primary Navigation */}
        <div className="space-y-1">
          {renderNavGroup(primaryNav)}
        </div>

        {/* Secondary Navigation */}
        {secondaryNav.length > 0 && (
          <div className="pt-4 border-t border-divider-soft space-y-1">
            <p className="px-3 text-[10px] font-semibold text-tertiary uppercase tracking-wider mb-2">
              System Settings
            </p>
            {renderNavGroup(secondaryNav)}
          </div>
        )}
      </div>

      {/* Bottom User Profile Area */}
      <div className="p-3 border-t border-divider-soft">
        <UserMenu
          user={user}
          isPreviewActive={isPreviewActive}
          previewPartnerName={previewPartnerName}
          onReturnFromPreview={onReturnFromPreview}
          onSignOut={onSignOut}
          align="top"
        />
      </div>
    </aside>
  );
}
