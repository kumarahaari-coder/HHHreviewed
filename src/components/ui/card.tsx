import React from "react";

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: "default" | "subtle" | "elevated";
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  hoverable?: boolean;
  children?: React.ReactNode;
}

export function Card({
  variant = "default",
  title,
  description,
  action,
  footer,
  hoverable = false,
  className = "",
  children,
  onClick,
  ...props
}: CardProps) {
  const baseStyles = "bg-surface border border-divider rounded-lg transition-all duration-150 font-sans";

  const variantStyles = {
    default: "shadow-xs",
    subtle: "bg-surface-subtle border-divider-soft shadow-none",
    elevated: "shadow-md border-divider"
  };

  const hoverStyles = hoverable || onClick
    ? "cursor-pointer hover:border-secondary/50 hover:shadow-sm active:scale-[0.99]"
    : "";

  // Without header/footer the children are laid out directly inside the card, so layout classes passed via
  // className (flex, grid, space-y, gap) act on the real content instead of a single wrapper div.
  const isBare = !title && !description && !action && !footer;
  const hasOwnPadding = /(^|\s)(sm:|md:|lg:)?p-/.test(className);
  const bareStyles = isBare && !hasOwnPadding ? "p-5" : "";

  return (
    <div
      onClick={onClick}
      className={`${baseStyles} ${variantStyles[variant]} ${hoverStyles} ${bareStyles} ${className}`}
      {...props}
    >
      {(title || description || action) && (
        <div className="p-5 border-b border-divider-soft flex items-start justify-between gap-4">
          <div>
            {title && (
              <h3 className="text-sm font-semibold text-primary tracking-tight">
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs text-secondary mt-0.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {isBare ? children : children && <div className="p-5">{children}</div>}
      {footer && (
        <div className="px-5 py-3.5 bg-surface-subtle border-t border-divider-soft rounded-b-lg">
          {footer}
        </div>
      )}
    </div>
  );
}
