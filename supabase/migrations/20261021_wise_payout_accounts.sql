-- Wise payout rail: partner payout destinations + WISE rail support.
-- Raw bank details are NEVER stored here; they are sent straight to Wise and only the
-- recipient reference plus non-sensitive display fields are kept.

CREATE TABLE IF NOT EXISTS public.partner_payout_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'WISE' CHECK (provider IN ('WISE')),
    wise_recipient_id BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    account_holder_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('CHECKING', 'SAVINGS')),
    account_last4 TEXT NOT NULL CHECK (account_last4 ~ '^[0-9]{4}$'),
    -- ACTIVE accounts still need admin verification before they can receive a payout.
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REPLACED', 'REMOVED')),
    verified_at TIMESTAMPTZ NULL,
    verified_by TEXT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One live destination per partner.
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_payout_account_active
ON public.partner_payout_accounts(partner_id)
WHERE status = 'ACTIVE';

ALTER TABLE public.partner_payout_accounts ENABLE ROW LEVEL SECURITY;

-- Allow the WISE rail on payout batches.
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.payout_batches'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%payout_rail%'
    LOOP
        EXECUTE format('ALTER TABLE public.payout_batches DROP CONSTRAINT %I', c.conname);
    END LOOP;

    ALTER TABLE public.payout_batches
    ADD CONSTRAINT payout_batches_payout_rail_check
    CHECK (payout_rail IN ('MANUAL_ACH', 'BANK_WIRE', 'CHECK', 'STRIPE_CONNECT', 'WISE'));
END $$;
