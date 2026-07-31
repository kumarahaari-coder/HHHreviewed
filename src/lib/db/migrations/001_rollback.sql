-- PostgreSQL DDL Rollback Script: Creator Tax Documents & Production Integrations
-- File: 001_rollback.sql

DROP TABLE IF EXISTS integration_idempotency_logs CASCADE;
DROP TABLE IF EXISTS tax_document_audit_logs CASCADE;
ALTER TABLE creator_tax_documents DROP CONSTRAINT IF EXISTS fk_current_version;
DROP TABLE IF EXISTS tax_document_versions CASCADE;
DROP TABLE IF EXISTS creator_tax_documents CASCADE;

ALTER TABLE partners DROP COLUMN IF EXISTS stripe_onboarding_status;
ALTER TABLE partners DROP COLUMN IF EXISTS stripe_connect_account_id;
ALTER TABLE partners DROP COLUMN IF EXISTS stripe_customer_id;

ALTER TABLE users DROP COLUMN IF EXISTS onboarding_status;
ALTER TABLE users DROP COLUMN IF EXISTS clerk_user_id;
