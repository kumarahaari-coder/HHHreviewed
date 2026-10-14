/**
 * Standalone utility: create or update the Hostaway unified webhook that feeds
 * reservations into this app (POST /api/webhooks/hostaway).
 * NOT imported by application runtime.
 *
 * Usage:
 *   npx tsx scripts/setup-hostaway-webhook.ts --url https://your-app.vercel.app            # dry run (default)
 *   npx tsx scripts/setup-hostaway-webhook.ts --url https://your-app.vercel.app --apply    # create / update + enable
 *   npx tsx scripts/setup-hostaway-webhook.ts --url https://your-app.vercel.app --apply --disable
 *
 * Reads HOSTAWAY_ACCOUNT_ID / HOSTAWAY_API_KEY and HOSTAWAY_WEBHOOK_USERNAME / HOSTAWAY_WEBHOOK_PASSWORD
 * from .env.local. Hostaway sends the login/password as HTTP Basic auth, which is what
 * verifyHostawayWebhookRequest checks, so these MUST match the values set in the deployed environment.
 * Matches an existing webhook by URL, so it is safe to re-run.
 */

import { existsSync, readFileSync } from "fs";
import { hostawayRequest } from "../src/lib/hostaway/client";

const EVENTS = ["reservation.created", "reservation.updated"];

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

interface UnifiedWebhook {
  id: number;
  isEnabled: number;
  url: string;
  login: string | null;
  events: string[];
}

async function main() {
  loadEnvLocal();

  const baseUrl = argValue("--url")?.replace(/\/+$/, "");
  const apply = process.argv.includes("--apply");
  const enable = !process.argv.includes("--disable");

  if (!baseUrl || !/^https:\/\//.test(baseUrl)) {
    console.error("Usage: npx tsx scripts/setup-hostaway-webhook.ts --url https://<deployed-app-host> [--apply] [--disable]");
    console.error("Hostaway can only call a public HTTPS URL (localhost will not work).");
    process.exit(1);
  }

  const login = process.env.HOSTAWAY_WEBHOOK_USERNAME?.trim();
  const password = process.env.HOSTAWAY_WEBHOOK_PASSWORD?.trim();
  if (!login || !password) {
    console.error("HOSTAWAY_WEBHOOK_USERNAME and HOSTAWAY_WEBHOOK_PASSWORD must be set in .env.local (and in the deployed environment).");
    process.exit(1);
  }

  const targetUrl = `${baseUrl}/api/webhooks/hostaway`;
  const list = await hostawayRequest<{ result: UnifiedWebhook[] }>("/webhooks/unifiedWebhooks");
  const existing = (list.result || []).find(w => w.url === targetUrl);

  const body = {
    isEnabled: enable ? 1 : 0,
    url: targetUrl,
    login,
    password,
    events: EVENTS,
  };

  console.log(existing
    ? `Found existing webhook #${existing.id} (enabled=${existing.isEnabled}, login=${existing.login ? "set" : "none"}) -> will UPDATE`
    : "No webhook for this URL yet -> will CREATE");
  console.log(`Target: ${targetUrl}\nEvents: ${EVENTS.join(", ")}\nEnabled: ${enable}`);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to make the change.");
    return;
  }

  const res = await hostawayRequest<{ result: UnifiedWebhook }>(
    existing ? `/webhooks/unifiedWebhooks/${existing.id}` : "/webhooks/unifiedWebhooks",
    {
      method: existing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const w = res.result;
  console.log(`\nDone: webhook #${w?.id} enabled=${w?.isEnabled} events=${(w?.events || []).join(", ")}`);
  console.log("Next: create a test booking in Hostaway and confirm it appears under Admin -> Bookings.");
}

main().catch(err => {
  console.error("Failed:", err.message);
  process.exit(1);
});
