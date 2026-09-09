-- ==============================================================================
-- HIDDEN HONEY HOMES - OWNERREZ PHASE 3 PRODUCTION ATTRIBUTION INTEGRATION
-- Migration Version: 20260908_ownerrez_phase3_production_attribution.sql
-- Strategy: Single Atomic Transaction with Strict Preflight & Conflict Assertions
-- Scope: Generalize external reservation identity, add OwnerRez provider columns,
--        and perform hardened transactional backfill of verified mappings.
-- Safe on first run and safe on accidental re-execution.
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
-- 2. GENERALIZE RESERVATION EXTERNAL IDENTITY (public.reservations)
-- ------------------------------------------------------------------------------
-- Make hospitable_reservation_id nullable so pure OwnerRez bookings do not require synthetic IDs
ALTER TABLE public.reservations ALTER COLUMN hospitable_reservation_id DROP NOT NULL;

-- Add OwnerRez columns to public.reservations (quote_id non-unique, ownerrez_booking_id unique)
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS ownerrez_booking_id BIGINT UNIQUE;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS quote_id BIGINT;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS raw_ownerrez_data JSONB;

-- Enforce that every reservation has at least one external system identity
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_reservation_external_identity'
          AND conrelid = 'public.reservations'::regclass
    ) THEN
        ALTER TABLE public.reservations
        ADD CONSTRAINT chk_reservation_external_identity
        CHECK (
            hospitable_reservation_id IS NOT NULL
            OR ownerrez_booking_id IS NOT NULL
        );
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. ADD OWNERREZ IDENTIFIERS (public.properties & public.sites)
-- ------------------------------------------------------------------------------
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS ownerrez_property_id BIGINT UNIQUE;

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS ownerrez_listing_site_id BIGINT UNIQUE;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS ownerrez_listing_site_name TEXT;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS ownerrez_listing_site_domain TEXT;

-- ------------------------------------------------------------------------------
-- 4. STRICT TRANSACTIONAL PREFLIGHT ASSERTIONS & CONFLICT ENFORCEMENT
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_beech_count INT;
    v_uptown_count INT;
    v_downtown_count INT;
    v_ellsworth_count INT;
    v_conflicting_other_props INT;
    v_conflicting_canonical_props INT;
    v_exact_site_count INT;
    v_conflicting_target_site INT;
    v_conflicting_other_sites INT;
    c_megbrass_site_id CONSTANT UUID := '9b0c836c-3fe0-4dcb-aedd-9fbb1f8839c8'::UUID;
    c_expected_partner_id CONSTANT UUID := 'b6cb0291-af01-43e3-8b2c-5d13ad5e266f'::UUID;
BEGIN
    -- Assertion 1: All 4 canonical HHH property UUIDs exist and have status = 'active'
    SELECT COUNT(*) INTO v_beech_count
    FROM public.properties
    WHERE id = '55791a54-b1a3-459e-bbd5-9073a418b774' AND status = 'active';

    SELECT COUNT(*) INTO v_uptown_count
    FROM public.properties
    WHERE id = '38d9159e-a35d-405e-826e-7381ad3c3197' AND status = 'active';

    SELECT COUNT(*) INTO v_downtown_count
    FROM public.properties
    WHERE id = 'f0fb867d-47cd-47d4-afa6-c4bf226c1768' AND status = 'active';

    SELECT COUNT(*) INTO v_ellsworth_count
    FROM public.properties
    WHERE id = '51be6158-268d-4c96-8f0b-9968f544ddfa' AND status = 'active';

    IF v_beech_count <> 1 OR v_uptown_count <> 1 OR v_downtown_count <> 1 OR v_ellsworth_count <> 1 THEN
        RAISE EXCEPTION 'Preflight Failure: One or more canonical HHH properties do not exist or are not active (beech: %, uptown: %, downtown: %, ellsworth: %).',
            v_beech_count, v_uptown_count, v_downtown_count, v_ellsworth_count;
    END IF;

    -- Assertion 2A: None of the OwnerRez property IDs (495423, 495793, 495794, 495795) is assigned to a different HHH property
    SELECT COUNT(*) INTO v_conflicting_other_props
    FROM public.properties
    WHERE id NOT IN (
        '55791a54-b1a3-459e-bbd5-9073a418b774',
        '38d9159e-a35d-405e-826e-7381ad3c3197',
        'f0fb867d-47cd-47d4-afa6-c4bf226c1768',
        '51be6158-268d-4c96-8f0b-9968f544ddfa'
    ) AND ownerrez_property_id IN (495423, 495793, 495794, 495795);

    IF v_conflicting_other_props > 0 THEN
        RAISE EXCEPTION 'Preflight Failure: OwnerRez property IDs (495423, 495793, 495794, 495795) are assigned to other non-canonical properties (% found).',
            v_conflicting_other_props;
    END IF;

    -- Assertion 2B: Each canonical HHH property either has NULL or its expected OwnerRez property ID — never a conflicting OwnerRez ID
    SELECT COUNT(*) INTO v_conflicting_canonical_props
    FROM public.properties
    WHERE (id = '55791a54-b1a3-459e-bbd5-9073a418b774' AND ownerrez_property_id IS NOT NULL AND ownerrez_property_id <> 495423)
       OR (id = '38d9159e-a35d-405e-826e-7381ad3c3197' AND ownerrez_property_id IS NOT NULL AND ownerrez_property_id <> 495793)
       OR (id = 'f0fb867d-47cd-47d4-afa6-c4bf226c1768' AND ownerrez_property_id IS NOT NULL AND ownerrez_property_id <> 495794)
       OR (id = '51be6158-268d-4c96-8f0b-9968f544ddfa' AND ownerrez_property_id IS NOT NULL AND ownerrez_property_id <> 495795);

    IF v_conflicting_canonical_props > 0 THEN
        RAISE EXCEPTION 'Preflight Failure: Canonical properties contain conflicting OwnerRez property IDs.';
    END IF;

    -- Assertion 3A: Exact site UUID exists, is active, belongs to expected partner, and website resolves to expected storefront
    SELECT COUNT(*) INTO v_exact_site_count
    FROM public.sites
    WHERE id = c_megbrass_site_id
      AND status = 'active'
      AND partner_id = c_expected_partner_id
      AND website_url ILIKE '%acefabric.myshopify.com%';

    IF v_exact_site_count <> 1 THEN
        RAISE EXCEPTION 'Preflight Failure: Expected Megbrass site % (partner %, storefront acefabric.myshopify.com) not found or not active.',
            c_megbrass_site_id, c_expected_partner_id;
    END IF;

    -- Assertion 3B: Target site 9b0c836c-3fe0-4dcb-aedd-9fbb1f8839c8 itself does not already contain a non-null ownerrez_listing_site_id different from 792965226
    SELECT COUNT(*) INTO v_conflicting_target_site
    FROM public.sites
    WHERE id = c_megbrass_site_id
      AND ownerrez_listing_site_id IS NOT NULL
      AND ownerrez_listing_site_id <> 792965226;

    IF v_conflicting_target_site > 0 THEN
        RAISE EXCEPTION 'Preflight Failure: Target Megbrass site % already contains a conflicting ownerrez_listing_site_id.',
            c_megbrass_site_id;
    END IF;

    -- Assertion 4: ownerrez_listing_site_id = 792965226 is either unassigned or already assigned to 9b0c836c-3fe0-4dcb-aedd-9fbb1f8839c8, and never another site
    SELECT COUNT(*) INTO v_conflicting_other_sites
    FROM public.sites
    WHERE ownerrez_listing_site_id = 792965226
      AND id <> c_megbrass_site_id;

    IF v_conflicting_other_sites > 0 THEN
        RAISE EXCEPTION 'Preflight Failure: OwnerRez source ID 792965226 is already assigned to a different site (% found).',
            v_conflicting_other_sites;
    END IF;

    -- --------------------------------------------------------------------------
    -- 5. VERIFIED PRODUCTION BACKFILL
    -- --------------------------------------------------------------------------
    -- Properties Backfill
    UPDATE public.properties SET ownerrez_property_id = 495423, updated_at = NOW() WHERE id = '55791a54-b1a3-459e-bbd5-9073a418b774';
    UPDATE public.properties SET ownerrez_property_id = 495793, updated_at = NOW() WHERE id = '38d9159e-a35d-405e-826e-7381ad3c3197';
    UPDATE public.properties SET ownerrez_property_id = 495794, updated_at = NOW() WHERE id = 'f0fb867d-47cd-47d4-afa6-c4bf226c1768';
    UPDATE public.properties SET ownerrez_property_id = 495795, updated_at = NOW() WHERE id = '51be6158-268d-4c96-8f0b-9968f544ddfa';

    -- Megbrass Site Backfill by Immutable UUID
    UPDATE public.sites
    SET ownerrez_listing_site_id = 792965226,
        ownerrez_listing_site_name = 'Megbrass',
        ownerrez_listing_site_domain = 'acefabric.myshopify.com',
        updated_at = NOW()
    WHERE id = c_megbrass_site_id;
END $$;

-- ------------------------------------------------------------------------------
-- 6. RECORD SUCCESSFUL MIGRATION (Preserve original application timestamp)
-- ------------------------------------------------------------------------------
INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('20260908_ownerrez_phase3_production_attribution', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
