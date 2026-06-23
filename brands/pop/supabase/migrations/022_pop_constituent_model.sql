-- ============================================================================
-- 022 — POP constituent reskin (BRAND-PRIVATE, POP DB ONLY)
-- ============================================================================
-- Reskins all_leads into a "constituent" record for Pulse of Punjab.
-- ISOLATION: this migration lives under brands/pop/supabase and is applied ONLY
-- to POP's Supabase project. It is NOT in master/supabase, NOT propagated, and
-- touches NO shared-core code. Other brands (bcon/windchasers/master) are
-- unaffected — they have their own databases and never run this file.
--
-- Mapping notes:
--   name  -> existing all_leads.customer_name (no redundant column added)
--   phone -> existing all_leads.phone, now the cross-channel merge key
--            (partial UNIQUE; left nullable so shared-core anon/web inserts that
--             lack a phone do not break — non-null phones still cannot duplicate)
--   created_at / updated_at -> already present
-- New constituent columns are added as text + CHECK (matches the existing
-- schema's text-status convention; easy to extend the taxonomy later).
-- ============================================================================

ALTER TABLE all_leads
  ADD COLUMN IF NOT EXISTS constituency        text,
  ADD COLUMN IF NOT EXISTS district            text,
  ADD COLUMN IF NOT EXISTS booth               text,
  ADD COLUMN IF NOT EXISTS language            text,
  ADD COLUMN IF NOT EXISTS lean                text DEFAULT 'undecided',
  ADD COLUMN IF NOT EXISTS magnet              text,
  ADD COLUMN IF NOT EXISTS grievance_category  text,
  ADD COLUMN IF NOT EXISTS grievance_text      text,
  ADD COLUMN IF NOT EXISTS salience            integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS action_intent       text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS loop_status         text DEFAULT 'raised';

-- Enum-style guards (text + CHECK). NULL allowed where the field may be unknown
-- at capture time (language/magnet/grievance_category/constituency/district).
ALTER TABLE all_leads
  ADD CONSTRAINT pop_language_chk
    CHECK (language IS NULL OR language IN ('pa','hi','en')),
  ADD CONSTRAINT pop_lean_chk
    CHECK (lean IS NULL OR lean IN ('supporter','leaning','undecided','opposed')),
  ADD CONSTRAINT pop_magnet_chk
    CHECK (magnet IS NULL OR magnet IN ('whatsapp','voice','pulse_app','qr','missed_call')),
  ADD CONSTRAINT pop_grievance_category_chk
    CHECK (grievance_category IS NULL OR grievance_category IN
      ('jobs','water','power','roads','drugs','farm_debt','health','education','other')),
  ADD CONSTRAINT pop_salience_chk
    CHECK (salience IS NULL OR salience BETWEEN 1 AND 3),
  ADD CONSTRAINT pop_action_intent_chk
    CHECK (action_intent IS NULL OR action_intent IN ('vote','volunteer','rally','share','none')),
  ADD CONSTRAINT pop_loop_status_chk
    CHECK (loop_status IS NULL OR loop_status IN ('raised','routed','resolved'));

-- phone = cross-channel merge key. Partial UNIQUE: one constituent per phone,
-- multiple NULL phones allowed (anon/web). "same phone = one constituent."
CREATE UNIQUE INDEX IF NOT EXISTS uniq_all_leads_phone_pop
  ON all_leads (phone) WHERE phone IS NOT NULL;

-- Helpful lookups for the constituency map + grievance feed.
CREATE INDEX IF NOT EXISTS idx_all_leads_constituency_pop ON all_leads (constituency);
CREATE INDEX IF NOT EXISTS idx_all_leads_grievance_cat_pop ON all_leads (grievance_category);
CREATE INDEX IF NOT EXISTS idx_all_leads_loop_status_pop   ON all_leads (loop_status);
