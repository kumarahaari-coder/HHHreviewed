"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { AuthShell } from "./AuthShell";
import { Notice, PasswordField, PrimaryButton } from "./fields";

const MIN = 10;

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : Circle;
  return (
    <li className={`flex items-center gap-2 text-[12px] ${ok ? "text-success" : "text-tertiary"}`}>
      <Icon size={14} />
      {children}
    </li>
  );
}

export function SetPasswordForm({ mode }: { mode: "reset" | "invite" }) {
  const token = useSearchParams().get("token") || "";
  const endpoint = mode === "reset" ? "/api/auth/reset-password" : "/api/auth/accept-invitation";

  const [state, setState] = useState<"checking" | "valid" | "invalid">("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${endpoint}?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!active) return;
        setEmail(data.email || null);
        setState(data.valid ? "valid" : "invalid");
      } catch {
        if (active) setState("invalid");
      }
    })();
    return () => {
      active = false;
    };
  }, [endpoint, token]);

  const longEnough = password.length >= MIN;
  const matches = password.length > 0 && password === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!longEnough) return setError(`Password must be at least ${MIN} characters.`);
    if (!matches) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (mode === "invite") {
          window.location.href = data.redirectUrl || "/auth/resolve";
        } else {
          setDone(true);
        }
        return;
      }
      setError(data.error || "Something went wrong.");
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  const title = mode === "reset" ? "Choose a new password" : "Set up your account";
  const subtitle =
    mode === "reset"
      ? "Pick a strong password you haven't used before."
      : "Create a password to finish your partner portal setup.";

  if (state === "checking") {
    return (
      <AuthShell title={title}>
        <div className="flex items-center gap-2 text-[14px] text-secondary">
          <Loader2 size={16} className="animate-spin" /> Verifying your link…
        </div>
      </AuthShell>
    );
  }

  if (state === "invalid") {
    return (
      <AuthShell
        title="This link has expired"
        subtitle={
          mode === "reset"
            ? "Reset links are valid for 1 hour and can only be used once."
            : "Invitation links are valid for 7 days and can only be used once. Ask your administrator to send a new one."
        }
        footer={<Link href="/sign-in" className="font-medium text-secondary hover:text-primary transition-colors">Back to sign in</Link>}
      >
        {mode === "reset" && (
          <Link
            href="/forgot-password"
            className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-[14px] font-semibold text-white hover:bg-black"
          >
            Request a new link
          </Link>
        )}
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="Your password has been changed. You can now sign in with it.">
        <Link
          href="/sign-in"
          className="flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-[14px] font-semibold text-white hover:bg-black"
        >
          Continue to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={title} subtitle={email ? `${subtitle} (${email})` : subtitle}>
      <form onSubmit={onSubmit} className="space-y-5">
        <PasswordField
          label="New password"
          autoComplete="new-password"
          placeholder="At least 10 characters"
          required
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
        />
        <ul className="space-y-1.5">
          <Rule ok={longEnough}>At least {MIN} characters</Rule>
          <Rule ok={matches}>Both passwords match</Rule>
        </ul>
        {error && <Notice kind="error">{error}</Notice>}
        <PrimaryButton type="submit" loading={loading}>
          {mode === "reset" ? "Update password" : "Create account & sign in"}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
