import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

try {
  const envConfig = fs.readFileSync(path.resolve(".env.local"), "utf8");
  for (const line of envConfig.split("\n")) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
} catch (e) {}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nxwxcmnulagcoirzkhvc.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Production Safety Gate: Abort before mutating production datastore
const isNodeProd = process.env.NODE_ENV === "production";
const isVercelProd = process.env.VERCEL_ENV === "production";
const isProductionDatabase = supabaseUrl.includes("nxwxcmnulagcoirzkhvc");

if (isNodeProd || isVercelProd || isProductionDatabase) {
  console.error("FATAL SAFETY GATE: Synthetic test script execution is blocked against production environment / database.");
  process.exit(1);
}

if (!serviceRoleKey) {
  throw new Error("Missing required SUPABASE_SERVICE_ROLE_KEY environment variable.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runDatabaseTests() {
  console.log("=== STARTING STAGING SUPABASE MIGRATION VERIFICATION SUITE ===");

  console.log("\n1. Testing Base Database Connectivity...");
  const { data: partnerData, error: partnerErr } = await supabase.from("partners").select("id").limit(1);
  if (partnerErr) {
    console.error("❌ Connection failed:", partnerErr.message);
    process.exit(1);
  }
  console.log("✓ Connection to Supabase PostgreSQL successful.");

  console.log("\n2. Verifying schema_migrations Version Entry...");
  const { data: migrationRow, error: migrationErr } = await supabase
    .from("schema_migrations")
    .select("version, applied_at")
    .eq("version", "20260731_hhh_final_production_migration")
    .maybeSingle();

  if (migrationErr) {
    console.log(`❌ schema_migrations table error: ${migrationErr.message}`);
  } else if (migrationRow) {
    console.log(`✓ Migration Applied: ${migrationRow.version} (Applied at: ${migrationRow.applied_at})`);
  } else {
    console.log("⚠️ Version record 20260731_hhh_final_production_migration NOT FOUND (Migration pending).");
  }

  console.log("\n3. Verifying System Tables Existence...");
  const tables = [
    "users",
    "creator_tax_documents",
    "tax_document_versions",
    "application_audit_logs",
    "tax_document_audit_logs",
    "idempotency_logs",
    "schema_migrations"
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).select("*").limit(0);
    if (error) {
      console.log(`  - Table '${table}': ❌ NOT CREATED (${error.message})`);
    } else {
      console.log(`  - Table '${table}': ✓ CREATED & ACCESSIBLE`);
    }
  }

  console.log("\n=== VERIFICATION SUMMARY COMPLETE ===");
}

runDatabaseTests().catch(err => {
  console.error("Database tests failed:", err);
  process.exit(1);
});
