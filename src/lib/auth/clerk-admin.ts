import { createClerkClient } from "@clerk/backend";
import { appConfig } from "../config";

function getClerkBackend() {
  const secretKey = appConfig.clerk.secretKey || process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  return createClerkClient({ secretKey });
}

export interface ClerkInviteResponse {
  success: boolean;
  clerkUserId: string;
  invitationId?: string;
  error?: string;
}

/**
 * Creates an authentic Clerk Invitation for a partner.
 * Returns the actual Clerk ID returned by Clerk API.
 */
export async function createClerkPartnerInvitation(
  email: string,
  partnerId: string,
  role: string = "CREATOR"
): Promise<ClerkInviteResponse> {
  const clerk = getClerkBackend();
  const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://hiddenhoneyhomes.com"}/sign-in`;

  if (!clerk) {
    // In dev mode without Clerk secret key, generate a clerk-scoped ID format
    const mockClerkId = `inv_clerk_${Date.now()}`;
    console.log(`[Clerk Admin Dev] Simulated invitation for ${email}. Clerk ID: ${mockClerkId}`);
    return {
      success: true,
      clerkUserId: mockClerkId,
      invitationId: mockClerkId
    };
  }

  try {
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl,
      publicMetadata: {
        partnerId,
        role
      },
      ignoreExisting: true
    });

    console.log(`[Clerk Admin] Created Clerk Invitation for ${email}. ID: ${invitation.id}`);

    return {
      success: true,
      clerkUserId: invitation.id,
      invitationId: invitation.id
    };
  } catch (err: any) {
    console.error(`[Clerk Admin Invitation Error] Failed to invite ${email}:`, err);
    return {
      success: false,
      clerkUserId: "",
      error: err?.errors?.[0]?.message || err?.message || "Failed to create Clerk invitation."
    };
  }
}

/**
 * Bans user in Clerk to disable login when partner access is suspended.
 */
export async function banClerkUser(clerkUserId: string): Promise<boolean> {
  const clerk = getClerkBackend();
  if (!clerk || !clerkUserId.startsWith("user_")) return true;

  try {
    await clerk.users.banUser(clerkUserId);
    console.log(`[Clerk Admin] Banned user in Clerk: ${clerkUserId}`);
    return true;
  } catch (err: any) {
    console.error(`[Clerk Admin Ban Error] Failed for ${clerkUserId}:`, err?.message);
    return false;
  }
}

/**
 * Unbans user in Clerk to reactivate login when suspended account is reactivated.
 */
export async function unbanClerkUser(clerkUserId: string): Promise<boolean> {
  const clerk = getClerkBackend();
  if (!clerk || !clerkUserId.startsWith("user_")) return true;

  try {
    await clerk.users.unbanUser(clerkUserId);
    console.log(`[Clerk Admin] Unbanned user in Clerk: ${clerkUserId}`);
    return true;
  } catch (err: any) {
    console.error(`[Clerk Admin Unban Error] Failed for ${clerkUserId}:`, err?.message);
    return false;
  }
}

/**
 * Revokes all active Clerk sessions for a user upon archiving or suspension.
 */
export async function revokeClerkUserSessions(clerkUserId: string): Promise<boolean> {
  const clerk = getClerkBackend();
  if (!clerk || !clerkUserId.startsWith("user_")) return true;

  try {
    const sessions = await clerk.sessions.getSessionList({ userId: clerkUserId });
    for (const session of sessions.data) {
      await clerk.sessions.revokeSession(session.id);
    }
    console.log(`[Clerk Admin] Revoked active sessions for user: ${clerkUserId}`);
    return true;
  } catch (err: any) {
    console.error(`[Clerk Admin Revoke Error] Failed for ${clerkUserId}:`, err?.message);
    return false;
  }
}
