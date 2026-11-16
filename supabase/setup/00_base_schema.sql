-- ==============================================================================
-- BASE SCHEMA for a brand-new Supabase project.
-- Recreates the core tables that were originally created by hand in the old
-- project (no migration in this repo creates them). Reconstructed from the
-- exported CSV headers + the migrations/app code that reference them.
--
-- Run this FIRST, then 20260731_hhh_final_production_migration.sql, the
-- 20260803_*.sql files and supabase/migrations/*.sql (see run-all.sh).
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Shared enum used by partners / sites / properties / site_properties
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE t.typname = 'record_status' AND n.nspname = 'public') THEN
        CREATE TYPE public.record_status AS ENUM ('active', 'inactive', 'invited', 'suspended', 'archived', 'pending');
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_code TEXT NOT NULL UNIQUE,
    business_name TEXT NOT NULL,
    contact_name TEXT,
    contact_email CITEXT,
    phone TEXT,
    payout_currency TEXT NOT NULL DEFAULT 'USD',
    payout_frequency TEXT,
    status public.record_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospitable_property_id TEXT UNIQUE,
    property_name TEXT NOT NULL,
    location TEXT,
    timezone TEXT,
    website_url TEXT,
    booking_url TEXT,
    status public.record_status NOT NULL DEFAULT 'active',
    raw_hospitable_data JSONB,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    image_url TEXT,
    summary TEXT,
    maximum_occupancy INTEGER,
    ownerrez_property_id BIGINT,
    hostaway_listing_id BIGINT
);

CREATE TABLE IF NOT EXISTS public.sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_code TEXT NOT NULL UNIQUE,
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    site_name TEXT NOT NULL,
    website_url TEXT,
    hospitable_widget_id TEXT,
    hospitable_booking_url TEXT,
    tracking_code TEXT,
    status public.record_status NOT NULL DEFAULT 'active',
    launched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ownerrez_listing_site_id BIGINT,
    ownerrez_listing_site_name TEXT,
    ownerrez_listing_site_domain TEXT
);

CREATE TABLE IF NOT EXISTS public.commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL DEFAULT 'percentage',
    percentage NUMERIC(8,4),
    fixed_amount NUMERIC(12,2),
    payout_base TEXT NOT NULL DEFAULT 'contracted_rent',
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospitable_reservation_id TEXT UNIQUE,
    confirmation_code TEXT,
    property_id UUID REFERENCES public.properties(id) ON DELETE RESTRICT,
    partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
    site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
    guest_name TEXT,
    guest_email TEXT,
    booking_date TIMESTAMPTZ,
    check_in_date TIMESTAMPTZ,
    check_out_date TIMESTAMPTZ,
    reservation_status TEXT,
    payment_status TEXT,
    gross_amount NUMERIC(12,2),
    amount_received NUMERIC(12,2),
    refund_amount NUMERIC(12,2),
    currency TEXT DEFAULT 'USD',
    attribution_status TEXT DEFAULT 'pending',
    raw_hospitable_data JSONB,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    nights INTEGER,
    guests INTEGER,
    taxes_amount NUMERIC(12,2),
    cleaning_fee NUMERIC(12,2),
    service_fee NUMERIC(12,2),
    platform TEXT,
    payment_confirmation_source TEXT,
    financial_data_available BOOLEAN,
    ownerrez_booking_id BIGINT,
    quote_id TEXT,
    raw_ownerrez_data JSONB,
    hostaway_reservation_id BIGINT,
    raw_hostaway_data JSONB,
    partner_payout_amount NUMERIC(12,2)
);
CREATE INDEX IF NOT EXISTS idx_reservations_partner_id ON public.reservations(partner_id);
CREATE INDEX IF NOT EXISTS idx_reservations_site_id ON public.reservations(site_id);
CREATE INDEX IF NOT EXISTS idx_reservations_property_id ON public.reservations(property_id);

-- Legacy payouts table (read by the partner dashboard; no exported rows)
CREATE TABLE IF NOT EXISTS public.payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
    calculated_payout NUMERIC(12,2),
    final_payout NUMERIC(12,2),
    status TEXT,
    payout_status TEXT,
    payment_date TIMESTAMPTZ,
    transaction_reference TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Updated_at triggers + lock down to service_role (app uses the service key)
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['partners','properties','sites','commission_rules','reservations','payouts'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column()', t, t);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    END LOOP;
END $$;
