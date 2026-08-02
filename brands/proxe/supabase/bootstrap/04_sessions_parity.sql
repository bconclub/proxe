-- 04_sessions_parity.sql
-- Columns core writes/reads that 007's original DDL predates. Derived from
-- core code, not from any sibling migration (none exists):
--   whatsapp_sessions.external_session_id  webhook + engine.ts:2362
--   whatsapp_sessions.session_status       sessionManager.ts
--   whatsapp_sessions.metadata             calendar/sync
--   booking_* + reminder_*                 cron/booking-reminders
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS external_session_id TEXT,
  ADD COLUMN IF NOT EXISTS session_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS booking_status TEXT,
  ADD COLUMN IF NOT EXISTS booking_date DATE,
  ADD COLUMN IF NOT EXISTS booking_time TIME,
  ADD COLUMN IF NOT EXISTS booking_meet_link TEXT,
  ADD COLUMN IF NOT EXISTS booking_title TEXT,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_external_session_id
  ON whatsapp_sessions(external_session_id);

ALTER TABLE web_sessions
  ADD COLUMN IF NOT EXISTS booking_meet_link TEXT,
  ADD COLUMN IF NOT EXISTS booking_title TEXT,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT FALSE;
