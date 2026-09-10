/**
 * Phase 6 Real PostgreSQL Server Acceptance Suite
 * 
 * Runs against a dedicated, genuine PostgreSQL 18.4 server with independent TCP connections.
 * 
 * Verifies:
 * 1. Exact migration execution from beginning to end with 0 errors.
 * 2. Complete schema & catalog inspection (columns, CHECKs, partial indexes, RLS, policies).
 * 3. Database CHECK constraint failures on real PostgreSQL.
 * 4. Partial unique index failures on real PostgreSQL.
 * 5. Two-connection FOR UPDATE row lock concurrency test with genuine independent TCP connections.
 * 6. Batch cancellation and re-batching test.
 * 7. Full 4-operation settlement atomicity failure test (zero partial state survives).
 * 8. Hardened maker-checker MANUAL_ADJUSTMENT workflow test.
 */

import fs from "fs";
import path from "path";
import { Client } from "pg";

// Dynamically require embedded-postgres
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ep = require("embedded-postgres");
const EmbeddedPostgres = ep.default || ep;

const PG_PORT = 54345;
const PG_DATA_DIR = path.resolve("./scratch_pg_real_acceptance");
const DB_URL = `postgresql://postgres:password@localhost:${PG_PORT}/postgres`;

async function main() {
  console.log("================================================================================");
  console.log("PHASE 6: REAL POSTGRESQL SERVER ACCEPTANCE TEST SUITE");
  console.log("================================================================================");

  // Clean up any stale data dir
  if (fs.existsSync(PG_DATA_DIR)) {
    fs.rmSync(PG_DATA_DIR, { recursive: true, force: true });
  }

  const pgServer = new EmbeddedPostgres({
    port: PG_PORT,
    databaseDir: PG_DATA_DIR,
    user: "postgres",
    password: "password",
    initialDatabase: "postgres",
  });

  console.log("\n[1/9] Initializing and launching real PostgreSQL 18 server on port", PG_PORT);
  await pgServer.initialise();
  await pgServer.start();
  console.log("✓ Real PostgreSQL 18 server running successfully!");

  const primaryClient = new Client({ connectionString: DB_URL });
  await primaryClient.connect();

  const verRes = await primaryClient.query("SELECT version();");
  console.log("Connected to:", verRes.rows[0].version);

  try {
    // -------------------------------------------------------------------------
    // Set up prerequisite base tables matching production Supabase
    // -------------------------------------------------------------------------
    console.log("\n[2/9] Creating prerequisite base tables in public schema...");
    await primaryClient.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "citext";

      -- Partners
      CREATE TABLE IF NOT EXISTS public.partners (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        payout_currency TEXT NOT NULL DEFAULT 'USD',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Sites
      CREATE TABLE IF NOT EXISTS public.sites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES public.partners(id),
        name TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'America/New_York',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Commission Rules
      CREATE TABLE IF NOT EXISTS public.commission_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES public.partners(id),
        site_id UUID REFERENCES public.sites(id),
        rule_type TEXT NOT NULL,
        flat_rate NUMERIC(10, 2),
        percentage_rate NUMERIC(5, 2),
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Reservations
      CREATE TABLE IF NOT EXISTS public.reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID NOT NULL REFERENCES public.partners(id),
        site_id UUID REFERENCES public.sites(id),
        source_provider TEXT NOT NULL,
        platform TEXT NOT NULL,
        confirmation_code TEXT NOT NULL,
        ownerrez_booking_id BIGINT,
        total_payout NUMERIC(10, 2) NOT NULL,
        check_in_date TIMESTAMPTZ NOT NULL,
        check_out_date TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Users
      CREATE TABLE IF NOT EXISTS public.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email CITEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'FINANCE_ADMIN', 'ADMIN', 'PARTNER_OWNER', 'CREATOR')),
        partner_id UUID REFERENCES public.partners(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Application Audit Logs
      CREATE TABLE IF NOT EXISTS public.application_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action TEXT NOT NULL,
        target_user_id UUID REFERENCES public.users(id),
        partner_id UUID REFERENCES public.partners(id),
        performed_by_user_id UUID REFERENCES public.users(id),
        source TEXT DEFAULT 'SYSTEM',
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✓ Base tables created.");

    // -------------------------------------------------------------------------
    // Execute Exact Phase 6 DDL Migration
    // -------------------------------------------------------------------------
    console.log("\n[3/9] Applying exact Phase 6 DDL migration: supabase/migrations/20260909_phase6_commission_ledger_and_payouts.sql");
    const migrationSql = fs.readFileSync(
      path.resolve("./supabase/migrations/20260909_phase6_commission_ledger_and_payouts.sql"),
      "utf8"
    );

    await primaryClient.query(migrationSql);
    console.log("✓ Migration executed from beginning to end with 0 errors!");

    // -------------------------------------------------------------------------
    // Catalog / Schema Inspection
    // -------------------------------------------------------------------------
    console.log("\n[4/9] Inspecting PostgreSQL Catalog & Schema Metadata...");

    const tableNames = [
      "commission_ledger_events",
      "payout_batches",
      "payout_items",
      "payout_payment_attempts",
      "commission_adjustment_requests",
    ];

    for (const t of tableNames) {
      const colRes = await primaryClient.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position;`,
        [t]
      );
      console.log(`\n--- TABLE: public.${t} (${colRes.rows.length} columns) ---`);
      for (const col of colRes.rows) {
        console.log(`  • ${col.column_name.padEnd(28)} ${col.data_type.padEnd(16)} nullable=${col.is_nullable} default=${col.column_default || "none"}`);
      }
    }

    console.log("\n--- CHECK CONSTRAINTS ---");
    const chkRes = await primaryClient.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND contype = 'c'
        AND conrelid IN (
          'public.commission_ledger_events'::regclass,
          'public.payout_batches'::regclass,
          'public.payout_items'::regclass,
          'public.payout_payment_attempts'::regclass,
          'public.commission_adjustment_requests'::regclass
        );
    `);
    for (const chk of chkRes.rows) {
      console.log(`  ✓ ${chk.conname.padEnd(38)}: ${chk.definition}`);
    }

    console.log("\n--- UNIQUE CONSTRAINTS & PARTIAL INDEXES ---");
    const idxRes = await primaryClient.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN (
          'commission_ledger_events',
          'payout_batches',
          'payout_items',
          'payout_payment_attempts',
          'commission_adjustment_requests'
        )
      ORDER BY tablename, indexname;
    `);
    for (const idx of idxRes.rows) {
      console.log(`  ✓ ${idx.indexname.padEnd(38)}: ${idx.indexdef}`);
    }

    console.log("\n--- ROW LEVEL SECURITY & POLICIES ---");
    const rlsRes = await primaryClient.query(`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname IN (
          'commission_ledger_events',
          'payout_batches',
          'payout_items',
          'payout_payment_attempts',
          'commission_adjustment_requests'
        );
    `);
    for (const r of rlsRes.rows) {
      console.log(`  ✓ ${r.relname.padEnd(34)} RLS enabled: ${r.relrowsecurity}`);
    }

    const polRes = await primaryClient.query(`
      SELECT tablename, policyname, roles, cmd
      FROM pg_policies
      WHERE schemaname = 'public';
    `);
    for (const p of polRes.rows) {
      console.log(`  ✓ Policy: ${p.policyname} ON ${p.tablename} (${p.cmd})`);
    }

    // Seed test entities
    const seedRes = await primaryClient.query(`
      INSERT INTO public.partners (name, email) VALUES ('Acme Retreats', 'finance@acme.com') RETURNING id;
    `);
    const partnerId = seedRes.rows[0].id;

    const userSeedRes = await primaryClient.query(`
      INSERT INTO public.users (name, email, role) VALUES 
        ('Alice Maker', 'alice@hhh.com', 'FINANCE_ADMIN'),
        ('Bob Checker', 'bob@hhh.com', 'SUPER_ADMIN')
      RETURNING id, role;
    `);
    const aliceMakerId = userSeedRes.rows.find((u: any) => u.role === "FINANCE_ADMIN").id;
    const bobApproverId = userSeedRes.rows.find((u: any) => u.role === "SUPER_ADMIN").id;

    const resSeed = await primaryClient.query(`
      INSERT INTO public.reservations (partner_id, source_provider, platform, confirmation_code, ownerrez_booking_id, total_payout, check_in_date, check_out_date)
      VALUES ($1, 'ownerrez', 'direct', 'CONF-100', 98765432, 1200.00, NOW() - INTERVAL '10 days', NOW() - INTERVAL '5 days')
      RETURNING id;
    `, [partnerId]);
    const reservationId = resSeed.rows[0].id;

    // -------------------------------------------------------------------------
    // CHECK Constraint Failure Tests
    // -------------------------------------------------------------------------
    console.log("\n[5/9] Testing CHECK Constraint Rejections on Real PostgreSQL...");

    // Test 1: MANUAL_ADJUSTMENT with blank reason
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_ledger_events (
          partner_id, reservation_id, source_provider, booking_channel, provider_booking_id,
          event_type, delta_amount, adjustment_reason, created_by, approved_by, idempotency_key
        ) VALUES (
          $1, $2, 'ownerrez', 'direct', 'OR-101',
          'MANUAL_ADJUSTMENT', 50.00, '   ', $3, $4, 'KEY_FAIL_BLANK_REASON'
        );
      `, [partnerId, reservationId, aliceMakerId, bobApproverId]);
      throw new Error("FAILED: MANUAL_ADJUSTMENT with blank reason was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_manual_adjustment_maker_checker")) {
        console.log("  ✓ Correctly rejected MANUAL_ADJUSTMENT with blank reason (chk_manual_adjustment_maker_checker)");
      } else {
        throw e;
      }
    }

    // Test 2: MANUAL_ADJUSTMENT with created_by = approved_by
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_ledger_events (
          partner_id, reservation_id, source_provider, booking_channel, provider_booking_id,
          event_type, delta_amount, adjustment_reason, created_by, approved_by, idempotency_key
        ) VALUES (
          $1, $2, 'ownerrez', 'direct', 'OR-102',
          'MANUAL_ADJUSTMENT', 50.00, 'Legit reason', $3, $3, 'KEY_FAIL_SELF_APPROVE'
        );
      `, [partnerId, reservationId, aliceMakerId]);
      throw new Error("FAILED: MANUAL_ADJUSTMENT with created_by = approved_by was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_manual_adjustment_maker_checker")) {
        console.log("  ✓ Correctly rejected MANUAL_ADJUSTMENT self-approval (chk_manual_adjustment_maker_checker)");
      } else {
        throw e;
      }
    }

    // Test 3: payout_batches with created_by = approved_by
    try {
      await primaryClient.query(`
        INSERT INTO public.payout_batches (
          batch_number, partner_id, payout_rail, total_gross_amount, total_netting_deduction, total_amount,
          status, created_by, approved_by
        ) VALUES (
          'BATCH-FAIL-01', $1, 'MANUAL_ACH', 500.00, 0.00, 500.00,
          'APPROVED', $2, $2
        );
      `, [partnerId, aliceMakerId]);
      throw new Error("FAILED: payout_batches self-approval was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_maker_checker_separation")) {
        console.log("  ✓ Correctly rejected payout_batch self-approval (chk_maker_checker_separation)");
      } else {
        throw e;
      }
    }

    // Test 4: PAYOUT_SETTLEMENT without payout_item_id
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_ledger_events (
          partner_id, reservation_id, source_provider, booking_channel, provider_booking_id,
          event_type, delta_amount, payout_item_id, idempotency_key
        ) VALUES (
          $1, $2, 'ownerrez', 'direct', 'OR-103',
          'PAYOUT_SETTLEMENT', -100.00, NULL, 'KEY_FAIL_NO_ITEM'
        );
      `, [partnerId, reservationId]);
      throw new Error("FAILED: PAYOUT_SETTLEMENT without payout_item_id was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_ledger_payout_item_exclusivity")) {
        console.log("  ✓ Correctly rejected PAYOUT_SETTLEMENT lacking payout_item_id (chk_ledger_payout_item_exclusivity)");
      } else {
        throw e;
      }
    }

    // Test 5: Ledger Immutability Trigger (UPDATE forbidden)
    try {
      await primaryClient.query(`
        UPDATE public.commission_ledger_events SET delta_amount = 9999.00 WHERE id = $1;
      `, [qualifyingEventId || partnerId]);
      throw new Error("FAILED: UPDATE on commission_ledger_events was permitted!");
    } catch (e: any) {
      if (e.message.includes("immutable") || e.message.includes("prohibited")) {
        console.log("  ✓ Correctly rejected UPDATE on commission_ledger_events (trg_prevent_ledger_mutation)");
      } else {
        // In case qualifyingEventId isn't seeded yet, seed and test below
      }
    }

    // Test 6: Payout Batch Arithmetic Invariant Failure
    try {
      await primaryClient.query(`
        INSERT INTO public.payout_batches (
          batch_number, partner_id, payout_rail, total_gross_amount, total_netting_deduction, total_amount,
          status, created_by
        ) VALUES (
          'BATCH-FAIL-ARITHMETIC', $1, 'MANUAL_ACH', 500.00, 50.00, 999.00,
          'DRAFT', $2
        );
      `, [partnerId, aliceMakerId]);
      throw new Error("FAILED: Inconsistent batch arithmetic was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_batch_arithmetic")) {
        console.log("  ✓ Correctly rejected inconsistent batch arithmetic (chk_batch_arithmetic)");
      } else {
        throw e;
      }
    }

    // Test 7: Payout Item Partner Consistency (Item partner_id != Batch partner_id)
    const partner2Res = await primaryClient.query(`
      INSERT INTO public.partners (name, email) VALUES ('Different Partner', 'other@partner.com') RETURNING id;
    `);
    const partner2Id = partner2Res.rows[0].id;

    // -------------------------------------------------------------------------
    // Partial Unique Index Tests
    // -------------------------------------------------------------------------
    console.log("\n[6/9] Testing Partial Unique Index Failures on Real PostgreSQL...");

    // Seed a valid PAYMENT_REALIZED event
    const prRes = await primaryClient.query(`
      INSERT INTO public.commission_ledger_events (
        partner_id, reservation_id, source_provider, booking_channel, provider_booking_id,
        event_type, delta_amount, calculated_commission, idempotency_key
      ) VALUES (
        $1, $2, 'ownerrez', 'direct', 'OR-100',
        'PAYMENT_REALIZED', 150.00, 150.00, 'PAYMENT_REALIZED:TEST:001'
      ) RETURNING id;
    `, [partnerId, reservationId]);
    const qualifyingEventId = prRes.rows[0].id;

    // Verify Ledger Immutability: UPDATE rejected
    try {
      await primaryClient.query("UPDATE public.commission_ledger_events SET delta_amount = 999.00 WHERE id = $1;", [qualifyingEventId]);
      throw new Error("FAILED: UPDATE on commission_ledger_events was permitted!");
    } catch (e: any) {
      if (e.message.includes("immutable") || e.message.includes("prohibited")) {
        console.log("  ✓ Correctly rejected UPDATE on commission_ledger_events (trg_prevent_ledger_mutation)");
      } else {
        throw e;
      }
    }

    // Verify Ledger Immutability: DELETE rejected
    try {
      await primaryClient.query("DELETE FROM public.commission_ledger_events WHERE id = $1;", [qualifyingEventId]);
      throw new Error("FAILED: DELETE on commission_ledger_events was permitted!");
    } catch (e: any) {
      if (e.message.includes("immutable") || e.message.includes("prohibited")) {
        console.log("  ✓ Correctly rejected DELETE on commission_ledger_events (trg_prevent_ledger_mutation)");
      } else {
        throw e;
      }
    }

    // Create Batch A
    const bARes = await primaryClient.query(`
      INSERT INTO public.payout_batches (
        batch_number, partner_id, payout_rail, total_gross_amount, total_netting_deduction, total_amount,
        status, created_by
      ) VALUES (
        'BATCH-PARTIAL-A', $1, 'MANUAL_ACH', 150.00, 0.00, 150.00,
        'DRAFT', $2
      ) RETURNING id;
    `, [partnerId, aliceMakerId]);
    const batchAId = bARes.rows[0].id;

    // Insert Item 1 in PENDING status
    const itemARes = await primaryClient.query(`
      INSERT INTO public.payout_items (
        payout_batch_id, qualifying_ledger_event_id, reservation_id, partner_id,
        gross_amount, netting_deduction, disbursed_amount, status
      ) VALUES (
        $1, $2, $3, $4,
        150.00, 0.00, 150.00, 'PENDING'
      ) RETURNING id;
    `, [batchAId, qualifyingEventId, reservationId, partnerId]);
    const itemAId = itemARes.rows[0].id;

    // Seed a distinct event to test partner consistency foreign key
    const pr2Res = await primaryClient.query(`
      INSERT INTO public.commission_ledger_events (
        partner_id, reservation_id, source_provider, booking_channel, provider_booking_id,
        event_type, delta_amount, calculated_commission, idempotency_key
      ) VALUES (
        $1, $2, 'ownerrez', 'direct', 'OR-100',
        'PAYMENT_REALIZED', 75.00, 75.00, 'PAYMENT_REALIZED:TEST:002'
      ) RETURNING id;
    `, [partnerId, reservationId]);
    const qualifyingEvent2Id = pr2Res.rows[0].id;

    // Verify Partner Consistency: Item partner_id != Batch partner_id rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.payout_items (
          payout_batch_id, qualifying_ledger_event_id, reservation_id, partner_id,
          gross_amount, netting_deduction, disbursed_amount, status
        ) VALUES (
          $1, $2, $3, $4,
          75.00, 0.00, 75.00, 'PENDING'
        );
      `, [batchAId, qualifyingEvent2Id, reservationId, partner2Id]);
      throw new Error("FAILED: Item with mismatched partner_id was accepted in batch!");
    } catch (e: any) {
      if (e.message.includes("fk_payout_items_batch_partner")) {
        console.log("  ✓ Correctly rejected item with mismatched partner_id (fk_payout_items_batch_partner)");
      } else {
        throw e;
      }
    }

    // Create Batch B and attempt duplicate PENDING item for SAME qualifying event
    const bBRes = await primaryClient.query(`
      INSERT INTO public.payout_batches (
        batch_number, partner_id, payout_rail, total_gross_amount, total_netting_deduction, total_amount,
        status, created_by
      ) VALUES (
        'BATCH-PARTIAL-B', $1, 'MANUAL_ACH', 150.00, 0.00, 150.00,
        'DRAFT', $2
      ) RETURNING id;
    `, [partnerId, aliceMakerId]);
    const batchBId = bBRes.rows[0].id;

    try {
      await primaryClient.query(`
        INSERT INTO public.payout_items (
          payout_batch_id, qualifying_ledger_event_id, reservation_id, partner_id,
          gross_amount, netting_deduction, disbursed_amount, status
        ) VALUES (
          $1, $2, $3, $4,
          150.00, 0.00, 150.00, 'PENDING'
        );
      `, [batchBId, qualifyingEventId, reservationId, partnerId]);
      throw new Error("FAILED: Duplicate active payout item was allowed!");
    } catch (e: any) {
      if (e.message.includes("uq_active_payout_item_ledger_event")) {
        console.log("  ✓ Correctly rejected duplicate active payout item on same event (uq_active_payout_item_ledger_event)");
      } else {
        throw e;
      }
    }

    // -------------------------------------------------------------------------
    // Two-Connection FOR UPDATE Concurrency Test
    // -------------------------------------------------------------------------
    console.log("\n[7/9] Running Two-Connection FOR UPDATE Concurrency Test (Genuine Server TCP)...");

    const client1 = new Client({ connectionString: DB_URL });
    const client2 = new Client({ connectionString: DB_URL });
    await client1.connect();
    await client2.connect();

    // Verify both connections have distinct backend PIDs
    const pid1Res = await client1.query("SELECT pg_backend_pid();");
    const pid2Res = await client2.query("SELECT pg_backend_pid();");
    const pid1 = pid1Res.rows[0].pg_backend_pid;
    const pid2 = pid2Res.rows[0].pg_backend_pid;
    console.log(`  • Connection 1 Server PID: ${pid1}`);
    console.log(`  • Connection 2 Server PID: ${pid2}`);
    if (pid1 === pid2) {
      throw new Error("Connections are not independent!");
    }
    console.log("  ✓ Verified two genuinely independent server PostgreSQL backend processes.");

    // client1 locks batchAId FOR UPDATE
    await client1.query("BEGIN;");
    await client1.query("SELECT * FROM public.payout_batches WHERE id = $1 FOR UPDATE;", [batchAId]);
    console.log("  • Connection 1 acquired exclusive FOR UPDATE row lock on batch", batchAId);

    // client2 attempts to lock the SAME row with NOWAIT -> must fail with SQLState 55P03
    await client2.query("BEGIN;");
    let lockConflictCaught = false;
    try {
      await client2.query("SELECT * FROM public.payout_batches WHERE id = $1 FOR UPDATE NOWAIT;", [batchAId]);
    } catch (e: any) {
      if (e.code === "55P03" || e.message.includes("could not obtain lock on row")) {
        lockConflictCaught = true;
        console.log(`  ✓ Connection 2 was immediately rejected with SQLState 55P03: "${e.message}"`);
      } else {
        throw e;
      }
    }
    await client2.query("ROLLBACK;");

    if (!lockConflictCaught) {
      throw new Error("FAILED: Connection 2 was not blocked by Connection 1 FOR UPDATE lock!");
    }

    // Release lock on client1
    await client1.query("COMMIT;");
    console.log("  • Connection 1 committed and released lock.");

    // client2 now acquires the lock without conflict
    await client2.query("BEGIN;");
    const c2LockRes = await client2.query("SELECT id, status FROM public.payout_batches WHERE id = $1 FOR UPDATE NOWAIT;", [batchAId]);
    console.log(`  ✓ Connection 2 successfully acquired row lock after release (status: ${c2LockRes.rows[0].status})`);
    await client2.query("COMMIT;");

    await client1.end();
    await client2.end();

    // -------------------------------------------------------------------------
    // Batch Cancellation and Re-Batching Test
    // -------------------------------------------------------------------------
    console.log("\n[8/9] Testing Batch Cancellation and Re-Batching (Partial Unique Index)...");

    // Cancel Batch A and its item A
    await primaryClient.query("UPDATE public.payout_batches SET status = 'CANCELLED' WHERE id = $1;", [batchAId]);
    await primaryClient.query("UPDATE public.payout_items SET status = 'CANCELLED' WHERE id = $1;", [itemAId]);
    console.log("  • Cancelled Batch A and released payout item A to CANCELLED status.");

    // Now Batch B can successfully claim qualifyingEventId because item A is CANCELLED!
    const rebatchItem = await primaryClient.query(`
      INSERT INTO public.payout_items (
        payout_batch_id, qualifying_ledger_event_id, reservation_id, partner_id,
        gross_amount, netting_deduction, disbursed_amount, status
      ) VALUES (
        $1, $2, $3, $4,
        150.00, 0.00, 150.00, 'PENDING'
      ) RETURNING id;
    `, [batchBId, qualifyingEventId, reservationId, partnerId]);
    console.log(`  ✓ Re-batching succeeded! Created new item ${rebatchItem.rows[0].id} in Batch B.`);

    // -------------------------------------------------------------------------
    // Full Settlement Atomicity Failure Test (All 4 Operations)
    // -------------------------------------------------------------------------
    console.log("\n[9/9] Running Full 4-Operation Settlement Atomicity Failure Test...");
    const activeItemId = rebatchItem.rows[0].id;

    // First approve Batch B
    await primaryClient.query(`
      UPDATE public.payout_batches SET status = 'APPROVED', approved_by = $1, approved_at = NOW() WHERE id = $2;
    `, [bobApproverId, batchBId]);

    // Transaction with all four operations + forced exception before commit
    console.log("  • Executing settlement transaction with simulated failure before commit...");
    let rollbackVerified = false;

    try {
      await primaryClient.query("BEGIN;");

      // 1. payout_items.status -> SETTLED
      await primaryClient.query(`
        UPDATE public.payout_items SET status = 'SETTLED', updated_at = NOW() WHERE id = $1;
      `, [activeItemId]);

      // 2. PAYOUT_SETTLEMENT ledger event -> inserted
      await primaryClient.query(`
        INSERT INTO public.commission_ledger_events (
          partner_id, reservation_id, payout_batch_id, payout_item_id,
          source_provider, booking_channel, provider_booking_id,
          event_type, delta_amount, calculated_commission, idempotency_key
        ) VALUES (
          $1, $2, $3, $4,
          'ownerrez', 'direct', 'OR-100',
          'PAYOUT_SETTLEMENT', -150.00, 0.00, 'PAYOUT_SETTLEMENT:ATOMIC_TEST'
        );
      `, [partnerId, reservationId, batchBId, activeItemId]);

      // 3. payout_batches.status -> SETTLED
      await primaryClient.query(`
        UPDATE public.payout_batches SET status = 'SETTLED', updated_at = NOW() WHERE id = $1;
      `, [batchBId]);

      // 4. application_audit_logs -> inserted
      await primaryClient.query(`
        INSERT INTO public.application_audit_logs (
          action, partner_id, performed_by_user_id, source, details
        ) VALUES (
          'SETTLE_PAYOUT_BATCH', $1, $2, 'admin_portal',
          '{"batchNumber": "BATCH-PARTIAL-B", "amount": 150.00}'::jsonb
        );
      `, [partnerId, bobApproverId]);

      // INJECT FAILURE AFTER OPERATION 4 BEFORE COMMIT
      throw new Error("SIMULATED_NETWORK_FAULT_BEFORE_COMMIT");
    } catch (e: any) {
      if (e.message === "SIMULATED_NETWORK_FAULT_BEFORE_COMMIT") {
        await primaryClient.query("ROLLBACK;");
        rollbackVerified = true;
        console.log("  • Exception caught: rolled back complete transaction.");
      } else {
        await primaryClient.query("ROLLBACK;");
        throw e;
      }
    }

    if (!rollbackVerified) {
      throw new Error("Settlement fault was not triggered!");
    }

    // Inspect database after rollback
    const postItemRes = await primaryClient.query("SELECT status FROM public.payout_items WHERE id = $1;", [activeItemId]);
    const postBatchRes = await primaryClient.query("SELECT status FROM public.payout_batches WHERE id = $1;", [batchBId]);
    const postLedgerRes = await primaryClient.query("SELECT COUNT(*) FROM public.commission_ledger_events WHERE event_type = 'PAYOUT_SETTLEMENT';");
    const postAuditRes = await primaryClient.query("SELECT COUNT(*) FROM public.application_audit_logs WHERE action = 'SETTLE_PAYOUT_BATCH';");

    const finalItemStatus = postItemRes.rows[0].status;
    const finalBatchStatus = postBatchRes.rows[0].status;
    const finalLedgerCount = parseInt(postLedgerRes.rows[0].count, 10);
    const finalAuditCount = parseInt(postAuditRes.rows[0].count, 10);

    console.log(`  • Post-rollback payout_item status: '${finalItemStatus}' (Expected: 'PENDING')`);
    console.log(`  • Post-rollback payout_batch status: '${finalBatchStatus}' (Expected: 'APPROVED')`);
    console.log(`  • Post-rollback PAYOUT_SETTLEMENT count: ${finalLedgerCount} (Expected: 0)`);
    console.log(`  • Post-rollback settlement audit log count: ${finalAuditCount} (Expected: 0)`);

    if (finalItemStatus !== "PENDING") throw new Error(`payout_item status survived rollback: ${finalItemStatus}`);
    if (finalBatchStatus !== "APPROVED") throw new Error(`payout_batch status survived rollback: ${finalBatchStatus}`);
    if (finalLedgerCount !== 0) throw new Error(`PAYOUT_SETTLEMENT ledger event survived rollback: count=${finalLedgerCount}`);
    if (finalAuditCount !== 0) throw new Error(`Settlement audit log survived rollback: count=${finalAuditCount}`);

    console.log("  ✓ ZERO PARTIAL FINANCIAL STATE SURVIVED ROLLBACK! Atomicity guarantee proven.");

    // -------------------------------------------------------------------------
    // Hardened Maker-Checker MANUAL_ADJUSTMENT Flow Verification
    // -------------------------------------------------------------------------
    console.log("\n[10/10] Verifying Hardened Maker-Checker MANUAL_ADJUSTMENT Flow...");

    // Test 1: Maker attempts self-approval -> DB constraint chk_adjustment_request_maker_checker rejects
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, reason, status, created_by, approved_by
        ) VALUES (
          $1, $2, 45.00, 'Self approval attempt', 'APPROVED', $3, $3
        );
      `, [partnerId, reservationId, aliceMakerId]);
      throw new Error("FAILED: Self-approved adjustment request was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_adjustment_request_maker_checker")) {
        console.log("  ✓ Test 1: Maker self-approval rejected by chk_adjustment_request_maker_checker");
      } else {
        throw e;
      }
    }

    // Test 2: FINANCE_ADMIN creates request -> allowed with status PENDING_APPROVAL
    const reqRes = await primaryClient.query(`
      INSERT INTO public.commission_adjustment_requests (
        partner_id, reservation_id, delta_amount, reason, status, created_by, approved_by
      ) VALUES (
        $1, $2, 75.00, 'Marketing fee correction', 'PENDING_APPROVAL', $3, NULL
      ) RETURNING id, status;
    `, [partnerId, reservationId, aliceMakerId]);
    const adjReqId = reqRes.rows[0].id;
    console.log(`  ✓ Test 2 & 3: FINANCE_ADMIN created adjustment request ${adjReqId} (status: PENDING_APPROVAL, approved_by: null)`);

    // Test 4: Same FINANCE_ADMIN tries to approve -> rejected
    try {
      await primaryClient.query(`
        UPDATE public.commission_adjustment_requests
        SET status = 'APPROVED', approved_by = $1, approved_at = NOW()
        WHERE id = $2;
      `, [aliceMakerId, adjReqId]);
      throw new Error("FAILED: Same user was allowed to approve adjustment request!");
    } catch (e: any) {
      if (e.message.includes("chk_adjustment_request_maker_checker")) {
        console.log("  ✓ Test 4: Same FINANCE_ADMIN approving own request rejected by constraint");
      } else {
        throw e;
      }
    }

    // Test 5: Distinct SUPER_ADMIN approves -> ledger event created exactly once
    await primaryClient.query("BEGIN;");
    const adjLedgerRes = await primaryClient.query(`
      INSERT INTO public.commission_ledger_events (
        partner_id, reservation_id, source_provider, booking_channel, provider_booking_id,
        event_type, delta_amount, adjustment_reason, created_by, approved_by, idempotency_key
      ) VALUES (
        $1, $2, 'ownerrez', 'direct', 'OR-100',
        'MANUAL_ADJUSTMENT', 75.00, 'Marketing fee correction', $3, $4, $5
      ) RETURNING id;
    `, [partnerId, reservationId, aliceMakerId, bobApproverId, `MANUAL_ADJUSTMENT:REQ:${adjReqId}`]);
    const adjLedgerEventId = adjLedgerRes.rows[0].id;

    await primaryClient.query(`
      UPDATE public.commission_adjustment_requests
      SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), ledger_event_id = $2
      WHERE id = $3;
    `, [bobApproverId, adjLedgerEventId, adjReqId]);

    await primaryClient.query(`
      INSERT INTO public.application_audit_logs (
        action, target_user_id, partner_id, performed_by_user_id, source, details
      ) VALUES (
        'APPROVE_MANUAL_ADJUSTMENT', $1, $2, $3, 'admin_portal',
        '{"requestId": "${adjReqId}", "ledgerEventId": "${adjLedgerEventId}", "maker": "${aliceMakerId}", "approver": "${bobApproverId}"}'::jsonb
      );
    `, [aliceMakerId, partnerId, bobApproverId]);
    await primaryClient.query("COMMIT;");
    console.log(`  ✓ Test 5: Distinct SUPER_ADMIN approved request: ledger event ${adjLedgerEventId} created, audit log recorded.`);

    // Test 6: Repeat approval -> zero duplicate ledger events (prevented by partial unique index uq_request_ledger_event)
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, reason, status, created_by, approved_by, ledger_event_id
        ) VALUES (
          $1, $2, 75.00, 'Duplicate ledger attempt', 'APPROVED', $3, $4, $5
        );
      `, [partnerId, reservationId, aliceMakerId, bobApproverId, adjLedgerEventId]);
      throw new Error("FAILED: Repeat approval was able to link to existing ledger event!");
    } catch (e: any) {
      if (e.message.includes("uq_request_ledger_event")) {
        console.log("  ✓ Test 6: Repeat approval prevented by unique index uq_request_ledger_event (zero duplicate ledger events)");
      } else {
        throw e;
      }
    }

    console.log("\n================================================================================");
    console.log("ALL REAL SERVER POSTGRESQL ACCEPTANCE TESTS PASSED WITH 100% SUCCESS!");
    console.log("================================================================================");
  } finally {
    await primaryClient.end();
    console.log("\nStopping real PostgreSQL server...");
    await pgServer.stop();
    if (fs.existsSync(PG_DATA_DIR)) {
      fs.rmSync(PG_DATA_DIR, { recursive: true, force: true });
    }
    console.log("PostgreSQL server cleanly shut down and temporary data removed.");
  }
}

main().catch((err) => {
  console.error("\n[FATAL ACCEPTANCE TEST FAILURE]:", err);
  process.exit(1);
});
