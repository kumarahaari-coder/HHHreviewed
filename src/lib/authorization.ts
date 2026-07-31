import { User, UserRole } from "./db/schema";
import { db } from "./db/mockDb";

export interface AuthSession {
  userId: string;
  email: string;
  role: UserRole;
  partnerId?: string;
  clerkUserId?: string;
}

/**
 * Normalizes roles into standard ADMIN vs CREATOR authorization buckets.
 */
export function isAdminRole(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "FINANCE_ADMIN" || role === "ADMIN";
}

export function isCreatorRole(role: UserRole): boolean {
  return role === "PARTNER_OWNER" || role === "CREATOR";
}

/**
 * Server-side check if a user can access a specific creator's tax documents or payout data.
 * - ADMIN can access all creators' data.
 * - CREATOR can ONLY access their own partnerId records.
 */
export function canAccessCreatorData(session: AuthSession, targetPartnerId: string): boolean {
  if (isAdminRole(session.role)) {
    return true;
  }
  if (isCreatorRole(session.role)) {
    return session.partnerId === targetPartnerId;
  }
  return false;
}

/**
 * Checks if a session has permission for administrative review actions.
 */
export function canPerformAdminReview(session: AuthSession): boolean {
  return isAdminRole(session.role);
}

/**
 * Helper to obtain the current session for request context.
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
