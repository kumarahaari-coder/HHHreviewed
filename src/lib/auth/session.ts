import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "../supabase/admin";

import { SESSION_COOKIE } from "./constants";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null } = {}): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const supabase = createAdminClient();
  const { error } = await supabase.from("auth_sessions").insert({
    user_id: userId,
    token_hash: hashToken(token),
    user_agent: meta.userAgent?.slice(0, 300) || null,
    ip_address: meta.ip || null,
    expires_at: expiresAt.toISOString()
  });
  if (error) throw new Error(`Failed to create session: ${error.message}`);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
}

/** Returns the user id owning a valid (unexpired, unrevoked) session cookie, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("auth_sessions")
    .select("id, user_id, expires_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data.user_id as string;
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await createAdminClient()
        .from("auth_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("token_hash", hashToken(token));
    } catch (err) {
      console.error("[Auth] Failed to revoke session:", err);
    }
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Revoke every session for a user (suspend/archive/password change). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await createAdminClient()
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
}
