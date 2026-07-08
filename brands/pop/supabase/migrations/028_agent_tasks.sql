-- 028: agent_tasks — the task/reminder engine table.
--
-- WHY: core's task board (/dashboard/tasks), follow-up cron, and the new D2D
-- revisit reminders (d2d/log outcome='revisit') all write/read agent_tasks,
-- but POP's schema never created it (same parity gap Windchasers hit — shape
-- copied from windchasers_task_template_parity.sql / master create-agent-tasks).

CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL DEFAULT 'pop',
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

CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON public.agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_scheduled ON public.agent_tasks(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_brand ON public.agent_tasks(brand);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_lead_id ON public.agent_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_lead_phone ON public.agent_tasks(lead_phone);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_task_type ON public.agent_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created_at ON public.agent_tasks(created_at DESC);
