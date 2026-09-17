import React from "react";
import { Loader2, LucideIcon } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "tertiary" | "destructive";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon: Icon,
      iconPosition = "left",
      disabled,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none disabled:transform-none select-none cursor-pointer";

    const variantStyles = {
      primary: "bg-primary text-surface hover:bg-primary/90 shadow-xs border border-transparent",
      secondary: "bg-surface text-primary border border-divider hover:bg-surface-subtle hover:border-secondary/40 shadow-xs",
      tertiary: "bg-transparent text-primary hover:bg-surface-muted border border-transparent",
      destructive: "bg-danger text-surface hover:bg-danger/90 shadow-xs border border-transparent"
    };

    const sizeStyles = {
      sm: "h-8 px-3 text-xs gap-1.5",
      md: "h-10 px-4 text-xs font-semibold gap-2",
      lg: "h-11 px-5 text-sm font-semibold gap-2"
    };

    const iconSizes = {
      sm: 14,
      md: 16,
      lg: 18
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <Loader2 className="animate-spin" size={iconSizes[size]} />
        ) : (
          <>
            {Icon && iconPosition === "left" && <Icon size={iconSizes[size]} />}
            {children && <span>{children}</span>}
            {Icon && iconPosition === "right" && <Icon size={iconSizes[size]} />}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
