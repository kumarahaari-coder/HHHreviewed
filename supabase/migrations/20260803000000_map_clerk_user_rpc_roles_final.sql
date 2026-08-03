-- ==============================================================================
-- HHH MIGRATION: 20260803000000_map_clerk_user_rpc_roles_final.sql
-- Description: Incremental migration updating map_clerk_user_tx RPC to support
--              SUPER_ADMIN, FINANCE_ADMIN, ADMIN, PARTNER_OWNER, and CREATOR.
-- ==============================================================================

BEGIN;

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
    v_clerk_existing public.users%ROWTYPE;
    v_action TEXT;
    v_result public.users%ROWTYPE;
BEGIN
    -- 1. Input Assertions & Regex Validation
    IF p_exact_clerk_user_id IS NULL OR NOT (p_exact_clerk_user_id ~ '^user_[A-Za-z0-9]+$') THEN
        RAISE EXCEPTION 'Mapping Aborted: Invalid Clerk User ID format: %', p_exact_clerk_user_id;
    END IF;

    IF p_operation NOT IN ('MAP', 'REPAIR') THEN
        RAISE EXCEPTION 'Mapping Aborted: Unsupported operation % (expected MAP or REPAIR)', p_operation;
    END IF;

    IF p_source NOT IN ('ADMIN_CONSOLE', 'CLERK_WEBHOOK', 'AUTH_RESOLVER', 'ADMIN_REPAIR', 'SYSTEM') THEN
        RAISE EXCEPTION 'Mapping Aborted: Unsupported audit source %.', p_source;
    END IF;

    -- 2. Concurrency-Safe Joint User Resolution
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

    -- 3. Role Assertions: Support SUPER_ADMIN, FINANCE_ADMIN, ADMIN, PARTNER_OWNER, CREATOR
    IF v_target_user.role NOT IN ('SUPER_ADMIN', 'FINANCE_ADMIN', 'ADMIN', 'PARTNER_OWNER', 'CREATOR') THEN
        RAISE EXCEPTION 'Mapping Aborted: User % has invalid role %.', v_target_user.id, v_target_user.role;
    END IF;

    -- 4. Status Guard: Reject SUSPENDED or ARCHIVED users
    IF v_target_user.status NOT IN ('INVITED', 'ACTIVE') THEN
        RAISE EXCEPTION 'Mapping Aborted: User % has status % (not eligible for mapping).', v_target_user.id, v_target_user.status;
    END IF;

    -- 5. Tenant Scoping: Require valid partner_id for PARTNER_OWNER and CREATOR
    IF v_target_user.role IN ('PARTNER_OWNER', 'CREATOR') THEN
        IF v_target_user.partner_id IS NULL THEN
            RAISE EXCEPTION 'Mapping Aborted: Tenant user % requires a valid partner_id.', v_target_user.id;
        END IF;

        SELECT * INTO v_partner_record FROM public.partners WHERE id = v_target_user.partner_id FOR UPDATE;
        IF v_partner_record.id IS NULL THEN
            RAISE EXCEPTION 'Mapping Aborted: Assigned partner UUID % does not exist.', v_target_user.partner_id;
        END IF;

        IF LOWER(v_partner_record.status::text) NOT IN ('active', 'invited') THEN
            RAISE EXCEPTION 'Mapping Aborted: Partner % status is not eligible for tenant access (status: %).', v_partner_record.id, v_partner_record.status;
        END IF;
    END IF;

    -- 6. Account Takeover Protection & Conflict Checks
    IF v_target_user.clerk_user_id IS NOT NULL AND v_target_user.clerk_user_id IS DISTINCT FROM p_exact_clerk_user_id THEN
        RAISE EXCEPTION 'Mapping Aborted: Existing Clerk identity % cannot be replaced with %.', v_target_user.clerk_user_id, p_exact_clerk_user_id;
    END IF;

    SELECT * INTO v_clerk_existing FROM public.users WHERE clerk_user_id = p_exact_clerk_user_id FOR UPDATE;
    IF v_clerk_existing.id IS NOT NULL AND v_clerk_existing.id <> v_target_user.id THEN
        RAISE EXCEPTION 'Mapping Aborted: Clerk User ID % is already assigned to application user %.', p_exact_clerk_user_id, v_clerk_existing.id;
    END IF;

    -- 7. Idempotent Identity Binding
    IF v_target_user.clerk_user_id = p_exact_clerk_user_id AND v_target_user.onboarding_status = 'MAPPED' THEN
        v_action := 'IDEMPOTENT_NOOP';
        v_result := v_target_user;
    ELSE
        UPDATE public.users
        SET clerk_user_id = p_exact_clerk_user_id,
            onboarding_status = 'MAPPED',
            status = CASE WHEN status = 'INVITED' THEN 'ACTIVE' ELSE status END,
            updated_at = NOW()
        WHERE id = v_target_user.id
        RETURNING * INTO v_result;

        v_action := 'MAPPED_NEW_CLERK_ID';
    END IF;

    -- 8. Audit Logging
    INSERT INTO public.application_audit_logs (
        action, target_user_id, partner_id, performed_by_user_id, source, details
    ) VALUES (
        'USER_CLERK_IDENTITY_MAPPED',
        v_result.id,
        v_result.partner_id,
        COALESCE(p_performed_by_user_id, 'SYSTEM'),
        p_source,
        jsonb_build_object(
            'email', v_result.email,
            'role', v_result.role,
            'clerkUserId', p_exact_clerk_user_id,
            'mappingAction', v_action,
            'operation', p_operation
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'action', v_action,
        'user', row_to_json(v_result)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.map_clerk_user_tx(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.map_clerk_user_tx(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('20260803000000_map_clerk_user_rpc_roles_final')
ON CONFLICT (version) DO NOTHING;

COMMIT;
