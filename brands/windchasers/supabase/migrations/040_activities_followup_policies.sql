-- 040: let the pipeline resolve a follow-up
--
-- Follow-ups (the "call them back tomorrow at 11" promise a caller makes when
-- nobody picks up) live in activities.next_follow_up_date. Migration 033 added
-- that column and an index for it, but no UPDATE policy - it was only ever
-- written, never changed. The pipeline queue now marks them done and snoozes
-- them, which is an UPDATE, and without a policy those calls quietly fail
-- wherever the service key is absent.
--
-- Deliberately NOT using agent_tasks: migration 037 blocks every insert there
-- to keep the automation stopped, so a task written to it reaches nobody while
-- reporting success.

BEGIN;

-- Idempotent: this migration may be re-run.
DROP POLICY IF EXISTS "Authenticated users can update activities" ON public.activities;

CREATE POLICY "Authenticated users can update activities"
  ON public.activities
  FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Follow-ups are read by "due soonest first" across all leads, which the 033
-- partial index alone does not order. Cheap, and it keeps the queue's first
-- query off a sort of the whole table.
CREATE INDEX IF NOT EXISTS idx_activities_followup_due
  ON public.activities (next_follow_up_date)
  WHERE next_follow_up_date IS NOT NULL;

COMMIT;

-- Verify:
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'activities' AND cmd = 'UPDATE';
--   -- expect one row: "Authenticated users can update activities"

-- ─────────────────────────────────────────────────────────────────────────────
-- NOT RUN. Kept here so the decision is findable rather than remembered.
--
-- Migration 037 installed trg_block_agent_task_inserts to stop the automation
-- from firing. It blocks ALL inserts, including the human_followup rows the
-- log-call route still writes - those are dropped on the floor, which is why
-- follow-ups moved to activities instead.
--
-- If Telegram reminders off agent_tasks are ever revived, this would let a
-- human's own task through while every automated type stays blocked:
--
--   CREATE OR REPLACE FUNCTION block_agent_task_inserts()
--   RETURNS TRIGGER AS $$
--   BEGIN
--     IF NEW.task_type = 'human_followup'
--        AND (NEW.metadata->>'human_task') = 'true' THEN
--       RETURN NEW;
--     END IF;
--     RETURN NULL;
--   END;
--   $$ LANGUAGE plpgsql;
--
-- Do not run this without deciding what will send those reminders - the VPS
-- worker is dead, so the rows would just accumulate.
