"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck, UserCheck, RefreshCw } from "lucide-react";

export function RoleSwitcher() {
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isMock = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_AUTH_MODE === "mock_dev_only";

  useEffect(() => {
    fetch("/api/auth/session")
      .then(res => res.json())
      .then(data => {
        if (data.session?.role) {
          setCurrentRole(data.session.role);
        } else {
          setCurrentRole(null);
        }
      })
      .catch(() => setCurrentRole(null));
  }, []);

  const isAdmin = currentRole === "SUPER_ADMIN" || currentRole === "ADMIN" || currentRole === "FINANCE_ADMIN";

  // In production, hide RoleSwitcher completely unless current user is an authenticated Admin
  if (!isMock && !isAdmin) {
    return null;
  }

  async function switchRole(targetRole: "SUPER_ADMIN" | "PARTNER_OWNER") {
    try {
      setLoading(true);
      const res = await fetch("/api/auth/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetRole })
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = data.redirectUrl;
      }
    } catch (e) {
      console.error("Failed to switch role:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1 bg-zinc-900/90 text-zinc-100 p-1 rounded-full border border-zinc-700/60 shadow-lg text-xs font-sans">
      <button
        type="button"
        disabled={loading}
        onClick={() => switchRole("SUPER_ADMIN")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-all ${
          isAdmin
            ? "bg-amber-500 text-zinc-950 font-bold shadow-md"
            : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        }`}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>Super Admin</span>
      </button>

      <button
        type="button"
        disabled={loading}
        onClick={() => switchRole("PARTNER_OWNER")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium transition-all ${
          !isAdmin
            ? "bg-emerald-500 text-zinc-950 font-bold shadow-md"
            : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        }`}
      >
        <UserCheck className="w-3.5 h-3.5" />
        <span>Member / Partner</span>
      </button>

      {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 ml-1" />}
    </div>
  );
}
