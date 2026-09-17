import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  position?: "right" | "left";
  size?: "md" | "lg" | "xl";
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function SlideOver({
  isOpen,
  onClose,
  title,
  description,
  position = "right",
  size = "md",
  footer,
  children
}: SlideOverProps) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;

  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Store trigger focus
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Set initial focus
    setTimeout(() => {
      panelRef.current?.focus();
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      // Focus trap
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || document.activeElement === panelRef.current) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  const sizeStyles = {
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
    xl: "sm:max-w-2xl"
  };

  const positionStyles = position === "right"
    ? "right-0 pl-0 sm:pl-10"
    : "left-0 pr-0 sm:pr-10";

  const translateStyles = position === "right"
    ? (isOpen ? "translate-x-0" : "translate-x-full")
    : (isOpen ? "translate-x-0" : "-translate-x-full");

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden font-sans transition-all duration-300 ${
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-primary/40 backdrop-blur-xs transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />

      <div className={`absolute inset-y-0 ${positionStyles} max-w-full flex w-full justify-end`}>
        <div
          ref={panelRef}
          tabIndex={-1}
          className={`w-full ${sizeStyles[size]} bg-surface border-${position === "right" ? "l" : "r"} border-divider shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out outline-none ${translateStyles}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          {/* SlideOver Header */}
          <div className="p-4 sm:p-5 border-b border-divider-soft flex items-start justify-between gap-4 shrink-0">
            <div>
              <h2 id={titleId} className="text-sm sm:text-base font-semibold text-primary tracking-tight">
                {title}
              </h2>
              {description && (
                <p className="text-xs text-secondary mt-0.5">
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 sm:p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
              aria-label="Close panel"
            >
              <X size={18} />
            </button>
          </div>

          {/* SlideOver Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 text-xs text-primary">{children}</div>

          {/* SlideOver Footer */}
          {footer && (
            <div className="p-3.5 sm:p-4 bg-surface-subtle border-t border-divider-soft flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
