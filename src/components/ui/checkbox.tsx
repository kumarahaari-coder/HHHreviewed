import React, { useId } from "react";
import { Check } from "lucide-react";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label?: React.ReactNode;
  description?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  error?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, checked = false, onChange, error, id, disabled, className = "", ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (onChange) onChange(e.target.checked);
    };

    return (
      <div className="flex items-start space-x-3 select-none font-sans">
        <div className="relative flex items-center pt-0.5">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            checked={checked}
            onChange={handleChange}
            disabled={disabled}
            className="peer sr-only"
            aria-invalid={!!error}
            {...props}
          />
          <div
            onClick={() => !disabled && onChange && onChange(!checked)}
            className={`w-4 h-4 rounded border transition-all duration-150 flex items-center justify-center cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-1 ${
              checked
                ? "bg-primary border-primary text-surface"
                : "bg-surface border-divider hover:border-secondary"
            } ${disabled ? "bg-surface-muted border-divider cursor-not-allowed opacity-50" : ""} ${
              error ? "border-danger" : ""
            } ${className}`}
          >
            {checked && <Check size={12} strokeWidth={3} className="text-surface" />}
          </div>
        </div>
        {(label || description) && (
          <div className="flex-1 text-xs">
            {label && (
              <label
                htmlFor={checkboxId}
                className={`font-medium text-primary cursor-pointer ${
                  disabled ? "cursor-not-allowed text-secondary" : ""
                }`}
              >
                {label}
              </label>
            )}
            {description && <p className="text-secondary text-[11px] mt-0.5 leading-relaxed">{description}</p>}
            {error && <p className="text-danger text-[11px] mt-0.5 font-medium">{error}</p>}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";
