-- Migration: 20260909_phase6_commission_ledger_and_payouts.sql
-- Description: Phase 6 Commission Ledger, Payout Batches, Payout Items, and Payment Attempts.
-- Dependency-safe sequence:
--   Stage A: CREATE commission_ledger_events without payout batch/item FK constraints
--   Stage B: CREATE payout_batches
--   Stage C: CREATE payout_items (FK -> commission_ledger_events)
--   Stage D: CREATE payout_payment_attempts (FK -> payout_batches)
--   Stage E: ALTER commission_ledger_events ADD foreign-key constraints for payout_batch_id and payout_item_id
--   Stage F: Row Level Security (RLS) policies

BEGIN;

-- ============================================================================
-- STAGE A: Create commission_ledger_events (Base Table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.commission_ledger_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id),
    site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
    reservation_id UUID NOT NULL REFERENCES public.reservations(id),
    commission_rule_id UUID REFERENCES public.commission_rules(id),
    
    -- Payout Association Columns (FK constraints added in Stage E)
    payout_batch_id UUID NULL,
    payout_item_id UUID NULL,
    
    -- Provider Identity (Provider only; booking channel is separate)
    source_provider TEXT NOT NULL CHECK (source_provider IN ('ownerrez', 'hospitable')),
    booking_channel TEXT NOT NULL, -- 'direct', 'airbnb', 'vrbo', etc.
    provider_booking_id TEXT NOT NULL,
    ownerrez_booking_id BIGINT NULL,
    
    -- Event Classification & Signed Financial Amount
    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'INITIAL_ACCRUAL',     -- Non-financial contracted forecast (delta = 0)
            'PAYMENT_REALIZED',    -- Realized guest payment liability (delta > 0)
            'REFUND_CLAWBACK',     -- Post-payment refund clawback (delta < 0)
            'MANUAL_ADJUSTMENT',   -- Admin financial correction (signed delta)
            'ELIGIBILITY_RELEASE', -- Stay completed + hold buffer elapsed (delta = 0)
            'DISPUTE_HOLD',        -- Chargeback or review freeze (delta = 0)
            'DISPUTE_RELEASE',     -- Dispute cleared (delta = 0)
            'PAYOUT_SETTLEMENT'    -- Final settlement disbursement (delta < 0)
        )
    ),
    delta_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    calculated_commission NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    snapshot_balance_after NUMERIC(10, 2) NULL, -- Non-authoritative diagnostic
    
    -- Audit & Administrative Controls
    adjustment_reason TEXT NULL,
    created_by TEXT NULL,
    approved_by TEXT NULL,
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    idempotency_key TEXT NOT NULL UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Maker-Checker Invariant for MANUAL_ADJUSTMENT
    CONSTRAINT chk_manual_adjustment_maker_checker CHECK (
        (event_type != 'MANUAL_ADJUSTMENT') OR 
        (
            adjustment_reason IS NOT NULL AND 
            btrim(adjustment_reason) <> '' AND 
            created_by IS NOT NULL AND 
            btrim(created_by) <> '' AND
            approved_by IS NOT NULL AND 
            btrim(approved_by) <> '' AND
            approved_by <> created_by
        )
    ),
    
    -- 1:1 Settlement Exclusivity Constraint
    CONSTRAINT chk_ledger_payout_item_exclusivity CHECK (
        (event_type = 'PAYOUT_SETTLEMENT' AND payout_item_id IS NOT NULL) OR
        (event_type != 'PAYOUT_SETTLEMENT' AND payout_item_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_ledger_partner_balance ON public.commission_ledger_events(partner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_reservation_events ON public.commission_ledger_events(reservation_id, event_type);
CREATE INDEX IF NOT EXISTS idx_ledger_provider_lookup ON public.commission_ledger_events(source_provider, provider_booking_id);
CREATE INDEX IF NOT EXISTS idx_ledger_ownerrez_audit ON public.commission_ledger_events(ownerrez_booking_id) WHERE ownerrez_booking_id IS NOT NULL;

-- Database-Enforced 1:1 Payout Settlement Index
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_payout_settlement_item
ON public.commission_ledger_events(payout_item_id)
WHERE event_type = 'PAYOUT_SETTLEMENT';

-- Database-Enforced Ledger Immutability Trigger (Prohibits UPDATE & DELETE)
CREATE OR REPLACE FUNCTION public.fn_prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Commission ledger events are strictly immutable. Updates and deletes are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_ledger_mutation ON public.commission_ledger_events;
CREATE TRIGGER trg_prevent_ledger_mutation
BEFORE UPDATE OR DELETE ON public.commission_ledger_events
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_ledger_mutation();

-- ============================================================================
-- STAGE B: Create payout_batches
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payout_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_number TEXT NOT NULL UNIQUE,
    partner_id UUID NOT NULL REFERENCES public.partners(id),
    payout_rail TEXT NOT NULL CHECK (payout_rail IN ('MANUAL_ACH', 'BANK_WIRE', 'CHECK', 'STRIPE_CONNECT')),
    total_gross_amount NUMERIC(10, 2) NOT NULL CHECK (total_gross_amount > 0),
    total_netting_deduction NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_netting_deduction >= 0),
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount > 0),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    status TEXT NOT NULL CHECK (
        status IN (
            'DRAFT',
            'PENDING_APPROVAL',
            'APPROVED',
            'AWAITING_MANUAL_CONFIRMATION',
            'PROCESSING',
            'SETTLED',
            'FAILED',
            'CANCELLED',
            'REQUIRES_RECONCILIATION'
        )
    ),
    created_by TEXT NOT NULL,
    submitted_by TEXT NULL,
    approved_by TEXT NULL,
    approved_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Maker-Checker Invariant
    CONSTRAINT chk_maker_checker_separation CHECK (
        (approved_by IS NULL) OR 
        (approved_by != created_by AND (submitted_by IS NULL OR approved_by != submitted_by))
    ),

    -- Payout Arithmetic Invariant
    CONSTRAINT chk_batch_arithmetic CHECK (total_amount = (total_gross_amount - total_netting_deduction)),

    -- Composite Unique Key for Cross-Table Partner Referential Integrity
    CONSTRAINT uq_payout_batch_partner UNIQUE (id, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_batches_partner_status ON public.payout_batches(partner_id, status);

-- ============================================================================
-- STAGE C: Create payout_items
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payout_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_batch_id UUID NOT NULL REFERENCES public.payout_batches(id) ON DELETE RESTRICT,
    qualifying_ledger_event_id UUID NOT NULL REFERENCES public.commission_ledger_events(id),
    reservation_id UUID NOT NULL REFERENCES public.reservations(id),
    partner_id UUID NOT NULL REFERENCES public.partners(id),
    gross_amount NUMERIC(10, 2) NOT NULL CHECK (gross_amount > 0),
    netting_deduction NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (netting_deduction >= 0),
    disbursed_amount NUMERIC(10, 2) NOT NULL CHECK (disbursed_amount > 0),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'SETTLED', 'FAILED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Item Payout Arithmetic Invariant
    CONSTRAINT chk_disbursed_arithmetic CHECK (disbursed_amount = (gross_amount - netting_deduction)),

    -- Database-Enforced Partner Consistency Between Batch and Items
    CONSTRAINT fk_payout_items_batch_partner FOREIGN KEY (payout_batch_id, partner_id)
        REFERENCES public.payout_batches(id, partner_id) ON DELETE RESTRICT
);

-- Partial Unique Index: Exactly one active claim per qualifying ledger event
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_payout_item_ledger_event
ON public.payout_items(qualifying_ledger_event_id)
WHERE status IN ('PENDING', 'SETTLED');

CREATE INDEX IF NOT EXISTS idx_payout_items_batch_status ON public.payout_items(payout_batch_id, status);
CREATE INDEX IF NOT EXISTS idx_payout_items_partner ON public.payout_items(partner_id);
CREATE INDEX IF NOT EXISTS idx_payout_items_reservation ON public.payout_items(reservation_id);

-- ============================================================================
-- STAGE D: Create payout_payment_attempts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payout_payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_batch_id UUID NOT NULL REFERENCES public.payout_batches(id),
    idempotency_key TEXT NOT NULL UNIQUE,
    payment_provider TEXT NOT NULL,
    provider_idempotency_key TEXT NOT NULL UNIQUE,
    provider_transfer_id TEXT UNIQUE NULL,
    requested_amount NUMERIC(10, 2) NOT NULL CHECK (requested_amount > 0),
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
    attempt_count INT NOT NULL DEFAULT 1,
    last_error TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempts_batch ON public.payout_payment_attempts(payout_batch_id);

-- ============================================================================
-- ============================================================================
-- STAGE E: Alter commission_ledger_events to Add Foreign Keys & Derivation Trigger
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_ledger_payout_batch'
          AND conrelid = 'public.commission_ledger_events'::regclass
    ) THEN
        ALTER TABLE public.commission_ledger_events
        ADD CONSTRAINT fk_ledger_payout_batch
        FOREIGN KEY (payout_batch_id) REFERENCES public.payout_batches(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_ledger_payout_item'
          AND conrelid = 'public.commission_ledger_events'::regclass
    ) THEN
        ALTER TABLE public.commission_ledger_events
        ADD CONSTRAINT fk_ledger_payout_item
        FOREIGN KEY (payout_item_id) REFERENCES public.payout_items(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- Enforce PAYOUT_SETTLEMENT relationship derivation and consistency
CREATE OR REPLACE FUNCTION public.fn_enforce_settlement_derivation()
RETURNS TRIGGER AS $$
DECLARE
    v_item RECORD;
BEGIN
    IF NEW.event_type = 'PAYOUT_SETTLEMENT' THEN
        IF NEW.payout_item_id IS NULL THEN
            RAISE EXCEPTION 'PAYOUT_SETTLEMENT requires payout_item_id to be specified.';
        END IF;

        SELECT id, payout_batch_id, reservation_id, partner_id, disbursed_amount
        INTO v_item
        FROM public.payout_items
        WHERE id = NEW.payout_item_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Referenced payout_item % does not exist.', NEW.payout_item_id;
        END IF;

        -- Validate or derive payout_batch_id
        IF NEW.payout_batch_id IS NOT NULL AND NEW.payout_batch_id <> v_item.payout_batch_id THEN
            RAISE EXCEPTION 'Inconsistent payout_batch_id % supplied for PAYOUT_SETTLEMENT. Expected % from referenced payout item.',
                NEW.payout_batch_id, v_item.payout_batch_id;
        END IF;
        NEW.payout_batch_id := v_item.payout_batch_id;

        -- Validate or derive reservation_id
        IF NEW.reservation_id IS NOT NULL AND NEW.reservation_id <> v_item.reservation_id THEN
            RAISE EXCEPTION 'Inconsistent reservation_id % supplied for PAYOUT_SETTLEMENT. Expected % from referenced payout item.',
                NEW.reservation_id, v_item.reservation_id;
        END IF;
        NEW.reservation_id := v_item.reservation_id;

        -- Validate or derive partner_id
        IF NEW.partner_id IS NOT NULL AND NEW.partner_id <> v_item.partner_id THEN
            RAISE EXCEPTION 'Inconsistent partner_id % supplied for PAYOUT_SETTLEMENT. Expected % from referenced payout item.',
                NEW.partner_id, v_item.partner_id;
        END IF;
        NEW.partner_id := v_item.partner_id;

        -- Validate or derive delta_amount (must match -ABS(disbursed_amount))
        IF NEW.delta_amount <> 0.00 AND NEW.delta_amount <> -ABS(v_item.disbursed_amount) THEN
            RAISE EXCEPTION 'Inconsistent delta_amount % supplied for PAYOUT_SETTLEMENT. Expected % from referenced payout item.',
                NEW.delta_amount, -ABS(v_item.disbursed_amount);
        END IF;
        NEW.delta_amount := -ABS(v_item.disbursed_amount);

    ELSE
        IF NEW.payout_item_id IS NOT NULL THEN
            RAISE EXCEPTION 'payout_item_id can only be associated with PAYOUT_SETTLEMENT events.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_settlement_derivation ON public.commission_ledger_events;
CREATE TRIGGER trg_enforce_settlement_derivation
BEFORE INSERT ON public.commission_ledger_events
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_settlement_derivation();

-- ============================================================================
-- STAGE F: Create commission_adjustment_requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.commission_adjustment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id),
    reservation_id UUID NOT NULL REFERENCES public.reservations(id),
    delta_amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    reason TEXT NOT NULL CHECK (btrim(reason) <> ''),
    status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (
        status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')
    ),
    created_by TEXT NOT NULL,
    approved_by TEXT NULL,
    approved_at TIMESTAMPTZ NULL,
    rejection_reason TEXT NULL,
    ledger_event_id UUID NULL REFERENCES public.commission_ledger_events(id) ON DELETE RESTRICT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Maker-Checker Invariant
    CONSTRAINT chk_adjustment_request_maker_checker CHECK (
        (approved_by IS NULL) OR (approved_by <> created_by)
    ),

    -- Database State-Coherence Constraint
    CONSTRAINT chk_adjustment_request_state_coherence CHECK (
        (
            status = 'PENDING_APPROVAL' AND
            approved_by IS NULL AND
            approved_at IS NULL AND
            ledger_event_id IS NULL AND
            rejection_reason IS NULL
        ) OR (
            status = 'APPROVED' AND
            approved_by IS NOT NULL AND
            btrim(approved_by) <> '' AND
            approved_at IS NOT NULL AND
            ledger_event_id IS NOT NULL AND
            rejection_reason IS NULL AND
            approved_by <> created_by
        ) OR (
            status = 'REJECTED' AND
            rejection_reason IS NOT NULL AND
            btrim(rejection_reason) <> '' AND
            ledger_event_id IS NULL
        )
    )
);

-- Exactly one ledger event per approved adjustment request
CREATE UNIQUE INDEX IF NOT EXISTS uq_request_ledger_event
ON public.commission_adjustment_requests(ledger_event_id)
WHERE ledger_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_adj_requests_partner_status ON public.commission_adjustment_requests(partner_id, status);

-- ============================================================================
-- STAGE G: Row Level Security (RLS)
-- ============================================================================

ALTER TABLE public.commission_ledger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_adjustment_requests ENABLE ROW LEVEL SECURITY;

-- Service role full access policies (service_role is native in Supabase)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commission_ledger_events' AND policyname = 'service_role_all_ledger_events') THEN
        CREATE POLICY service_role_all_ledger_events ON public.commission_ledger_events FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payout_batches' AND policyname = 'service_role_all_payout_batches') THEN
        CREATE POLICY service_role_all_payout_batches ON public.payout_batches FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payout_items' AND policyname = 'service_role_all_payout_items') THEN
        CREATE POLICY service_role_all_payout_items ON public.payout_items FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payout_payment_attempts' AND policyname = 'service_role_all_payment_attempts') THEN
        CREATE POLICY service_role_all_payment_attempts ON public.payout_payment_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'commission_adjustment_requests' AND policyname = 'service_role_all_adj_requests') THEN
        CREATE POLICY service_role_all_adj_requests ON public.commission_adjustment_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- ============================================================================
-- STAGE H: Record Migration in public.schema_migrations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('20260909_phase6_commission_ledger_and_payouts', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
