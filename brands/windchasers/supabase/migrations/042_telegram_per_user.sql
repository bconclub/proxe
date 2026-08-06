-- 042: a Telegram address per person
--
-- telegram.ts has exactly ONE chat id - a group. That is fine for a daily
-- brief, and useless for "the person who promised to call back at 11 should be
-- reminded at 11", which needs to reach a person rather than a room.
--
-- The link code exists so nobody has to hunt for their numeric Telegram chat
-- id and paste it into a settings box. The dashboard mints a short code, the
-- user taps a t.me link carrying it, and the bot's /start handler binds the
-- chat that answered to the account that asked. The code is single use and
-- expires, so a leaked link cannot redirect someone else's reminders.

BEGIN;

ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS telegram_chat_id     TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username    TEXT,
  ADD COLUMN IF NOT EXISTS telegram_linked_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS telegram_link_code   TEXT,
  ADD COLUMN IF NOT EXISTS telegram_code_expires TIMESTAMPTZ;

-- One Telegram account drives one dashboard user. Without this, two people
-- linking the same chat would both be "the owner" and reminders would follow
-- whichever row was read first.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_users_telegram_chat
  ON public.dashboard_users (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- The webhook looks a user up BY the code it was handed, so that lookup is the
-- one that has to be fast and unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_users_link_code
  ON public.dashboard_users (telegram_link_code)
  WHERE telegram_link_code IS NOT NULL;

-- Which reminders have already been sent. A cron that runs every ten minutes
-- would otherwise re-send the same 11:00 reminder on every pass until the
-- follow-up is cleared, and the fix cannot be "mark the follow-up done" -
-- being reminded is not the same as having made the call.
CREATE TABLE IF NOT EXISTS public.followup_reminders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id  UUID NOT NULL,
  user_id      UUID,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  channel      TEXT NOT NULL DEFAULT 'telegram',
  ok           BOOLEAN NOT NULL DEFAULT TRUE,
  error        TEXT
);

-- One reminder per follow-up. This is the guard that makes the cron idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_reminders_activity
  ON public.followup_reminders (activity_id);

ALTER TABLE public.followup_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read followup reminders" ON public.followup_reminders;
CREATE POLICY "Authenticated users read followup reminders"
  ON public.followup_reminders FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

COMMIT;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'dashboard_users' AND column_name LIKE 'telegram%';
--   -- expect 5 rows
