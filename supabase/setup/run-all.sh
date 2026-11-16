#!/usr/bin/env bash
# Usage: NEWDB='postgresql://...' bash supabase/setup/run-all.sh
# Builds the full schema on an EMPTY database (base tables + every migration).
set -euo pipefail
: "${NEWDB:?set NEWDB to the new Postgres connection string}"
cd "$(dirname "$0")/../.."
run() { echo ">>> $1"; psql "$NEWDB" -v ON_ERROR_STOP=1 -q -f "$1"; }

run supabase/setup/00_base_schema.sql
run 20260731_hhh_final_production_migration.sql
# This migration was a one-off fix for legacy rows that only exist in the old DB (it asserts
# 2 legacy partners + 4 legacy users exist). Insert throw-away placeholders so it passes,
# then remove them; the real rows come from the CSV import.
psql "$NEWDB" -v ON_ERROR_STOP=1 -q -c "
INSERT INTO public.partners (id, partner_code, business_name, contact_email, status) VALUES
 ('00000000-0000-0000-0000-000000000001','PARTNER_001','tmp','megan@megsbrass.com','active'),
 ('00000000-0000-0000-0000-000000000002','PARTNER_002','tmp','lucy@escapes.com','active');
INSERT INTO public.users (id, name, email, role, status) VALUES
 ('user-admin-1','tmp','tmp-admin@example.invalid','SUPER_ADMIN','ACTIVE'),
 ('user-finance-1','tmp','tmp-fin@example.invalid','CREATOR','ACTIVE'),
 ('user-partner-megan','tmp','tmp-meg@example.invalid','CREATOR','ACTIVE'),
 ('user-partner-lucy','tmp','tmp-luc@example.invalid','CREATOR','ACTIVE');"
run 20260803_hhh_user_role_correction.sql
psql "$NEWDB" -v ON_ERROR_STOP=1 -q -c "
DELETE FROM public.application_audit_logs WHERE source = 'MIGRATION';
DELETE FROM public.users WHERE email LIKE '%@example.invalid';
DELETE FROM public.partners WHERE id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');"
run supabase/migrations/20261014_seed_core_properties.sql        # 4 core properties (needed by preflight checks)
run supabase/migrations/20260729000000_create_hospitable_sync_logs.sql
run supabase/migrations/20260729000001_add_hospitable_sync_lock.sql
run supabase/migrations/20260803000000_map_clerk_user_rpc_roles_final.sql
run supabase/migrations/20260804_site_properties_production.sql
run supabase/migrations/20260804_site_properties_schema_completion.sql
run supabase/migrations/20260804_site_properties_not_null_hardening.sql
run supabase/migrations/20260804_redirect_clicks_and_attributions.sql
run supabase/migrations/20260817_users_clerk_invitation_fields.sql
# OwnerRez migration preflight-checks one legacy site (Megbrass); add a throw-away copy, run, remove.
psql "$NEWDB" -v ON_ERROR_STOP=1 -q -c "
INSERT INTO public.partners (id, partner_code, business_name, status) VALUES ('b6cb0291-af01-43e3-8b2c-5d13ad5e266f','PARTNER_TMP_MEGBRASS','tmp','active');
INSERT INTO public.sites (id, site_code, partner_id, site_name, website_url, status) VALUES ('9b0c836c-3fe0-4dcb-aedd-9fbb1f8839c8','SITE_TMP_MEGBRASS','b6cb0291-af01-43e3-8b2c-5d13ad5e266f','tmp','https://acefabric.myshopify.com','active');"
run supabase/migrations/20260908_ownerrez_phase3_production_attribution.sql
psql "$NEWDB" -v ON_ERROR_STOP=1 -q -c "
DELETE FROM public.sites WHERE id = '9b0c836c-3fe0-4dcb-aedd-9fbb1f8839c8';
DELETE FROM public.partners WHERE id = 'b6cb0291-af01-43e3-8b2c-5d13ad5e266f';"
run supabase/migrations/20260909_phase6_commission_ledger_and_payouts.sql
run supabase/migrations/20260930_hostaway_migration_phase1_foundation.sql
run supabase/migrations/20261013_native_password_auth.sql
run supabase/migrations/20261014_tax_documents_app_schema.sql
run supabase/migrations/20261021_wise_payout_accounts.sql
run supabase/migrations/20261113_reservation_offline_payments.sql
echo "Schema complete."
