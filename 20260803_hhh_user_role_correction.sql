-- ==============================================================================
-- HHH MIGRATION: 20260803_hhh_user_role_correction.sql
-- Description: Incremental migration to update public.users role CHECK constraint,
--              enforce role-based partner scoping, replace RPC function with p_role parameter,
--              audit role corrections, and validate preflight/postflight assertions.
-- Pre-conditions: 20260731_hhh_final_production_migration must be applied.
-- Post-conditions: All 5 user roles supported, admin partner_id IS NULL enforced,
--                  tenant partner_id IS NOT NULL enforced, existing rows updated & audited.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PREFLIGHT CHECKS & STRICT PARTNER PREFLIGHT VERIFICATION
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_has_schema_migrations BOOLEAN;
    v_prev_migration_applied BOOLEAN;
    v_this_migration_applied BOOLEAN;
    v_has_users_table BOOLEAN;
    v_megan_partner_valid BOOLEAN;
    v_lucy_partner_valid BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'schema_migrations'
    ) INTO v_has_schema_migrations;

    IF NOT v_has_schema_migrations THEN
        RAISE EXCEPTION 'Preflight Failure: schema_migrations table does not exist.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.schema_migrations 
        WHERE version = '20260731_hhh_final_production_migration'
    ) INTO v_prev_migration_applied;

    IF NOT v_prev_migration_applied THEN
        RAISE EXCEPTION 'Preflight Failure: 20260731_hhh_final_production_migration has not been executed.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.schema_migrations 
        WHERE version = '20260803_hhh_user_role_correction'
    ) INTO v_this_migration_applied;

    IF v_this_migration_applied THEN
        RAISE EXCEPTION 'Preflight Failure: Migration 20260803_hhh_user_role_correction has already been applied.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
    ) INTO v_has_users_table;

    IF NOT v_has_users_table THEN
        RAISE EXCEPTION 'Preflight Failure: public.users table does not exist.';
    END IF;

    -- Strict Partner Preflight Check for Megan (UUID: 00000000-0000-0000-0000-000000000001)
    SELECT EXISTS (
        SELECT 1 FROM public.partners 
        WHERE id = '00000000-0000-0000-0000-000000000001'::uuid 
          AND LOWER(contact_email) = 'megan@megsbrass.com'
          AND UPPER(partner_code) = 'PARTNER_001'
          AND LOWER(status::text) IN ('active', 'invited')
    ) INTO v_megan_partner_valid;

    IF NOT v_megan_partner_valid THEN
        RAISE EXCEPTION 'Preflight Failure: Partner UUID 00000000-0000-0000-0000-000000000001 does not strictly match contact_email megan@megsbrass.com AND partner_code PARTNER_001.';
    END IF;

    -- Strict Partner Preflight Check for Lucy (UUID: 00000000-0000-0000-0000-000000000002)
    SELECT EXISTS (
        SELECT 1 FROM public.partners 
        WHERE id = '00000000-0000-0000-0000-000000000002'::uuid 
          AND LOWER(contact_email) = 'lucy@escapes.com'
          AND UPPER(partner_code) = 'PARTNER_002'
          AND LOWER(status::text) IN ('active', 'invited')
    ) INTO v_lucy_partner_valid;

    IF NOT v_lucy_partner_valid THEN
        RAISE EXCEPTION 'Preflight Failure: Partner UUID 00000000-0000-0000-0000-000000000002 does not strictly match contact_email lucy@escapes.com AND partner_code PARTNER_002.';
    END IF;

    RAISE NOTICE 'Preflight Passed: Schema state and strict partner preflight validations passed.';
END $$;

-- ------------------------------------------------------------------------------
-- 2. UPDATE PUBLIC.USERS ROLE CHECK CONSTRAINT
-- ------------------------------------------------------------------------------
-- Drop existing users_role_check constraint to allow updating rows to new roles
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Dynamically find and drop any remaining role CHECK constraint on public.users
    FOR r IN (
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu 
          ON tc.constraint_name = ccu.constraint_name 
         AND tc.table_schema = ccu.table_schema
        WHERE tc.table_schema = 'public' 
          AND tc.table_name = 'users' 
          AND tc.constraint_type = 'CHECK'
          AND ccu.column_name = 'role'
    ) LOOP
        EXECUTE 'ALTER TABLE public.users DROP CONSTRAINT ' || quote_ident(r.constraint_name);
        RAISE NOTICE 'Dropped old users role constraint: %', r.constraint_name;
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 3. CORRECT EXISTING PERSISTED ROWS & AUDIT LOGGING
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_fin_user public.users%ROWTYPE;
    v_meg_user public.users%ROWTYPE;
    v_luc_user public.users%ROWTYPE;
BEGIN
    -- A. Correct user-finance-1
    SELECT * INTO v_fin_user FROM public.users WHERE id = 'user-finance-1';
    IF FOUND THEN
        UPDATE public.users
        SET role = 'FINANCE_ADMIN', partner_id = NULL, updated_at = NOW()
        WHERE id = 'user-finance-1';

        INSERT INTO public.application_audit_logs (
            action, target_user_id, partner_id, performed_by_user_id, source, details
        ) VALUES (
            'ROLE_AND_SCOPE_CORRECTED', 'user-finance-1', NULL, 'user-admin-1', 'MIGRATION',
            jsonb_build_object(
                'migration', '20260803_hhh_user_role_correction',
                'previous_role', v_fin_user.role,
                'new_role', 'FINANCE_ADMIN',
                'previous_partner_id', v_fin_user.partner_id,
                'new_partner_id', NULL
            )
        );
    END IF;

    -- B. Correct user-partner-megan
    SELECT * INTO v_meg_user FROM public.users WHERE id = 'user-partner-megan';
    IF FOUND THEN
        UPDATE public.users
        SET role = 'PARTNER_OWNER', partner_id = '00000000-0000-0000-0000-000000000001'::uuid, updated_at = NOW()
        WHERE id = 'user-partner-megan';

        INSERT INTO public.application_audit_logs (
            action, target_user_id, partner_id, performed_by_user_id, source, details
        ) VALUES (
            'ROLE_AND_SCOPE_CORRECTED', 'user-partner-megan', '00000000-0000-0000-0000-000000000001'::uuid, 'user-admin-1', 'MIGRATION',
            jsonb_build_object(
                'migration', '20260803_hhh_user_role_correction',
                'previous_role', v_meg_user.role,
                'new_role', 'PARTNER_OWNER',
                'previous_partner_id', v_meg_user.partner_id,
                'new_partner_id', '00000000-0000-0000-0000-000000000001'::uuid
            )
        );
    END IF;

    -- C. Correct user-partner-lucy
    SELECT * INTO v_luc_user FROM public.users WHERE id = 'user-partner-lucy';
    IF FOUND THEN
        UPDATE public.users
        SET role = 'PARTNER_OWNER', partner_id = '00000000-0000-0000-0000-000000000002'::uuid, updated_at = NOW()
        WHERE id = 'user-partner-lucy';

        INSERT INTO public.application_audit_logs (
            action, target_user_id, partner_id, performed_by_user_id, source, details
        ) VALUES (
            'ROLE_AND_SCOPE_CORRECTED', 'user-partner-lucy', '00000000-0000-0000-0000-000000000002'::uuid, 'user-admin-1', 'MIGRATION',
            jsonb_build_object(
                'migration', '20260803_hhh_user_role_correction',
                'previous_role', v_luc_user.role,
                'new_role', 'PARTNER_OWNER',
                'previous_partner_id', v_luc_user.partner_id,
                'new_partner_id', '00000000-0000-0000-0000-000000000002'::uuid
            )
        );
    END IF;
END $$;

-- Add updated role CHECK constraint allowing all 5 application roles
ALTER TABLE public.users ADD CONSTRAINT chk_users_role 
    CHECK (role IN ('SUPER_ADMIN', 'FINANCE_ADMIN', 'ADMIN', 'PARTNER_OWNER', 'CREATOR'));

-- ------------------------------------------------------------------------------
-- 4. ENFORCE ROLE-BASED PARTNER ASSIGNMENT CONSTRAINT
-- ------------------------------------------------------------------------------
-- Admin roles (SUPER_ADMIN, FINANCE_ADMIN, ADMIN) must have partner_id IS NULL.
-- Tenant roles (PARTNER_OWNER, CREATOR) must have partner_id IS NOT NULL.
ALTER TABLE public.users ADD CONSTRAINT chk_users_role_partner_scope
    CHECK (
        (role IN ('SUPER_ADMIN', 'FINANCE_ADMIN', 'ADMIN') AND partner_id IS NULL) OR
        (role IN ('PARTNER_OWNER', 'CREATOR') AND partner_id IS NOT NULL)
    );

-- ------------------------------------------------------------------------------
-- 5. REPLACE CREATOR INVITATION RPC SAFELY (EXPLICIT DROP & RE-CREATE)
-- ------------------------------------------------------------------------------
-- Drop old 7-parameter function signature
DROP FUNCTION IF EXISTS public.create_creator_invitation_tx(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT);

-- Create new 8-parameter RPC function signature supporting p_role
CREATE OR REPLACE FUNCTION public.create_creator_invitation_tx(
    p_internal_user_id TEXT,
    p_name TEXT,
    p_email TEXT,
    p_partner_id UUID DEFAULT NULL,
    p_partner_code TEXT DEFAULT NULL,
    p_performed_by_user_id TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'ADMIN_CONSOLE',
    p_role TEXT DEFAULT 'CREATOR'
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
    v_target_role TEXT := UPPER(TRIM(COALESCE(p_role, 'CREATOR')));
BEGIN
    -- 1. Input Assertions
    IF p_internal_user_id IS NULL OR TRIM(p_internal_user_id) = '' THEN
        RAISE EXCEPTION 'Invitation Aborted: Internal user ID is required.';
    END IF;
    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'Invitation Aborted: User name is required.';
    END IF;
    IF v_norm_email = '' OR POSITION('@' IN v_norm_email) < 2 THEN
        RAISE EXCEPTION 'Invitation Aborted: A valid email address is required.';
    END IF;
    IF p_source NOT IN ('ADMIN_CONSOLE', 'CLERK_WEBHOOK', 'AUTH_RESOLVER', 'ADMIN_REPAIR', 'SYSTEM') THEN
        RAISE EXCEPTION 'Invitation Aborted: Unsupported audit source %.', p_source;
    END IF;
    IF v_target_role NOT IN ('SUPER_ADMIN', 'FINANCE_ADMIN', 'ADMIN', 'PARTNER_OWNER', 'CREATOR') THEN
        RAISE EXCEPTION 'Invitation Aborted: Invalid role %.', v_target_role;
    END IF;

    -- 2. Role-Based Partner Assignment Scoping & Explicit Partner Rejection for Admins
    IF v_target_role IN ('SUPER_ADMIN', 'FINANCE_ADMIN', 'ADMIN') THEN
        IF p_partner_id IS NOT NULL OR p_partner_code IS NOT NULL THEN
            RAISE EXCEPTION 'Invitation Aborted: Admin roles (SUPER_ADMIN, FINANCE_ADMIN, ADMIN) cannot be assigned to a partner.';
        END IF;
        v_partner_id := NULL;
    ELSIF v_target_role IN ('PARTNER_OWNER', 'CREATOR') THEN
        IF p_partner_id IS NOT NULL THEN
            SELECT * INTO v_partner_by_id FROM public.partners WHERE id = p_partner_id;
            IF v_partner_by_id.id IS NULL THEN
                RAISE EXCEPTION 'Invitation Aborted: Partner ID % does not exist.', p_partner_id;
            END IF;
            IF LOWER(v_partner_by_id.status::text) NOT IN ('active', 'invited') THEN
                RAISE EXCEPTION 'Invitation Aborted: Partner % status is not eligible for tenant access (status: %).', p_partner_id, v_partner_by_id.status;
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
            IF LOWER(v_partner_by_code.status::text) NOT IN ('active', 'invited') THEN
                RAISE EXCEPTION 'Invitation Aborted: Partner code % status is not eligible for tenant access (status: %).', p_partner_code, v_partner_by_code.status;
            END IF;

            IF v_partner_id IS NOT NULL AND v_partner_id IS DISTINCT FROM v_partner_by_code.id THEN
                RAISE EXCEPTION 'Invitation Aborted: Provided partner_id % and partner_code % resolve to different partners.', p_partner_id, p_partner_code;
            END IF;
            v_partner_id := v_partner_by_code.id;
        END IF;

        IF v_partner_id IS NULL THEN
            RAISE EXCEPTION 'Invitation Aborted: Tenant roles (PARTNER_OWNER, CREATOR) require a valid partner_id or partner_code.';
        END IF;
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

        -- If user is already MAPPED or has a populated clerk_user_id
        IF v_existing_user_by_id.clerk_user_id IS NOT NULL OR v_existing_user_by_id.onboarding_status = 'MAPPED' THEN
            IF v_existing_user_by_id.role <> v_target_role OR v_existing_user_by_id.partner_id IS DISTINCT FROM v_partner_id THEN
                RAISE EXCEPTION 'Invitation Aborted: User % is already mapped to Clerk ID %. Administrative repair flow required to modify role or partner scope.', p_internal_user_id, v_existing_user_by_id.clerk_user_id;
            END IF;
            RETURN jsonb_build_object('success', true, 'user', row_to_json(v_existing_user_by_id), 'state', 'ALREADY_MAPPED');
        END IF;

        -- For an INVITED user with clerk_user_id IS NULL:
        IF v_existing_user_by_id.onboarding_status = 'INVITED' OR v_existing_user_by_id.status = 'INVITED' THEN
            IF v_existing_user_by_id.role <> v_target_role OR v_existing_user_by_id.partner_id IS DISTINCT FROM v_partner_id THEN
                UPDATE public.users
                SET role = v_target_role, partner_id = v_partner_id, updated_at = NOW()
                WHERE id = p_internal_user_id
                RETURNING * INTO v_user;

                INSERT INTO public.application_audit_logs (
                    action, target_user_id, partner_id, performed_by_user_id, source, details
                ) VALUES (
                    'USER_INVITATION_UPDATED', p_internal_user_id, v_partner_id, p_performed_by_user_id, p_source,
                    jsonb_build_object('email', v_norm_email, 'previous_role', v_existing_user_by_id.role, 'new_role', v_target_role, 'previous_partner_id', v_existing_user_by_id.partner_id, 'new_partner_id', v_partner_id)
                );

                RETURN jsonb_build_object('success', true, 'user', row_to_json(v_user), 'state', 'INVITATION_UPDATED');
            ELSE
                RETURN jsonb_build_object('success', true, 'user', row_to_json(v_existing_user_by_id), 'state', 'IDEMPOTENT_INVITED');
            END IF;
        END IF;

        RAISE EXCEPTION 'Invitation Aborted: User % is in an inconsistent onboarding state (status: %, onboarding_status: %). Repair required.', p_internal_user_id, v_existing_user_by_id.status, v_existing_user_by_id.onboarding_status;
    END IF;

    -- 4. Create User with Specified Role and Partner Scope
    BEGIN
        INSERT INTO public.users (
            id, name, email, role, partner_id, status, onboarding_status
        ) VALUES (
            p_internal_user_id, TRIM(p_name), v_norm_email, v_target_role, v_partner_id, 'INVITED', 'INVITED'
        ) RETURNING * INTO v_user;
    EXCEPTION
        WHEN unique_violation THEN
            SELECT * INTO v_user FROM public.users WHERE id = p_internal_user_id AND email = v_norm_email;
            IF v_user.id = p_internal_user_id THEN
                RETURN jsonb_build_object('success', true, 'user', row_to_json(v_user), 'state', 'IDEMPOTENT_INVITED');
            END IF;
            RAISE EXCEPTION 'Invitation Aborted: Concurrent user creation conflict for email %.', v_norm_email;
    END;

    -- 5. Audit Log
    INSERT INTO public.application_audit_logs (
        action, target_user_id, partner_id, performed_by_user_id, source, details
    ) VALUES (
        'USER_INVITED', p_internal_user_id, v_partner_id, p_performed_by_user_id, p_source,
        jsonb_build_object('email', v_norm_email, 'role', v_target_role, 'partnerId', v_partner_id)
    );

    RETURN jsonb_build_object('success', true, 'user', row_to_json(v_user), 'state', 'CREATED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.create_creator_invitation_tx(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_creator_invitation_tx(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 6. STRENGTHENED POST-MIGRATION USER ASSERTIONS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_rpc_overloads INTEGER;
    v_has_role_chk BOOLEAN;
    v_has_partner_scope_chk BOOLEAN;
    v_fin_user public.users%ROWTYPE;
    v_meg_user public.users%ROWTYPE;
    v_luc_user public.users%ROWTYPE;
    v_fin_count INTEGER;
    v_meg_count INTEGER;
    v_luc_count INTEGER;
BEGIN
    -- Assert pg_proc has exactly 1 overload for create_creator_invitation_tx
    SELECT COUNT(*) INTO v_rpc_overloads
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_creator_invitation_tx';

    IF v_rpc_overloads <> 1 THEN
        RAISE EXCEPTION 'Post-Migration Failure: Found % overloads for create_creator_invitation_tx (expected 1).', v_rpc_overloads;
    END IF;

    -- Assert constraints exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'users' AND constraint_name = 'chk_users_role'
    ) INTO v_has_role_chk;

    IF NOT v_has_role_chk THEN
        RAISE EXCEPTION 'Post-Migration Failure: Constraint chk_users_role was not created.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'users' AND constraint_name = 'chk_users_role_partner_scope'
    ) INTO v_has_partner_scope_chk;

    IF NOT v_has_partner_scope_chk THEN
        RAISE EXCEPTION 'Post-Migration Failure: Constraint chk_users_role_partner_scope was not created.';
    END IF;

    -- 1. Assert user-finance-1 exact row existence & role/partner validation
    SELECT COUNT(*) INTO v_fin_count FROM public.users WHERE id = 'user-finance-1';
    IF v_fin_count <> 1 THEN
        RAISE EXCEPTION 'Post-Migration Failure: Required user row user-finance-1 missing (found % rows).', v_fin_count;
    END IF;

    SELECT * INTO v_fin_user FROM public.users WHERE id = 'user-finance-1';
    IF v_fin_user.role <> 'FINANCE_ADMIN' OR v_fin_user.partner_id IS NOT NULL THEN
        RAISE EXCEPTION 'Post-Migration Failure: user-finance-1 role/partner mismatch (role: %, partner: %).', v_fin_user.role, v_fin_user.partner_id;
    END IF;

    -- 2. Assert user-partner-megan exact row existence & role/partner validation
    SELECT COUNT(*) INTO v_meg_count FROM public.users WHERE id = 'user-partner-megan';
    IF v_meg_count <> 1 THEN
        RAISE EXCEPTION 'Post-Migration Failure: Required user row user-partner-megan missing (found % rows).', v_meg_count;
    END IF;

    SELECT * INTO v_meg_user FROM public.users WHERE id = 'user-partner-megan';
    IF v_meg_user.role <> 'PARTNER_OWNER' OR v_meg_user.partner_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::uuid THEN
        RAISE EXCEPTION 'Post-Migration Failure: user-partner-megan role/partner mismatch (role: %, partner: %).', v_meg_user.role, v_meg_user.partner_id;
    END IF;

    -- 3. Assert user-partner-lucy exact row existence & role/partner validation
    SELECT COUNT(*) INTO v_luc_count FROM public.users WHERE id = 'user-partner-lucy';
    IF v_luc_count <> 1 THEN
        RAISE EXCEPTION 'Post-Migration Failure: Required user row user-partner-lucy missing (found % rows).', v_luc_count;
    END IF;

    SELECT * INTO v_luc_user FROM public.users WHERE id = 'user-partner-lucy';
    IF v_luc_user.role <> 'PARTNER_OWNER' OR v_luc_user.partner_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000002'::uuid THEN
        RAISE EXCEPTION 'Post-Migration Failure: user-partner-lucy role/partner mismatch (role: %, partner: %).', v_luc_user.role, v_luc_user.partner_id;
    END IF;

    RAISE NOTICE 'Post-Migration Assertions Passed: Role correction migration successfully completed.';
END $$;

-- ------------------------------------------------------------------------------
-- 7. RECORD SCHEMA MIGRATION VERSION
-- ------------------------------------------------------------------------------
INSERT INTO public.schema_migrations (version)
VALUES ('20260803_hhh_user_role_correction');

COMMIT;
