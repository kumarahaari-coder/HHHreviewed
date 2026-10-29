"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/ui/loading-state";

export default function EntryPortal() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/auth/resolve");
  }, [router]);

  return (
    <div className="min-h-screen bg-brand-bg p-6 sm:p-10">
      <LoadingState message="Signing you in..." />
    </div>
  );
}
