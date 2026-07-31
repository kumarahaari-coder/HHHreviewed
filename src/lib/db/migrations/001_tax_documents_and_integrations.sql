-- PostgreSQL DDL Migration: Creator Tax Documents & Production Integrations
-- File: 001_tax_documents_and_integrations.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Extend Users table for Clerk Authentication
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(50) DEFAULT 'PENDING';

-- 2. Extend Partners table for Stripe Connect Creator Payouts
ALTER TABLE partners ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255) UNIQUE;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS stripe_connect_account_id VARCHAR(255) UNIQUE;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS stripe_onboarding_status VARCHAR(50) DEFAULT 'NOT_CONNECTED';

-- 3. Create Creator Tax Documents Parent Table (UUID primary key)
CREATE TABLE IF NOT EXISTS creator_tax_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  current_version_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'NOT_SUBMITTED',
  admin_note TEXT,
  internal_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_partner_tax_doc UNIQUE(partner_id)
);

-- 4. Create Tax Document Versions Table (UUID primary key)
CREATE TABLE IF NOT EXISTS tax_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES creator_tax_documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  document_type VARCHAR(20) NOT NULL, -- 'W_9', 'W_8'
  w8_subtype VARCHAR(50), -- 'W_8BEN', 'W_8BEN_E', 'OTHER'
  s3_storage_key VARCHAR(512) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_hash VARCHAR(128) NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  is_superseded BOOLEAN DEFAULT FALSE,
  confirmation_checked BOOLEAN NOT NULL DEFAULT TRUE,
  quarantine_status VARCHAR(50) DEFAULT 'PASSED', -- 'QUARANTINED', 'PASSED', 'FAILED'
  submission_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_doc_version UNIQUE(document_id, version_number)
);

-- 5. Add foreign key for current version reference
ALTER TABLE creator_tax_documents 
  ADD CONSTRAINT fk_current_version 
  FOREIGN KEY (current_version_id) REFERENCES tax_document_versions(id) ON DELETE SET NULL;

-- 6. Create Tax Document Audit Logs Table (UUID primary key)
CREATE TABLE IF NOT EXISTS tax_document_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES creator_tax_documents(id) ON DELETE SET NULL,
  version_id UUID REFERENCES tax_document_versions(id) ON DELETE SET NULL,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'UPLOAD', 'REPLACE', 'REVIEW_UPDATE', 'DOWNLOAD', 'DELETE'
  performed_by_user_id VARCHAR(255) NOT NULL,
  performed_by_user_role VARCHAR(50) NOT NULL,
  ip_address VARCHAR(50),
  details TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Integration Event Idempotency Table (UUID primary key)
CREATE TABLE IF NOT EXISTS integration_idempotency_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL, -- 'CLERK', 'STRIPE', 'BREVO'
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'PROCESSED',
  CONSTRAINT uq_provider_event UNIQUE(provider, event_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tax_docs_partner ON creator_tax_documents(partner_id);
CREATE INDEX IF NOT EXISTS idx_tax_docs_status ON creator_tax_documents(status);
CREATE INDEX IF NOT EXISTS idx_tax_versions_doc ON tax_document_versions(document_id, version_number);
CREATE INDEX IF NOT EXISTS idx_tax_audit_doc ON tax_document_audit_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_users_clerk ON users(clerk_user_id);
