import React from "react";
import { LucideIcon } from "lucide-react";

export type StatusType = "neutral" | "success" | "warning" | "danger" | "info" | "accent" | "plum" | "wine" | "sage" | "gray";

export interface StatusBadgeProps {
  variant?: StatusType;
  /** @deprecated use `variant` */
  type?: StatusType;
  children: React.ReactNode;
  icon?: LucideIcon;
  dot?: boolean;
  className?: string;
}

export function StatusBadge({
  variant,
  type = "neutral",
  children,
  icon: Icon,
  dot = false,
  className = ""
}: StatusBadgeProps) {
  const activeVariant = variant || type;

  const styles: Record<StatusType, string> = {
    neutral: "bg-surface-muted text-secondary border-divider-soft",
    success: "bg-success-surface text-success border-success-border",
    warning: "bg-warning-surface text-warning border-warning-border",
    danger: "bg-danger-surface text-danger border-danger-border",
    info: "bg-info-surface text-info border-info-border",
    accent: "bg-accent-subtle text-accent border-accent/20",
    // Backward compatibility mappings for legacy un-migrated pages
    plum: "bg-primary/10 text-primary border-primary/20",
    wine: "bg-secondary/10 text-secondary border-secondary/20",
    sage: "bg-accent-subtle text-accent border-accent/20",
    gray: "bg-surface-muted text-secondary border-divider-soft"
  };

  const dotColors: Record<StatusType, string> = {
    neutral: "bg-secondary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    accent: "bg-accent",
    plum: "bg-primary",
    wine: "bg-secondary",
    sage: "bg-accent",
    gray: "bg-secondary"
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border font-sans select-none ${styles[activeVariant] || styles.neutral} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[activeVariant] || dotColors.neutral}`} />}
      {Icon && <Icon size={12} className="shrink-0" />}
      <span>{children}</span>
    </span>
  );
}

export function Badge({
  variant,
  type = "neutral",
  children
}: {
  variant?: StatusType;
  type?: StatusType;
  children: React.ReactNode;
}) {
  return <StatusBadge variant={variant || type}>{children}</StatusBadge>;
}

// Re-export domain status mappers for backwards compatibility with legacy imports
export { formatStatusLabel, getStatusTypeForState } from "@/lib/status-mapper";
