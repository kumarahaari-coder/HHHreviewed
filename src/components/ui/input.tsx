import React, { useId } from "react";
import { LucideIcon } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  iconLeading?: LucideIcon;
  iconTrailing?: LucideIcon;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      iconLeading: IconLeading,
      iconTrailing: IconTrailing,
      id,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className="w-full space-y-1.5 font-sans">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-primary tracking-tight"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {IconLeading && (
            <div className="absolute left-3 text-secondary pointer-events-none">
              <IconLeading size={16} />
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`w-full h-10 px-3 text-xs text-primary bg-surface border rounded-md transition-colors duration-150 placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-surface-muted disabled:text-secondary disabled:cursor-not-allowed ${
              IconLeading ? "pl-9" : ""
            } ${IconTrailing ? "pr-9" : ""} ${
              error
                ? "border-danger focus:ring-danger focus:border-danger"
                : "border-divider"
            } ${className}`}
            {...props}
          />
          {IconTrailing && (
            <div className="absolute right-3 text-secondary pointer-events-none">
              <IconTrailing size={16} />
            </div>
          )}
        </div>
        {error && (
          <p id={errorId} className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={helperId} className="text-xs text-secondary">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
