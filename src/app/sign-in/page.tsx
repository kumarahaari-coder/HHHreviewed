"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Notice, PasswordField, PrimaryButton, TextField } from "@/components/auth/fields";

export default function DirectSignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        window.location.href = data.redirectUrl || "/auth/resolve";
        return;
      }
      setError(data.error || "Sign-in failed.");
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to access your referrals, earnings and payouts."
      footer={<>Invited as a partner? Check your email for your setup link.</>}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <TextField
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          autoFocus
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          hint={
            <Link href="/forgot-password" className="text-[12px] font-medium text-secondary hover:text-primary transition-colors">
              Forgot password?
            </Link>
          }
        />
        {error && <Notice kind="error">{error}</Notice>}
        <PrimaryButton type="submit" loading={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
