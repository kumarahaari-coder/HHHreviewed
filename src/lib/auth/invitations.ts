import { createAdminClient } from "../supabase/admin";
import { createAuthToken } from "./tokens";
import { sendInvitationEmail, sendPasswordResetEmail } from "./email";
import { revokeAllUserSessions } from "./session";

export interface InviteResult {
  success: boolean;
  error?: string;
}

/** Issues a fresh single-use invitation link (older unused ones are invalidated) and emails it. */
export async function sendPartnerInvitation(userId: string, email: string, businessName: string): Promise<InviteResult> {
  try {
    const token = await createAuthToken(userId, "INVITE");
    const res = await sendInvitationEmail(email, businessName, token);
    return res.success ? { success: true } : { success: false, error: res.error || "Failed to send invitation email." };
  } catch (err: unknown) {
    console.error("[Invitations] sendPartnerInvitation failed:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to create invitation." };
  }
}

/** Admin-triggered password reset email for an existing ACTIVE user. */
export async function sendAdminPasswordReset(userId: string, email: string): Promise<InviteResult> {
  try {
    const token = await createAuthToken(userId, "RESET");
    const res = await sendPasswordResetEmail(email, token);
    return res.success ? { success: true } : { success: false, error: res.error || "Failed to send reset email." };
  } catch (err: unknown) {
    console.error("[Invitations] sendAdminPasswordReset failed:", err);
    return { success: false, error: err instanceof Error ? err.message : "Failed to create reset link." };
  }
}

/** Immediately cuts access: kills live sessions and voids unused invite/reset links. */
export async function revokeUserAccess(userId: string): Promise<void> {
  try {
    await revokeAllUserSessions(userId);
    await createAdminClient()
      .from("auth_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("used_at", null);
  } catch (err) {
    console.error("[Invitations] revokeUserAccess failed:", err);
  }
}
