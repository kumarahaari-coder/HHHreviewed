import React, { useId } from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, id, className = "", disabled, rows = 3, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const errorId = `${textareaId}-error`;
    const helperId = `${textareaId}-helper`;

    return (
      <div className="w-full space-y-1.5 font-sans">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-semibold text-primary tracking-tight">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          rows={rows}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={`w-full p-3 text-xs text-primary bg-surface border rounded-md transition-colors duration-150 placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-surface-muted disabled:text-secondary disabled:cursor-not-allowed ${
            error ? "border-danger focus:ring-danger focus:border-danger" : "border-divider"
          } ${className}`}
          {...props}
        />
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

Textarea.displayName = "Textarea";
