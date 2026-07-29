"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Landmark, Users, ArrowRight, Heart } from "lucide-react";
import { db } from "@/lib/db/mockDb";
import { User } from "@/lib/db/schema";

export default function EntryPortal() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setUsers(db.users);
  }, []);

  const handleLogin = (user: User) => {
    db.currentUser = user;
    if (user.role === "SUPER_ADMIN" || user.role === "FINANCE_ADMIN") {
      router.push("/admin");
    } else {
      router.push("/partner");
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-16 bg-brand-bg select-none">
      {/* Editorial Header */}
      <div className="max-w-2xl text-center mb-12">
        <span className="text-xs uppercase tracking-widest text-brand-wine font-semibold bg-brand-blush/40 px-3 py-1.5 rounded-full">
          Partner Portal & Booking Dashboard
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold text-brand-plum tracking-tight">
          Hidden Honey Homes
        </h1>
        <p className="mt-4 text-zinc-600 font-serif italic text-lg">
          Connecting travelers to curated, adults-only retreats. Designed for couples to slow down, reconnect, and explore.
        </p>
      </div>

      {/* Main Selector Card */}
      <div className="w-full max-w-xl bg-brand-cream border border-brand-blush shadow-xl rounded-2xl p-8">
        <h2 className="text-xl font-bold text-brand-plum tracking-tight text-center mb-2">
          Select Your Persona
        </h2>
        <p className="text-zinc-500 text-sm text-center mb-8">
          Open the reviewed POC using an available administrator or partner profile.
        </p>

        <div className="space-y-4">
          {users.map(user => {
            let Icon = Users;
            let roleLabel = "Partner Website Owner";
            let roleColor = "bg-brand-blush/45 text-brand-wine border-brand-blush";
            let desc = "View referred stays, estimated payouts, and download statements.";

            if (user.role === "SUPER_ADMIN") {
              Icon = ShieldCheck;
              roleLabel = "Super Admin";
              roleColor = "bg-brand-plum/10 text-brand-plum border-brand-plum/20";
              desc = "Access all website referrals, commission configurations, payout queues, and integrations.";
            } else if (user.role === "FINANCE_ADMIN") {
              Icon = Landmark;
              roleLabel = "Finance & Operations";
              roleColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
              desc = "Review stays, verify check-ins, process payout batches, and log transaction references.";
            }

            return (
              <button
                key={user.id}
                onClick={() => handleLogin(user)}
                className="w-full text-left p-4 rounded-xl border border-brand-blush hover:border-brand-plum hover:bg-brand-blush/20 focus-visible:bg-brand-blush/20 focus-visible:ring-2 focus-visible:ring-brand-plum transition-all duration-200 group flex items-start space-x-4"
              >
                <div className={`p-2.5 rounded-lg border ${roleColor} shrink-0`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-brand-text truncate">{user.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${roleColor}`}>
                      {roleLabel}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                    {desc}
                  </p>
                </div>
                <div className="self-center pl-2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                  <ArrowRight size={16} className="text-brand-plum" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Branding */}
      <div className="mt-16 flex items-center space-x-2 text-xs text-zinc-500 font-serif">
        <Heart size={10} className="text-brand-wine fill-brand-wine" />
        <span className="font-semibold text-brand-plum font-sans tracking-wide">Hidden Honey Homes Partner Portal POC</span>
      </div>
    </div>
  );
}
