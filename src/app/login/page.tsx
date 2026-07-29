"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ArrowLeft } from "lucide-react";
import { db } from "@/lib/db/mockDb";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Simulate database auth
    setTimeout(() => {
      const match = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (match) {
        db.currentUser = match;
        if (match.role === "SUPER_ADMIN" || match.role === "FINANCE_ADMIN") {
          router.push("/admin");
        } else {
          router.push("/partner");
        }
      } else {
        setError("Invalid POC profile. Use admin@hiddenhoneyhomes.com until Supabase Auth is connected.");
        setLoading(false);
      }
    }, 800);
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-12 bg-brand-bg relative font-sans">
      {/* Back button */}
      <button
        onClick={() => router.push("/")}
        className="absolute top-8 left-8 flex items-center space-x-2 text-zinc-500 hover:text-brand-plum font-serif text-sm transition-colors"
      >
        <ArrowLeft size={16} />
        <span>Return to Selection</span>
      </button>

      <div className="w-full max-w-md bg-brand-cream border border-brand-blush shadow-xl rounded-2xl p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold text-brand-plum tracking-tight">
            Sign In
          </h2>
          <p className="text-zinc-500 font-serif italic text-sm mt-2">
            Secure login for HHH partners and administrators
          </p>
        </div>

        {error && (
          <div className="p-3 mb-6 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs uppercase tracking-widest text-brand-wine font-bold mb-2">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400">
                <Mail size={16} />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full pl-10 pr-4 py-3 bg-brand-bg/50 border border-brand-blush rounded-lg text-sm text-brand-text placeholder-zinc-400 focus:outline-none focus:border-brand-plum focus:ring-2 focus:ring-brand-plum/20 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-brand-wine font-bold mb-2">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400">
                <KeyRound size={16} />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-brand-bg/50 border border-brand-blush rounded-lg text-sm text-brand-text placeholder-zinc-400 focus:outline-none focus:border-brand-plum focus:ring-2 focus:ring-brand-plum/20 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-plum text-brand-cream hover:bg-brand-wine py-3 px-4 rounded-lg font-semibold text-sm transition-all shadow-md active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-plum focus:ring-offset-2 flex justify-center items-center"
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        <div className="mt-8 border-t border-brand-blush pt-6">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-wine mb-3">
            POC Access
          </h4>
          <div className="bg-brand-bg/40 p-3 rounded-lg border border-brand-blush/60 space-y-1.5 text-xs text-zinc-600">
            <div>
              <span className="font-bold text-brand-plum">Admin:</span> admin@hiddenhoneyhomes.com
            </div>
            <div>
              <span className="font-bold text-brand-plum">Status:</span> Browser-only authentication placeholder
            </div>
            <div className="text-[10px] italic text-zinc-400 mt-1">
              Use any password for this UI review only. Connect Supabase Auth before sharing externally.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
