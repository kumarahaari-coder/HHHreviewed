import React from "react";
import { Search } from "lucide-react";
import { Input } from "./input";

export interface FilterToolbarProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  resultsCount?: number;
  className?: string;
}

export function FilterToolbar({
  search,
  filters,
  actions,
  resultsCount,
  className = ""
}: FilterToolbarProps) {
  return (
    <div className={`p-4 bg-surface border border-divider rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 font-sans mb-4 shadow-xs ${className}`}>
      <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
        {search && (
          <div className="w-full sm:w-64">
            <Input
              type="text"
              placeholder={search.placeholder || "Search..."}
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              iconLeading={Search}
            />
          </div>
        )}
        {filters && <div className="flex items-center gap-2 flex-wrap">{filters}</div>}
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
        {resultsCount !== undefined && (
          <span className="text-xs text-secondary font-medium tabular-nums">
            {resultsCount} {resultsCount === 1 ? "result" : "results"}
          </span>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
