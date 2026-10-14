import React from "react";
import { Loader2 } from "lucide-react";

export interface LoadingStateProps {
  variant?: "page" | "card" | "table" | "inline";
  message?: string;
  className?: string;
}

export function LoadingState({
  variant = "page",
  message = "Loading...",
  className = ""
}: LoadingStateProps) {
  if (variant === "inline") {
    return (
      <div className={`inline-flex items-center gap-2 text-xs text-secondary font-sans ${className}`}>
        <Loader2 size={14} className="animate-spin text-primary" />
        {message && <span>{message}</span>}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={`p-8 text-center bg-surface rounded-lg border border-divider font-sans ${className}`}>
        <div className="flex flex-col items-center justify-center space-y-2">
          <Loader2 size={24} className="animate-spin text-primary" />
          <p className="text-xs text-secondary font-medium">{message}</p>
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={`p-6 bg-surface border border-divider rounded-lg shadow-xs space-y-3 font-sans animate-pulse ${className}`}>
        <div className="h-4 bg-surface-muted rounded w-1/3" />
        <div className="h-3 bg-surface-muted rounded w-2/3" />
        <div className="h-8 bg-surface-muted rounded w-full mt-4" />
      </div>
    );
  }

  // Page level loader (default): skeleton placeholder shaped like a typical admin page
  return (
    <div
      className={`space-y-6 font-sans pb-8 animate-pulse ${className}`}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{message}</span>

      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 bg-surface-muted rounded w-48" />
        <div className="h-4 bg-surface-muted rounded w-80 max-w-full" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="p-4 bg-surface border border-divider rounded-lg space-y-3">
            <div className="h-3 bg-surface-muted rounded w-1/2" />
            <div className="h-7 bg-surface-muted rounded w-2/3" />
          </div>
        ))}
      </div>

      {/* Toolbar + table rows */}
      <div className="bg-surface border border-divider rounded-lg overflow-hidden">
        <div className="p-4 border-b border-divider-soft">
          <div className="h-9 bg-surface-muted rounded w-full max-w-md" />
        </div>
        <div className="divide-y divide-divider-soft">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="p-4 flex items-center gap-4">
              <div className="h-4 bg-surface-muted rounded w-1/4" />
              <div className="h-4 bg-surface-muted rounded w-1/4" />
              <div className="h-4 bg-surface-muted rounded w-1/6" />
              <div className="h-4 bg-surface-muted rounded w-1/6 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
