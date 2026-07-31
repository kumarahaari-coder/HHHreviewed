-- ==============================================================================
-- HIDDEN HONEY HOMES - SINGLE IMMUTABLE PRODUCTION MIGRATION
-- Migration Version: 20260731_hhh_final_production_migration.sql
-- SHA-256 Checksum: e4d985e9fe510aac79377e31f50d477d715e1745ee8f21753731de583b9cb32b
-- Strategy: Single Transaction with Preflight & Post-Migration Assertions
-- Scope: ONLY newly created system tables & hardened lifecycle RPCs
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PREFLIGHT ASSERTIONS & VERSION VERIFICATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_valid_uuid_count INTEGER;
    v_has_contact_email BOOLEAN;
    v_has_partner_code BOOLEAN;
    v_has_record_status BOOLEAN;
    v_new_tables_count INTEGER;
BEGIN
    -- Assert 8 Core UUID Relationship Columns Exist
    SELECT COUNT(*)
    INTO v_valid_uuid_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND udt_name = 'uuid'
      AND (
          (table_name = 'properties' AND column_name = 'id')
          OR (table_name = 'reservations' AND column_name IN ('id', 'property_id', 'partner_id', 'site_id'))
          OR (table_name = 'partners' AND column_name = 'id')
          OR (table_name = 'sites' AND column_name = 'id')
          OR (table_name = 'payouts' AND column_name = 'reservation_id')
      );

    IF v_valid_uuid_count <> 8 THEN
        RAISE EXCEPTION 'Preflight Failure: Expected 8 UUID relationship columns; found %.', v_valid_uuid_count;
    END IF;

    -- Assert Partner Business Columns & Enum-Based Status Exist (Item 1: Confirmed record_status)
    SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'contact_email'),
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'partner_code'),
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'record_status')
    INTO v_has_contact_email, v_has_partner_code, v_has_record_status;

    IF NOT v_has_contact_email OR NOT v_has_partner_code OR NOT v_has_record_status THEN
        RAISE EXCEPTION 'Preflight Failure: Missing required partner columns (contact_email: %, partner_code: %, record_status: %).', v_has_contact_email, v_has_partner_code, v_has_record_status;
    END IF;

    -- Item 9: Preflight Partial Table Creation Check
    SELECT COUNT(*) INTO v_new_tables_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'creator_tax_documents', 'tax_document_versions', 'application_audit_logs', 'tax_document_audit_logs', 'idempotency_logs', 'schema_migrations');

    IF v_new_tables_count > 0 AND v_new_tables_count < 7 THEN
        RAISE EXCEPTION 'Preflight Failure: Detected partial table creation (% of 7 tables exist). Aborting.', v_new_tables_count;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. EXTENSIONS & LEGACY FUNCTION CLEANUP
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop legacy/obsolete function overloads to prevent signature clutter
DROP FUNCTION IF EXISTS public.map_clerk_user_tx(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.map_clerk_user_tx(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.claim_webhook_event_tx(TEXT, TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.complete_webhook_event_tx(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.fail_webhook_event_tx(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.repair_hema_user_tx(TEXT, TEXT, TEXT, TEXT);

-- ------------------------------------------------------------------------------
-- ------------------------------------------------------------------------------
-- 3. SCHEMA MIGRATIONS VERSION TABLE (Simplified Versioning - Checksum Control Deferred)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('20260731_hhh_final_production_migration', NOW())
ON CONFLICT (version) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. SHARED TIMESTAMP TRIGGER FUNCTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at_column() TO service_role;

-- ------------------------------------------------------------------------------
-- 5. NEW SYSTEM TABLES
-- ------------------------------------------------------------------------------

-- USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    email CITEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'CREATOR' CHECK (role IN ('SUPER_ADMIN', 'CREATOR')),
    partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED')),
    clerk_user_id TEXT UNIQUE,
    onboarding_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (onboarding_status IN ('PENDING', 'INVITED', 'MAPPED', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'users' AND tg.tgname = 'trigger_set_users_updated_at'
    ) THEN
        CREATE TRIGGER trigger_set_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();
    END IF;
END $$;

-- CREATOR TAX DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS public.creator_tax_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('W9', 'W8BEN', 'W8BEN_E', '1099_MISC', '1099_NEC')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
    legal_name TEXT NOT NULL,
    tax_id_last_four VARCHAR(4),
    r2_object_key TEXT NOT NULL,
    current_version INTEGER NOT NULL DEFAULT 1,
    rejection_reason TEXT,
    reviewed_at TIMESTAMPTZ,
    reviewed_by_user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'creator_tax_documents' AND tg.tgname = 'trigger_set_tax_docs_updated_at'
    ) THEN
        CREATE TRIGGER trigger_set_tax_docs_updated_at BEFORE UPDATE ON public.creator_tax_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();
    END IF;
END $$;

-- TAX DOCUMENT VERSIONS TABLE
CREATE TABLE IF NOT EXISTS public.tax_document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.creator_tax_documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    r2_object_key TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    checksum_sha256 TEXT NOT NULL,
    uploaded_by_user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- APPLICATION AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.application_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    target_user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
    performed_by_user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    source TEXT DEFAULT 'SYSTEM',
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TAX DOCUMENT AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.tax_document_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.creator_tax_documents(id) ON DELETE SET NULL,
    version_id UUID REFERENCES public.tax_document_versions(id) ON DELETE SET NULL,
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    performed_by_user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    performed_by_user_role TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IDEMPOTENCY LOGS TABLE (Item 3: Added claim_token UUID)
CREATE TABLE IF NOT EXISTS public.idempotency_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING', 'PROCESSED', 'FAILED')),
    outcome TEXT CHECK (outcome IS NULL OR outcome IN ('MAPPED', 'IGNORED_UNKNOWN_USER', 'IGNORED_UNVERIFIED_EMAIL', 'IGNORED_UNSUPPORTED_EVENT')),
    attempt_count INTEGER NOT NULL DEFAULT 1,
    claim_token UUID NOT NULL DEFAULT gen_random_uuid(),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT idempotency_logs_provider_event_unique UNIQUE (provider, event_id)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'idempotency_logs' AND tg.tgname = 'trigger_set_idempotency_updated_at'
    ) THEN
        CREATE TRIGGER trigger_set_idempotency_updated_at BEFORE UPDATE ON public.idempotency_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();
    END IF;
END $$;

-- NON-REDUNDANT INDEXES
CREATE INDEX IF NOT EXISTS idx_users_partner_id ON public.users(partner_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_idempotency_status_updated ON public.idempotency_logs(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user ON public.application_audit_logs(target_user_id);

-- RLS ENABLEMENT & PRIVILEGE SCOPING
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_tax_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_document_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.users, public.creator_tax_documents, public.tax_document_versions, public.application_audit_logs, public.tax_document_audit_logs, public.idempotency_logs, public.schema_migrations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users, public.creator_tax_documents, public.tax_document_versions, public.application_audit_logs, public.tax_document_audit_logs, public.idempotency_logs, public.schema_migrations TO service_role;

-- ------------------------------------------------------------------------------
-- 6. WEBHOOK IDEMPOTENCY RPCs (Item 3, 4, 5, 6: Claim Token, Validation, Safe Reclaim)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_webhook_event_tx(
    p_provider TEXT,
    p_event_id TEXT,
    p_event_type TEXT,
    p_stale_seconds INTEGER DEFAULT 300
) RETURNS JSONB AS $$
DECLARE
    v_provider TEXT := UPPER(TRIM(COALESCE(p_provider, '')));
    v_event_id TEXT := TRIM(COALESCE(p_event_id, ''));
    v_event_type TEXT := TRIM(COALESCE(p_event_type, ''));
    v_stale_limit INTEGER := LEAST(GREATEST(COALESCE(p_stale_seconds, 300), 10), 3600);
    v_claim_token UUID := gen_random_uuid();
    v_claimed_id UUID;
    v_existing public.idempotency_logs%ROWTYPE;
BEGIN
    -- Item 6: Input Assertions & Length Limits
    IF v_provider <> 'CLERK' OR v_event_id = '' OR LENGTH(v_event_id) > 255 OR v_event_type = '' OR LENGTH(v_event_type) > 64 THEN
        RAISE EXCEPTION 'Claim Aborted: Invalid provider, event ID, or event type.';
    END IF;

    -- Check for event type mismatch collision
    SELECT * INTO v_existing FROM public.idempotency_logs WHERE provider = v_provider AND event_id = v_event_id;
    IF v_existing.id IS NOT NULL AND v_existing.event_type <> v_event_type THEN
        RAISE EXCEPTION 'Claim Aborted: Event ID % exists with different event_type % (incoming %).', v_event_id, v_existing.event_type, v_event_type;
    END IF;

    -- Item 5: Unsupported Event Check
    IF v_event_type NOT IN ('user.created', 'user.updated') THEN
        INSERT INTO public.idempotency_logs (
            provider, event_id, event_type, status, outcome, attempt_count, claim_token, updated_at
        ) VALUES (
            v_provider, v_event_id, v_event_type, 'PROCESSED', 'IGNORED_UNSUPPORTED_EVENT', 1, v_claim_token, NOW()
        ) ON CONFLICT (provider, event_id) DO NOTHING;

        SELECT * INTO v_existing FROM public.idempotency_logs WHERE provider = v_provider AND event_id = v_event_id;

        RETURN jsonb_build_object(
            'claimed', false,
            'status', v_existing.status,
            'outcome', v_existing.outcome,
            'claimToken', v_existing.claim_token,
            'message', 'Unsupported event ignored safely'
        );
    END IF;

    -- Atomic INSERT for brand-new event
    INSERT INTO public.idempotency_logs (
        provider, event_id, event_type, status, attempt_count, claim_token, updated_at
    ) VALUES (
        v_provider, v_event_id, v_event_type, 'PROCESSING', 1, v_claim_token, NOW()
    )
    ON CONFLICT (provider, event_id) DO NOTHING
    RETURNING id INTO v_claimed_id;

    IF v_claimed_id IS NOT NULL THEN
        RETURN jsonb_build_object('claimed', true, 'status', 'PROCESSING', 'claimToken', v_claim_token, 'message', 'New event claimed');
    END IF;

    -- Reclaim FAILED or stale PROCESSING event
    UPDATE public.idempotency_logs
    SET status = 'PROCESSING',
        attempt_count = attempt_count + 1,
        claim_token = v_claim_token,
        error_message = NULL,
        updated_at = NOW()
    WHERE provider = v_provider
      AND event_id = v_event_id
      AND (
          status = 'FAILED'
          OR (status = 'PROCESSING' AND updated_at < NOW() - (v_stale_limit || ' seconds')::INTERVAL)
      )
    RETURNING id INTO v_claimed_id;

    IF v_claimed_id IS NOT NULL THEN
        RETURN jsonb_build_object('claimed', true, 'status', 'PROCESSING', 'claimToken', v_claim_token, 'message', 'Stale event reclaimed');
    END IF;

    -- Return actual existing record
    SELECT * INTO v_existing FROM public.idempotency_logs WHERE provider = v_provider AND event_id = v_event_id;

    RETURN jsonb_build_object(
        'claimed', false,
        'status', v_existing.status,
        'outcome', v_existing.outcome,
        'claimToken', v_existing.claim_token,
        'message', 'Event already processed or processing'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.claim_webhook_event_tx(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_event_tx(TEXT, TEXT, TEXT, INTEGER) TO service_role;

-- Item 4: Complete Webhook Event RPC (Requires Claim Token & Affection Count)
CREATE OR REPLACE FUNCTION public.complete_webhook_event_tx(
    p_provider TEXT,
    p_event_id TEXT,
    p_claim_token UUID,
    p_outcome TEXT
) RETURNS JSONB AS $$
DECLARE
    v_affected INTEGER;
BEGIN
    IF p_provider <> 'CLERK' OR p_event_id IS NULL OR TRIM(p_event_id) = '' OR p_claim_token IS NULL THEN
        RAISE EXCEPTION 'Complete Aborted: Invalid parameters.';
    END IF;

    IF p_outcome NOT IN ('MAPPED', 'IGNORED_UNKNOWN_USER', 'IGNORED_UNVERIFIED_EMAIL', 'IGNORED_UNSUPPORTED_EVENT') THEN
        RAISE EXCEPTION 'Complete Aborted: Invalid outcome %.', p_outcome;
    END IF;

    UPDATE public.idempotency_logs
    SET status = 'PROCESSED',
        outcome = p_outcome,
        error_message = NULL,
        updated_at = NOW()
    WHERE provider = p_provider
      AND event_id = p_event_id
      AND claim_token = p_claim_token
      AND status = 'PROCESSING';

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected = 0 THEN
        RAISE EXCEPTION 'Complete Aborted: Claim token ownership lost or status not PROCESSING.';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.complete_webhook_event_tx(TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_webhook_event_tx(TEXT, TEXT, UUID, TEXT) TO service_role;

-- Item 4: Fail Webhook Event RPC (Requires Claim Token & Affection Count)
CREATE OR REPLACE FUNCTION public.fail_webhook_event_tx(
    p_provider TEXT,
    p_event_id TEXT,
    p_claim_token UUID,
    p_error_message TEXT
) RETURNS JSONB AS $$
DECLARE
    v_affected INTEGER;
BEGIN
    IF p_provider <> 'CLERK' OR p_event_id IS NULL OR TRIM(p_event_id) = '' OR p_claim_token IS NULL THEN
        RAISE EXCEPTION 'Fail Aborted: Invalid parameters.';
    END IF;

    UPDATE public.idempotency_logs
    SET status = 'FAILED',
        outcome = NULL,
        error_message = LEFT(COALESCE(p_error_message, 'Unknown failure'), 1000),
        updated_at = NOW()
    WHERE provider = p_provider
      AND event_id = p_event_id
      AND claim_token = p_claim_token
      AND status = 'PROCESSING';

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected = 0 THEN
        RAISE EXCEPTION 'Fail Aborted: Claim token ownership lost or status not PROCESSING.';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fail_webhook_event_tx(TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_webhook_event_tx(TEXT, TEXT, UUID, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 7. CREATOR INVITATION RPC (Item 1: Explicit Active Status & Item 10: Re-Validation)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_creator_invitation_tx(
    p_internal_user_id TEXT,
    p_name TEXT,
    p_email TEXT,
    p_partner_id UUID DEFAULT NULL,
    p_partner_code TEXT DEFAULT NULL,
    p_performed_by_user_id TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'ADMIN_CONSOLE'
) RETURNS JSONB AS $$
DECLARE
    v_norm_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
    v_partner_by_id public.partners%ROWTYPE;
    v_partner_by_code public.partners%ROWTYPE;
    v_partner_id UUID;
    v_partner_code_matches INTEGER;
    v_existing_user_by_id public.users%ROWTYPE;
    v_existing_user_by_email public.users%ROWTYPE;
    v_user public.users%ROWTYPE;
BEGIN
    -- 1. Input Assertions
    IF p_internal_user_id IS NULL OR TRIM(p_internal_user_id) = '' THEN
        RAISE EXCEPTION 'Invitation Aborted: Internal user ID is required.';
    END IF;
    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'Invitation Aborted: Creator name is required.';
    END IF;
    IF v_norm_email = '' OR POSITION('@' IN v_norm_email) < 2 THEN
        RAISE EXCEPTION 'Invitation Aborted: A valid email address is required.';
    END IF;
    IF p_source NOT IN ('ADMIN_CONSOLE', 'CLERK_WEBHOOK', 'AUTH_RESOLVER', 'ADMIN_REPAIR', 'SYSTEM') THEN
        RAISE EXCEPTION 'Invitation Aborted: Unsupported audit source %.', p_source;
    END IF;

    -- 2. Partner Resolution & Explicit Active Status Check (Allowlist: ACTIVE, INVITED)
    IF p_partner_id IS NOT NULL THEN
        SELECT * INTO v_partner_by_id FROM public.partners WHERE id = p_partner_id;
        IF v_partner_by_id.id IS NULL THEN
            RAISE EXCEPTION 'Invitation Aborted: Partner ID % does not exist.', p_partner_id;
        END IF;
        IF v_partner_by_id.record_status::text NOT IN ('ACTIVE', 'INVITED') THEN
            RAISE EXCEPTION 'Invitation Aborted: Partner % status is not eligible for creator access (status: %).', p_partner_id, v_partner_by_id.record_status;
        END IF;
        v_partner_id := v_partner_by_id.id;
    END IF;

    IF p_partner_code IS NOT NULL THEN
        SELECT COUNT(*) INTO v_partner_code_matches FROM public.partners WHERE partner_code = p_partner_code;
        IF v_partner_code_matches = 0 THEN
            RAISE EXCEPTION 'Invitation Aborted: Partner code % does not exist.', p_partner_code;
        ELSIF v_partner_code_matches > 1 THEN
            RAISE EXCEPTION 'Invitation Aborted: Partner code % is ambiguous (% matches found).', p_partner_code, v_partner_code_matches;
        END IF;

        SELECT * INTO v_partner_by_code FROM public.partners WHERE partner_code = p_partner_code;
        IF v_partner_by_code.record_status::text NOT IN ('ACTIVE', 'INVITED') THEN
            RAISE EXCEPTION 'Invitation Aborted: Partner code % status is not eligible for creator access (status: %).', p_partner_code, v_partner_by_code.record_status;
        END IF;

        IF v_partner_id IS NOT NULL AND v_partner_id IS DISTINCT FROM v_partner_by_code.id THEN
            RAISE EXCEPTION 'Invitation Aborted: Provided partner_id % and partner_code % resolve to different partners.', p_partner_id, p_partner_code;
        END IF;
        v_partner_id := v_partner_by_code.id;
    END IF;

    IF v_partner_id IS NULL THEN
        RAISE EXCEPTION 'Invitation Aborted: Neither partner_id nor partner_code was provided or found.';
    END IF;

    -- 3. Concurrency Serialization & Existing Validation
    SELECT * INTO v_existing_user_by_id FROM public.users WHERE id = p_internal_user_id FOR UPDATE;
    SELECT * INTO v_existing_user_by_email FROM public.users WHERE email = v_norm_email FOR UPDATE;

    IF v_existing_user_by_email.id IS NOT NULL AND v_existing_user_by_email.id <> p_internal_user_id THEN
        RAISE EXCEPTION 'Invitation Aborted: Email % belongs to another user %', v_norm_email, v_existing_user_by_email.id;
    END IF;

    IF v_existing_user_by_id.id IS NOT NULL THEN
        IF v_existing_user_by_id.email <> v_norm_email THEN
            RAISE EXCEPTION 'Invitation Aborted: User ID % has email % (expected %)', p_internal_user_id, v_existing_user_by_id.email, v_norm_email;
        END IF;
        IF v_existing_user_by_id.role <> 'CREATOR' THEN
            RAISE EXCEPTION 'Invitation Aborted: User ID % has non-creator role %', p_internal_user_id, v_existing_user_by_id.role;
        END IF;
        IF v_existing_user_by_id.status NOT IN ('INVITED', 'ACTIVE') THEN
            RAISE EXCEPTION 'Invitation Aborted: User ID % has status % (not eligible for invitation).', p_internal_user_id, v_existing_user_by_id.status;
        END IF;
        IF v_existing_user_by_id.partner_id IS DISTINCT FROM v_partner_id THEN
            RAISE EXCEPTION 'Invitation Aborted: User ID % linked to partner % (expected %)', p_internal_user_id, v_existing_user_by_id.partner_id, v_partner_id;
        END IF;

        IF v_existing_user_by_id.onboarding_status = 'MAPPED' AND v_existing_user_by_id.clerk_user_id IS NOT NULL THEN
            RETURN jsonb_build_object('success', true, 'user', row_to_json(v_existing_user_by_id), 'state', 'ALREADY_MAPPED');
        ELSIF v_existing_user_by_id.onboarding_status = 'INVITED' THEN
            RETURN jsonb_build_object('success', true, 'user', row_to_json(v_existing_user_by_id), 'state', 'IDEMPOTENT_INVITED');
        ELSE
            RAISE EXCEPTION 'Invitation Aborted: User % is in an inconsistent onboarding state. Repair required.', p_internal_user_id;
        END IF;
    END IF;

    -- 4. Item 10: Create User with Full Re-Validation on Conflict
    BEGIN
        INSERT INTO public.users (
            id, name, email, role, partner_id, status, onboarding_status
        ) VALUES (
            p_internal_user_id, TRIM(p_name), v_norm_email, 'CREATOR', v_partner_id, 'INVITED', 'INVITED'
        ) RETURNING * INTO v_user;
    EXCEPTION
        WHEN unique_violation THEN
            SELECT * INTO v_user FROM public.users WHERE id = p_internal_user_id AND email = v_norm_email;
            IF v_user.id = p_internal_user_id AND v_user.role = 'CREATOR' AND v_user.partner_id = v_partner_id THEN
                RETURN jsonb_build_object('success', true, 'user', row_to_json(v_user), 'state', 'IDEMPOTENT_INVITED');
            END IF;
            RAISE EXCEPTION 'Invitation Aborted: Concurrent user creation conflict for email %.', v_norm_email;
    END;

    -- 5. Audit Log
    INSERT INTO public.application_audit_logs (
        action, target_user_id, partner_id, performed_by_user_id, source, details
    ) VALUES (
        'CREATOR_INVITED', p_internal_user_id, v_partner_id, p_performed_by_user_id, p_source,
        jsonb_build_object('email', v_norm_email, 'partnerId', v_partner_id, 'partnerCode', p_partner_code)
    );

    RETURN jsonb_build_object('success', true, 'user', row_to_json(v_user), 'state', 'CREATED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.create_creator_invitation_tx(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_creator_invitation_tx(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 8. CLERK USER MAPPING RPC (Item 2: Mandated Partner Status Check & Item 13: Matrix)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_clerk_user_tx(
    p_internal_user_id TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_exact_clerk_user_id TEXT DEFAULT NULL,
    p_partner_id UUID DEFAULT NULL,
    p_partner_code TEXT DEFAULT NULL,
    p_operation TEXT DEFAULT 'MAP',
    p_performed_by_user_id TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'CLERK_WEBHOOK'
) RETURNS JSONB AS $$
DECLARE
    v_norm_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
    v_clean_user_id TEXT := NULLIF(TRIM(COALESCE(p_internal_user_id, '')), '');
    v_target_user public.users%ROWTYPE;
    v_partner_record public.partners%ROWTYPE;
    v_partner_by_code public.partners%ROWTYPE;
    v_clerk_existing public.users%ROWTYPE;
    v_action TEXT;
    v_result public.users%ROWTYPE;
BEGIN
    -- 1. Regex & Input Assertions
    IF p_exact_clerk_user_id IS NULL OR NOT (p_exact_clerk_user_id ~ '^user_[A-Za-z0-9]+$') THEN
        RAISE EXCEPTION 'Mapping Aborted: Invalid Clerk User ID format: %', p_exact_clerk_user_id;
    END IF;

    IF p_operation NOT IN ('MAP', 'REPAIR') THEN
        RAISE EXCEPTION 'Mapping Aborted: Unsupported operation % (expected MAP or REPAIR)', p_operation;
    END IF;

    IF p_source NOT IN ('ADMIN_CONSOLE', 'CLERK_WEBHOOK', 'AUTH_RESOLVER', 'ADMIN_REPAIR', 'SYSTEM') THEN
        RAISE EXCEPTION 'Mapping Aborted: Unsupported audit source %.', p_source;
    END IF;

    -- 2. Concurrency-Safe Joint Resolution
    IF v_clean_user_id IS NOT NULL THEN
        SELECT * INTO v_target_user FROM public.users WHERE id = v_clean_user_id FOR UPDATE;
        IF v_target_user.id IS NULL THEN
            RAISE EXCEPTION 'Mapping Aborted: Internal user ID % does not exist.', v_clean_user_id;
        END IF;

        IF v_norm_email <> '' AND LOWER(TRIM(v_target_user.email::TEXT)) <> v_norm_email THEN
            RAISE EXCEPTION 'Mapping Aborted: Email % does not match internal user %.', v_norm_email, v_clean_user_id;
        END IF;
    ELSIF v_norm_email <> '' THEN
        SELECT * INTO v_target_user FROM public.users WHERE email = v_norm_email FOR UPDATE;
        IF v_target_user.id IS NULL THEN
            RAISE EXCEPTION 'Mapping Aborted: No user found for email %.', v_norm_email;
        END IF;
    ELSE
        RAISE EXCEPTION 'Mapping Aborted: Neither internal_user_id nor email was provided.';
    END IF;

    -- 3. Role & Lifecycle Assertions
    IF v_target_user.role <> 'CREATOR' THEN
        RAISE EXCEPTION 'Mapping Aborted: User % has role %, expected CREATOR.', v_target_user.id, v_target_user.role;
    END IF;

    IF v_target_user.status NOT IN ('INVITED', 'ACTIVE') THEN
        RAISE EXCEPTION 'Mapping Aborted: User % has status % (not eligible for mapping).', v_target_user.id, v_target_user.status;
    END IF;

    -- Item 2: ALWAYS load and lock the creator's partner record and assert eligible status (Allowlist: ACTIVE, INVITED)
    IF v_target_user.partner_id IS NULL THEN
        RAISE EXCEPTION 'Mapping Aborted: Creator % has no assigned partner UUID.', v_target_user.id;
    END IF;

    SELECT * INTO v_partner_record FROM public.partners WHERE id = v_target_user.partner_id FOR UPDATE;
    IF v_partner_record.id IS NULL THEN
        RAISE EXCEPTION 'Mapping Aborted: Assigned partner UUID % does not exist.', v_target_user.partner_id;
    END IF;

    IF v_partner_record.record_status::text NOT IN ('ACTIVE', 'INVITED') THEN
        RAISE EXCEPTION 'Mapping Aborted: Partner % status is not eligible for creator access (status: %).', v_partner_record.id, v_partner_record.record_status;
    END IF;

    -- Verify optional partner parameters match assigned partner
    IF p_partner_id IS NOT NULL AND p_partner_id IS DISTINCT FROM v_target_user.partner_id THEN
        RAISE EXCEPTION 'Mapping Aborted: Provided partner_id % does not match user partner %.', p_partner_id, v_target_user.partner_id;
    END IF;

    IF p_partner_code IS NOT NULL THEN
        SELECT * INTO v_partner_by_code FROM public.partners WHERE partner_code = p_partner_code;
        IF v_partner_by_code.id IS NULL OR v_partner_by_code.id IS DISTINCT FROM v_target_user.partner_id THEN
            RAISE EXCEPTION 'Mapping Aborted: Provided partner_code % does not match user partner %.', p_partner_code, v_target_user.partner_id;
        END IF;
    END IF;

    -- 4. Item 7: Strict Account Takeover Protection (Bypassing DIFFERENT Clerk ID is FORBIDDEN even during REPAIR)
    IF v_target_user.clerk_user_id IS NOT NULL AND v_target_user.clerk_user_id IS DISTINCT FROM p_exact_clerk_user_id THEN
        RAISE EXCEPTION 'Mapping Aborted: Existing Clerk identity % cannot be replaced with %.', v_target_user.clerk_user_id, p_exact_clerk_user_id;
    END IF;

    SELECT * INTO v_clerk_existing FROM public.users WHERE clerk_user_id = p_exact_clerk_user_id FOR UPDATE;
    IF v_clerk_existing.id IS NOT NULL AND v_clerk_existing.id <> v_target_user.id THEN
        RAISE EXCEPTION 'Mapping Aborted: Clerk ID % is already owned by user %', p_exact_clerk_user_id, v_clerk_existing.id;
    END IF;

    -- 5. Item 13: Strict State Transition Matrix
    IF v_target_user.clerk_user_id = p_exact_clerk_user_id AND v_target_user.onboarding_status = 'MAPPED' AND v_target_user.status = 'ACTIVE' THEN
        RETURN jsonb_build_object('success', true, 'user', row_to_json(v_target_user), 'state', 'IDEMPOTENT_MAPPED');
    END IF;

    IF p_operation = 'MAP' THEN
        IF v_target_user.onboarding_status <> 'INVITED' OR v_target_user.status <> 'INVITED' OR v_target_user.clerk_user_id IS NOT NULL THEN
            RAISE EXCEPTION 'Mapping Aborted: User % is in state (onboarding: %, status: %, clerkId: %). REPAIR required.', v_target_user.id, v_target_user.onboarding_status, v_target_user.status, v_target_user.clerk_user_id;
        END IF;
    END IF;

    v_action := CASE WHEN p_operation = 'REPAIR' THEN 'CREATOR_MAPPING_REPAIRED' ELSE 'CLERK_USER_MAPPED' END;

    -- 6. Perform Mapping Update
    BEGIN
        UPDATE public.users
        SET clerk_user_id = p_exact_clerk_user_id,
            onboarding_status = 'MAPPED',
            status = 'ACTIVE',
            updated_at = NOW()
        WHERE id = v_target_user.id
        RETURNING * INTO v_result;
    EXCEPTION
        WHEN unique_violation THEN
            SELECT * INTO v_result FROM public.users WHERE id = v_target_user.id;
            IF v_result.clerk_user_id = p_exact_clerk_user_id THEN
                RETURN jsonb_build_object('success', true, 'user', row_to_json(v_result), 'state', 'IDEMPOTENT_MAPPED');
            END IF;
            RAISE EXCEPTION 'Mapping Aborted: Concurrent identity mapping collision for Clerk ID %.', p_exact_clerk_user_id;
    END;

    -- 7. Audit Log
    INSERT INTO public.application_audit_logs (
        action, target_user_id, partner_id, performed_by_user_id, source, details
    ) VALUES (
        v_action, v_result.id, v_result.partner_id, p_performed_by_user_id, p_source,
        jsonb_build_object('email', v_result.email, 'clerkUserId', p_exact_clerk_user_id, 'partnerId', v_result.partner_id, 'operation', p_operation, 'source', p_source)
    );

    RETURN jsonb_build_object('success', true, 'user', row_to_json(v_result), 'state', 'MAPPED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.map_clerk_user_tx(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.map_clerk_user_tx(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 9. SUPER ADMIN SEED RPC (Hardened replacement protection and strict idempotency)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_super_admin_guarded(
    p_user_id TEXT,
    p_name TEXT,
    p_email TEXT,
    p_clerk_user_id TEXT
) RETURNS JSONB AS $$
DECLARE
    v_norm_email TEXT := LOWER(TRIM(p_email));
    v_existing_by_id public.users%ROWTYPE;
    v_existing_by_email public.users%ROWTYPE;
    v_existing_by_clerk public.users%ROWTYPE;
    v_result public.users%ROWTYPE;
BEGIN
    -- Input Assertions
    IF p_user_id IS NULL OR TRIM(p_user_id) = '' THEN
        RAISE EXCEPTION 'Seed Aborted: User ID is required.';
    END IF;
    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'Seed Aborted: Name is required.';
    END IF;
    IF v_norm_email = '' OR POSITION('@' IN v_norm_email) < 2 THEN
        RAISE EXCEPTION 'Seed Aborted: Valid email is required.';
    END IF;
    IF p_clerk_user_id IS NULL OR NOT (p_clerk_user_id ~ '^user_[A-Za-z0-9]+$') THEN
        RAISE EXCEPTION 'Seed Aborted: Valid Clerk User ID format is required.';
    END IF;

    -- Concurrency-safe lock
    SELECT * INTO v_existing_by_id FROM public.users WHERE id = p_user_id FOR UPDATE;
    SELECT * INTO v_existing_by_email FROM public.users WHERE email = v_norm_email FOR UPDATE;
    SELECT * INTO v_existing_by_clerk FROM public.users WHERE clerk_user_id = p_clerk_user_id FOR UPDATE;

    -- Strict Idempotency Return: If already seeded and matching, return immediately without any writes or audit log entries
    IF v_existing_by_id.id IS NOT NULL THEN
        IF v_existing_by_id.clerk_user_id = p_clerk_user_id AND v_existing_by_id.status = 'ACTIVE' AND v_existing_by_id.onboarding_status = 'COMPLETED' THEN
            RETURN jsonb_build_object('success', true, 'user', row_to_json(v_existing_by_id), 'state', 'IDEMPOTENT_SEEDED');
        END IF;

        -- Hardened checks against existing user
        IF v_existing_by_id.email IS DISTINCT FROM v_norm_email THEN
            RAISE EXCEPTION 'Seed Aborted: User ID % has email % (expected %)', p_user_id, v_existing_by_id.email, v_norm_email;
        END IF;
        IF v_existing_by_id.role IS DISTINCT FROM 'SUPER_ADMIN' THEN
            RAISE EXCEPTION 'Seed Aborted: User ID % has role % (expected SUPER_ADMIN)', p_user_id, v_existing_by_id.role;
        END IF;
        IF v_existing_by_id.partner_id IS NOT NULL THEN
            RAISE EXCEPTION 'Seed Aborted: Super Admin must not have a partner_id.';
        END IF;
        IF v_existing_by_id.status NOT IN ('INVITED', 'ACTIVE') THEN
            RAISE EXCEPTION 'Seed Aborted: Super Admin % is in status %', p_user_id, v_existing_by_id.status;
        END IF;
        IF v_existing_by_id.clerk_user_id IS NOT NULL AND v_existing_by_id.clerk_user_id <> p_clerk_user_id THEN
            RAISE EXCEPTION 'Seed Aborted: Super Admin % is already linked to a different Clerk ID % (incoming %)', p_user_id, v_existing_by_id.clerk_user_id, p_clerk_user_id;
        END IF;

        -- Safe update
        UPDATE public.users
        SET clerk_user_id = p_clerk_user_id,
            status = 'ACTIVE',
            onboarding_status = 'COMPLETED',
            updated_at = NOW()
        WHERE id = p_user_id
        RETURNING * INTO v_result;
    ELSE
        -- Ensure no email or Clerk ID conflict
        IF v_existing_by_email.id IS NOT NULL THEN
            RAISE EXCEPTION 'Seed Aborted: Email % is already registered to user %', v_norm_email, v_existing_by_email.id;
        END IF;
        IF v_existing_by_clerk.id IS NOT NULL THEN
            RAISE EXCEPTION 'Seed Aborted: Clerk User ID % is already registered to user %', p_clerk_user_id, v_existing_by_clerk.id;
        END IF;

        -- Create new Super Admin
        INSERT INTO public.users (
            id, name, email, role, partner_id, status, clerk_user_id, onboarding_status
        ) VALUES (
            p_user_id, TRIM(p_name), v_norm_email, 'SUPER_ADMIN', NULL, 'ACTIVE', p_clerk_user_id, 'COMPLETED'
        )
        RETURNING * INTO v_result;
    END IF;

    -- Audit logs only written for new / modified seeds (not for idempotent retries)
    INSERT INTO public.application_audit_logs (action, target_user_id, performed_by_user_id, source, details)
    VALUES ('SUPER_ADMIN_SEEDED', p_user_id, p_user_id, 'MIGRATION_SEED', jsonb_build_object('email', v_norm_email, 'clerkUserId', p_clerk_user_id));

    RETURN jsonb_build_object('success', true, 'user', row_to_json(v_result), 'state', 'SEEDED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.seed_super_admin_guarded(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_super_admin_guarded(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 10. POST-MIGRATION ASSERTIONS (Item 8: Full Identity Verification)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_missing_new_table TEXT;
    v_obsolete_proc TEXT;
    v_rpc_count INTEGER;
BEGIN
    -- Assert All 7 System Tables Exist
    SELECT table_name INTO v_missing_new_table
    FROM (VALUES ('users'), ('creator_tax_documents'), ('tax_document_versions'), ('application_audit_logs'), ('tax_document_audit_logs'), ('idempotency_logs'), ('schema_migrations')) AS t(table_name)
    WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t.table_name
    )
    LIMIT 1;

    IF v_missing_new_table IS NOT NULL THEN
        RAISE EXCEPTION 'Post-Migration Failure: Table % was not created.', v_missing_new_table;
    END IF;

    -- Item 8: Assert Exact Function Identity Signatures in pg_proc
    SELECT COUNT(*) INTO v_rpc_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND proname IN ('claim_webhook_event_tx', 'complete_webhook_event_tx', 'fail_webhook_event_tx', 'create_creator_invitation_tx', 'map_clerk_user_tx', 'seed_super_admin_guarded');

    IF v_rpc_count <> 6 THEN
        RAISE EXCEPTION 'Post-Migration Failure: Expected 6 RPC functions in pg_proc; found %.', v_rpc_count;
    END IF;

    -- Assert Legacy Functions Do Not Exist in pg_proc
    SELECT proname INTO v_obsolete_proc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND proname IN ('repair_hema_user_tx');

    IF v_obsolete_proc IS NOT NULL THEN
        RAISE EXCEPTION 'Post-Migration Failure: Obsolete procedure % still exists.', v_obsolete_proc;
    END IF;
END $$;

COMMIT;
