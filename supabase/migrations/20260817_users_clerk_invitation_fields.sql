-- ==============================================================================
-- HIDDEN HONEY HOMES - USERS TABLE CLERK INVITATION & LAST LOGIN MIGRATION
-- Migration Version: 20260817_users_clerk_invitation_fields.sql
-- Strategy: Non-destructive incremental migration adding missing clerk_invitation_id and last_login columns to public.users
-- ==============================================================================

BEGIN;

-- 1. ADD MISSING COLUMNS SAFELY
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS clerk_invitation_id TEXT UNIQUE;

ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- 2. CREATE INDEX FOR INVITATION LOOKUPS
CREATE INDEX IF NOT EXISTS idx_users_clerk_invitation_id ON public.users(clerk_invitation_id);

-- 3. RECORD MIGRATION IN SCHEMA_MIGRATIONS
INSERT INTO public.schema_migrations (version, applied_at)
VALUES ('20260817_users_clerk_invitation_fields', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
