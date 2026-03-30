-- Migration: Add follow-up tracking columns to all_leads
-- Purpose: Prevent duplicate follow-up messages and enable cooldown periods
-- Date: 2026-03-30
-- Bug fix: GPFC-001 Duplicate Follow-up Prevention

-- Add columns for tracking follow-up state
ALTER TABLE all_leads 
ADD COLUMN IF NOT EXISTS last_follow_up_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS last_follow_up_template text,
ADD COLUMN IF NOT EXISTS follow_up_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS follow_up_cooldown_until timestamptz;

-- Add index for efficient querying of follow-up eligible leads
CREATE INDEX IF NOT EXISTS idx_all_leads_follow_up_tracking 
ON all_leads(last_follow_up_sent_at, follow_up_cooldown_until) 
WHERE needs_human_followup = false;

-- Add index for finding stuck leads (for stats/monitoring)
CREATE INDEX IF NOT EXISTS idx_all_leads_stuck_follow_ups
ON all_leads(last_interaction_at, follow_up_cooldown_until)
WHERE lead_stage NOT IN ('Converted', 'Closed Won', 'Closed Lost');

-- Add comment for documentation
COMMENT ON COLUMN all_leads.last_follow_up_sent_at IS 'Timestamp of last automated follow-up message sent';
COMMENT ON COLUMN all_leads.last_follow_up_template IS 'Template name of last follow-up sent (for rotation)';
COMMENT ON COLUMN all_leads.follow_up_count IS 'Number of follow-ups sent in current sequence';
COMMENT ON COLUMN all_leads.follow_up_cooldown_until IS 'Pause follow-ups until this time (user replied, failure, etc)';

-- One-time cleanup: Set cooldown for leads who received follow-ups in last 24h
-- This prevents immediate duplicate sends after deployment
UPDATE all_leads 
SET follow_up_cooldown_until = NOW() + INTERVAL '48 hours'
WHERE id IN (
    SELECT DISTINCT lead_id 
    FROM conversations 
    WHERE sender = 'agent' 
    AND created_at > NOW() - INTERVAL '24 hours'
    AND lead_id IS NOT NULL
);

-- Log the migration
SELECT 'Migration complete: Added follow-up tracking columns to ' || COUNT(*)::text || ' leads' as result
FROM all_leads;
