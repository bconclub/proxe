-- ============================================================================
-- Lokazen — agent_tasks + activities tables (missing on this Supabase)
-- ============================================================================
-- WHY: Lokazen's Supabase never had these two tables, so:
--   - the Tasks page / any agent_tasks query fails (PGRST205), and
--   - support requests / human-handoffs can't become visible tasks.
-- Other brands have them (bcon's create-agent-tasks.sql; pop master schema).
-- Run once in the Lokazen Supabase SQL editor (project egwwpngaoaeqemieawcx).
-- Idempotent.
-- ============================================================================

-- 1. agent_tasks — the automated/human task queue (Tasks page, follow-ups) -----
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL DEFAULT 'lokazen',
  lead_id UUID REFERENCES all_leads(id) ON DELETE CASCADE,
  lead_name TEXT,
  lead_phone TEXT,
  task_type TEXT NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_scheduled ON agent_tasks(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_brand ON agent_tasks(brand);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_lead ON agent_tasks(lead_id);

-- 2. activities — the per-lead activity/notes feed (Notes tab, call logs) ------
-- created_by is NULLABLE here: system/agent-created activities have no user.
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  note TEXT NOT NULL,
  duration_minutes INTEGER,
  next_followup_date TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES dashboard_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at);

-- 3. Live dashboard updates ---------------------------------------------------
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE agent_tasks; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE activities;  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============================================================================
-- Done. Support requests / human handoffs now create a 'pending' agent_task
-- (see flagForHumanFollowup) so the team can see + act on them on the Tasks page.
-- ============================================================================
