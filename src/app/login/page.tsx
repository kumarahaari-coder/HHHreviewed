"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, UserCheck, Building2, Loader2, ArrowRight } from "lucide-react";

interface PartnerItem {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  status: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [activeAccount, setActiveAccount] = useState<string | null>(null);

  useEffect(() => {
    async function loadPartners() {
      try {
        const res = await fetch("/api/admin/partners");
        const data = await res.json();
        if (data.partners && Array.isArray(data.partners)) {
          setPartners(data.partners);
        }
      } catch (err) {
        console.error("Failed to load partners:", err);
      } finally {
        setLoadingPartners(false);
      }
    }
    loadPartners();
  }, []);

  async function loginAsUser(params: {
    role: "SUPER_ADMIN" | "FINANCE_ADMIN" | "PARTNER_OWNER";
    email: string;
    partnerId?: string;
    name: string;
  }) {
    try {
      setActiveAccount(params.email);
      const res = await fetch("/api/auth/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: params.role,
          email: params.email,
          partnerId: params.partnerId || ""
        })
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      console.error("Login failed:", err);
      setActiveAccount(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-bg font-sans px-4 py-12">
      <div className="w-full max-w-xl bg-brand-cream border border-brand-blush shadow-2xl rounded-3xl p-8 space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center space-x-2 bg-brand-blush/40 px-3 py-1 rounded-full text-brand-wine text-xs font-bold uppercase tracking-wider">
            <span>Hidden Honey Homes</span>
          </div>
          <h1 className="text-2xl font-extrabold text-brand-plum tracking-tight">
            Account Switcher
          </h1>
          <p className="text-xs text-zinc-500 font-serif italic">
            Select an account to log in directly into the Admin or Partner Portal.
          </p>
        </div>

        {/* ADMIN ACCOUNTS */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-amber-600" />
            <span>Administrator Profiles</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!!activeAccount}
              onClick={() => loginAsUser({
                role: "SUPER_ADMIN",
                email: "hiddenhoneyace@gmail.com",
                name: "Super Admin"
              })}
              className="group p-4 bg-white border border-brand-blush hover:border-amber-500 hover:shadow-md rounded-2xl text-left transition-all relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-brand-plum group-hover:text-amber-600 transition-colors">
                    Super Admin
                  </span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                    SUPER_ADMIN
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 truncate">
                  hiddenhoneyace@gmail.com
                </p>
              </div>
              <div className="mt-3 flex items-center text-[11px] font-bold text-amber-700 group-hover:translate-x-1 transition-transform">
                <span>Enter Admin Portal</span>
                <ArrowRight size={12} className="ml-1" />
              </div>
            </button>

            <button
              type="button"
              disabled={!!activeAccount}
              onClick={() => loginAsUser({
                role: "FINANCE_ADMIN",
                email: "finance@hhh.com",
                name: "Finance Admin"
              })}
              className="group p-4 bg-white border border-brand-blush hover:border-amber-500 hover:shadow-md rounded-2xl text-left transition-all relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-brand-plum group-hover:text-amber-600 transition-colors">
                    Finance Admin
                  </span>
                  <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full">
                    FINANCE_ADMIN
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 truncate">
                  finance@hhh.com
                </p>
              </div>
              <div className="mt-3 flex items-center text-[11px] font-bold text-amber-700 group-hover:translate-x-1 transition-transform">
                <span>Enter Admin Portal</span>
                <ArrowRight size={12} className="ml-1" />
              </div>
            </button>
          </div>
        </div>

        {/* PARTNER / MEMBER ACCOUNTS */}
        <div className="space-y-3 pt-2 border-t border-brand-blush/60">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
            <UserCheck size={14} className="text-emerald-600" />
            <span>Member & Partner Accounts</span>
          </h2>

          {loadingPartners ? (
            <div className="flex items-center justify-center p-6 text-zinc-400 text-xs gap-2">
              <Loader2 className="animate-spin" size={16} />
              <span>Loading partner directory...</span>
            </div>
          ) : partners.length === 0 ? (
            <button
              type="button"
              disabled={!!activeAccount}
              onClick={() => loginAsUser({
                role: "PARTNER_OWNER",
                email: "kumarahaari@gmail.com",
                name: "Default Partner Owner"
              })}
              className="w-full group p-4 bg-white border border-brand-blush hover:border-emerald-500 hover:shadow-md rounded-2xl text-left transition-all flex items-center justify-between"
            >
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-extrabold text-brand-plum">Partner Owner</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    PARTNER_OWNER
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">kumarahaari@gmail.com</p>
              </div>
              <div className="flex items-center text-[11px] font-bold text-emerald-700 group-hover:translate-x-1 transition-transform">
                <span>Enter Partner Portal</span>
                <ArrowRight size={12} className="ml-1" />
              </div>
            </button>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {partners.map(p => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!!activeAccount}
                  onClick={() => loginAsUser({
                    role: "PARTNER_OWNER",
                    email: p.email,
                    partnerId: p.id,
                    name: p.contactName || p.businessName
                  })}
                  className="w-full group p-3.5 bg-white border border-brand-blush hover:border-emerald-500 hover:shadow-md rounded-2xl text-left transition-all flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center space-x-2 truncate">
                      <Building2 size={13} className="text-emerald-600 shrink-0" />
                      <span className="text-xs font-extrabold text-brand-plum truncate">
                        {p.businessName}
                      </span>
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded">
                        {p.contactName}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 truncate mt-0.5">{p.email}</p>
                  </div>
                  <div className="shrink-0 flex items-center text-[11px] font-bold text-emerald-700 group-hover:translate-x-1 transition-transform">
                    <span>Log in</span>
                    <ArrowRight size={12} className="ml-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {activeAccount && (
          <div className="flex items-center justify-center p-3 bg-brand-bg rounded-xl text-xs font-bold text-brand-plum space-x-2 animate-pulse">
            <Loader2 className="animate-spin" size={14} />
            <span>Logging in as {activeAccount}...</span>
          </div>
        )}
      </div>
    </div>
  );
}
