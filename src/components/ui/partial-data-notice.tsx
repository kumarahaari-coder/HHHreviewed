import React from "react";
import { Info } from "lucide-react";
import { Button } from "./button";

export interface PartialDataNoticeProps {
  /** What is shown, e.g. "the latest 500 of 3,200 bookings". */
  summary: React.ReactNode;
  /** What only covers the loaded rows, e.g. "Search, filters, tab counts and CSV export". */
  scope: string;
  onLoadMore?: () => void;
  loadMoreLabel?: string;
  loading?: boolean;
  className?: string;
}

/** Tells the user a list was loaded in part (to keep data transfer low) so partial totals are not mistaken for full ones. */
export function PartialDataNotice({ summary, scope, onLoadMore, loadMoreLabel = "Load more", loading, className = "" }: PartialDataNoticeProps) {
  return (
    <div className={`p-3 bg-warning-surface border border-warning-border rounded-lg flex items-start justify-between gap-4 font-sans ${className}`}>
      <div className="flex items-start gap-3">
        <Info size={16} className="text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-warning leading-relaxed">
          Showing {summary}. {scope} only cover what is loaded.
        </p>
      </div>
      {onLoadMore && (
        <Button variant="secondary" size="sm" disabled={loading} onClick={onLoadMore}>
          {loading ? "Loading..." : loadMoreLabel}
        </Button>
      )}
    </div>
  );
}
