"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function AuthResolverPage() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isSubscribed = true;

    async function resolveUserDestination() {
      try {
        console.log("[Auth Resolver] Resolving session via /api/auth/session...");
        const res = await fetch("/api/auth/session");
        const data = await res.json();

        if (!isSubscribed) return;

        console.log("[Auth Resolver] Session data:", data);

        if (!data.authenticated || data.status === "UNAUTHENTICATED") {
          console.log("[Auth Resolver] Unauthenticated. Redirecting to /sign-in");
          router.replace("/sign-in");
          return;
        }

        if (data.status === "PENDING_ACCESS") {
          console.log("[Auth Resolver] Pending access. Redirecting to /pending-access");
          router.replace("/pending-access");
          return;
        }

        if (data.status === "APPROVED" && data.user) {
          const role = data.user.role;
          if (role === "SUPER_ADMIN" || role === "FINANCE_ADMIN" || role === "ADMIN") {
            console.log(`[Auth Resolver] Admin role (${role}). Redirecting directly to /admin`);
            router.replace("/admin");
          } else if (role === "CREATOR" || role === "PARTNER_OWNER") {
            console.log(`[Auth Resolver] Creator role (${role}). Redirecting to /partner`);
            router.replace("/partner");
          } else {
            console.log(`[Auth Resolver] Unknown role (${role}). Redirecting to /pending-access`);
            router.replace("/pending-access");
          }
          return;
        }

        router.replace("/pending-access");
      } catch (err: any) {
        console.error("[Auth Resolver Error]", err);
        if (isSubscribed) {
          setErrorMsg("Authentication resolution failed. Redirecting...");
          setTimeout(() => router.replace("/sign-in"), 1500);
        }
      }
    }

    resolveUserDestination();

    return () => {
      isSubscribed = false;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-bg font-sans px-4">
      <div className="flex flex-col items-center space-y-4 text-center max-w-sm p-6 bg-brand-cream border border-brand-blush shadow-xl rounded-2xl">
        <Loader2 className="h-10 w-10 animate-spin text-brand-plum" />
        <div>
          <h2 className="text-lg font-bold text-brand-plum">Resolving Authentication...</h2>
          <p className="text-xs text-zinc-500 font-serif italic mt-1">
            Validating account credentials and establishing server authorization.
          </p>
        </div>
        {errorMsg && (
          <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg">
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  );
}
