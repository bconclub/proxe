-- ============================================================================
-- 037: Stop the agent-task engine (windchasers)
--
-- Run this WHOLE file in the Supabase SQL editor. Paste it all, hit Run once.
-- It is safe to run more than once.
--
-- It does three things:
--   1. Parks every queued task so nothing can fire.
--   2. Installs a trigger so no NEW task can be created.
--   3. Prints a verification table at the end.
--
-- WHY
-- The task worker (/var/www/windchasers-proxe/worker) has been crash-looping
-- since May on a missing SUPABASE_URL, so nothing drained the queue and ~3,500
-- tasks piled up, every one already past its scheduled time. Fixing the
-- worker's .env without this would fire all of them at real customers.
--
-- Parking alone does not hold: the producers are still live (new tasks were
-- created today). Inserts come from ~19 files in core - engine.ts,
-- noteOrchestrator.ts, log-call, inbound, bookingManager - AND from the VPS
-- worker. A trigger stops every writer at the table, instantly, with no deploy
-- and nothing to miss.
--
-- The trigger DROPS the insert silently (RETURN NULL) rather than raising.
-- inbound/route.ts queues a task while creating a lead, and a blocked task
-- must never cost a real lead. Callers see success; the row is not written.
--
-- TO TURN IT ALL BACK ON LATER: see the commented block at the bottom.
-- ============================================================================

BEGIN;

-- ── 1. Park everything currently queued ────────────────────────────────────
-- Nothing is deleted. Status moves to 'cancelled' and the marker makes the
-- parked set findable if you ever want a subset back.
UPDATE agent_tasks
SET status        = 'cancelled',
    error_message = 'Parked 2026-08-03: worker down since May, backlog not re-sent'
WHERE status IN ('pending', 'processing');

-- ── 2. Block creation of new tasks ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION block_agent_task_inserts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Logged, not raised: a breadcrumb in the Postgres logs showing what WOULD
  -- have been queued while paused, without failing the caller.
  RAISE NOTICE 'agent_tasks insert blocked (paused): type=% lead=%',
    NEW.task_type, NEW.lead_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_agent_task_inserts ON agent_tasks;

CREATE TRIGGER trg_block_agent_task_inserts
  BEFORE INSERT ON agent_tasks
  FOR EACH ROW
  EXECUTE FUNCTION block_agent_task_inserts();

COMMIT;

-- ── 3. Verify ──────────────────────────────────────────────────────────────
-- Expect: queued_now = 0, and blocker_installed = 1.
SELECT
  (SELECT count(*) FROM agent_tasks
     WHERE status IN ('pending', 'processing'))                AS queued_now,
  (SELECT count(*) FROM agent_tasks
     WHERE error_message LIKE 'Parked 2026-08-03%')            AS parked_total,
  (SELECT count(*) FROM pg_trigger
     WHERE tgrelid = 'agent_tasks'::regclass
       AND NOT tgisinternal
       AND tgname = 'trg_block_agent_task_inserts')            AS blocker_installed;

-- ============================================================================
-- RESUMING LATER - do NOT run any of this now. It is commented out on purpose;
-- running it is what undoes everything above.
--
--   Step A, allow new tasks to be created again:
--     DROP TRIGGER IF EXISTS trg_block_agent_task_inserts ON agent_tasks;
--
--   Step B, ONLY if you also want the old parked backlog re-queued (you almost
--   certainly do not - it is months stale):
--     UPDATE agent_tasks SET status = 'pending', error_message = NULL
--     WHERE error_message LIKE 'Parked 2026-08-03%';
-- ============================================================================
