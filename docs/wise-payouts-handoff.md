# Wise payouts: handoff notes (as of 2026-10-22)

Read this instead of re-deriving context. Last working state: the sandbox flow settled a $100 test payout end to end.

## What exists (all uncommitted at time of writing)
- **Wise client/payout logic:** `src/lib/wise/{client,payout,payout-account,webhook}.ts`. Defaults to the **sandbox** (`https://api.wise-sandbox.com`) unless `WISE_ENV=production`. Env: `WISE_ENV`, `WISE_BASE_URL`, `WISE_API_TOKEN`, `WISE_PROFILE_ID` (numeric profile `id`, not `userId`), `WISE_WEBHOOK_PUBLIC_KEY`.
- **API routes:** `/api/partner/payout-account` (partner adds US ACH account, sent straight to Wise, only last4 stored), `/api/admin/payout-accounts/verify` (admin verifies), `/api/admin/commissions/payout-batches[/id]` (draft/submit/approve/pay-via-wise/refresh/retry-wise-funding/abandon-wise-payout/cancel), `/api/admin/wise/status`, `/api/webhooks/wise`, dev-only `/api/admin/dev/seed-commission`.
- **UI:** `src/components/admin/Phase6LedgerPanel.tsx` (admin: Payouts > Ledger & Batches tab). Partner: `/partner/profile` (payout account card), `/partner/payouts` + `/partner` (now read `phase6` from `/api/partner/dashboard`).
- **Migration:** `supabase/migrations/20261021_wise_payout_accounts.sql` (applied to dev).
- **Scripts:** `scripts/create-admin-user.ts` (2nd admin for maker-checker), `wise-simulate.ts <transferId> [state]` (sandbox state simulation), `setup-wise-webhook.ts list|create|delete|test`, `test-wise-webhook-signature.ts`.

## Flow
Hostaway/OwnerRez sync -> `INITIAL_ACCRUAL` (forecast) -> `PAYMENT_REALIZED` (only when amount_received >= gross, not cancelled/refunded) -> `ELIGIBILITY_RELEASE` (checkout 11:00 + 24h, no dispute; run by `processCompletedStaysEligibility`, currently only called from the sync-ownerrez cron) -> admin: verify partner account, Draft batch (rail WISE) -> Submit -> Approve (a *different* Super Admin) -> Pay via Wise -> funding -> `outgoing_payment_sent` (webhook or "Refresh Wise status") -> batch SETTLED + `PAYOUT_SETTLEMENT` ledger row.
The admin "Eligible Queue" tab is the legacy `payouts` system; the ledger flow does not need it.

## Dev-only settings (never in production)
`.env.local` has `PHASE6_SETTLEMENT_ENABLED`, `PHASE6_EXTERNAL_PAYOUTS_ENABLED` (needed true for payouts at all), `PHASE6_DEV_ALLOW_SELF_APPROVAL` (ignored in production). The DB constraint `chk_maker_checker_separation` still enforces creator != approver; use a second admin. The "Add test commission" button creates `DEVSEED-*` reservations (a few exist in dev DB; safe to delete).

## Known findings / open items
1. **Sandbox quirk:** the sandbox profile had an Estonia address, so funding returned 403 (EU SCA). A US live profile may not need SCA: ask Wise. If it does, implement SCA signing (RSA key pair, sign one-time token on 403).
2. **Funding source:** payouts come from the Wise USD balance, which must hold real money in live.
3. **Payment verification gap:** "paid" comes only from Hostaway `paidAmount`/`isPaid` (via `normalizeHostawayPaymentStatus`). In the dev DB all 80 real direct Hostaway bookings show received=$0 and raw `isPaid` is empty; all 371 PAID rows are Airbnb via OwnerRez. Stripe is never consulted (`src/lib/stripe` is a mock for Connect payouts only). Chargebacks/disputes don't reach the ledger automatically.
3b. **Stripe check (2026-10-22):** the Stripe account "Hidden Honey LLC" (live) has zero payments and zero customers; the "HHE" account in the picker is unrelated. So guest payments do NOT go through that Stripe account. Next step: find which processor Hostaway uses for direct bookings (Hostaway Payments / other gateway) and check a direct booking's Payments tab in Hostaway.
4. **No accruals yet** for the 5 partner-attributed bookings (all unpaid, 2027 stays). Find out why (commission rule missing / commission disabled?).
5. Add `processCompletedStaysEligibility()` to the Hostaway cron too.
6. Consider a longer hold than 24h (Stripe payout delay and dispute window).
7. Not built: partner payout notification email; SCA signing; automated Wise e2e test; webhook not yet deployed (use "Refresh Wise status" locally).
8. Before live: remove dev flags, restore maker-checker constraint if dropped, delete exposed sandbox tokens, create live token/profile, set `WISE_ENV=production` in prod only, create live webhook subscription + live public key.
