import { createClient } from "@supabase/supabase-js";

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
  const rpcs = [
    "claim_webhook_event_tx",
    "complete_webhook_event_tx",
    "fail_webhook_event_tx",
    "create_creator_invitation_tx",
    "map_clerk_user_tx",
    "seed_super_admin_guarded"
  ];
  
  for (const rpc of rpcs) {
    const { error } = await supabase.rpc(rpc, {});
    if (error && error.message.includes("Could not find the function")) {
      console.log(`  - RPC '${rpc}': ❌ NOT DEFINED`);
    } else {
      console.log(`  - RPC '${rpc}': ✓ DEFINED (Returned expected signature code: ${error ? error.message : "SUCCESS"})`);
    }
  }

  console.log("\n=== VERIFICATION SUMMARY COMPLETE ===");
}

runDatabaseTests().catch(err => {
  console.error("Database tests failed:", err);
  process.exit(1);
});
