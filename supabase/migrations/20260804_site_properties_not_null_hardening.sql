-- ==============================================================================
-- HIDDEN HONEY HOMES - SITE_PROPERTIES NOT NULL HARDENING MIGRATION
-- Migration Version: 20260804_site_properties_not_null_hardening.sql
-- Strategy: Single-transaction safe migration enforcing NOT NULL constraints
-- ==============================================================================

BEGIN;

-- 1. PREFLIGHT ASSERTIONS
DO $$
DECLARE
    v_row_count INTEGER;
BEGIN
    -- Assert table public.site_properties contains ZERO rows before setting NOT NULL
    SELECT COUNT(*) INTO v_row_count FROM public.site_properties;
    IF v_row_count > 0 THEN
        RAISE EXCEPTION 'Preflight Failure: public.site_properties contains % rows. Cannot alter NOT NULL without data backfill.', v_row_count;
    END IF;
END $$;

-- 2. ENFORCE NOT NULL CONSTRAINTS
ALTER TABLE public.site_properties ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.site_properties ALTER COLUMN site_id SET NOT NULL;
ALTER TABLE public.site_properties ALTER COLUMN property_id SET NOT NULL;
ALTER TABLE public.site_properties ALTER COLUMN hospitable_widget_id SET NOT NULL;
ALTER TABLE public.site_properties ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.site_properties ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.site_properties ALTER COLUMN updated_at SET NOT NULL;

-- 3. RECORD MIGRATION IN SCHEMA_MIGRATIONS
INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('20260804_site_properties_not_null_hardening', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
