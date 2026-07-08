-- 025: put d2d_visits on the realtime publication.
--
-- WHY: the War Room subscribes to postgres_changes on d2d_visits (live D2D
-- coverage — a knock from the field pulses the seat instantly), but 023
-- created the table without adding it to supabase_realtime, so the
-- subscription never fired. Idempotent via the membership check.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'd2d_visits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE d2d_visits;
  END IF;
END $$;
