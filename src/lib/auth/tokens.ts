import { createAdminClient } from "../supabase/admin";
import { generateToken, hashToken } from "./session";

export type AuthTokenType = "INVITE" | "RESET" | "HANDOFF";

export const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  INVITE: 7 * 24 * 60 * 60 * 1000,
  RESET: 60 * 60 * 1000,
  HANDOFF: 60 * 1000
};

/** Creates a one-time token (previous unused tokens of the same type are invalidated). Returns the raw token. */
export async function createAuthToken(userId: string, type: AuthTokenType): Promise<string> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  await supabase.from("auth_tokens").update({ used_at: now }).eq("user_id", userId).eq("token_type", type).is("used_at", null);

  const raw = generateToken();
  const { error } = await supabase.from("auth_tokens").insert({
    user_id: userId,
    token_hash: hashToken(raw),
    token_type: type,
    expires_at: new Date(Date.now() + TOKEN_TTL_MS[type]).toISOString()
  });
  if (error) throw new Error(`Failed to create auth token: ${error.message}`);
  return raw;
}

/** Read-only check (does not consume). Returns the owning user id if the token is valid. */
export async function peekAuthToken(raw: string, type: AuthTokenType): Promise<string | null> {
  if (!raw || raw.length > 200) return null;
  const { data } = await createAdminClient()
    .from("auth_tokens")
    .select("user_id, expires_at, used_at")
    .eq("token_hash", hashToken(raw))
    .eq("token_type", type)
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at).getTime() <= Date.now()) return null;
  return data.user_id as string;
}

/** Atomically consumes the token (single use). Returns the owning user id, or null if invalid/used/expired. */
export async function consumeAuthToken(raw: string, type: AuthTokenType): Promise<string | null> {
  if (!raw || raw.length > 200) return null;
  const now = new Date().toISOString();
  const { data } = await createAdminClient()
    .from("auth_tokens")
    .update({ used_at: now })
    .eq("token_hash", hashToken(raw))
    .eq("token_type", type)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("user_id")
    .maybeSingle();
  return (data?.user_id as string) || null;
}
