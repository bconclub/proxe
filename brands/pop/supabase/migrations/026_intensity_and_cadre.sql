-- 026: the INTENSITY LADDER + cadre registry.
--
-- The campaign's central model: ~3 crore people, ~2 crore voters, and every
-- person climbs a ladder of engagement intensity. Every artifact (War Room,
-- leader app, D2D, MyVoice, Listen) reads/writes the SAME person and gauges
-- flow on this one number:
--
--   0 contact           row exists, nothing placeable
--   1 identified voter  placeable: constituency/booth known, a non-default
--                       lean, or vote intent
--   2 supporter         lean='supporter', or leaning + an action intent
--   3 volunteer         volunteered (action_intent/engagement_type) or stage
--                       'Converted' (displays as "Volunteer" for POP)
--   4 cadre             active d2d_workers row linked to this person
--
-- Enforcement is a BEFORE INSERT/UPDATE trigger on all_leads — POP fields are
-- written from many code paths (web chat, WhatsApp, voice webhook, d2d/log,
-- leads/inbound, future MyVoice/D2D apps) and the trigger catches ALL of them
-- with zero app-code changes. RATCHET semantics: intensity climbs, never
-- silently falls (GREATEST of old and derived); lean='opposed' caps the
-- DERIVED tier at 1 but never demotes an existing higher tier.
--
-- Idempotent / re-runnable throughout.

-- ── Cadre registry (tier 4). A cadre IS a person in all_leads. ──
CREATE TABLE IF NOT EXISTS d2d_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  lead_id uuid REFERENCES all_leads(id) ON DELETE SET NULL,
  constituency text,
  district text,
  booth_assignments text[] DEFAULT '{}',
  verification_code text UNIQUE,        -- short code carried on the QR badge
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  brand text NOT NULL DEFAULT 'pop'
);
CREATE INDEX IF NOT EXISTS idx_d2d_workers_constituency ON d2d_workers (constituency);
CREATE INDEX IF NOT EXISTS idx_d2d_workers_lead ON d2d_workers (lead_id);

-- ── Intensity column ──
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS intensity smallint NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE all_leads ADD CONSTRAINT pop_intensity_chk CHECK (intensity BETWEEN 0 AND 4);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_all_leads_intensity ON all_leads (intensity);

-- ── Single source of truth for derivation (trigger + backfill both use it) ──
-- NOTE: lean has DEFAULT 'undecided' (022), so tier-1 must test <> 'undecided',
-- not IS NOT NULL.
CREATE OR REPLACE FUNCTION pop_derive_intensity(
  p_lean text, p_action_intent text, p_engagement_type text,
  p_lead_stage text, p_constituency text, p_booth text, p_lead_id uuid
) RETURNS smallint LANGUAGE plpgsql STABLE AS $fn$
DECLARE t smallint := 0;
BEGIN
  IF p_constituency IS NOT NULL OR p_booth IS NOT NULL
     OR (p_lean IS NOT NULL AND p_lean <> 'undecided')
     OR p_action_intent = 'vote' THEN t := 1; END IF;
  IF p_lean = 'supporter'
     OR (p_lean = 'leaning' AND p_action_intent IN ('vote','rally','share')) THEN t := 2; END IF;
  IF p_action_intent = 'volunteer' OR p_engagement_type = 'volunteer'
     OR p_lead_stage = 'Converted' THEN t := 3; END IF;
  -- Opposed caps the DERIVED tier: an opposed person is still an identified
  -- voter but never counted supporter+. (Ratchet in the trigger still protects
  -- an existing higher tier from demotion.)
  IF p_lean = 'opposed' THEN t := LEAST(t, 1); END IF;
  IF p_lead_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM d2d_workers w WHERE w.lead_id = p_lead_id AND w.status = 'active'
     ) THEN t := 4; END IF;
  RETURN t;
END $fn$;

CREATE OR REPLACE FUNCTION pop_set_intensity() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.intensity := GREATEST(
    COALESCE(CASE WHEN TG_OP = 'UPDATE' THEN OLD.intensity ELSE 0 END, 0),
    pop_derive_intensity(NEW.lean, NEW.action_intent, NEW.engagement_type,
                         NEW.lead_stage, NEW.constituency, NEW.booth, NEW.id));
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_pop_set_intensity ON all_leads;
CREATE TRIGGER trg_pop_set_intensity BEFORE INSERT OR UPDATE ON all_leads
  FOR EACH ROW EXECUTE FUNCTION pop_set_intensity();

-- ── Cadre promotion: registering/activating a worker bumps the linked lead ──
CREATE OR REPLACE FUNCTION pop_promote_cadre() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.lead_id IS NOT NULL AND NEW.status = 'active' THEN
    UPDATE all_leads SET intensity = 4 WHERE id = NEW.lead_id AND intensity < 4;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_pop_promote_cadre ON d2d_workers;
CREATE TRIGGER trg_pop_promote_cadre AFTER INSERT OR UPDATE ON d2d_workers
  FOR EACH ROW EXECUTE FUNCTION pop_promote_cadre();

-- ── Household survey payload rides on the knock itself ──
ALTER TABLE d2d_visits
  ADD COLUMN IF NOT EXISTS survey jsonb,
  ADD COLUMN IF NOT EXISTS survey_version text;

-- ── Backfill (one pass; the trigger keeps it current afterwards) ──
UPDATE all_leads SET intensity = GREATEST(COALESCE(intensity, 0), pop_derive_intensity(
  lean, action_intent, engagement_type, lead_stage, constituency, booth, id))
WHERE brand = 'pop';
