import React from "react";

export function TableContainer({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full overflow-x-auto rounded-lg border border-divider bg-surface ${className}`}>
      {children}
    </div>
  );
}

export function Table({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <table className={`w-full text-left border-collapse font-sans ${className}`}>
      {children}
    </table>
  );
}

export function TableHeader({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <thead className={`bg-surface-subtle border-b border-divider text-xs font-medium text-secondary ${className}`}>
      {children}
    </thead>
  );
}

export function TableBody({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tbody className={`divide-y divide-divider-soft text-xs text-primary ${className}`}>
      {children}
    </tbody>
  );
}

export function TableFooter({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tfoot className={`bg-surface-subtle border-t border-divider text-xs font-semibold text-primary ${className}`}>
      {children}
    </tfoot>
  );
}

export function TableRow({
  children,
  onClick,
  className = ""
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={`transition-colors duration-150 ${
        onClick ? "cursor-pointer hover:bg-surface-subtle/80 active:bg-surface-muted" : "hover:bg-surface-subtle/40"
      } ${className}`}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  children,
  align = "left",
  className = ""
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`py-3 px-4 text-xs font-medium text-secondary tracking-normal ${alignClass} ${className}`}>
      {children}
    </th>
  );
}

export function TableCell({
  children,
  align = "left",
  numeric = false,
  className = ""
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  numeric?: boolean;
  className?: string;
}) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const numericClass = numeric ? "tabular-nums" : "";

  return (
    <td className={`py-3.5 px-4 text-xs ${alignClass} ${numericClass} ${className}`}>
      {children}
    </td>
  );
}

/**
 * Mobile-first card wrapper for operational tabular data on screens <768px.
 * Allows domain pages to render stacked card items instead of forcing horizontal scrolling.
 */
export function TableMobileCard({
  title,
  subtitle,
  badge,
  action,
  details,
  className = ""
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  details: Array<{ label: string; value: React.ReactNode; numeric?: boolean }>;
  className?: string;
}) {
  return (
    <div className={`bg-surface border border-divider rounded-lg p-4 space-y-3 font-sans shadow-xs ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-divider-soft pb-2.5">
        <div>
          <div className="text-xs font-semibold text-primary">{title}</div>
          {subtitle && <div className="text-[11px] text-secondary mt-0.5">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          {action}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-0.5">
        {details.map((d, i) => (
          <div key={i} className="space-y-0.5">
            <span className="text-[10px] text-tertiary uppercase font-medium tracking-wider block">{d.label}</span>
            <div className={`text-xs font-medium text-primary ${d.numeric ? "tabular-nums" : ""}`}>
              {d.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
