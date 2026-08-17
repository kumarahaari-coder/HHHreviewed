-- ==============================================================================
-- HIDDEN HONEY HOMES - DETERMINISTIC REDIRECT CLICKS & RESERVATION ATTRIBUTIONS
-- Migration Version: 20260804_redirect_clicks_and_attributions.sql
-- Strategy: Production-safe, non-destructive migration creating redirect_clicks and reservation_attributions tables
-- Scope: ONLY redirect_clicks, reservation_attributions, purge function, security & indexes
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. CREATE PUBLIC.REDIRECT_CLICKS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.redirect_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
    site_property_id UUID REFERENCES public.site_properties(id) ON DELETE SET NULL,
    tracking_code TEXT NOT NULL,
    widget_url TEXT NOT NULL,
    anonymous_session_id TEXT NOT NULL,
    referrer_url TEXT,
    user_agent_summary TEXT,
    ip_hash TEXT,
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for redirect_clicks performance
CREATE INDEX IF NOT EXISTS idx_redirect_clicks_site_id ON public.redirect_clicks(site_id);
CREATE INDEX IF NOT EXISTS idx_redirect_clicks_partner_id ON public.redirect_clicks(partner_id);
CREATE INDEX IF NOT EXISTS idx_redirect_clicks_property_clicked ON public.redirect_clicks(property_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_redirect_clicks_expires_at ON public.redirect_clicks(expires_at);

-- RLS & Grants for redirect_clicks
ALTER TABLE public.redirect_clicks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.redirect_clicks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.redirect_clicks TO service_role;

-- ------------------------------------------------------------------------------
-- 2. CREATE PUBLIC.RESERVATION_ATTRIBUTIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reservation_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
    partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
    site_property_id UUID REFERENCES public.site_properties(id) ON DELETE SET NULL,
    click_id UUID REFERENCES public.redirect_clicks(id) ON DELETE SET NULL,
    attribution_method TEXT NOT NULL, -- e.g. "TIME_WINDOW_PROBABILISTIC", "MANUAL_ADMIN", "DIRECT_WIDGET"
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    matched_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
    competing_candidates JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED', -- 'REVIEW_REQUIRED', 'ATTRIBUTED', 'UNATTRIBUTED', 'REJECTED'
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_reservation_attribution UNIQUE (reservation_id)
);

-- Indexes for reservation_attributions performance
CREATE INDEX IF NOT EXISTS idx_reservation_attributions_reservation_id ON public.reservation_attributions(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_attributions_status ON public.reservation_attributions(status);
CREATE INDEX IF NOT EXISTS idx_reservation_attributions_site_id ON public.reservation_attributions(site_id);
CREATE INDEX IF NOT EXISTS idx_reservation_attributions_partner_id ON public.reservation_attributions(partner_id);

-- Apply updated_at trigger if trigger function exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_column') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger tg 
            JOIN pg_class c ON c.oid = tg.tgrelid 
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'reservation_attributions' AND tg.tgname = 'trigger_set_reservation_attributions_updated_at'
        ) THEN
            CREATE TRIGGER trigger_set_reservation_attributions_updated_at 
                BEFORE UPDATE ON public.reservation_attributions 
                FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();
        END IF;
    END IF;
END $$;

-- RLS & Grants for reservation_attributions
ALTER TABLE public.reservation_attributions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_attributions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservation_attributions TO service_role;

-- ------------------------------------------------------------------------------
-- 3. MAINTENANCE PURGE FUNCTION (purge_expired_redirect_clicks)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_redirect_clicks()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.redirect_clicks
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.purge_expired_redirect_clicks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_redirect_clicks() TO service_role;

-- ------------------------------------------------------------------------------
-- 4. SCHEMA MIGRATION VERSION ENTRY
-- ------------------------------------------------------------------------------
INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('20260804_redirect_clicks_and_attributions', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
