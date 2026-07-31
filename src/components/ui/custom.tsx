import React, { useEffect } from "react";
import { X } from "lucide-react";

// --- CARD COMPONENT ---
export function Card({
  children,
  className = "",
  onClick
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-brand-cream border border-brand-blush rounded-xl shadow-xs p-6 transition-all duration-200 ${
        onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.01] focus-within:ring-2 focus-within:ring-brand-plum" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

// --- BADGE COMPONENT ---
export type BadgeType = "plum" | "wine" | "sage" | "success" | "warning" | "danger" | "gray" | "info";

export function Badge({
  children,
  type = "gray"
}: {
  children: React.ReactNode;
  type?: BadgeType;
}) {
  const styles: Record<BadgeType, string> = {
    plum: "bg-brand-plum/10 text-brand-plum border-brand-plum/20",
    wine: "bg-brand-wine/10 text-brand-wine border-brand-wine/20",
    sage: "bg-brand-sage/10 text-brand-wine border-brand-sage/20",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-800 border-amber-200",
    danger: "bg-rose-50 text-rose-700 border-rose-200",
    gray: "bg-zinc-100 text-zinc-700 border-zinc-200",
    info: "bg-sky-50 text-sky-700 border-sky-200"
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[type]}`}>
      {children}
    </span>
  );
}

// --- DIALOG / MODAL COMPONENT ---
export function Dialog({
  isOpen,
  onClose,
  title,
  children
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  // Support Escape key for closing dialog (accessibility)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-brand-plum/40 backdrop-blur-xs transition-opacity animate-fade-in">
      <div
        className="relative w-full max-w-lg p-6 bg-brand-cream border border-brand-blush rounded-2xl shadow-xl animate-scale-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between border-b border-brand-blush pb-3 mb-4">
          <h3 id="modal-title" className="text-lg font-bold text-brand-plum tracking-tight">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-brand-plum hover:bg-brand-blush/40 transition-colors focus-visible:ring-2 focus-visible:ring-brand-plum"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}

// --- SLIDE OVER / DRAWER COMPONENT ---
export function SlideOver({
  isOpen,
  onClose,
  title,
  children
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden transition-all duration-300 ${
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-brand-plum/30 backdrop-blur-xs transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
        <div
          className={`w-screen max-w-md bg-brand-cream border-l border-brand-blush shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
            isOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="p-6 border-b border-brand-blush flex items-center justify-between">
            <h2 className="text-lg font-bold text-brand-plum tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-zinc-400 hover:text-brand-plum hover:bg-brand-blush/40 transition-colors focus-visible:ring-2 focus-visible:ring-brand-plum"
              aria-label="Close panel"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

// --- TABS COMPONENT ---
export function Tabs({
  tabs,
  activeTab,
  onChange
}: {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="border-b border-brand-blush flex space-x-8">
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200 relative ${
              isActive
                ? "border-brand-plum text-brand-plum"
                : "border-transparent text-zinc-500 hover:text-brand-plum hover:border-brand-blush"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
