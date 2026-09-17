import React, { useId } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, helperText, id, className = "", disabled, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    return (
      <div className="w-full space-y-1.5 font-sans">
        {label && (
          <label htmlFor={selectId} className="block text-xs font-semibold text-primary tracking-tight">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`w-full h-10 pl-3 pr-9 text-xs text-primary bg-surface border rounded-md appearance-none transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-surface-muted disabled:text-secondary disabled:cursor-not-allowed ${
              error ? "border-danger focus:ring-danger focus:border-danger" : "border-divider"
            } ${className}`}
            {...props}
          >
            {options.map(opt => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="absolute right-3 text-secondary pointer-events-none">
            <ChevronDown size={14} />
          </div>
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

Select.displayName = "Select";
