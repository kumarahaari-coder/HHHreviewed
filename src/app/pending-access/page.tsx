"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, ArrowLeft, Mail } from "lucide-react";
import { useClerk } from "@clerk/nextjs";

export default function PendingAccessPage() {
  const router = useRouter();
  const { signOut } = useClerk();

  const handleSignOut = async () => {
    await signOut({ redirectUrl: "/sign-in" });
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-16 bg-brand-bg relative font-sans min-h-screen">
      <div className="w-full max-w-md bg-brand-cream border border-brand-blush shadow-xl rounded-2xl p-8 text-center">
        <div className="w-12 h-12 bg-amber-100 border border-amber-200 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={24} />
        </div>

        <h1 className="text-2xl font-extrabold text-brand-plum tracking-tight">
          Account Access Pending
        </h1>

        <p className="text-zinc-600 font-serif italic text-sm mt-3 leading-relaxed">
          Your account has been authenticated through Clerk, but an active partner or administrator profile has not yet been assigned to your email by Hidden Honey Homes.
        </p>

        <div className="my-6 p-4 bg-brand-bg/50 border border-brand-blush/80 rounded-xl text-xs text-zinc-600 text-left space-y-2">
          <div className="flex items-center space-x-2 font-bold text-brand-wine">
            <Mail size={14} />
            <span>What should I do next?</span>
          </div>
          <p className="text-zinc-500 text-[11px]">
            Please contact your Hidden Honey Homes account administrator to approve your email address and assign your partner credentials.
          </p>
        </div>

        <div className="pt-2 flex flex-col space-y-3">
          <button
            onClick={handleSignOut}
            className="w-full bg-brand-plum hover:bg-brand-wine text-brand-cream py-2.5 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center space-x-2"
          >
            <ArrowLeft size={16} />
            <span>Sign Out & Return to Sign In</span>
          </button>
        </div>
      </div>
    </div>
  );
}
