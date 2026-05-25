-- 033_create_activities_compatibility_table.sql
-- The Windchasers dashboard reads/writes public.activities for notes, call logs,
-- automation summaries, scoring, and lead summaries. Older schema exports only
-- created lead_activities, which made saves appear successful in the UI while
-- the Lead Modal had nothing reliable to read back.

CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.all_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  note TEXT NOT NULL,
  duration_minutes INTEGER NULL,
  next_followup_date TIMESTAMPTZ NULL,
  created_by TEXT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_lead_id
  ON public.activities(lead_id);

CREATE INDEX IF NOT EXISTS idx_activities_created_at
  ON public.activities(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activities_activity_type
  ON public.activities(activity_type);

CREATE INDEX IF NOT EXISTS idx_activities_next_followup_date
  ON public.activities(next_followup_date)
  WHERE next_followup_date IS NOT NULL;

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view activities"
  ON public.activities;
CREATE POLICY "Authenticated users can view activities"
  ON public.activities FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert activities"
  ON public.activities;
CREATE POLICY "Authenticated users can insert activities"
  ON public.activities FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DO $$
BEGIN
  IF to_regclass('public.lead_activities') IS NOT NULL THEN
    INSERT INTO public.activities (
      id,
      lead_id,
      activity_type,
      note,
      duration_minutes,
      next_followup_date,
      created_by,
      created_at
    )
    SELECT
      la.id,
      la.lead_id,
      la.activity_type,
      la.note,
      la.duration_minutes,
      la.next_followup_date,
      la.created_by::text,
      la.created_at
    FROM public.lead_activities la
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
