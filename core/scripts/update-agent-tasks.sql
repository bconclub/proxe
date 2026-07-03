-- Migration: Ensure agent_tasks has all columns needed by the task worker.
-- Run in Supabase SQL editor for the BCON project.
-- Safe to run multiple times (all statements use IF NOT EXISTS / IF EXISTS).

-- Add columns that may be missing from the original create-agent-tasks.sql
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS lead_phone TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS lead_name TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add composite indexes for the task worker queries
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_scheduled ON agent_tasks(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_type_lead ON agent_tasks(task_type, lead_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_type_phone ON agent_tasks(task_type, lead_phone);
