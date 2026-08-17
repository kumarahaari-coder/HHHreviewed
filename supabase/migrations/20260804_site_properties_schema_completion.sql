-- ==============================================================================
-- HIDDEN HONEY HOMES - SITE_PROPERTIES CORRECTIVE SCHEMA COMPLETION MIGRATION
-- Migration Version: 20260804_site_properties_schema_completion.sql
-- Strategy: Single-transaction safe migration to add missing columns to physical table
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PREFLIGHT ASSERTIONS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_row_count INTEGER;
BEGIN
    -- Assert table public.site_properties exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'site_properties'
    ) THEN
        RAISE EXCEPTION 'Preflight Failure: public.site_properties table does not exist.';
    END IF;

    -- Assert public.site_properties contains ZERO rows
    SELECT COUNT(*) INTO v_row_count FROM public.site_properties;
    IF v_row_count > 0 THEN
        RAISE EXCEPTION 'Preflight Failure: public.site_properties contains % rows. Aborting schema modification to protect data.', v_row_count;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. ADD MISSING COLUMNS SAFELY (Table is confirmed 0 rows)
-- ------------------------------------------------------------------------------

-- Add id UUID NOT NULL DEFAULT gen_random_uuid()
ALTER TABLE public.site_properties 
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

-- Add UNIQUE(id) constraint so it can be referenced by foreign keys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.site_properties'::regclass AND conname = 'site_properties_id_unique'
    ) THEN
        ALTER TABLE public.site_properties ADD CONSTRAINT site_properties_id_unique UNIQUE (id);
    END IF;
END $$;

-- Add hospitable_widget_id TEXT NOT NULL
ALTER TABLE public.site_properties 
  ADD COLUMN IF NOT EXISTS hospitable_widget_id TEXT NOT NULL;

-- Add custom_booking_url TEXT NULLABLE
ALTER TABLE public.site_properties 
  ADD COLUMN IF NOT EXISTS custom_booking_url TEXT;

-- Add status public.record_status NOT NULL DEFAULT 'active'
ALTER TABLE public.site_properties 
  ADD COLUMN IF NOT EXISTS status public.record_status NOT NULL DEFAULT 'active'::public.record_status;

-- Add updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
ALTER TABLE public.site_properties 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ------------------------------------------------------------------------------
-- 3. INDEXES & RLS SECURITY
-- ------------------------------------------------------------------------------

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_site_properties_id ON public.site_properties(id);
CREATE INDEX IF NOT EXISTS idx_site_properties_site_id ON public.site_properties(site_id);
CREATE INDEX IF NOT EXISTS idx_site_properties_property_id ON public.site_properties(property_id);

-- RLS Hardening & Grants
ALTER TABLE public.site_properties ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.site_properties FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_properties TO service_role;

-- ------------------------------------------------------------------------------
-- 4. UPDATED_AT TRIGGER FOR SITE_PROPERTIES
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 5. RECORD MIGRATION IN SCHEMA_MIGRATIONS
-- ------------------------------------------------------------------------------
INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('20260804_site_properties_schema_completion', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
