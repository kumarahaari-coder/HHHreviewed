import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { UserRole } from "./db/schema";
import { findUserByClerkUserId } from "./supabase/data-store";
import { isMockAuthAllowed } from "./config";

export interface AuthSession {
  userId: string;
  email: string;
  role: UserRole;
  partnerId?: string;
  clerkUserId?: string;
}

export function isAdminRole(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "FINANCE_ADMIN" || role === "ADMIN";
}

export function isCreatorRole(role: UserRole): boolean {
  return role === "PARTNER_OWNER" || role === "CREATOR";
}

export function canAccessCreatorData(session: AuthSession | null | undefined, targetPartnerId: string): boolean {
  if (!session) return false;
  if (isAdminRole(session.role)) {
    return true;
  }
  if (isCreatorRole(session.role)) {
    return Boolean(session.partnerId && session.partnerId === targetPartnerId);
  }
  return false;
}

export function canPerformAdminReview(session: AuthSession | null | undefined): boolean {
  if (!session) return false;
  return isAdminRole(session.role);
}

/**
 * Server-side authoritative session resolver.
 */
export async function getClerkAuthSession(): Promise<AuthSession | null> {
  try {
    let cookieStore: any = null;
    try {
      cookieStore = await cookies();
    } catch (_) {
      // Called outside Next.js HTTP request scope
    }

    if (!isMockAuthAllowed()) {
      // Safe expiration of legacy demo cookies in production
      if (cookieStore && (cookieStore.get("demo_role") || cookieStore.get("demo_email"))) {
        try {
          cookieStore.delete("demo_role");
          cookieStore.delete("demo_email");
          cookieStore.delete("demo_partner_id");
          cookieStore.delete("demo_user_id");
        } catch (_) {}
      }

      // Canonical identity resolution via Clerk
      let clerkUserId: string | null = null;
      try {
        const authData = await auth();
        clerkUserId = authData.userId;
      } catch (_) {
        return null;
      }

      if (!clerkUserId) {
        return null;
      }

      const user = await findUserByClerkUserId(clerkUserId);
      if (!user) {
        return null;
      }

      // Require active state
      const isApprovedStatus = user.status === "ACTIVE";
      if (!isApprovedStatus) {
        return null;
      }

      if (!user.role) {
        return null;
      }

      // Require valid partner mapping for creators
      if (isCreatorRole(user.role) && !user.partnerId) {
        return null;
      }

      return {
        userId: user.id,
        email: user.email,
        role: user.role,
        partnerId: isAdminRole(user.role) ? undefined : user.partnerId,
        clerkUserId: clerkUserId
      };
    }

    // Mock auth allowed ONLY in explicit non-production dev mode
    const demoRole = cookieStore.get("demo_role")?.value;
    const demoEmail = cookieStore.get("demo_email")?.value;
    const demoPartnerId = cookieStore.get("demo_partner_id")?.value;
    const demoUserId = cookieStore.get("demo_user_id")?.value;

    if (demoRole || demoEmail) {
      const role: UserRole = (demoRole as UserRole) || "SUPER_ADMIN";
      const partnerId = demoPartnerId || "00000000-0000-0000-0000-000000000001";
      const email = demoEmail || (role === "SUPER_ADMIN" ? "hiddenhoneyace@gmail.com" : "kumarahaari@gmail.com");
      const userId = demoUserId || (role === "SUPER_ADMIN" ? "user-admin-1" : "user-partner-demo");

      return {
        userId,
        email,
        role,
        partnerId: isAdminRole(role) ? undefined : partnerId,
        clerkUserId: "open_bypass_user"
      };
    }

    return {
      userId: "user-admin-1",
      email: "hiddenhoneyace@gmail.com",
      role: "SUPER_ADMIN",
      partnerId: undefined,
      clerkUserId: "open_bypass_admin"
    };
  } catch (error) {
    console.error("[Auth Session Resolver Error]", error);
    return null;
  }
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  return getClerkAuthSession();
}
