/**
 * Standalone utility: manage the Wise webhook subscription that settles payout batches
 * automatically (POST /api/webhooks/wise). NOT imported by application runtime.
 *
 * Usage:
 *   npx tsx scripts/setup-wise-webhook.ts list
 *   npx tsx scripts/setup-wise-webhook.ts create --url https://<public-host>/api/webhooks/wise [--version 2.0.0]
 *   npx tsx scripts/setup-wise-webhook.ts delete --id <subscriptionId>
 *   npx tsx scripts/setup-wise-webhook.ts test --id <subscriptionId>
 *
 * Reads WISE_ENV / WISE_BASE_URL / WISE_API_TOKEN / WISE_PROFILE_ID from .env.local, so the subscription is
 * created in whichever environment the token belongs to. Wise needs a public HTTPS URL with a domain name
 * (use a tunnel such as ngrok or cloudflared for local testing).
 */

import { existsSync, readFileSync } from "fs";

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function call(method: string, path: string, body?: unknown) {
  const base =
    process.env.WISE_BASE_URL?.trim() ||
    (process.env.WISE_ENV === "production" ? "https://api.wise.com" : "https://api.wise-sandbox.com");
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.WISE_API_TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    console.error(`Wise API ${res.status}:`, typeof json === "string" ? json : JSON.stringify(json));
    process.exit(1);
  }
  return json;
}

async function main() {
  loadEnvLocal();
  const profileId = process.env.WISE_PROFILE_ID?.trim();
  if (!process.env.WISE_API_TOKEN || !profileId) {
    console.error("WISE_API_TOKEN and WISE_PROFILE_ID must be set in .env.local.");
    process.exit(1);
  }
  console.log(`Environment: ${process.env.WISE_ENV === "production" ? "PRODUCTION" : "sandbox"}, profile ${profileId}`);

  const cmd = process.argv[2];
  if (cmd === "list") {
    const subs = await call("GET", `/v3/profiles/${profileId}/subscriptions`);
    console.log(JSON.stringify(subs, null, 2));
  } else if (cmd === "create") {
    const url = arg("--url");
    if (!url || !/^https:\/\/[^/]+\.[^/]+\//.test(url) || /\?/.test(url)) {
      console.error("--url must be a public https URL with a domain name, a path, and no query string.");
      process.exit(1);
    }
    const sub = await call("POST", `/v3/profiles/${profileId}/subscriptions`, {
      name: "HHH payout transfer state",
      trigger_on: "transfers#state-change",
      delivery: { version: arg("--version") || "2.0.0", url },
    });
    console.log("Created subscription:", JSON.stringify(sub, null, 2));
    console.log("\nNext: put Wise's public key for this environment in WISE_WEBHOOK_PUBLIC_KEY, then run `test`.");
  } else if (cmd === "delete") {
    const id = arg("--id");
    if (!id) return console.error("--id required"), process.exit(1);
    await call("DELETE", `/v3/profiles/${profileId}/subscriptions/${id}`);
    console.log("Deleted", id);
  } else if (cmd === "test") {
    const id = arg("--id");
    if (!id) return console.error("--id required"), process.exit(1);
    const r = await call("POST", `/v3/profiles/${profileId}/subscriptions/${id}/test-notifications`);
    console.log("Test notification sent:", JSON.stringify(r));
  } else {
    console.error("Commands: list | create --url <url> | delete --id <id> | test --id <id>");
    process.exit(1);
  }
}

main();
