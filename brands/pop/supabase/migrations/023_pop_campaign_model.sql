-- ============================================================================
-- 023 — POP campaign model: engagement types, events, D2D (BRAND-PRIVATE, POP DB ONLY)
-- ============================================================================
-- The campaign is broader than grievances: people arrive to support, volunteer,
-- attend events, ask what we stand for — or WE reach them (outbound, D2D).
-- This adds:
--   1. all_leads.engagement_type  — WHY the person engaged (primary reason)
--   2. magnet gains 'd2d' | 'event' | 'landing' entry channels
--   3. campaign_events + event_rsvps — mobilization spine
--   4. d2d_visits — door-to-door field log (photo of the place, worker, outcome)
-- Same conventions as 022: text + CHECK, additive-only, POP's Supabase only.
-- See brands/pop/docs/campaign-model.md for the model rationale.
-- ============================================================================

-- 1. Why they engaged. Existing rows default to 'grievance' (that WAS the only
--    flow), new rows default at the intake layer per source.
ALTER TABLE all_leads
  ADD COLUMN IF NOT EXISTS engagement_type text DEFAULT 'grievance';

DO $$ BEGIN
  ALTER TABLE all_leads
    ADD CONSTRAINT pop_engagement_type_chk
      CHECK (engagement_type IS NULL OR engagement_type IN
        ('grievance','support','volunteer','event','info','outreach'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Widen magnet (entry channel) with the new arrival paths.
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS pop_magnet_chk;
ALTER TABLE all_leads
  ADD CONSTRAINT pop_magnet_chk
    CHECK (magnet IS NULL OR magnet IN
      ('whatsapp','voice','pulse_app','qr','missed_call','d2d','event','landing'));

-- 3. Events — the mobilization spine ("this event here, on this topic").
CREATE TABLE IF NOT EXISTS campaign_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  title        text NOT NULL,
  topic        text,
  description  text,
  constituency text,
  district     text,
  venue        text,
  event_date   timestamptz,
  status       text NOT NULL DEFAULT 'planned'
               CHECK (status IN ('planned','live','done','cancelled')),
  brand        text NOT NULL DEFAULT 'pop'
);
CREATE INDEX IF NOT EXISTS idx_campaign_events_constituency ON campaign_events (constituency);
CREATE INDEX IF NOT EXISTS idx_campaign_events_date        ON campaign_events (event_date);

CREATE TABLE IF NOT EXISTS event_rsvps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_id   uuid NOT NULL REFERENCES campaign_events(id) ON DELETE CASCADE,
  lead_id    uuid NOT NULL REFERENCES all_leads(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'interested'
             CHECK (status IN ('invited','interested','confirmed','attended','no_show')),
  UNIQUE (event_id, lead_id)
);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_lead  ON event_rsvps (lead_id);

-- 4. D2D — one row per door knocked. lead_id nullable: a knock with no contact
--    captured still counts for coverage. Photos go to the PRIVATE 'd2d-photos'
--    storage bucket (signed URLs only) — photo_url stores the bucket path.
CREATE TABLE IF NOT EXISTS d2d_visits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  worker_name  text,
  worker_phone text,
  lead_id      uuid REFERENCES all_leads(id) ON DELETE SET NULL,
  constituency text,
  district     text,
  booth        text,
  address_note text,
  photo_url    text,
  latitude     double precision,
  longitude    double precision,
  outcome      text NOT NULL DEFAULT 'met'
               CHECK (outcome IN ('met','not_home','refused','revisit')),
  notes        text,
  brand        text NOT NULL DEFAULT 'pop'
);
CREATE INDEX IF NOT EXISTS idx_d2d_visits_constituency ON d2d_visits (constituency);
CREATE INDEX IF NOT EXISTS idx_d2d_visits_lead         ON d2d_visits (lead_id);
CREATE INDEX IF NOT EXISTS idx_d2d_visits_worker       ON d2d_visits (worker_phone);

-- Storage bucket for D2D photos (private; access via signed URLs only).
-- Supabase: INSERT INTO storage.buckets works idempotently via ON CONFLICT.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('d2d-photos', 'd2d-photos', false)
  ON CONFLICT (id) DO NOTHING;
