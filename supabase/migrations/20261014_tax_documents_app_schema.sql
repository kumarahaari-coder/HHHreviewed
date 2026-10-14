-- ============================================================================
-- Tax documents: align the Supabase tables with what the application saves.
-- Before this, tax document metadata was only kept in an in-memory mock store, so uploads
-- "succeeded" but the record vanished and admins could never see or preview the file.
-- Safe to re-run (idempotent). Run in the Supabase SQL Editor.
-- ============================================================================

-- creator_tax_documents: one row per partner; the document type and file live on the versions.
ALTER TABLE public.creator_tax_documents ALTER COLUMN legal_name DROP NOT NULL;
ALTER TABLE public.creator_tax_documents ALTER COLUMN r2_object_key DROP NOT NULL;
ALTER TABLE public.creator_tax_documents ALTER COLUMN document_type DROP NOT NULL;

ALTER TABLE public.creator_tax_documents DROP CONSTRAINT IF EXISTS creator_tax_documents_document_type_check;
ALTER TABLE public.creator_tax_documents DROP CONSTRAINT IF EXISTS creator_tax_documents_status_check;

ALTER TABLE public.creator_tax_documents
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS internal_note TEXT,
  ADD COLUMN IF NOT EXISTS current_version_id UUID;

ALTER TABLE public.creator_tax_documents ALTER COLUMN status SET DEFAULT 'SUBMITTED';

ALTER TABLE public.creator_tax_documents
  ADD CONSTRAINT creator_tax_documents_document_type_check
  CHECK (document_type IS NULL OR document_type IN ('W_9', 'W_8'));

ALTER TABLE public.creator_tax_documents
  ADD CONSTRAINT creator_tax_documents_status_check
  CHECK (status IN ('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REPLACEMENT_REQUIRED', 'SUPERSEDED'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_tax_documents_partner
  ON public.creator_tax_documents (partner_id);

-- tax_document_versions: per-upload details the app records.
ALTER TABLE public.tax_document_versions
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS w8_subtype TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_checked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quarantine_status TEXT NOT NULL DEFAULT 'PASSED',
  ADD COLUMN IF NOT EXISTS is_superseded BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.tax_document_versions DROP CONSTRAINT IF EXISTS tax_document_versions_document_type_check;
ALTER TABLE public.tax_document_versions
  ADD CONSTRAINT tax_document_versions_document_type_check
  CHECK (document_type IS NULL OR document_type IN ('W_9', 'W_8'));

ALTER TABLE public.tax_document_versions DROP CONSTRAINT IF EXISTS tax_document_versions_w8_subtype_check;
ALTER TABLE public.tax_document_versions
  ADD CONSTRAINT tax_document_versions_w8_subtype_check
  CHECK (w8_subtype IS NULL OR w8_subtype IN ('W_8BEN', 'W_8BEN_E', 'OTHER'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_document_versions_doc_ver
  ON public.tax_document_versions (document_id, version_number);
