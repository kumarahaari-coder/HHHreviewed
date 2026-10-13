import { cookies } from "next/headers";
import { User, UserRole } from "./db/schema";
import { findUserById } from "./supabase/data-store";
import { isMockAuthAllowed } from "./config";
import { getSessionUserId } from "./auth/session";

export interface AuthSession {
  userId: string;
  name?: string;
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

export interface AuthResolutionResult {
  authenticated: boolean;
  status: "APPROVED" | "PENDING_ACCESS" | "UNAUTHENTICATED";
  reason?: string;
  session: AuthSession | null;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    partnerId?: string;
    clerkUserId?: string;
  } | null;
}

function evaluateUserAccess(user: User, clerkUserId?: string): AuthResolutionResult {
  // Require active state
  const isApprovedStatus = user.status === "ACTIVE";
  if (!isApprovedStatus) {
    return {
      authenticated: true,
      status: "PENDING_ACCESS",
      reason: `ACCOUNT_${user.status || "INACTIVE"}`,
      session: null,
      user: null
    };
  }

  if (!user.role) {
    return {
      authenticated: true,
      status: "PENDING_ACCESS",
      reason: "NO_ROLE_ASSIGNED",
      session: null,
      user: null
    };
  }

  // Require valid partner mapping for creators
  if (isCreatorRole(user.role) && !user.partnerId) {
    return {
      authenticated: true,
      status: "PENDING_ACCESS",
      reason: "NO_PARTNER_ASSIGNED",
      session: null,
      user: null
    };
  }

  const userName = user.name || (isAdminRole(user.role) ? "Admin User" : "Partner Owner");

  const session: AuthSession = {
    userId: user.id,
    name: userName,
    email: user.email,
    role: user.role,
    partnerId: isAdminRole(user.role) ? undefined : user.partnerId,
    clerkUserId
  };

  return {
    authenticated: true,
    status: "APPROVED",
    session,
    user: {
      id: user.id,
      name: userName,
      email: user.email,
      role: user.role,
      partnerId: session.partnerId,
      clerkUserId
    }
  };
}

/**
 * Server-side authoritative session resolution with detailed diagnostic status.
 */
export async function resolveAuthSession(): Promise<AuthResolutionResult> {
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

      // Native password session (hhh_session cookie), validated against the database
      const nativeUserId = await getSessionUserId();
      if (nativeUserId) {
        const nativeUser = await findUserById(nativeUserId);
        if (nativeUser) {
          return evaluateUserAccess(nativeUser);
        }
      }

      // No valid native session
      return {
        authenticated: false,
        status: "UNAUTHENTICATED",
        session: null,
        user: null
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
      const name = role === "SUPER_ADMIN" ? "Hidden Honey Admin" : "Partner Owner";

      const session: AuthSession = {
        userId,
        name,
        email,
        role,
        partnerId: isAdminRole(role) ? undefined : partnerId,
        clerkUserId: "open_bypass_user"
      };

      return {
        authenticated: true,
        status: "APPROVED",
        session,
        user: {
          id: userId,
          name,
          email,
          role,
          partnerId: session.partnerId,
          clerkUserId: "open_bypass_user"
        }
      };
    }

    const defaultSession: AuthSession = {
      userId: "user-admin-1",
      name: "Hidden Honey Admin",
      email: "hiddenhoneyace@gmail.com",
      role: "SUPER_ADMIN",
      partnerId: undefined,
      clerkUserId: "open_bypass_admin"
    };

    return {
      authenticated: true,
      status: "APPROVED",
      session: defaultSession,
      user: {
        id: defaultSession.userId,
        name: defaultSession.name!,
        email: defaultSession.email,
        role: defaultSession.role,
        partnerId: undefined,
        clerkUserId: "open_bypass_admin"
      }
    };
  } catch (error) {
    console.error("[Auth Session Resolver Error]", error);
    return {
      authenticated: false,
      status: "UNAUTHENTICATED",
      session: null,
      user: null
    };
  }
}

/**
 * Server-side authoritative session resolver.
 */
export async function getAuthSession(): Promise<AuthSession | null> {
  const result = await resolveAuthSession();
  return result.session;
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  return getAuthSession();
}

