"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Notice, PrimaryButton, TextField } from "@/components/auth/fields";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a link to reset it."
      footer={
        <Link href="/sign-in" className="inline-flex items-center gap-1.5 font-medium text-secondary hover:text-primary transition-colors">
          <ArrowLeft size={14} /> Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Notice kind="success">
          If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in 1 hour.
        </Notice>
      ) : (
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
          {error && <Notice kind="error">{error}</Notice>}
          <PrimaryButton type="submit" loading={loading}>
            Send reset link
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
