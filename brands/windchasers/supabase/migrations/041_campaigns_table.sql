-- 041: campaigns become rows
--
-- Every campaign used to live inside ONE JSON document - dashboard_settings
-- with key 'campaigns_v1' - and every save rewrote the whole document. That
-- design loses data three ways, and has:
--
--   1. A read that returns nothing (transient error, service client missing,
--      unexpected shape) is indistinguishable from "there are no campaigns".
--      The next save then writes that empty list over everything.
--   2. Two people saving at once: last write wins, the other's work is gone.
--   3. No history. Nothing to restore from.
--
-- The 'campaigns_v1' row is currently MISSING entirely, and the campaigns that
-- were in it are unrecoverable. One row per campaign means a bad read can
-- never erase a campaign it did not return, and a concurrent save touches only
-- its own row.

BEGIN;

CREATE TABLE IF NOT EXISTS public.campaigns (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'ready', 'sending', 'sent', 'archived')),
  channel       TEXT NOT NULL DEFAULT 'whatsapp',
  -- Audience and template stay JSON: their shape is the builder's business and
  -- changes with it. What matters is that they are per-campaign, not shared.
  audience      JSONB NOT NULL DEFAULT '{}'::jsonb,
  template      JSONB,
  scheduled_at  TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  -- Send outcome, filled when a send actually runs.
  sent_count    INTEGER NOT NULL DEFAULT 0,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON public.campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns (status);

-- Per-recipient send log. Without it "sent" is a number nobody can audit, and
-- a re-run cannot tell who already received the message.
CREATE TABLE IF NOT EXISTS public.campaign_sends (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  TEXT NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id      UUID,
  phone        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error        TEXT,
  message_id   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON public.campaign_sends (campaign_id);
-- One send per lead per campaign: a retried or double-clicked send must not
-- message the same person twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_sends_unique
  ON public.campaign_sends (campaign_id, lead_id)
  WHERE lead_id IS NOT NULL;

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users manage campaigns" ON public.campaigns;
CREATE POLICY "Authenticated users manage campaigns"
  ON public.campaigns FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users manage campaign sends" ON public.campaign_sends;
CREATE POLICY "Authenticated users manage campaign sends"
  ON public.campaign_sends FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Carry over anything still in the old blob. Harmless when the row is missing
-- (which it currently is) or already migrated - ON CONFLICT keeps the row that
-- is already there.
INSERT INTO public.campaigns (id, name, status, channel, audience, template, scheduled_at, created_by, created_at, updated_at)
SELECT
  c->>'id',
  COALESCE(c->>'name', 'Untitled'),
  CASE WHEN c->>'status' IN ('draft','ready','sending','sent','archived') THEN c->>'status' ELSE 'draft' END,
  COALESCE(c->>'channel', 'whatsapp'),
  COALESCE(c->'audience', '{}'::jsonb),
  c->'template',
  NULLIF(c->>'scheduled_at', '')::timestamptz,
  c->>'created_by',
  COALESCE(NULLIF(c->>'created_at', '')::timestamptz, NOW()),
  COALESCE(NULLIF(c->>'updated_at', '')::timestamptz, NOW())
FROM public.dashboard_settings s
CROSS JOIN LATERAL jsonb_array_elements(s.value->'campaigns') AS c
WHERE s.key = 'campaigns_v1'
  AND jsonb_typeof(s.value->'campaigns') = 'array'
  AND c->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verify:
--   SELECT COUNT(*) FROM public.campaigns;
--   SELECT id, name, status, created_at FROM public.campaigns ORDER BY created_at DESC LIMIT 10;
--
-- The old dashboard_settings row is deliberately NOT deleted. It costs nothing
-- to keep, and if it ever reappears from a backup the rows can be re-imported
-- by re-running the INSERT above.
