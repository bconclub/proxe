-- 043: a campaign holds many messages, and campaigns hold campaigns
--
-- Two things the model was missing.
--
-- 1. WHICH MESSAGE a send belongs to. campaign_sends recorded who was
--    messaged but not what they were sent, so a campaign that sends three
--    times over a fortnight could only ever report one undifferentiated
--    total. Every send now carries its template name, and the 154 rows
--    already there are backfilled from the campaign's own template - that
--    history is recoverable, it was simply never written down.
--
-- 2. Freedom to Fly is the CAMPAIGN. "Applications open" is one push inside
--    it, and more follow as the event nears. parent_id lets a campaign hang
--    under another so the event rolls up its pushes instead of the dashboard
--    showing a flat list of unrelated sends.

BEGIN;

ALTER TABLE public.campaign_sends
  ADD COLUMN IF NOT EXISTS template_name TEXT;

-- Backfill: every existing send used its campaign's template.
UPDATE public.campaign_sends s
   SET template_name = c.template->>'name'
  FROM public.campaigns c
 WHERE s.campaign_id = c.id
   AND s.template_name IS NULL
   AND c.template->>'name' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_sends_template
  ON public.campaign_sends (campaign_id, template_name);

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_parent ON public.campaigns (parent_id);

COMMIT;

-- Verify:
--   SELECT template_name, COUNT(*) FROM public.campaign_sends GROUP BY 1;
--   -- expect windchasers_scholarship_open_v3 with 155
