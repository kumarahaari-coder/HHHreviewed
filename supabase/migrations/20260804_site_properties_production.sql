-- ==============================================================================
-- HIDDEN HONEY HOMES - MULTI-PROPERTY SITE MAPPING & RPC TRANSACTION MIGRATION
-- Migration Version: 20260804_site_properties_production.sql
-- Strategy: Production-safe, non-destructive migration creating public.site_properties
-- Scope: ONLY site_properties table, create_referral_site_tx RPC, security & indexes
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PREFLIGHT ASSERTIONS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_prop_count INTEGER;
    v_sites_exists BOOLEAN;
BEGIN
    -- Verify 4 Core Active Properties exist in public.properties by exact live UUIDs
    SELECT COUNT(*) INTO v_prop_count
    FROM public.properties
    WHERE id IN (
        '38d9159e-a35d-405e-826e-7381ad3c3197'::UUID, -- Uptown St. Augustine
        'f0fb867d-47cd-47d4-afa6-c4bf226c1768'::UUID, -- Downtown St. Augustine (Lincoln)
        '51be6158-268d-4c96-8f0b-9968f544ddfa'::UUID, -- Ellsworth, Maine
        '55791a54-b1a3-459e-bbd5-9073a418b774'::UUID  -- Beech Mountain, North Carolina
    ) AND status = 'active';

    IF v_prop_count <> 4 THEN
        RAISE EXCEPTION 'Preflight Aborted: Expected 4 active core production properties; found %.', v_prop_count;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'sites'
    ) INTO v_sites_exists;

    IF NOT v_sites_exists THEN
        RAISE EXCEPTION 'Preflight Aborted: Table public.sites does not exist.';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. CREATE PUBLIC.SITE_PROPERTIES JUNCTION TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
    hospitable_widget_id TEXT NOT NULL,
    custom_booking_url TEXT,
    status public.record_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_site_property UNIQUE (site_id, property_id)
);

-- Indexes for fast foreign key lookups
CREATE INDEX IF NOT EXISTS idx_site_properties_site_id ON public.site_properties(site_id);
CREATE INDEX IF NOT EXISTS idx_site_properties_property_id ON public.site_properties(property_id);

-- Apply updated_at trigger if trigger function exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_column') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger tg 
            JOIN pg_class c ON c.oid = tg.tgrelid 
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'site_properties' AND tg.tgname = 'trigger_set_site_properties_updated_at'
        ) THEN
            CREATE TRIGGER trigger_set_site_properties_updated_at 
                BEFORE UPDATE ON public.site_properties 
                FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();
        END IF;
    END IF;
END $$;

-- RLS Hardening & Grants
ALTER TABLE public.site_properties ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.site_properties FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_properties TO service_role;

-- ------------------------------------------------------------------------------
-- 3. HARDENED TRANSACTIONAL SITE CREATION RPC (create_referral_site_tx)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_referral_site_tx(
    p_partner_id UUID,
    p_site_name TEXT,
    p_website_url TEXT,
    p_tracking_code TEXT,
    p_mappings JSONB -- JSON array of exactly 4 mappings: [{ "property_id": "<UUID>", "hospitable_widget_id": "<string>" }, ...]
) RETURNS JSONB AS $$
DECLARE
    v_partner_status public.record_status;
    v_site_id UUID;
    v_site_code TEXT;
    v_clean_url TEXT;
    v_clean_code TEXT;
    v_item JSONB;
    v_prop_id UUID;
    v_widget_id TEXT;
    v_seen_widgets TEXT[] := ARRAY[]::TEXT[];
    v_prop_count INT;
BEGIN
    -- Assert 1: Partner exists and is active
    SELECT status INTO v_partner_status FROM public.partners WHERE id = p_partner_id;
    IF v_partner_status IS NULL OR v_partner_status <> 'active' THEN
        RAISE EXCEPTION 'Site Registration Aborted: Partner % does not exist or is not active.', p_partner_id;
    END IF;

    -- Assert 2: Inputs non-empty & valid URL/code
    IF COALESCE(TRIM(p_site_name), '') = '' OR COALESCE(TRIM(p_website_url), '') = '' OR COALESCE(TRIM(p_tracking_code), '') = '' THEN
        RAISE EXCEPTION 'Site Registration Aborted: Site name, website URL, and tracking code are required.';
    END IF;

    v_clean_url := LOWER(TRIM(p_website_url));
    IF NOT (v_clean_url LIKE 'http://%' OR v_clean_url LIKE 'https://%') THEN
        v_clean_url := 'https://' || v_clean_url;
    END IF;

    v_clean_code := UPPER(TRIM(p_tracking_code));
    v_site_code := 'SITE_' || v_clean_code;

    -- Assert 3: Unique tracking code
    IF EXISTS (SELECT 1 FROM public.sites WHERE UPPER(tracking_code) = v_clean_code OR UPPER(site_code) = v_site_code) THEN
        RAISE EXCEPTION 'Site Registration Aborted: Tracking code "%" is already registered.', v_clean_code;
    END IF;

    -- Assert 4: Exactly 4 mappings supplied
    IF p_mappings IS NULL OR jsonb_array_length(p_mappings) <> 4 THEN
        RAISE EXCEPTION 'Site Registration Aborted: Registration requires exactly 4 valid property widget mappings.';
    END IF;

    -- Insert main public.sites row
    INSERT INTO public.sites (
        partner_id,
        site_code,
        site_name,
        website_url,
        tracking_code,
        status
    ) VALUES (
        p_partner_id,
        v_site_code,
        TRIM(p_site_name),
        v_clean_url,
        v_clean_code,
        'active'::public.record_status
    ) RETURNING id INTO v_site_id;

    -- Loop through and validate each mapping
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_mappings) LOOP
        v_prop_id := (v_item->>'property_id')::UUID;
        v_widget_id := TRIM(COALESCE(v_item->>'hospitable_widget_id', ''));

        -- Assert property_id matches one of the 4 live core production properties
        IF v_prop_id NOT IN (
            '38d9159e-a35d-405e-826e-7381ad3c3197'::UUID, -- Uptown St. Augustine
            'f0fb867d-47cd-47d4-afa6-c4bf226c1768'::UUID, -- Downtown St. Augustine (Lincoln)
            '51be6158-268d-4c96-8f0b-9968f544ddfa'::UUID, -- Ellsworth, Maine
            '55791a54-b1a3-459e-bbd5-9073a418b774'::UUID  -- Beech Mountain, NC
        ) THEN
            RAISE EXCEPTION 'Site Registration Aborted: Invalid property UUID "%". Must match one of the 4 core production properties.', v_prop_id;
        END IF;

        -- Assert non-empty, non-placeholder widget ID
        IF v_widget_id = '' OR LOWER(v_widget_id) IN ('widget_1', 'widget_2', 'test', 'dummy', 'placeholder', 'xxx', 'none') THEN
            RAISE EXCEPTION 'Site Registration Aborted: Invalid widget ID "%" for property "%". Real production widget IDs are required.', v_widget_id, v_prop_id;
        END IF;

        -- Assert distinct widget IDs within the website
        IF v_widget_id = ANY(v_seen_widgets) THEN
            RAISE EXCEPTION 'Site Registration Aborted: Duplicate widget ID "%" submitted within the same website.', v_widget_id;
        END IF;
        v_seen_widgets := array_append(v_seen_widgets, v_widget_id);

        -- Insert site_properties row
        INSERT INTO public.site_properties (
            site_id,
            property_id,
            hospitable_widget_id,
            status
        ) VALUES (
            v_site_id,
            v_prop_id,
            v_widget_id,
            'active'::public.record_status
        );
    END LOOP;

    -- Assert all 4 core properties were inserted
    SELECT COUNT(DISTINCT property_id) INTO v_prop_count FROM public.site_properties WHERE site_id = v_site_id;
    IF v_prop_count <> 4 THEN
        RAISE EXCEPTION 'Site Registration Aborted: Failed to map all 4 core properties.';
    END IF;

    RETURN jsonb_build_object('success', true, 'site_id', v_site_id);
EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.create_referral_site_tx(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_referral_site_tx(UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ------------------------------------------------------------------------------
-- 4. SCHEMA MIGRATION VERSION ENTRY
-- ------------------------------------------------------------------------------
INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('20260804_site_properties_production', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
