import React from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-canvas px-4 py-12 sm:px-6">
      <div className="w-full max-w-[420px]">
        {/* Brand header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white text-xs font-bold tracking-wider shadow-xs">
            HHH
          </div>
          <span className="text-sm font-semibold tracking-tight text-primary">
            Hidden Honey Homes
          </span>
          <p className="mt-0.5 text-[11px] text-secondary">Partner &amp; Creator Portal</p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-divider-soft bg-surface p-7 shadow-xs sm:p-9">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-primary">{title}</h1>
            {subtitle && (
              <p className="mt-2 text-[13px] leading-relaxed text-secondary">{subtitle}</p>
            )}
          </div>

          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="mt-6 text-center text-[13px] text-secondary">
            {footer}
          </div>
        )}

        {/* Copyright notice */}
        <p className="mt-8 text-center text-xs text-tertiary">
          &copy; {new Date().getFullYear()} Hidden Honey Homes. All rights reserved.
        </p>
      </div>
    </div>
  );
}




