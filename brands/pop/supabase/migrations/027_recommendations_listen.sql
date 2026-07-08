-- 027: recommendations + listen signals.
--
-- campaign_recommendations — the leader app (Pulse Punjab) and future AI
-- pushes directives to the War Room team ("Contact WAR ROOM — push
-- recommendations to Team"). Status tracks the team's response.
--
-- listen_signals — PROXe LISTEN's raw feed. External bridges (WhatsApp media
-- scan group, call centre, volunteer reports, future social scrapers) POST one
-- row per signal via /api/agent/listen/log; the War Room digests them into
-- trending issues / crisis alerts / narratives.

CREATE TABLE IF NOT EXISTS campaign_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  body text,
  source text NOT NULL DEFAULT 'leader' CHECK (source IN ('leader','ai')),
  constituency text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','acked','actioned')),
  created_by text,                 -- leader name / device label from the app
  brand text NOT NULL DEFAULT 'pop'
);
CREATE INDEX IF NOT EXISTS idx_campaign_recos_status ON campaign_recommendations (status);
CREATE INDEX IF NOT EXISTS idx_campaign_recos_created ON campaign_recommendations (created_at DESC);

CREATE TABLE IF NOT EXISTS listen_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN
    ('twitter','facebook','instagram','youtube','news','whatsapp_trend',
     'complaint','call_centre','volunteer_report','survey')),
  content text NOT NULL,
  url text,
  author text,
  sentiment text CHECK (sentiment IS NULL OR sentiment IN ('positive','negative','neutral')),
  issue_category text CHECK (issue_category IS NULL OR issue_category IN
    ('jobs','water','power','roads','drugs','farm_debt','health','education','other')),
  constituency text,
  district text,
  severity smallint DEFAULT 1 CHECK (severity BETWEEN 1 AND 3),
  is_crisis boolean NOT NULL DEFAULT false,
  is_opposition boolean NOT NULL DEFAULT false,
  is_positive boolean NOT NULL DEFAULT false,
  brand text NOT NULL DEFAULT 'pop'
);
CREATE INDEX IF NOT EXISTS idx_listen_signals_created ON listen_signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listen_signals_issue ON listen_signals (issue_category);

-- Realtime pulses for the War Room (same pattern as 025 / d2d_visits).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'campaign_recommendations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE campaign_recommendations;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'listen_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE listen_signals;
  END IF;
END $$;
