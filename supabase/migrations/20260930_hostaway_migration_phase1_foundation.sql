-- ==============================================================================
-- HIDDEN HONEY HOMES - HOSTAWAY MASTER PMS MIGRATION (PHASE 1 FOUNDATION)
-- Migration Version: 20260930_hostaway_migration_phase1_foundation.sql
-- Strategy: Transactional with Strict Conflict Assertions
-- Scope: Add Hostaway provider columns, support source_provider = 'hostaway'
--        in commission ledger events, and create idempotency checkpoint log table.
-- Invariants:
-- - Zero placeholder property IDs (101001-101004 strictly omitted)
-- - Zero guessed listing IDs
-- - Preserves all legacy OwnerRez and Hospitable property and reservation mappings
-- - Idempotent: safe on first run and safe on re-execution
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. RECORD MIGRATION TRACKING TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. ADD HOSTAWAY IDENTIFIERS TO PROPERTIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS hostaway_listing_id BIGINT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_properties_hostaway_listing_id ON public.properties(hostaway_listing_id);

-- ------------------------------------------------------------------------------
-- 3. ADD HOSTAWAY IDENTIFIERS TO RESERVATIONS
-- ------------------------------------------------------------------------------
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS hostaway_reservation_id BIGINT UNIQUE;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS raw_hostaway_data JSONB;
CREATE INDEX IF NOT EXISTS idx_reservations_hostaway_reservation_id ON public.reservations(hostaway_reservation_id);

-- Update external identity check constraint to include hostaway_reservation_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_reservation_external_identity'
          AND conrelid = 'public.reservations'::regclass
    ) THEN
        ALTER TABLE public.reservations DROP CONSTRAINT chk_reservation_external_identity;
    END IF;

    ALTER TABLE public.reservations
    ADD CONSTRAINT chk_reservation_external_identity
    CHECK (
        hospitable_reservation_id IS NOT NULL
        OR ownerrez_booking_id IS NOT NULL
        OR hostaway_reservation_id IS NOT NULL
    );
END $$;

-- ------------------------------------------------------------------------------
-- 4. UPDATE COMMISSION LEDGER SOURCE PROVIDER CONSTRAINT
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'commission_ledger_events_source_provider_check'
          AND conrelid = 'public.commission_ledger_events'::regclass
    ) THEN
        ALTER TABLE public.commission_ledger_events DROP CONSTRAINT commission_ledger_events_source_provider_check;
    END IF;

    ALTER TABLE public.commission_ledger_events
    ADD CONSTRAINT commission_ledger_events_source_provider_check
    CHECK (source_provider IN ('ownerrez', 'hospitable', 'hostaway'));
END $$;

-- ------------------------------------------------------------------------------
-- 5. CREATE INTEGRATION IDEMPOTENCY & CHECKPOINT LOGS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_idempotency_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (upper(provider) IN ('HOSTAWAY', 'OWNERREZ', 'HOSPITABLE', 'CLERK', 'STRIPE', 'BREVO')),
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSED',
    payload_hash TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_integration_provider_event UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_integration_idempotency_provider_event ON public.integration_idempotency_logs (provider, event_id);

-- ------------------------------------------------------------------------------
-- 6. RECORD SUCCESSFUL MIGRATION
-- ------------------------------------------------------------------------------
INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('20260930_hostaway_migration_phase1_foundation', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
