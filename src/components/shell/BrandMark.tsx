import React from "react";

export interface BrandMarkProps {
  variant?: "clean" | "monogram";
  subtitle?: boolean;
  contextTag?: "Admin" | "Partner" | null;
  className?: string;
}

export function BrandMark({
  variant = "clean",
  subtitle = true,
  contextTag = null,
  className = ""
}: BrandMarkProps) {
  if (variant === "monogram") {
    // Option B: Compact Monogram for narrow/sidebar/mobile contexts
    return (
      <div className={`font-sans select-none flex items-center gap-2.5 ${className}`}>
        <div className="w-7 h-7 rounded bg-primary text-surface flex items-center justify-center font-bold tracking-wider text-[11px] shadow-xs shrink-0 font-sans">
          HHH
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-tight text-primary">HHH</span>
            {contextTag && (
              <span className="text-[10px] font-semibold text-secondary uppercase tracking-wider px-1.5 py-0.2 rounded bg-surface-muted border border-divider-soft">
                {contextTag}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] text-secondary tracking-normal leading-tight font-normal">
              Hidden Honey Homes
            </p>
          )}
        </div>
      </div>
    );
  }

  // Option A (Default): Clean wordmark with system typography
  return (
    <div className={`font-sans select-none ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold tracking-tight text-primary">HHH</span>
        {contextTag && (
          <span className="text-[10px] font-semibold text-secondary uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-muted border border-divider-soft">
            {contextTag}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-[11px] text-secondary tracking-normal font-normal mt-0.5">
          Hidden Honey Homes
        </p>
      )}
    </div>
  );
}
