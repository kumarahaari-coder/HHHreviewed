import React, { useState, useRef, useEffect } from "react";
import { User, LogOut, ShieldAlert, ChevronUp, UserCheck } from "lucide-react";

export interface UserMenuProps {
  user: {
    name: string;
    email: string;
    role: string;
    avatarUrl?: string;
  };
  isPreviewActive?: boolean;
  previewPartnerName?: string;
  onReturnFromPreview?: () => void;
  onSignOut?: () => void;
  align?: "top" | "bottom";
  className?: string;
}

export function UserMenu({
  user,
  isPreviewActive = false,
  previewPartnerName = "",
  onReturnFromPreview,
  onSignOut,
  align = "top",
  className = ""
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const initials = user.name
    .split(" ")
    .map(n => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const popoverPosition = align === "top"
    ? "bottom-full mb-2 left-0 w-64"
    : "top-full mt-2 right-0 w-64";

  return (
    <div ref={menuRef} className={`relative font-sans ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary text-left"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="User account menu"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-surface-muted border border-divider-soft flex items-center justify-center text-xs font-semibold text-primary shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary truncate leading-tight">
              {user.name}
            </p>
            <p className="text-[11px] text-secondary truncate mt-0.5 leading-tight">
              {user.role}
            </p>
          </div>
        </div>
        <ChevronUp size={14} className={`text-tertiary transition-transform duration-150 shrink-0 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className={`absolute ${popoverPosition} bg-surface border border-divider rounded-xl shadow-lg p-1.5 z-50 animate-fade-in font-sans`}>
          {/* Header Info */}
          <div className="px-3 py-2 border-b border-divider-soft space-y-0.5">
            <p className="text-xs font-semibold text-primary">{user.name}</p>
            <p className="text-[11px] text-secondary truncate">{user.email}</p>
            <div className="pt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              <span className="text-[10px] text-tertiary uppercase font-medium tracking-wider">{user.role}</span>
            </div>
          </div>

          {/* Admin Partner Preview Return Option */}
          {isPreviewActive && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (onReturnFromPreview) onReturnFromPreview();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-accent hover:bg-accent-subtle/50 rounded-md font-medium transition-colors cursor-pointer text-left mt-1"
            >
              <ShieldAlert size={14} className="shrink-0" />
              <span>Return from {previewPartnerName || "Partner"} Preview</span>
            </button>
          )}

          {/* Account Profile Link */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-primary hover:bg-surface-subtle rounded-md font-medium transition-colors cursor-pointer text-left mt-0.5"
          >
            <User size={14} className="text-secondary shrink-0" />
            <span>Account Profile</span>
          </button>

          <div className="my-1 border-t border-divider-soft" />

          {/* Quiet Sign Out Action */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              if (onSignOut) onSignOut();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-secondary hover:text-danger hover:bg-danger-surface rounded-md font-medium transition-colors cursor-pointer text-left"
          >
            <LogOut size={14} className="shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
