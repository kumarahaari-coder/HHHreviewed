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

  // Page level loader (default)
  return (
    <div className={`flex min-h-[50vh] flex-col items-center justify-center p-8 font-sans ${className}`}>
      <div className="flex flex-col items-center space-y-3 p-6 bg-surface border border-divider rounded-xl shadow-xs">
        <Loader2 size={28} className="animate-spin text-primary" />
        <span className="text-xs font-medium text-secondary">{message}</span>
      </div>
    </div>
  );
}
