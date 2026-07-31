import { createClerkClient } from "@clerk/backend";
import { appConfig } from "../config";

function getClerkBackend() {
  const secretKey = appConfig.clerk.secretKey || process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;
  return createClerkClient({ secretKey });
}

export interface ClerkInviteResult {
  success: boolean;
  invitationId?: string;
  error?: string;
}

/**
 * Creates an authentic Clerk Invitation for a partner.
 * Returns the invitation ID (inv_...) returned by Clerk API.
 * Stores partnerId and applicationUserId in publicMetadata for trusted webhook resolution.
 */
export async function createClerkPartnerInvitation(
  email: string,
  partnerId: string,
  applicationUserId: string,
  role: string = "CREATOR"
): Promise<ClerkInviteResult> {
  const clerk = getClerkBackend();
  const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://hiddenhoneyhomes.com"}/sign-in`;

  if (!clerk) {
    // In dev mode without Clerk secret key, return simulated inv_ ID
    const mockInvId = `inv_${Math.random().toString(36).substring(2, 15)}`;
    console.log(`[Clerk Admin Dev] Simulated invitation for ${email}. Invitation ID: ${mockInvId}`);
    return {
      success: true,
      invitationId: mockInvId
    };
  }

  try {
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl,
      publicMetadata: {
        partnerId,
        applicationUserId,
        role
      },
      ignoreExisting: true
    });

    console.log(`[Clerk Admin] Created Clerk Invitation for ${email}. Invitation ID: ${invitation.id}`);

    return {
      success: true,
      invitationId: invitation.id
    };
  } catch (err: any) {
    console.error(`[Clerk Admin Invitation Error] Failed to invite ${email}:`, err);
    return {
      success: false,
      error: err?.errors?.[0]?.message || err?.message || "Failed to create Clerk invitation."
    };
  }
}

/**
 * Revokes a pending Clerk invitation (inv_...).
 */
export async function revokeClerkInvitation(invitationId: string): Promise<boolean> {
  const clerk = getClerkBackend();
  if (!clerk || !invitationId.startsWith("inv_")) return true;

  try {
    await clerk.invitations.revokeInvitation(invitationId);
    console.log(`[Clerk Admin] Revoked Clerk Invitation: ${invitationId}`);
    return true;
  } catch (err: any) {
    console.error(`[Clerk Admin Revoke Invitation Error] Failed for ${invitationId}:`, err?.message);
    return false;
  }
}

/**
 * Bans user in Clerk to disable login when partner access is suspended or archived.
 * (Note: banUser in Clerk automatically revokes all active sessions natively).
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
