-- Migration: Add atomic lease lock table and functions for Hospitable synchronization
-- File: supabase/migrations/20260729000001_add_hospitable_sync_lock.sql

CREATE TABLE IF NOT EXISTS public.hospitable_sync_locks (
  lock_name TEXT PRIMARY KEY,
  lock_token UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  acquired_by TEXT NOT NULL DEFAULT 'system'
);

-- Enable RLS and grant service role full access
ALTER TABLE public.hospitable_sync_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to hospitable_sync_locks"
  ON public.hospitable_sync_locks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function: Try Acquire Lock
CREATE OR REPLACE FUNCTION public.try_acquire_hospitable_sync_lock(
  p_lock_name TEXT,
  p_lock_token UUID,
  p_lease_seconds INTEGER,
  p_acquired_by TEXT DEFAULT 'system'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expires TIMESTAMPTZ := v_now + (p_lease_seconds || ' seconds')::INTERVAL;
  v_acquired BOOLEAN := FALSE;
BEGIN
  -- Insert or update existing lock row if expired
  INSERT INTO public.hospitable_sync_locks (
    lock_name,
    lock_token,
    acquired_at,
    expires_at,
    acquired_by
  )
  VALUES (
    p_lock_name,
    p_lock_token,
    v_now,
    v_expires,
    p_acquired_by
  )
  ON CONFLICT (lock_name) DO UPDATE
  SET
    lock_token = EXCLUDED.lock_token,
    acquired_at = EXCLUDED.acquired_at,
    expires_at = EXCLUDED.expires_at,
    acquired_by = EXCLUDED.acquired_by
  WHERE public.hospitable_sync_locks.expires_at <= v_now;

  IF FOUND THEN
    v_acquired := TRUE;
  END IF;

  RETURN v_acquired;
END;
$$;

-- Function: Renew Lock (Token Matched)
CREATE OR REPLACE FUNCTION public.renew_hospitable_sync_lock(
  p_lock_name TEXT,
  p_lock_token UUID,
  p_lease_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_expires TIMESTAMPTZ := v_now + (p_lease_seconds || ' seconds')::INTERVAL;
  v_renewed BOOLEAN := FALSE;
BEGIN
  UPDATE public.hospitable_sync_locks
  SET
    expires_at = v_expires,
    acquired_at = v_now
  WHERE lock_name = p_lock_name
    AND lock_token = p_lock_token
    AND expires_at > v_now;

  IF FOUND THEN
    v_renewed := TRUE;
  END IF;

  RETURN v_renewed;
END;
$$;

-- Function: Release Lock (Token Matched)
CREATE OR REPLACE FUNCTION public.release_hospitable_sync_lock(
  p_lock_name TEXT,
  p_lock_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_released BOOLEAN := FALSE;
BEGIN
  -- Update expires_at to past timestamp to release lock cleanly
  UPDATE public.hospitable_sync_locks
  SET expires_at = now() - INTERVAL '1 second'
  WHERE lock_name = p_lock_name
    AND lock_token = p_lock_token;

  IF FOUND THEN
    v_released := TRUE;
  END IF;

  RETURN v_released;
END;
$$;
