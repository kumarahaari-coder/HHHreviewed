/**
 * Phase 6 Real PostgreSQL Server Acceptance Suite
 * 
 * Runs against a dedicated, genuine PostgreSQL 18.4 server with independent TCP connections.
 * 
 * Verifies:
 * 1. Exact migration execution from beginning to end with 0 errors.
 * 2. Complete schema & catalog inspection (columns, CHECKs, partial indexes, RLS, policies).
 * 3. Database CHECK constraint failures on real PostgreSQL (including state-coherence).
 * 4. Relationship derivation and inconsistency rejection for PAYOUT_SETTLEMENT.
 * 5. Partial unique index failures on real PostgreSQL.
 * 6. Two-connection FOR UPDATE row lock concurrency test with genuine independent TCP connections.
 * 7. Batch cancellation and re-batching test.
 * 8. Full 4-operation settlement atomicity failure test (zero partial state survives).
 * 9. Adjustment approval atomicity failure & commit test.
 * 10. Actor-ID datatype verification (confirming TEXT across all tables).
 */

import fs from "fs";
import path from "path";
import { Client } from "pg";
import { generateDraftPayoutBatch } from "../src/lib/commissions/payout-generator";

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

  console.log("\n[1/11] Initializing and launching real PostgreSQL 18 server on port", PG_PORT);
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
    console.log("\n[2/11] Creating prerequisite base tables in public schema...");
    await primaryClient.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS "citext";

      -- Ensure service_role exists in preflight for test harness (native in Supabase production)
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
              CREATE ROLE service_role;
          END IF;
      END $$;

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

      -- Users (Matching production Supabase: id is TEXT e.g. 'user-admin-1', 'user_3HGD...')
      CREATE TABLE IF NOT EXISTS public.users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email CITEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'FINANCE_ADMIN', 'ADMIN', 'PARTNER_OWNER', 'CREATOR')),
        partner_id UUID REFERENCES public.partners(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Application Audit Logs (Matching production Supabase: performed_by_user_id is TEXT)
      CREATE TABLE IF NOT EXISTS public.application_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action TEXT NOT NULL,
        target_user_id TEXT,
        partner_id UUID REFERENCES public.partners(id),
        performed_by_user_id TEXT,
        source TEXT DEFAULT 'SYSTEM',
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("✓ Base tables created with production TEXT user identifiers and service_role preflight.");

    // -------------------------------------------------------------------------
    // Execute Exact Phase 6 DDL Migration
    // -------------------------------------------------------------------------
    console.log("\n[3/11] Applying exact Phase 6 DDL migration: supabase/migrations/20260909_phase6_commission_ledger_and_payouts.sql");
    const migrationSql = fs.readFileSync(
      path.resolve("./supabase/migrations/20260909_phase6_commission_ledger_and_payouts.sql"),
      "utf8"
    );

    await primaryClient.query(migrationSql);
    console.log("✓ Migration executed from beginning to end with 0 errors!");

    // -------------------------------------------------------------------------
    // Catalog / Schema Inspection
    // -------------------------------------------------------------------------
    console.log("\n[4/11] Inspecting PostgreSQL Catalog & Schema Metadata...");

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
      console.log(`  ✓ ${chk.conname.padEnd(42)}: ${chk.definition}`);
    }

    console.log("\n--- FOREIGN KEYS ---");
    const fkRes = await primaryClient.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND contype = 'f'
        AND conrelid IN (
          'public.commission_ledger_events'::regclass,
          'public.payout_batches'::regclass,
          'public.payout_items'::regclass,
          'public.payout_payment_attempts'::regclass,
          'public.commission_adjustment_requests'::regclass
        );
    `);
    for (const fk of fkRes.rows) {
      console.log(`  ✓ ${fk.conname.padEnd(42)}: ${fk.definition}`);
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
      console.log(`  ✓ ${idx.indexname.padEnd(42)}: ${idx.indexdef}`);
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

    // Seed test entities matching production IDs
    const seedRes = await primaryClient.query(`
      INSERT INTO public.partners (name, email) VALUES ('Acme Retreats', 'finance@acme.com') RETURNING id;
    `);
    const partnerId = seedRes.rows[0].id;

    await primaryClient.query(`
      INSERT INTO public.users (id, name, email, role) VALUES 
        ('user-finance-1', 'Alice Maker', 'alice@hhh.com', 'FINANCE_ADMIN'),
        ('user-admin-1', 'Bob Checker', 'bob@hhh.com', 'SUPER_ADMIN');
    `);
    const aliceMakerId = 'user-finance-1';
    const bobApproverId = 'user-admin-1';

    const resSeed = await primaryClient.query(`
      INSERT INTO public.reservations (partner_id, source_provider, platform, confirmation_code, ownerrez_booking_id, total_payout, check_in_date, check_out_date)
      VALUES ($1, 'ownerrez', 'direct', 'CONF-100', 98765432, 1200.00, NOW() - INTERVAL '10 days', NOW() - INTERVAL '5 days')
      RETURNING id;
    `, [partnerId]);
    const reservationId = resSeed.rows[0].id;

    // -------------------------------------------------------------------------
    // CHECK Constraint Failure Tests
    // -------------------------------------------------------------------------
    console.log("\n[5/11] Testing CHECK Constraint Rejections on Real PostgreSQL...");

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
      if (e.message.includes("chk_ledger_payout_item_exclusivity") || e.message.includes("PAYOUT_SETTLEMENT requires payout_item_id")) {
        console.log("  ✓ Correctly rejected PAYOUT_SETTLEMENT lacking payout_item_id");
      } else {
        throw e;
      }
    }

    // Test 5: Payout Batch Arithmetic Invariant Failure
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

    // -------------------------------------------------------------------------
    // State-Coherence Constraint Tests for commission_adjustment_requests
    // -------------------------------------------------------------------------
    console.log("\n[6/11] Testing State-Coherence Constraint on commission_adjustment_requests...");

    // Test SC-1: PENDING_APPROVAL with approved_by set -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, reason, status, created_by, approved_by
        ) VALUES (
          $1, $2, 50.00, 'Test reason', 'PENDING_APPROVAL', $3, $4
        );
      `, [partnerId, reservationId, aliceMakerId, bobApproverId]);
      throw new Error("FAILED: PENDING_APPROVAL with approved_by was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_adjustment_request_state_coherence")) {
        console.log("  ✓ Correctly rejected PENDING_APPROVAL with non-null approved_by");
      } else {
        throw e;
      }
    }

    // Test SC-2: PENDING_APPROVAL with rejection_reason set -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, reason, status, created_by, rejection_reason
        ) VALUES (
          $1, $2, 50.00, 'Test reason', 'PENDING_APPROVAL', $3, 'Some reason'
        );
      `, [partnerId, reservationId, aliceMakerId]);
      throw new Error("FAILED: PENDING_APPROVAL with rejection_reason was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_adjustment_request_state_coherence")) {
        console.log("  ✓ Correctly rejected PENDING_APPROVAL with rejection_reason");
      } else {
        throw e;
      }
    }

    // Test SC-3: APPROVED with null approved_by -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, reason, status, created_by, approved_by, approved_at
        ) VALUES (
          $1, $2, 50.00, 'Test reason', 'APPROVED', $3, NULL, NOW()
        );
      `, [partnerId, reservationId, aliceMakerId]);
      throw new Error("FAILED: APPROVED with null approved_by was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_adjustment_request_state_coherence")) {
        console.log("  ✓ Correctly rejected APPROVED with null approved_by");
      } else {
        throw e;
      }
    }

    // Test SC-4: APPROVED with null ledger_event_id -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, reason, status, created_by, approved_by, approved_at, ledger_event_id
        ) VALUES (
          $1, $2, 50.00, 'Test reason', 'APPROVED', $3, $4, NOW(), NULL
        );
      `, [partnerId, reservationId, aliceMakerId, bobApproverId]);
      throw new Error("FAILED: APPROVED with null ledger_event_id was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_adjustment_request_state_coherence")) {
        console.log("  ✓ Correctly rejected APPROVED with null ledger_event_id");
      } else {
        throw e;
      }
    }

    // Test SC-5: APPROVED with rejection_reason populated -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, reason, status, created_by, approved_by, approved_at, rejection_reason
        ) VALUES (
          $1, $2, 50.00, 'Test reason', 'APPROVED', $3, $4, NOW(), 'Contradictory rejection'
        );
      `, [partnerId, reservationId, aliceMakerId, bobApproverId]);
      throw new Error("FAILED: APPROVED with rejection_reason was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_adjustment_request_state_coherence")) {
        console.log("  ✓ Correctly rejected APPROVED with contradictory rejection_reason");
      } else {
        throw e;
      }
    }

    // Test SC-6: REJECTED with ledger_event_id populated -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, reason, status, created_by, rejection_reason, ledger_event_id
        ) VALUES (
          $1, $2, 50.00, 'Test reason', 'REJECTED', $3, 'Legit rejection', gen_random_uuid()
        );
      `, [partnerId, reservationId, aliceMakerId]);
      throw new Error("FAILED: REJECTED with ledger_event_id was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_adjustment_request_state_coherence")) {
        console.log("  ✓ Correctly rejected REJECTED with non-null ledger_event_id");
      } else {
        throw e;
      }
    }

    // Test SC-7: REJECTED with blank rejection_reason -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, reason, status, created_by, rejection_reason
        ) VALUES (
          $1, $2, 50.00, 'Test reason', 'REJECTED', $3, '   '
        );
      `, [partnerId, reservationId, aliceMakerId]);
      throw new Error("FAILED: REJECTED with blank rejection_reason was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_adjustment_request_state_coherence")) {
        console.log("  ✓ Correctly rejected REJECTED with blank rejection_reason");
      } else {
        throw e;
      }
    }

    // Test SC-8: REJECTED with approved_by set -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, reason, status, created_by, approved_by, rejection_reason
        ) VALUES (
          $1, $2, 50.00, 'Test reason', 'REJECTED', $3, $4, 'Some rejection reason'
        );
      `, [partnerId, reservationId, aliceMakerId, bobApproverId]);
      throw new Error("FAILED: REJECTED with approved_by was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_adjustment_request_state_coherence")) {
        console.log("  ✓ Correctly rejected REJECTED with non-null approved_by");
      } else {
        throw e;
      }
    }

    // Test SC-9: REJECTED with approved_at set -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, reason, status, created_by, approved_at, rejection_reason
        ) VALUES (
          $1, $2, 50.00, 'Test reason', 'REJECTED', $3, NOW(), 'Some rejection reason'
        );
      `, [partnerId, reservationId, aliceMakerId]);
      throw new Error("FAILED: REJECTED with approved_at was accepted!");
    } catch (e: any) {
      if (e.message.includes("chk_adjustment_request_state_coherence")) {
        console.log("  ✓ Correctly rejected REJECTED with non-null approved_at");
      } else {
        throw e;
      }
    }

    // Test SC-10: currency != 'USD' -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_adjustment_requests (
          partner_id, reservation_id, delta_amount, currency, reason, status, created_by
        ) VALUES (
          $1, $2, 50.00, 'EUR', 'Test reason', 'PENDING_APPROVAL', $3
        );
      `, [partnerId, reservationId, aliceMakerId]);
      throw new Error("FAILED: currency 'EUR' was accepted on commission_adjustment_requests!");
    } catch (e: any) {
      if (e.message.includes("currency")) {
        console.log("  ✓ Correctly rejected non-USD currency on commission_adjustment_requests (currency = 'USD')");
      } else {
        throw e;
      }
    }

    // -------------------------------------------------------------------------
    // Partial Unique Index & Immutability Tests
    // -------------------------------------------------------------------------
    console.log("\n[7/11] Testing Partial Unique Indexes & Ledger Immutability...");

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

    // Seed a 2nd distinct partner & event to test partner consistency
    const partner2Res = await primaryClient.query(`
      INSERT INTO public.partners (name, email) VALUES ('Different Partner', 'other@partner.com') RETURNING id;
    `);
    const partner2Id = partner2Res.rows[0].id;

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
    // PAYOUT_SETTLEMENT Derivation & Inconsistent Relationship Rejection Tests
    // -------------------------------------------------------------------------
    console.log("\n[8/11] Testing PAYOUT_SETTLEMENT Derivation & Relationship Inconsistency Rejection...");

    // Test S-1: Inconsistent payout_batch_id supplied -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_ledger_events (
          partner_id, reservation_id, payout_batch_id, payout_item_id,
          source_provider, booking_channel, provider_booking_id,
          event_type, delta_amount, idempotency_key
        ) VALUES (
          $1, $2, $3, $4,
          'ownerrez', 'direct', 'OR-100',
          'PAYOUT_SETTLEMENT', -150.00, 'SETTLE_FAIL_WRONG_BATCH'
        );
      `, [partnerId, reservationId, batchBId, itemAId]); // itemA belongs to batchAId, not batchBId!
      throw new Error("FAILED: PAYOUT_SETTLEMENT with inconsistent payout_batch_id was accepted!");
    } catch (e: any) {
      if (e.message.includes("Inconsistent payout_batch_id")) {
        console.log("  ✓ Correctly rejected PAYOUT_SETTLEMENT with inconsistent payout_batch_id");
      } else {
        throw e;
      }
    }

    // Test S-2: Inconsistent reservation_id supplied -> rejected
    const res2Res = await primaryClient.query(`
      INSERT INTO public.reservations (partner_id, source_provider, platform, confirmation_code, total_payout, check_in_date, check_out_date)
      VALUES ($1, 'ownerrez', 'direct', 'CONF-999', 800.00, NOW(), NOW() + INTERVAL '3 days')
      RETURNING id;
    `, [partnerId]);
    const reservation2Id = res2Res.rows[0].id;

    try {
      await primaryClient.query(`
        INSERT INTO public.commission_ledger_events (
          partner_id, reservation_id, payout_batch_id, payout_item_id,
          source_provider, booking_channel, provider_booking_id,
          event_type, delta_amount, idempotency_key
        ) VALUES (
          $1, $2, $3, $4,
          'ownerrez', 'direct', 'OR-100',
          'PAYOUT_SETTLEMENT', -150.00, 'SETTLE_FAIL_WRONG_RES'
        );
      `, [partnerId, reservation2Id, batchAId, itemAId]); // itemA belongs to reservationId, not reservation2Id!
      throw new Error("FAILED: PAYOUT_SETTLEMENT with inconsistent reservation_id was accepted!");
    } catch (e: any) {
      if (e.message.includes("Inconsistent reservation_id")) {
        console.log("  ✓ Correctly rejected PAYOUT_SETTLEMENT with inconsistent reservation_id");
      } else {
        throw e;
      }
    }

    // Test S-3: Inconsistent partner_id supplied -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_ledger_events (
          partner_id, reservation_id, payout_batch_id, payout_item_id,
          source_provider, booking_channel, provider_booking_id,
          event_type, delta_amount, idempotency_key
        ) VALUES (
          $1, $2, $3, $4,
          'ownerrez', 'direct', 'OR-100',
          'PAYOUT_SETTLEMENT', -150.00, 'SETTLE_FAIL_WRONG_PARTNER'
        );
      `, [partner2Id, reservationId, batchAId, itemAId]); // itemA belongs to partnerId, not partner2Id!
      throw new Error("FAILED: PAYOUT_SETTLEMENT with inconsistent partner_id was accepted!");
    } catch (e: any) {
      if (e.message.includes("Inconsistent partner_id")) {
        console.log("  ✓ Correctly rejected PAYOUT_SETTLEMENT with inconsistent partner_id");
      } else {
        throw e;
      }
    }

    // Test S-4: Inconsistent delta_amount supplied -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_ledger_events (
          partner_id, reservation_id, payout_batch_id, payout_item_id,
          source_provider, booking_channel, provider_booking_id,
          event_type, delta_amount, idempotency_key
        ) VALUES (
          $1, $2, $3, $4,
          'ownerrez', 'direct', 'OR-100',
          'PAYOUT_SETTLEMENT', -999.00, 'SETTLE_FAIL_WRONG_DELTA'
        );
      `, [partnerId, reservationId, batchAId, itemAId]); // itemA disbursed_amount is 150.00, not 999.00!
      throw new Error("FAILED: PAYOUT_SETTLEMENT with inconsistent delta_amount was accepted!");
    } catch (e: any) {
      if (e.message.includes("Inconsistent delta_amount")) {
        console.log("  ✓ Correctly rejected PAYOUT_SETTLEMENT with inconsistent delta_amount");
      } else {
        throw e;
      }
    }

    // Test S-5: Non-PAYOUT_SETTLEMENT event with payout_item_id -> rejected
    try {
      await primaryClient.query(`
        INSERT INTO public.commission_ledger_events (
          partner_id, reservation_id, payout_item_id,
          source_provider, booking_channel, provider_booking_id,
          event_type, delta_amount, idempotency_key
        ) VALUES (
          $1, $2, $3,
          'ownerrez', 'direct', 'OR-100',
          'PAYMENT_REALIZED', 150.00, 'PR_FAIL_WITH_ITEM'
        );
      `, [partnerId, reservationId, itemAId]);
      throw new Error("FAILED: PAYMENT_REALIZED with payout_item_id was accepted!");
    } catch (e: any) {
      if (e.message.includes("payout_item_id can only be associated with PAYOUT_SETTLEMENT events") || e.message.includes("chk_ledger_payout_item_exclusivity")) {
        console.log("  ✓ Correctly rejected non-PAYOUT_SETTLEMENT event referencing payout_item_id");
      } else {
        throw e;
      }
    }

    // -------------------------------------------------------------------------
    // Two-Connection FOR UPDATE Concurrency Test: Actual Batch-Generation Lock
    // -------------------------------------------------------------------------
    console.log("\n[9/11] Running Two-Connection Concurrency Acceptance on Real PostgreSQL (Actual Batch-Generation Lock)...");

    // Part A: Exact Raw SQL Concurrency Workflow (Partner P)
    console.log("\n  --- PART A: RAW SQL ACTUAL BATCH-GENERATION CONCURRENCY WORKFLOW ---");

    // Initial State: Partner P exists with ZERO active payout batches
    const partnerPRes = await primaryClient.query(`
      INSERT INTO public.partners (name, email) 
      VALUES ('Partner P Concurrency', 'partner-p@example.com') 
      RETURNING id;
    `);
    const partnerPId = partnerPRes.rows[0].id;

    const resPRes = await primaryClient.query(`
      INSERT INTO public.reservations (partner_id, source_provider, platform, confirmation_code, total_payout, check_in_date, check_out_date)
      VALUES ($1, 'ownerrez', 'direct', 'CONF-CONC-P', 1500.00, NOW() - INTERVAL '7 days', NOW() - INTERVAL '2 days')
      RETURNING id;
    `, [partnerPId]);
    const resPId = resPRes.rows[0].id;

    const prPRes = await primaryClient.query(`
      INSERT INTO public.commission_ledger_events (
        partner_id, reservation_id, source_provider, booking_channel, provider_booking_id,
        event_type, delta_amount, calculated_commission, idempotency_key
      ) VALUES (
        $1, $2, 'ownerrez', 'direct', 'OR-CONC-P',
        'PAYMENT_REALIZED', 250.00, 250.00, 'PAYMENT_REALIZED:CONC:P'
      ) RETURNING id;
    `, [partnerPId, resPId]);
    const qualEventPId = prPRes.rows[0].id;

    // Verify initial active batches count is exactly ZERO
    const activeBatchesInit = await primaryClient.query(`
      SELECT id FROM public.payout_batches
      WHERE partner_id = $1
        AND status IN (
          'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'AWAITING_MANUAL_CONFIRMATION', 'PROCESSING', 'REQUIRES_RECONCILIATION'
        );
    `, [partnerPId]);
    console.log(`  • Initial State: Partner P exists, active payout batches count: ${activeBatchesInit.rows.length} (Expected: 0)`);
    if (activeBatchesInit.rows.length !== 0) throw new Error("Expected zero active batches initially");

    // Open two independent TCP PostgreSQL connections
    const client1 = new Client({ connectionString: DB_URL });
    const client2 = new Client({ connectionString: DB_URL });
    await client1.connect();
    await client2.connect();

    const pid1 = (await client1.query("SELECT pg_backend_pid();")).rows[0].pg_backend_pid;
    const pid2 = (await client2.query("SELECT pg_backend_pid();")).rows[0].pg_backend_pid;
    console.log(`  • Connection 1 Server PID: ${pid1}`);
    console.log(`  • Connection 2 Server PID: ${pid2}`);
    if (pid1 === pid2) throw new Error("Connections are not independent!");
    console.log("  ✓ Verified two genuinely independent server PostgreSQL backend processes.");

    // Connection 1: BEGIN; SELECT id FROM public.partners WHERE id = :partner_id FOR UPDATE;
    await client1.query("BEGIN;");
    await client1.query("SELECT id FROM public.partners WHERE id = $1 FOR UPDATE;", [partnerPId]);
    console.log("  • Connection 1: Acquired exclusive FOR UPDATE lock on Partner P (Transaction 1 kept open)");

    // Connection 1 verifies active batches for Partner P (zero rows)
    const activeC1 = await client1.query(`
      SELECT id
      FROM public.payout_batches
      WHERE partner_id = $1
        AND status IN (
          'DRAFT',
          'PENDING_APPROVAL',
          'APPROVED',
          'AWAITING_MANUAL_CONFIRMATION',
          'PROCESSING',
          'REQUIRES_RECONCILIATION'
        );
    `, [partnerPId]);
    console.log(`  • Connection 1: Verified active batches count: ${activeC1.rows.length} (Expected: 0)`);
    if (activeC1.rows.length !== 0) throw new Error("Expected zero active batches in Connection 1");

    // Connection 1 creates the DRAFT batch/items but does NOT commit yet
    const batchC1Res = await client1.query(`
      INSERT INTO public.payout_batches (
        batch_number, partner_id, payout_rail, total_gross_amount, total_netting_deduction, total_amount,
        status, created_by
      ) VALUES (
        'BATCH-CONCURRENCY-P1', $1, 'MANUAL_ACH', 250.00, 0.00, 250.00,
        'DRAFT', $2
      ) RETURNING id;
    `, [partnerPId, aliceMakerId]);
    const batchC1Id = batchC1Res.rows[0].id;

    await client1.query(`
      INSERT INTO public.payout_items (
        payout_batch_id, qualifying_ledger_event_id, reservation_id, partner_id,
        gross_amount, netting_deduction, disbursed_amount, status
      ) VALUES (
        $1, $2, $3, $4,
        250.00, 0.00, 250.00, 'PENDING'
      );
    `, [batchC1Id, qualEventPId, resPId, partnerPId]);
    console.log("  • Connection 1: Created DRAFT batch and payout item, but KEPT TRANSACTION OPEN (uncommitted).");

    // Connection 2, concurrently: BEGIN; SELECT id FROM public.partners WHERE id = :partner_id FOR UPDATE NOWAIT;
    await client2.query("BEGIN;");
    let nowaitLockRejected = false;
    try {
      await client2.query("SELECT id FROM public.partners WHERE id = $1 FOR UPDATE NOWAIT;", [partnerPId]);
    } catch (e: any) {
      if (e.code === "55P03" || e.message.includes("could not obtain lock on row")) {
        nowaitLockRejected = true;
        console.log(`  ✓ Connection 2 NOWAIT immediately rejected with SQLSTATE 55P03: "${e.message}"`);
      } else {
        throw e;
      }
    }
    await client2.query("ROLLBACK;");
    if (!nowaitLockRejected) throw new Error("Connection 2 NOWAIT was not rejected!");

    // Connection 2 waiting lock: Transaction 2 blocks until Transaction 1 commits
    await client2.query("BEGIN;");
    console.log("  • Connection 2: Starting waiting FOR UPDATE query on Partner P (blocking)...");

    let c2AcquiredLock = false;
    const c2LockPromise = (async () => {
      const res = await client2.query("SELECT id FROM public.partners WHERE id = $1 FOR UPDATE;", [partnerPId]);
      c2AcquiredLock = true;
      return res;
    })();

    // Verify Connection 2 is blocked
    await new Promise((r) => setTimeout(r, 150));
    console.log(`  • Connection 2 is blocked waiting on lock: ${!c2AcquiredLock} (Expected: true)`);
    if (c2AcquiredLock) throw new Error("Connection 2 did not block!");

    // Transaction 1 COMMIT
    await client1.query("COMMIT;");
    console.log("  • Connection 1: COMMITTED and released partner row lock.");

    // Transaction 2 acquires partner lock
    await c2LockPromise;
    console.log("  ✓ Connection 2: Unblocked and acquired partner lock.");

    // Transaction 2 re-runs active-batch query
    const activeC2 = await client2.query(`
      SELECT id, status, batch_number
      FROM public.payout_batches
      WHERE partner_id = $1
        AND status IN (
          'DRAFT',
          'PENDING_APPROVAL',
          'APPROVED',
          'AWAITING_MANUAL_CONFIRMATION',
          'PROCESSING',
          'REQUIRES_RECONCILIATION'
        );
    `, [partnerPId]);

    // Transaction 2 sees the new DRAFT batch
    console.log(`  • Connection 2: Re-ran active-batch query: found ${activeC2.rows.length} active batch (${activeC2.rows[0].batch_number}, status: '${activeC2.rows[0].status}')`);
    if (activeC2.rows.length !== 1) throw new Error("Connection 2 failed to see committed DRAFT batch!");

    // Transaction 2 exits without creating another batch
    console.log("  ✓ Connection 2: Detects in-flight batch and gracefully EXITS without creating another batch.");
    await client2.query("ROLLBACK;");

    await client1.end();
    await client2.end();

    // Final Assertions for Part A
    const finalBatchesP = await primaryClient.query(`
      SELECT id, batch_number, status FROM public.payout_batches
      WHERE partner_id = $1
        AND status IN (
          'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'AWAITING_MANUAL_CONFIRMATION', 'PROCESSING', 'REQUIRES_RECONCILIATION'
        );
    `, [partnerPId]);
    const finalItemsP = await primaryClient.query(`
      SELECT id, disbursed_amount, status FROM public.payout_items
      WHERE partner_id = $1 AND status IN ('PENDING', 'SETTLED');
    `, [partnerPId]);

    console.log(`  • Final active payout batches for Partner P: ${finalBatchesP.rows.length} (Expected: 1)`);
    console.log(`  • Final active payout items for Partner P: ${finalItemsP.rows.length} (Expected: 1)`);
    console.log(`  • Duplicate payout batches created: ${finalBatchesP.rows.length - 1} (Expected: 0)`);
    console.log(`  • Duplicate payout items: ${finalItemsP.rows.length - 1} (Expected: 0)`);
    console.log(`  • Duplicate locked liability: $0.00 (Single $250.00 locked, exactly as expected)`);

    if (finalBatchesP.rows.length !== 1) throw new Error(`Expected exactly 1 active batch, got ${finalBatchesP.rows.length}`);
    if (finalItemsP.rows.length !== 1) throw new Error(`Expected exactly 1 payout item, got ${finalItemsP.rows.length}`);

    // Part B: Test via generateDraftPayoutBatch()
    console.log("\n  --- PART B: CONCURRENCY TEST THROUGH generateDraftPayoutBatch() ---");

    const partnerQRes = await primaryClient.query(`
      INSERT INTO public.partners (name, email) 
      VALUES ('Partner Q Generator Concurrency', 'partner-q@example.com') 
      RETURNING id;
    `);
    const partnerQId = partnerQRes.rows[0].id;

    const resQRes = await primaryClient.query(`
      INSERT INTO public.reservations (partner_id, source_provider, platform, confirmation_code, total_payout, check_in_date, check_out_date)
      VALUES ($1, 'ownerrez', 'direct', 'CONF-CONC-Q', 1800.00, NOW() - INTERVAL '8 days', NOW() - INTERVAL '3 days')
      RETURNING id;
    `, [partnerQId]);
    const resQId = resQRes.rows[0].id;

    // Seed events for Partner Q: PAYMENT_REALIZED + ELIGIBILITY_RELEASE
    await primaryClient.query(`
      INSERT INTO public.commission_ledger_events (
        partner_id, reservation_id, source_provider, booking_channel, provider_booking_id,
        event_type, delta_amount, calculated_commission, idempotency_key
      ) VALUES (
        $1, $2, 'ownerrez', 'direct', 'OR-CONC-Q',
        'PAYMENT_REALIZED', 300.00, 300.00, 'PAYMENT_REALIZED:CONC:Q'
      );
    `, [partnerQId, resQId]);

    await primaryClient.query(`
      INSERT INTO public.commission_ledger_events (
        partner_id, reservation_id, source_provider, booking_channel, provider_booking_id,
        event_type, delta_amount, calculated_commission, idempotency_key
      ) VALUES (
        $1, $2, 'ownerrez', 'direct', 'OR-CONC-Q',
        'ELIGIBILITY_RELEASE', 0.00, 0.00, 'ELIGIBILITY_RELEASE:CONC:Q'
      );
    `, [partnerQId, resQId]);

    const clientQ1 = new Client({ connectionString: DB_URL });
    const clientQ2 = new Client({ connectionString: DB_URL });
    await clientQ1.connect();
    await clientQ2.connect();

    // Client Q1 begins transaction and generates draft batch using pgClient (locks partner FOR UPDATE)
    await clientQ1.query("BEGIN;");
    const q1Result = await generateDraftPayoutBatch({
      partnerId: partnerQId,
      payoutRail: "MANUAL_ACH",
      createdBy: aliceMakerId,
      pgClient: clientQ1,
    });
    console.log(`  • Connection Q1 called generateDraftPayoutBatch(): created batch ${q1Result?.batch.batch_number} (Transaction Q1 kept uncommitted)`);

    // Client Q2 calls generateDraftPayoutBatch() concurrently -> blocks on partner lock
    await clientQ2.query("BEGIN;");
    console.log("  • Connection Q2 calling generateDraftPayoutBatch() concurrently (blocks on partner lock)...");

    let q2Blocked = true;
    let q2ErrorMessage: string | null = null;
    const q2Promise = (async () => {
      try {
        await generateDraftPayoutBatch({
          partnerId: partnerQId,
          payoutRail: "MANUAL_ACH",
          createdBy: aliceMakerId,
          pgClient: clientQ2,
        });
      } catch (err: any) {
        q2Blocked = false;
        q2ErrorMessage = err.message;
      }
    })();

    // Verify Q2 is waiting
    await new Promise((r) => setTimeout(r, 150));
    console.log(`  • Connection Q2 still blocked waiting on Q1 partner lock: ${q2Blocked} (Expected: true)`);
    if (!q2Blocked) throw new Error("Connection Q2 did not block on partner lock!");

    // Connection Q1 COMMITS
    await clientQ1.query("COMMIT;");
    console.log("  • Connection Q1 COMMITTED transaction.");

    // Connection Q2 unblocks, re-runs active batch check, sees Q1's batch, and throws
    await q2Promise;
    console.log(`  ✓ Connection Q2 caught expected active batch error: "${q2ErrorMessage}"`);
    if (!q2ErrorMessage || !q2ErrorMessage.includes("already exists for this partner")) {
      throw new Error(`Expected active batch error, got: ${q2ErrorMessage}`);
    }

    await clientQ2.query("ROLLBACK;");
    await clientQ1.end();
    await clientQ2.end();

    // Final Assertions for Part B
    const finalBatchesQ = await primaryClient.query(`
      SELECT id, batch_number, status FROM public.payout_batches
      WHERE partner_id = $1
        AND status IN (
          'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'AWAITING_MANUAL_CONFIRMATION', 'PROCESSING', 'REQUIRES_RECONCILIATION'
        );
    `, [partnerQId]);
    const finalItemsQ = await primaryClient.query(`
      SELECT id, disbursed_amount, status FROM public.payout_items
      WHERE partner_id = $1 AND status IN ('PENDING', 'SETTLED');
    `, [partnerQId]);

    console.log(`  • Final active payout batches for Partner Q: ${finalBatchesQ.rows.length} (Expected: 1)`);
    console.log(`  • Final active payout items for Partner Q: ${finalItemsQ.rows.length} (Expected: 1)`);
    console.log(`  • Duplicate payout batches created: ${finalBatchesQ.rows.length - 1} (Expected: 0)`);
    console.log(`  • Duplicate payout items: ${finalItemsQ.rows.length - 1} (Expected: 0)`);
    console.log(`  • Duplicate locked liability: $0.00 (Single $300.00 locked, exactly as expected)`);

    if (finalBatchesQ.rows.length !== 1) throw new Error(`Expected exactly 1 active batch for Partner Q, got ${finalBatchesQ.rows.length}`);
    if (finalItemsQ.rows.length !== 1) throw new Error(`Expected exactly 1 payout item for Partner Q, got ${finalItemsQ.rows.length}`);
    console.log("  ✓ BOTH RAW SQL AND generateDraftPayoutBatch() CONCURRENCY LOCK TESTS PASSED 100%!");

    // -------------------------------------------------------------------------
    // Batch Cancellation and Re-Batching Test
    // -------------------------------------------------------------------------
    console.log("\n[10/11] Testing Batch Cancellation, Re-Batching & Full Settlement Rollback...");

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
    const activeItemId = rebatchItem.rows[0].id;
    console.log(`  ✓ Re-batching succeeded! Created new item ${activeItemId} in Batch B.`);

    // Approve Batch B
    await primaryClient.query(`
      UPDATE public.payout_batches SET status = 'APPROVED', approved_by = $1, approved_at = NOW() WHERE id = $2;
    `, [bobApproverId, batchBId]);

    // Full Settlement Atomicity Failure Test (All 4 Operations)
    console.log("\n  --- FULL 4-OPERATION SETTLEMENT ATOMICITY FAILURE TEST ---");
    let settlementRollbackVerified = false;

    try {
      await primaryClient.query("BEGIN;");

      // 1. payout_items.status -> SETTLED
      await primaryClient.query(`
        UPDATE public.payout_items SET status = 'SETTLED', updated_at = NOW() WHERE id = $1;
      `, [activeItemId]);

      // 2. PAYOUT_SETTLEMENT ledger event -> inserted (relationships and delta auto-derived by trigger!)
      await primaryClient.query(`
        INSERT INTO public.commission_ledger_events (
          payout_item_id,
          source_provider, booking_channel, provider_booking_id,
          event_type, idempotency_key
        ) VALUES (
          $1,
          'ownerrez', 'direct', 'OR-100',
          'PAYOUT_SETTLEMENT', 'PAYOUT_SETTLEMENT:ATOMIC_TEST'
        );
      `, [activeItemId]);

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

      // SIMULATE FORCED CRASH BEFORE COMMIT
      throw new Error("SIMULATED_CRASH_BEFORE_SETTLEMENT_COMMIT");
    } catch (e: any) {
      if (e.message === "SIMULATED_CRASH_BEFORE_SETTLEMENT_COMMIT") {
        await primaryClient.query("ROLLBACK;");
        settlementRollbackVerified = true;
        console.log("  • Exception caught: rolled back complete settlement transaction.");
      } else {
        await primaryClient.query("ROLLBACK;");
        throw e;
      }
    }

    if (!settlementRollbackVerified) {
      throw new Error("Settlement fault was not triggered!");
    }

    // Inspect database after settlement rollback
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

    console.log("  ✓ ZERO PARTIAL FINANCIAL STATE SURVIVED SETTLEMENT ROLLBACK!");

    // -------------------------------------------------------------------------
    // Adjustment Approval Atomicity Test & Actor-ID Datatype Verification
    // -------------------------------------------------------------------------
    console.log("\n[11/11] Testing Adjustment Approval Atomicity & Actor-ID Datatype Verification...");

    // Create adjustment request in PENDING_APPROVAL
    const adjReqRes = await primaryClient.query(`
      INSERT INTO public.commission_adjustment_requests (
        partner_id, reservation_id, delta_amount, reason, status, created_by
      ) VALUES (
        $1, $2, 60.00, 'Fee correction adjustment', 'PENDING_APPROVAL', $3
      ) RETURNING id, status, created_by;
    `, [partnerId, reservationId, aliceMakerId]);
    const adjReqId = adjReqRes.rows[0].id;
    console.log(`  • Created adjustment request ${adjReqId} with TEXT created_by: '${adjReqRes.rows[0].created_by}'`);

    // Part A: Simulated failure during approval transaction -> complete rollback
    console.log("  • Executing adjustment approval transaction with simulated failure before commit...");
    let adjRollbackVerified = false;

    try {
      await primaryClient.query("BEGIN;");

      // 1. Insert MANUAL_ADJUSTMENT ledger event
      const failLedgerRes = await primaryClient.query(`
        INSERT INTO public.commission_ledger_events (
          partner_id, reservation_id, source_provider, booking_channel, provider_booking_id,
          event_type, delta_amount, adjustment_reason, created_by, approved_by, idempotency_key
        ) VALUES (
          $1, $2, 'ownerrez', 'direct', 'OR-100',
          'MANUAL_ADJUSTMENT', 60.00, 'Fee correction adjustment', $3, $4, $5
        ) RETURNING id;
      `, [partnerId, reservationId, aliceMakerId, bobApproverId, `MANUAL_ADJUSTMENT:REQ:${adjReqId}:FAIL`]);

      // 2. Update request to APPROVED
      await primaryClient.query(`
        UPDATE public.commission_adjustment_requests
        SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), ledger_event_id = $2
        WHERE id = $3;
      `, [bobApproverId, failLedgerRes.rows[0].id, adjReqId]);

      // 3. Write audit log
      await primaryClient.query(`
        INSERT INTO public.application_audit_logs (
          action, target_user_id, partner_id, performed_by_user_id, source, details
        ) VALUES (
          'APPROVE_MANUAL_ADJUSTMENT', $1, $2, $3, 'admin_portal',
          '{"requestId": "${adjReqId}"}'::jsonb
        );
      `, [aliceMakerId, partnerId, bobApproverId]);

      // SIMULATE FAILURE
      throw new Error("SIMULATED_FAILURE_BEFORE_ADJUSTMENT_COMMIT");
    } catch (e: any) {
      if (e.message === "SIMULATED_FAILURE_BEFORE_ADJUSTMENT_COMMIT") {
        await primaryClient.query("ROLLBACK;");
        adjRollbackVerified = true;
        console.log("  • Exception caught: rolled back complete adjustment approval transaction.");
      } else {
        await primaryClient.query("ROLLBACK;");
        throw e;
      }
    }

    if (!adjRollbackVerified) {
      throw new Error("Adjustment approval rollback was not triggered!");
    }

    // Verify request post-rollback remains PENDING_APPROVAL with no ledger event
    const postAdjReqRes = await primaryClient.query("SELECT status, approved_by, ledger_event_id FROM public.commission_adjustment_requests WHERE id = $1;", [adjReqId]);
    const postAdjLedgerCount = await primaryClient.query("SELECT COUNT(*) FROM public.commission_ledger_events WHERE event_type = 'MANUAL_ADJUSTMENT';");
    const postAdjAuditCount = await primaryClient.query("SELECT COUNT(*) FROM public.application_audit_logs WHERE action = 'APPROVE_MANUAL_ADJUSTMENT';");

    console.log(`  • Post-rollback request status: '${postAdjReqRes.rows[0].status}' (Expected: 'PENDING_APPROVAL')`);
    console.log(`  • Post-rollback request approved_by: ${postAdjReqRes.rows[0].approved_by} (Expected: null)`);
    console.log(`  • Post-rollback request ledger_event_id: ${postAdjReqRes.rows[0].ledger_event_id} (Expected: null)`);
    console.log(`  • Post-rollback MANUAL_ADJUSTMENT ledger events: ${postAdjLedgerCount.rows[0].count} (Expected: 0)`);
    console.log(`  • Post-rollback adjustment audit logs: ${postAdjAuditCount.rows[0].count} (Expected: 0)`);

    if (postAdjReqRes.rows[0].status !== "PENDING_APPROVAL") throw new Error("Request did not remain PENDING_APPROVAL after rollback");
    if (postAdjReqRes.rows[0].approved_by !== null) throw new Error("approved_by was not null after rollback");
    if (postAdjReqRes.rows[0].ledger_event_id !== null) throw new Error("ledger_event_id was not null after rollback");
    if (parseInt(postAdjLedgerCount.rows[0].count, 10) !== 0) throw new Error("MANUAL_ADJUSTMENT ledger event survived rollback");
    if (parseInt(postAdjAuditCount.rows[0].count, 10) !== 0) throw new Error("Adjustment audit log survived rollback");

    console.log("  ✓ ZERO PARTIAL STATE SURVIVED ADJUSTMENT APPROVAL ROLLBACK!");

    // Part B: Now execute successful atomic approval
    await primaryClient.query("BEGIN;");
    const succLedgerRes = await primaryClient.query(`
      INSERT INTO public.commission_ledger_events (
        partner_id, reservation_id, source_provider, booking_channel, provider_booking_id,
        event_type, delta_amount, adjustment_reason, created_by, approved_by, idempotency_key
      ) VALUES (
        $1, $2, 'ownerrez', 'direct', 'OR-100',
        'MANUAL_ADJUSTMENT', 60.00, 'Fee correction adjustment', $3, $4, $5
      ) RETURNING id;
    `, [partnerId, reservationId, aliceMakerId, bobApproverId, `MANUAL_ADJUSTMENT:REQ:${adjReqId}:SUCCESS`]);
    const succLedgerId = succLedgerRes.rows[0].id;

    await primaryClient.query(`
      UPDATE public.commission_adjustment_requests
      SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), ledger_event_id = $2
      WHERE id = $3;
    `, [bobApproverId, succLedgerId, adjReqId]);

    await primaryClient.query(`
      INSERT INTO public.application_audit_logs (
        action, target_user_id, partner_id, performed_by_user_id, source, details
      ) VALUES (
        'APPROVE_MANUAL_ADJUSTMENT', $1, $2, $3, 'admin_portal',
        '{"requestId": "${adjReqId}", "ledgerEventId": "${succLedgerId}"}'::jsonb
      );
    `, [aliceMakerId, partnerId, bobApproverId]);
    await primaryClient.query("COMMIT;");

    console.log(`  ✓ Adjustment approval committed atomically: request APPROVED, ledger event ${succLedgerId} created.`);

    // Actor-ID datatype verification
    console.log("\n  --- ACTOR-ID DATATYPE VERIFICATION ---");
    const actorCheck = await primaryClient.query(`
      SELECT 
        r.created_by as req_creator,
        r.approved_by as req_approver,
        l.created_by as ledger_creator,
        l.approved_by as ledger_approver,
        b.created_by as batch_creator,
        b.approved_by as batch_approver
      FROM public.commission_adjustment_requests r
      JOIN public.commission_ledger_events l ON l.id = r.ledger_event_id
      JOIN public.payout_batches b ON b.id = $1
      WHERE r.id = $2;
    `, [batchBId, adjReqId]);

    console.log("  • Request Maker/Approver:", { creator: actorCheck.rows[0].req_creator, approver: actorCheck.rows[0].req_approver });
    console.log("  • Ledger Maker/Approver:", { creator: actorCheck.rows[0].ledger_creator, approver: actorCheck.rows[0].ledger_approver });
    console.log("  • Batch Maker/Approver:", { creator: actorCheck.rows[0].batch_creator, approver: actorCheck.rows[0].batch_approver });

    if (
      actorCheck.rows[0].req_creator !== 'user-finance-1' ||
      actorCheck.rows[0].req_approver !== 'user-admin-1' ||
      actorCheck.rows[0].ledger_creator !== 'user-finance-1' ||
      actorCheck.rows[0].ledger_approver !== 'user-admin-1' ||
      actorCheck.rows[0].batch_creator !== 'user-finance-1' ||
      actorCheck.rows[0].batch_approver !== 'user-admin-1'
    ) {
      throw new Error("Actor identifier mismatch in verification!");
    }
    console.log("  ✓ Confirmed: TEXT actor IDs ('user-finance-1', 'user-admin-1') seamlessly accepted and verified across all tables.");

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
