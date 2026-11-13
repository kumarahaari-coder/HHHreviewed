"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE_OPTIONS = [25, 50, 100];

/**
 * Client-side pagination for an already-loaded list. The page resets to 1 whenever `resetKey` changes
 * (pass a string built from the active filters) and is clamped when the list shrinks.
 */
export function usePagination<T>(items: T[], resetKey: string = "", initialPageSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize]
  );

  return { pageItems, page: currentPage, pageSize, totalPages, total: items.length, setPage, setPageSize };
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

export function Pagination({ page, pageSize, total, totalPages, onPageChange, onPageSizeChange, className = "" }: PaginationProps) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn =
    "inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-divider-soft bg-surface text-primary hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 text-xs text-secondary font-sans ${className}`}>
      <div className="flex items-center gap-3">
        <span>
          Showing <span className="font-semibold text-primary tabular-nums">{from}–{to}</span> of{" "}
          <span className="font-semibold text-primary tabular-nums">{total}</span>
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span>Per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-surface-subtle border border-divider-soft text-primary text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={14} /> Previous
        </button>
        <span className="tabular-nums">Page {page} of {totalPages}</span>
        <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
