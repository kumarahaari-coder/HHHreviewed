-- Migration: Create hospitable_sync_logs table for operational sync tracking
CREATE TABLE IF NOT EXISTS hospitable_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    properties_fetched INTEGER,
    properties_processed INTEGER,
    reservations_fetched INTEGER,
    reservations_processed INTEGER,
    reservations_skipped INTEGER,
    financial_coverage_percent INTEGER,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS (No public policies defined; restricted to server-side service role client)
ALTER TABLE hospitable_sync_logs ENABLE ROW LEVEL SECURITY;

-- Indexes for efficient querying by status and timestamp
CREATE INDEX IF NOT EXISTS idx_hospitable_sync_logs_started_at ON hospitable_sync_logs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_hospitable_sync_logs_status ON hospitable_sync_logs (status);
