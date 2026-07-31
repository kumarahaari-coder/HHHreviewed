import { auth, currentUser } from "@clerk/nextjs/server";
import { User, UserRole } from "./db/schema";
import { db } from "./db/mockDb";

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
 * Server-side session resolver supporting Clerk authentication & dev mock fallback.
 * Strictly guarantees that authorization roles come ONLY from trusted application database records.
 * Automatically rejects users who do not have an approved application user record.
 */
export async function getClerkAuthSession(): Promise<AuthSession | null> {
  const isDevMockMode = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_AUTH_MODE === "mock_dev_only";

  if (isDevMockMode) {
    const user = db.currentUser;
    if (!user) return null;
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      partnerId: user.partnerId,
      clerkUserId: user.clerkUserId
    };
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return null;
    }

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.emailAddresses?.[0]?.emailAddress || "";
    const publicMetadata = (clerkUser?.publicMetadata || {}) as { role?: UserRole; partnerId?: string };

    // Match strictly by Clerk User ID first, then by exact verified email
    let matchedDbUser = db.users.find(u => u.clerkUserId === userId);
    if (!matchedDbUser && primaryEmail) {
      matchedDbUser = db.users.find(u => u.email.toLowerCase() === primaryEmail.toLowerCase());
      if (matchedDbUser) {
        matchedDbUser.clerkUserId = userId;
      }
    }

    // SECURITY CONTROL: If no application user record exists, DENY ACCESS (No default CREATOR fallback)
    if (!matchedDbUser) {
      console.warn(`[Access Denied] Clerk user ${userId} (${primaryEmail}) has no approved application database record.`);
      return null;
    }

    // Role MUST come exclusively from application trusted server-side database record.
    // Never escalate from Clerk publicMetadata.
    const role: UserRole = matchedDbUser.role;

    return {
      userId: matchedDbUser.id,
      email: primaryEmail || matchedDbUser.email,
      role,
      partnerId: matchedDbUser.partnerId || undefined,
      clerkUserId: userId
    };
  } catch (error) {
    console.error("[Auth Session Resolver Error]", error);
    return null;
  }
}

/**
 * Synchronous session helper
 */
export function getCurrentSession(): AuthSession | null {
  const isDevMockMode = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_AUTH_MODE === "mock_dev_only";
  if (isDevMockMode) {
    const user = db.currentUser;
    if (!user) return null;
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      partnerId: user.partnerId,
      clerkUserId: user.clerkUserId
    };
  }

  const user = db.currentUser;
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    partnerId: user.partnerId || undefined,
    clerkUserId: user.clerkUserId
  };
}
