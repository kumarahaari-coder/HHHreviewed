import fs from "fs";
import path from "path";
import { Client } from "pg";

// Load env files
for (const envFile of [".env.production.local", ".env.local", ".env"]) {
  try {
    const p = path.resolve(envFile);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match && !process.env[match[1].trim()]) {
          process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch (e) {}
}

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;

async function applyMigration() {
  if (!dbUrl) {
    console.error("❌ No DATABASE_URL, POSTGRES_URL, or SUPABASE_DB_URL found in environment.");
    process.exit(1);
  }

  console.log("Connecting to PostgreSQL...");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log("✓ Connected to PostgreSQL successfully.");

  const migrationPath = path.resolve("supabase/migrations/20260909_phase6_commission_ledger_and_payouts.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");

  console.log("Applying Phase 6 migration (20260909_phase6_commission_ledger_and_payouts.sql)...");
  try {
    await client.query(sql);
    console.log("✓ Phase 6 DDL Migration executed successfully on live Supabase!");
  } catch (err: any) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration().catch((err) => {
  console.error("Execution error:", err);
  process.exit(1);
});
