import { cookies } from "next/headers";
import { User, UserRole } from "./db/schema";
import { db } from "./db/mockDb";
import { findUserByEmail, getAllPartners } from "./supabase/data-store";

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

export function canAccessCreatorData(session: AuthSession, targetPartnerId: string): boolean {
  if (isAdminRole(session.role)) {
    return true;
  }
  if (isCreatorRole(session.role)) {
    return session.partnerId === targetPartnerId;
  }
  return false;
}

export function canPerformAdminReview(session: AuthSession): boolean {
  return isAdminRole(session.role);
}

/**
 * Server-side session resolver when Clerk is disabled/bypassed.
 * Always resolves a valid, active approved session without blocking.
 */
export async function getClerkAuthSession(): Promise<AuthSession> {
  try {
    const cookieStore = await cookies();
    const demoRole = cookieStore.get("demo_role")?.value;
    const demoEmail = cookieStore.get("demo_email")?.value;
    const demoPartnerId = cookieStore.get("demo_partner_id")?.value;
    const demoUserId = cookieStore.get("demo_user_id")?.value;

    const partners = await getAllPartners().catch(() => []);
    const firstPartner = partners[0];

    if (demoRole || demoEmail) {
      const dbUser = demoEmail ? await findUserByEmail(demoEmail).catch(() => null) : null;
      const role: UserRole = (demoRole as UserRole) || dbUser?.role || "SUPER_ADMIN";
      const partnerId = demoPartnerId || dbUser?.partnerId || firstPartner?.id || "00000000-0000-0000-0000-000000000001";
      const email = demoEmail || dbUser?.email || (role === "SUPER_ADMIN" ? "hiddenhoneyace@gmail.com" : "kumarahaari@gmail.com");
      const userId = demoUserId || dbUser?.id || (role === "SUPER_ADMIN" ? "user-admin-1" : "user-partner-demo");

      return {
        userId,
        email,
        role,
        partnerId: (role === "SUPER_ADMIN" || role === "ADMIN" || role === "FINANCE_ADMIN") ? undefined : partnerId,
        clerkUserId: "open_bypass_user"
      };
    }

    // Default active Super Admin session
    const adminUser = await findUserByEmail("hiddenhoneyace@gmail.com").catch(() => null);
    return {
      userId: adminUser?.id || "user-admin-1",
      email: adminUser?.email || "hiddenhoneyace@gmail.com",
      role: (adminUser?.role as UserRole) || "SUPER_ADMIN",
      partnerId: undefined,
      clerkUserId: "open_bypass_admin"
    };
  } catch (error) {
    console.error("[Auth Session Resolver]", error);
    return {
      userId: "user-admin-1",
      email: "hiddenhoneyace@gmail.com",
      role: "SUPER_ADMIN",
      partnerId: undefined,
      clerkUserId: "open_bypass_admin"
    };
  }
}

/**
 * Server session helper, delegates to getClerkAuthSession.
 */
export async function getCurrentSession(): Promise<AuthSession> {
  return getClerkAuthSession();
}
