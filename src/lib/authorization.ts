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

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.emailAddresses?.[0]?.emailAddress || "";
    const publicMetadata = (clerkUser?.publicMetadata || {}) as { role?: UserRole; partnerId?: string };

    const matchedDbUser = db.users.find(u => u.clerkUserId === userId || (primaryEmail && u.email.toLowerCase() === primaryEmail.toLowerCase()));

    const role: UserRole = publicMetadata.role || matchedDbUser?.role || "CREATOR";
    const partnerId: string | undefined = publicMetadata.partnerId || matchedDbUser?.partnerId || "partner-001";

    return {
      userId: matchedDbUser?.id || userId,
      email: primaryEmail || matchedDbUser?.email || "user@clerk.dev",
      role,
      partnerId,
      clerkUserId: userId
    };
  } catch {
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
}

/**
 * Synchronous session helper with fallback to current db.currentUser
 */
export function getCurrentSession(): AuthSession | null {
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
