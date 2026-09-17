import React from "react";
import Link from "next/link";
import { SlideOver } from "../ui/slide-over";
import { BrandMark } from "./BrandMark";
import { NavItem } from "./Sidebar";
import { LogOut, ShieldAlert } from "lucide-react";
import { formatRoleLabel } from "@/lib/status-mapper";

export interface MobileNavigationProps {
  isOpen: boolean;
  onClose: () => void;
  brandVariant?: "clean" | "monogram";
  contextTag?: "Admin" | "Partner" | null;
  primaryNav: NavItem[];
  secondaryNav?: NavItem[];
  activeId: string;
  onNavigate: (id: string, href?: string) => void;
  user: {
    name: string;
    email: string;
    role: string;
  };
  isPreviewActive?: boolean;
  previewPartnerName?: string;
  onReturnFromPreview?: () => void;
  onSignOut?: () => void;
}

export function MobileNavigation({
  isOpen,
  onClose,
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
  onSignOut
}: MobileNavigationProps) {
  const handleItemClick = (id: string) => {
    onNavigate(id);
    onClose();
  };

  const initials = user.name
    .split(" ")
    .map(n => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      position="left"
      title={<BrandMark variant={brandVariant} contextTag={contextTag} />}
    >
      <div className="flex flex-col justify-between h-full font-sans space-y-6 pt-2">
        {/* Navigation Section */}
        <div className="space-y-6">
          {/* Primary Nav */}
          <nav aria-label="Mobile Primary Navigation" className="space-y-1">
            <p className="px-3 text-[10px] font-semibold text-tertiary uppercase tracking-wider mb-2">
              Main Menu
            </p>
            {primaryNav.map(item => {
              const Icon = item.icon;
              const isActive = item.id === activeId;
              const itemClass = `w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer min-h-[44px] text-left ${
                isActive
                  ? "bg-surface-subtle text-primary font-semibold border-l-3 border-accent pl-2.5"
                  : "text-secondary hover:text-primary hover:bg-surface-subtle/60"
              }`;

              const innerContent = (
                <>
                  <div className="flex items-center gap-3">
                    <Icon size={20} className={isActive ? "text-primary" : "text-tertiary"} />
                    <span>{item.label}</span>
                  </div>
                  {item.count !== undefined && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ${
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
                    onClick={() => handleItemClick(item.id)}
                    className={itemClass}
                  >
                    {innerContent}
                  </Link>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item.id)}
                  className={itemClass}
                >
                  {innerContent}
                </button>
              );
            })}
          </nav>

          {/* Secondary Nav */}
          {secondaryNav.length > 0 && (
            <nav aria-label="Mobile Secondary Navigation" className="pt-4 border-t border-divider-soft space-y-1">
              <p className="px-3 text-[10px] font-semibold text-tertiary uppercase tracking-wider mb-2">
                System & Settings
              </p>
              {secondaryNav.map(item => {
                const Icon = item.icon;
                const isActive = item.id === activeId;
                const itemClass = `w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer min-h-[44px] text-left ${
                  isActive
                    ? "bg-surface-subtle text-primary font-semibold border-l-3 border-accent pl-2.5"
                    : "text-secondary hover:text-primary hover:bg-surface-subtle/60"
                }`;

                const innerContent = (
                  <div className="flex items-center gap-3">
                    <Icon size={20} className={isActive ? "text-primary" : "text-tertiary"} />
                    <span>{item.label}</span>
                  </div>
                );

                if (item.href && item.href !== "#") {
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => handleItemClick(item.id)}
                      className={itemClass}
                    >
                      {innerContent}
                    </Link>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item.id)}
                    className={itemClass}
                  >
                    {innerContent}
                  </button>
                );
              })}
            </nav>
          )}
        </div>

        {/* User Account & Sign Out */}
        <div className="pt-6 border-t border-divider-soft space-y-3">
          <div className="p-3 bg-surface-subtle rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-surface-muted border border-divider-soft flex items-center justify-center text-xs font-semibold text-primary shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-primary truncate">{user.name}</p>
              <p className="text-[11px] text-secondary truncate">{user.email}</p>
              <p className="text-[10px] text-tertiary font-medium mt-0.5 truncate">{formatRoleLabel(user.role)}</p>
            </div>
          </div>

          {isPreviewActive && (
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onReturnFromPreview) onReturnFromPreview();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-3 rounded-lg text-xs font-medium text-accent bg-accent-subtle/40 border border-accent/20 min-h-[44px]"
            >
              <ShieldAlert size={18} />
              <span>Return from {previewPartnerName} Preview</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              if (onSignOut) onSignOut();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-3 rounded-lg text-xs font-medium text-secondary hover:text-danger hover:bg-danger-surface min-h-[44px] transition-colors"
          >
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </SlideOver>
  );
}
