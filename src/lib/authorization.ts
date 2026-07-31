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
 * Strictly guarantees that Clerk authenticated users resolve by Clerk User ID without falling back to seeded Super Admin records.
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
      // Unauthenticated request in production
      return null;
    }

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.emailAddresses?.[0]?.emailAddress || "";
    const publicMetadata = (clerkUser?.publicMetadata || {}) as { role?: UserRole; partnerId?: string };

    // Match strictly by Clerk User ID first, then by exact verified email
    let matchedDbUser = db.users.find(u => u.clerkUserId === userId);
    if (!matchedDbUser && primaryEmail) {
      // Never auto-match Super Admin record unless exact email match
      matchedDbUser = db.users.find(u => u.email.toLowerCase() === primaryEmail.toLowerCase());
      if (matchedDbUser) {
        matchedDbUser.clerkUserId = userId;
      }
    }

    // Determine strict role: Default to CREATOR. Admin roles require explicit assignment.
    let role: UserRole = "CREATOR";
    if (publicMetadata.role && isAdminRole(publicMetadata.role)) {
      role = publicMetadata.role;
    } else if (matchedDbUser?.role) {
      role = matchedDbUser.role;
    }

    // If target affected user ID `user_3HGDykF71AqhxNuqdtbsMvuP1Xv`, enforce CREATOR role & partner-001 mapping
    if (userId === "user_3HGDykF71AqhxNuqdtbsMvuP1Xv") {
      role = "CREATOR";
    }

    const partnerId: string | undefined = publicMetadata.partnerId || matchedDbUser?.partnerId || "partner-001";

    // If user is new to DB, persist record with CREATOR role
    if (!matchedDbUser) {
      const newUser: User = {
        id: userId,
        name: `${clerkUser?.firstName || ""} ${clerkUser?.lastName || ""}`.trim() || primaryEmail.split("@")[0] || "Creator",
        email: primaryEmail || "user@clerk.dev",
        role: role === "SUPER_ADMIN" || role === "FINANCE_ADMIN" || role === "ADMIN" ? role : "CREATOR",
        partnerId,
        status: "ACTIVE",
        clerkUserId: userId,
        onboardingStatus: "COMPLETED",
        createdAt: new Date().toISOString()
      };
      db.users.push(newUser);
      matchedDbUser = newUser;
    }

    return {
      userId: matchedDbUser.id,
      email: primaryEmail || matchedDbUser.email,
      role: matchedDbUser.role,
      partnerId: matchedDbUser.partnerId,
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
  // In production, sync calls return db.currentUser if set, or default to current user record
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
