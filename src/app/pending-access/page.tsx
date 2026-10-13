"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { ShieldAlert, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PendingAccessPage() {
  const router = useRouter();
  const { signOut } = useClerk();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas font-sans px-4">
      <div className="flex flex-col items-center space-y-5 text-center max-w-md p-8 bg-surface border border-divider shadow-xl rounded-2xl">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
          <ShieldAlert size={24} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-primary">Access Pending Approval</h2>
          <p className="text-xs text-secondary leading-relaxed">
            Your authentication was successful, but your account is not yet active or assigned to a partner organization. Please contact your administrator to activate your account.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full pt-2">
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={() => router.push("/auth/resolve")}
            className="flex-1 justify-center min-h-[40px] text-xs"
          >
            Check Status
          </Button>
          <Button
            variant="tertiary"
            icon={LogOut}
            onClick={() => signOut({ redirectUrl: "/sign-in" })}
            className="flex-1 justify-center min-h-[40px] text-xs text-danger hover:text-danger hover:bg-danger-surface"
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}

