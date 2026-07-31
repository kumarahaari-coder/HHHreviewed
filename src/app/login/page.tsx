"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

export default function LoginPage() {
  const router = useRouter();
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (isLoaded) {
      if (userId) {
        fetch("/api/auth/session")
          .then(res => res.json())
          .then(data => {
            if (data.status === "PENDING_ACCESS") {
              router.replace("/pending-access");
            } else if (data.status === "APPROVED" && data.user) {
              const role = data.user.role;
              if (role === "SUPER_ADMIN" || role === "FINANCE_ADMIN" || role === "ADMIN") {
                router.replace("/admin");
              } else {
                router.replace("/partner");
              }
            } else {
              router.replace("/pending-access");
            }
          })
          .catch(() => router.replace("/pending-access"));
      } else {
        router.replace("/sign-in");
      }
    }
  }, [isLoaded, userId, router]);

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-16 bg-brand-bg font-sans">
      <div className="text-center">
        <h2 className="text-xl font-bold text-brand-plum">Redirecting to Clerk Sign In...</h2>
        <p className="text-xs text-zinc-500 mt-2 font-serif italic">Please wait standard authentication redirect.</p>
      </div>
    </div>
  );
}
