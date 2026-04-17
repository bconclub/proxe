-- ============================================================================
-- windchasers_task_template_parity.sql
-- Purpose:
--   Create missing task + template tables for Windchasers parity.
-- Scope:
--   DDL only (tables, constraints, indexes). No data mutations.
--
-- Notes:
-- - BCON migration files in brands/bcon/supabase/migrations reference
--   agent_tasks and follow_up_templates but do not include CREATE TABLE for them.
-- - Canonical CREATE TABLE shapes were taken from:
--   - master/agent/scripts/create-agent-tasks.sql
--   - master/supabase/migrations/021_add_flow_stages.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) agent_tasks
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL DEFAULT 'bcon',
  lead_id UUID REFERENCES public.all_leads(id),
  lead_name TEXT,
  lead_phone TEXT,
  task_type TEXT NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_status
  ON public.agent_tasks(status);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_scheduled
  ON public.agent_tasks(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_brand
  ON public.agent_tasks(brand);

-- Helpful for common query patterns in dashboard + engine
CREATE INDEX IF NOT EXISTS idx_agent_tasks_lead_id
  ON public.agent_tasks(lead_id);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_lead_phone
  ON public.agent_tasks(lead_phone);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_task_type
  ON public.agent_tasks(task_type);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_created_at
  ON public.agent_tasks(created_at DESC);

-- ----------------------------------------------------------------------------
-- 2) follow_up_templates
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.follow_up_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL DEFAULT 'default',

  -- Stage and timing
  stage TEXT NOT NULL CHECK (stage IN (
    'one_touch', 'low_touch', 'engaged', 'high_intent',
    'booking_made', 'no_show', 'demo_taken', 'proposal_sent', 'converted'
  )),
  day INTEGER NOT NULL CHECK (day IN (1, 3, 7, 30, 90)),

  -- Channel and variant
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'voice', 'sms', 'email')),
  variant TEXT NOT NULL DEFAULT 'A' CHECK (variant IN ('A', 'B', 'C')),

  -- Meta template info
  meta_template_name TEXT,
  meta_template_id TEXT,
  meta_status TEXT DEFAULT 'pending' CHECK (meta_status IN ('pending', 'approved', 'rejected')),
  meta_rejection_reason TEXT,

  -- Content
  content TEXT NOT NULL,
  language TEXT DEFAULT 'en',

  -- Template rotation tracking
  current_variant TEXT DEFAULT 'A' CHECK (current_variant IN ('A', 'B', 'C')),
  send_count INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ,

  -- Required unique constraint for ON CONFLICT (brand, stage, day, channel, variant)
  CONSTRAINT follow_up_templates_brand_stage_day_channel_variant_key
    UNIQUE (brand, stage, day, channel, variant)
);

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_stage
  ON public.follow_up_templates(stage);

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_day
  ON public.follow_up_templates(day);

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_channel
  ON public.follow_up_templates(channel);

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_meta_status
  ON public.follow_up_templates(meta_status);

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_active
  ON public.follow_up_templates(is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_lookup
  ON public.follow_up_templates(brand, stage, day, channel, is_active);
