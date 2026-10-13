/**
 * Standalone utility: set (or reset) a user's password directly in Supabase.
 * NOT imported by application runtime.
 * Run: `npx tsx scripts/set-user-password.ts user@example.com`
 * The password is prompted for with hidden input, so it never lands in shell history or the repo.
 */

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "readline";
import { existsSync, readFileSync } from "fs";
import { hashPassword, validatePasswordStrength } from "../src/lib/auth/password";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

function promptHidden(question: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as any;
    out._writeToOutput = (s: string) => {
      if (s.includes(question)) process.stdout.write(s);
    };
    rl.question(question, answer => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  loadEnvLocal();
  const email = process.argv[2]?.toLowerCase().trim();
  if (!email) {
    console.error("Usage: npx tsx scripts/set-user-password.ts <email>");
    process.exit(1);
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    // Realtime is unused here; Node 20 has no native WebSocket, so give it a no-op transport.
    realtime: { transport: class {} as any }
  });

  const { data: user, error } = await supabase.from("users").select("id, email, role, status").eq("email", email).maybeSingle();
  if (error || !user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }

  const pw = await promptHidden(`New password for ${user.email} (${user.role}, ${user.status}): `);
  const confirm = await promptHidden("Confirm password: ");
  if (pw !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }
  const problem = validatePasswordStrength(pw);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  const { error: updErr } = await supabase
    .from("users")
    .update({
      password_hash: await hashPassword(pw),
      password_updated_at: new Date().toISOString(),
      failed_login_attempts: 0,
      locked_until: null
    })
    .eq("id", user.id);
  if (updErr) {
    console.error("Failed to set password:", updErr.message);
    process.exit(1);
  }

  await supabase.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.id).is("revoked_at", null);
  console.log(`Password set for ${user.email}. Existing sessions revoked.`);
}

main();
