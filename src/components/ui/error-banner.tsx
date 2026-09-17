import React from "react";
import { AlertCircle, X, RefreshCw } from "lucide-react";
import { Button } from "./button";

export interface ErrorBannerProps {
  title?: string;
  message: React.ReactNode;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function ErrorBanner({
  title = "Error Encountered",
  message,
  onDismiss,
  onRetry,
  className = ""
}: ErrorBannerProps) {
  return (
    <div className={`p-4 bg-danger-surface border border-danger-border rounded-lg flex items-start justify-between gap-4 font-sans ${className}`}>
      <div className="flex items-start gap-3">
        <AlertCircle size={18} className="text-danger shrink-0 mt-0.5" />
        <div>
          {title && (
            <h4 className="text-xs font-semibold text-danger tracking-tight">
              {title}
            </h4>
          )}
          <p className="text-xs text-danger/90 mt-0.5 leading-relaxed">
            {message}
          </p>
          {onRetry && (
            <div className="mt-3">
              <Button
                variant="destructive"
                size="sm"
                icon={RefreshCw}
                onClick={onRetry}
              >
                Retry Operation
              </Button>
            </div>
          )}
        </div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 rounded text-danger/70 hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
          aria-label="Dismiss banner"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
