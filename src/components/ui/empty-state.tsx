import React from "react";
import { LucideIcon, Inbox } from "lucide-react";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className = ""
}: EmptyStateProps) {
  return (
    <div className={`p-8 sm:p-12 text-center bg-surface border border-divider rounded-lg font-sans shadow-xs ${className}`}>
      <div className="max-w-md mx-auto flex flex-col items-center">
        <div className="w-12 h-12 rounded-full bg-surface-subtle border border-divider-soft flex items-center justify-center text-secondary mb-4">
          <Icon size={24} />
        </div>
        <h3 className="text-base font-semibold text-primary tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-secondary mt-1.5 leading-relaxed">
          {description}
        </p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
