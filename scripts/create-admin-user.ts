/**
 * Standalone utility: create an admin user directly in Supabase (e.g. the second approver for payout maker-checker).
 * NOT imported by application runtime.
 * Run: `npx tsx scripts/create-admin-user.ts admin2@example.com "Finance Admin" SUPER_ADMIN`
 * Role is one of SUPER_ADMIN | FINANCE_ADMIN | ADMIN (default SUPER_ADMIN). Batch approval needs SUPER_ADMIN.
 * The password is prompted for with hidden input, so it never lands in shell history or the repo.
 */

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "readline";
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { hashPassword, validatePasswordStrength } from "../src/lib/auth/password";

const ROLES = ["SUPER_ADMIN", "FINANCE_ADMIN", "ADMIN"];

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
  const name = process.argv[3]?.trim();
  const role = (process.argv[4] || "SUPER_ADMIN").toUpperCase();
  if (!email || !name || !ROLES.includes(role)) {
    console.error(`Usage: npx tsx scripts/create-admin-user.ts <email> "<name>" [${ROLES.join("|")}]`);
    process.exit(1);
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    realtime: { transport: class {} as any }
  });

  const { data: existing } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
  if (existing) {
    console.error(`A user with ${email} already exists (${existing.id}). Use scripts/set-user-password.ts to reset its password.`);
    process.exit(1);
  }

  const pw = await promptHidden(`Password for ${email}: `);
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

  const { error } = await supabase.from("users").insert({
    id: `user-admin-${randomUUID().slice(0, 8)}`,
    name,
    email,
    role,
    status: "ACTIVE",
    onboarding_status: "COMPLETED",
    password_hash: await hashPassword(pw),
    password_updated_at: new Date().toISOString()
  });
  if (error) {
    console.error("Failed to create admin:", error.message);
    process.exit(1);
  }
  console.log(`Created ${role} ${email}. Sign in at /login.`);
}

main();
