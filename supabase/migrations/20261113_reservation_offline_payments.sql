-- Offline ("marked paid in Hostaway") guest payments.
-- Hostaway can show a booking as paid through a manual/offline charge (cash, bank transfer, etc.). Nothing can verify
-- that money, so it never counts as received automatically. Sync records it here as PENDING_CONFIRMATION; an admin
-- confirms it with a reason, and a DIFFERENT admin approves it. Only APPROVED rows may later be counted as received.
-- Stripe-backed payments are unaffected and keep being verified against Stripe.

CREATE TABLE IF NOT EXISTS public.reservation_offline_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE RESTRICT,
    hostaway_reservation_id BIGINT NOT NULL,
    hostaway_charge_id BIGINT NOT NULL UNIQUE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
    payment_method TEXT NULL,
    -- Latest status Hostaway reports for the charge ('paid', 'cancelled', ...). Updated by every sync.
    hostaway_status TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION' CHECK (
        status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'APPROVED', 'REJECTED', 'WITHDRAWN')
    ),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_by TEXT NULL,
    confirmed_at TIMESTAMPTZ NULL,
    confirmation_reason TEXT NULL,
    approved_by TEXT NULL,
    approved_at TIMESTAMPTZ NULL,
    rejected_by TEXT NULL,
    rejected_at TIMESTAMPTZ NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Confirmation needs a person and a written reason.
    CONSTRAINT chk_offline_payment_confirmation CHECK (
        status IN ('PENDING_CONFIRMATION', 'REJECTED', 'WITHDRAWN')
        OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL
            AND confirmation_reason IS NOT NULL AND btrim(confirmation_reason) <> '')
    ),
    -- Maker-checker: the approver must exist only after confirmation and must differ from the confirmer.
    CONSTRAINT chk_offline_payment_maker_checker CHECK (
        status <> 'APPROVED'
        OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND confirmed_by IS NOT NULL AND approved_by <> confirmed_by)
    )
);

CREATE INDEX IF NOT EXISTS idx_offline_payments_reservation ON public.reservation_offline_payments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_offline_payments_status ON public.reservation_offline_payments(status);

ALTER TABLE public.reservation_offline_payments ENABLE ROW LEVEL SECURITY;
