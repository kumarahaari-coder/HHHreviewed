#!/usr/bin/env bash
# Usage: NEWDB='postgresql://...' bash supabase/setup/import-csv.sh [backup_dir]
# Imports the exported CSVs (parents first). Safe to re-run: existing rows are skipped.
set -euo pipefail
: "${NEWDB:?set NEWDB to the new Postgres connection string}"
cd "$(dirname "$0")/../.."
DIR="${1:-backup}"
# Order matters (foreign keys).
TABLES="partners users properties sites site_properties commission_rules reservations
reservation_attributions reservation_offline_payments commission_ledger_events
partner_payout_accounts payout_batches payout_items payout_payment_attempts
creator_tax_documents tax_document_versions tax_document_audit_logs application_audit_logs
auth_sessions auth_tokens hospitable_sync_logs integration_idempotency_logs schema_migrations"

# The 4 core properties were seeded by the migrations; the CSV is the source of truth.
psql "$NEWDB" -q -c "DELETE FROM public.properties;"

for t in $TABLES; do
  f="$DIR/${t}_rows.csv"
  [ -f "$f" ] || { echo "skip $t (no file)"; continue; }
  cols=$(head -1 "$f")
  psql "$NEWDB" -v ON_ERROR_STOP=1 -q <<SQL
BEGIN;
SET LOCAL session_replication_role = replica;  -- restore mode: skip triggers (keeps original timestamps, avoids order-dependent checks)
CREATE TEMP TABLE _stage (LIKE public.$t INCLUDING DEFAULTS) ON COMMIT DROP;
\copy _stage ($cols) FROM '$f' WITH (FORMAT csv, HEADER true)
INSERT INTO public.$t ($cols) SELECT $cols FROM _stage ON CONFLICT DO NOTHING;
COMMIT;
SQL
  n=$(psql "$NEWDB" -Atc "SELECT count(*) FROM public.$t")
  echo "$t: $n rows"
done
