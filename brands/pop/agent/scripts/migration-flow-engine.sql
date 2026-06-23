-- Migration: Flow engine support for agent_tasks table
-- Run in Supabase SQL editor for the BCON project.
-- Safe to run multiple times (all statements use IF NOT EXISTS).
--
-- Supports new task types from engine.ts:
--   nudge_waiting, booking_reminder_24h, booking_reminder_1h,
--   booking_reminder_30m, post_booking_followup, push_to_book

-- Ensure all required columns exist
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS lead_phone TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS lead_name TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Composite index for the main worker query: pending tasks ordered by scheduled_at
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_scheduled_brand
  ON agent_tasks(status, scheduled_at, brand);

-- Composite index for dedup: find existing tasks by type + lead
CREATE INDEX IF NOT EXISTS idx_agent_tasks_type_lead
  ON agent_tasks(task_type, lead_id);

-- Composite index for dedup by phone (when lead_id is null)
CREATE INDEX IF NOT EXISTS idx_agent_tasks_type_phone
  ON agent_tasks(task_type, lead_phone);

-- Index for 24h window check: find recent completed tasks
CREATE INDEX IF NOT EXISTS idx_agent_tasks_completed_at
  ON agent_tasks(completed_at)
  WHERE completed_at IS NOT NULL;
