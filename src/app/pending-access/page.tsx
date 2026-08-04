"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function PendingAccessPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-bg font-sans px-4">
      <div className="flex items-center space-x-2 text-brand-plum text-sm font-bold animate-pulse">
        <Loader2 className="animate-spin" size={18} />
        <span>Redirecting to Account Switcher...</span>
      </div>
    </div>
  );
}
