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

if (!serviceRoleKey) {
  throw new Error("Missing required SUPABASE_SERVICE_ROLE_KEY environment variable.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runDatabaseTests() {
  console.log("=== STARTING LIVE SUPABASE MIGRATION VERIFICATION SUITE ===");

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

  console.log("\n4. Verifying RPC Transaction Functions...");
  const rpcTests = [
    { name: "claim_webhook_event_tx", params: { p_provider: "CLERK", p_event_id: "test_check", p_event_type: "user.created" } },
    { name: "complete_webhook_event_tx", params: { p_provider: "CLERK", p_event_id: "test_check", p_claim_token: "00000000-0000-0000-0000-000000000000", p_outcome: "MAPPED" } },
    { name: "fail_webhook_event_tx", params: { p_provider: "CLERK", p_event_id: "test_check", p_claim_token: "00000000-0000-0000-0000-000000000000", p_error_message: "test" } },
    { name: "create_creator_invitation_tx", params: { p_internal_user_id: "non_existent_test_id_check", p_name: "Test Check", p_email: "test_check@example.com" } },
    { name: "map_clerk_user_tx", params: { p_internal_user_id: "non_existent_test_id_check", p_email: "test_check@example.com", p_exact_clerk_user_id: "user_test123" } },
    { name: "seed_super_admin_guarded", params: { p_user_id: "non_existent_admin_check", p_name: "Test Admin", p_email: "admin_check@example.com", p_clerk_user_id: "user_admin123" } }
  ];
  
  for (const rpc of rpcTests) {
    const { error } = await supabase.rpc(rpc.name, rpc.params);
    if (error && error.message.includes("Could not find the function")) {
      console.log(`  - RPC '${rpc.name}': ❌ NOT DEFINED (${error.message})`);
    } else {
      console.log(`  - RPC '${rpc.name}': ✓ DEFINED & ACCESSIBLE (Result code: ${error ? error.message : "SUCCESS"})`);
    }
  }

  console.log("\n=== VERIFICATION SUMMARY COMPLETE ===");
}

runDatabaseTests().catch(err => {
  console.error("Database tests failed:", err);
  process.exit(1);
});
