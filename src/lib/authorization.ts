import { auth, currentUser } from "@clerk/nextjs/server";
import { User, UserRole } from "./db/schema";
import { db } from "./db/mockDb";
import { findUserByClerkUserId, findUserByEmail, mapClerkUser, activateUserAndPartner } from "./supabase/data-store";

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

    // Step 1: Match strictly by Clerk User ID first
    let matchedDbUser = await findUserByClerkUserId(userId);

    // Step 2: Secure Session Fallback Mapping
    if (!matchedDbUser && primaryEmail) {
      const emailObj = clerkUser?.emailAddresses?.find(
        e => e.emailAddress.toLowerCase().trim() === primaryEmail.toLowerCase().trim()
      );
      // Check if primary email is verified in Clerk session claims
      const isEmailVerified = emailObj ? emailObj.verification?.status === "verified" : true;

      if (isEmailVerified) {
        const potentialUser = await findUserByEmail(primaryEmail);

        // Security Controls:
        // 1. Exactly one application user matches
        // 2. User status is NOT SUSPENDED or ARCHIVED
        // 3. Existing clerk_user_id is NULL or already equals current userId
        // 4. Role & partner scoping exist in Supabase (preserved without modification)
        if (
          potentialUser &&
          potentialUser.status !== "SUSPENDED" &&
          potentialUser.status !== "ARCHIVED" &&
          (!potentialUser.clerkUserId || potentialUser.clerkUserId === userId)
        ) {
          const mappedUser = await mapClerkUser({
            internalUserId: potentialUser.id,
            email: primaryEmail,
            clerkUserId: userId,
            operation: "MAP",
            source: "AUTH_RESOLVER"
          });

          if (mappedUser) {
            await activateUserAndPartner(mappedUser.id, mappedUser.partnerId);
            matchedDbUser = (await findUserByClerkUserId(userId)) || mappedUser;
          }
        }
      }
    }

    // SECURITY CONTROL: If no application user record exists or user is suspended/archived, DENY ACCESS
    if (!matchedDbUser || matchedDbUser.status === "SUSPENDED" || matchedDbUser.status === "ARCHIVED") {
      console.warn(`[Access Denied] Clerk user ${userId} (${primaryEmail}) has no approved active application database record.`);
      return null;
    }

    // Step 3: Lifecycle Activation check for mapped invited user
    if (matchedDbUser.status === "INVITED" || matchedDbUser.onboardingStatus === "MAPPED") {
      await activateUserAndPartner(matchedDbUser.id, matchedDbUser.partnerId);
      matchedDbUser = await findUserByClerkUserId(userId) || matchedDbUser;
    }

    // Role MUST come exclusively from application trusted server-side database record.
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
 * Server session helper, delegates to getClerkAuthSession.
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  return getClerkAuthSession();
}
