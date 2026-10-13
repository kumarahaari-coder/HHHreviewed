"use client";

import React, { useId, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";

const inputBase =
  "w-full rounded-xl border border-divider bg-surface px-4 py-3 text-[14px] text-primary placeholder:text-tertiary outline-none transition-all hover:border-tertiary focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60";

export function TextField({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: React.ReactNode }) {
  const id = useId();
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-medium text-primary">
          {label}
        </label>
        {hint}
      </div>
      <input id={id} {...props} className={inputBase} />
    </div>
  );
}

export function PasswordField({
  label,
  hint,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; hint?: React.ReactNode }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-medium text-primary">
          {label}
        </label>
        {hint}
      </div>
      <div className="relative">
        <input id={id} {...props} type={visible ? "text" : "password"} className={`${inputBase} pr-12`} />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-tertiary transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none cursor-pointer"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

export function PrimaryButton({
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-[14px] font-semibold text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  const isError = kind === "error";
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-snug ${
        isError ? "border-danger-border bg-danger-surface text-danger" : "border-success-border bg-success-surface text-success"
      }`}
    >
      <Icon size={16} className="mt-px shrink-0" />
      <span>{children}</span>
    </div>
  );
}
