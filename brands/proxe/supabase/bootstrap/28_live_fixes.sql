-- ============================================================================
-- 28 — Fixes found by actually running this database
--
-- Blocks 01-27 were written before anything used them. Migrating BCON's live
-- data into a project built from them surfaced six defects, four of which make
-- the database unusable rather than merely inconvenient. They were fixed on the
-- live project first; this file exists so a FRESH bootstrap does not
-- reintroduce every one of them.
--
-- Two of these (3 and 4) mean that on a clean bootstrap, the very first insert
-- into `conversations` fails. Nothing in blocks 01-27 exercises that path, so
-- the schema looked healthy right up until real traffic hit it.
--
-- Idempotent and safe to re-run.
-- ============================================================================


-- 1 ─ brand CHECK is single-brand -------------------------------------------
-- 03_lead_schema.sql pins brand to exactly 'proxe' on five tables. This project
-- is now the single database for BCON as well, so every bcon row was rejected
-- with 23514. BCON's own history also carries three legacy brand values from
-- earlier experiments; they are real records and are carried across as they
-- are rather than rewritten to fit a constraint.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['all_leads','web_sessions','whatsapp_sessions'] LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_brand_check');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (brand = ANY (ARRAY[''proxe'',''bcon'',''bournvita'',''default'',''loan brands'']))',
      t, t || '_brand_check');
  END LOOP;
END $$;


-- 2 ─ lead_stage is missing a stage BCON actually uses -----------------------
-- BCON's pipeline has a 'Proposal Sent' stage that PROXe's stage list never
-- had. Found by reading the distinct lead_stage values out of the live data
-- before importing, rather than one rejected row at a time.
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_lead_stage_check;
ALTER TABLE all_leads ADD CONSTRAINT all_leads_lead_stage_check
  CHECK (lead_stage = ANY (ARRAY[
    'New','Engaged','Qualified','High Intent','Proposal Sent','Booking Made',
    'Closed Won','Closed Lost','Not Qualified','In Sequence','Cold','R&R'
  ]));


-- 3 ─ determine_lead_stage: parameter shadows a column ----------------------
-- The function takes a parameter named is_active_chat and all_leads has a
-- column of the same name. Called from a statement that also touches
-- all_leads, PL/pgSQL cannot tell them apart and raises 42702.
-- #variable_conflict resolves in favour of the parameter, which is what every
-- branch already intends: the function judges values passed to it.
CREATE OR REPLACE FUNCTION public.determine_lead_stage(
  score integer, is_active_chat boolean, has_booking boolean
) RETURNS text
LANGUAGE plpgsql
AS $$
#variable_conflict use_variable
BEGIN
  IF has_booking THEN RETURN 'Booking Made';
  ELSIF score >= 86 THEN RETURN 'Booking Made';
  ELSIF score >= 61 THEN RETURN 'High Intent';
  ELSIF score >= 31 THEN RETURN 'Qualified';
  ELSIF is_active_chat THEN RETURN 'Engaged';
  ELSIF score < 61 THEN RETURN 'In Sequence';
  ELSE RETURN 'New';
  END IF;
END;
$$;


-- 4 ─ update_lead_score_and_stage: local variable shadows a column ----------
-- Same collision, worse blast radius: this is the scoring trigger, so the
-- 42702 aborted whatever statement fired it. Symptom on a clean database is
-- that EVERY insert into conversations fails once the lead exists. Fixed by
-- qualifying the one ambiguous read as all_leads.is_active_chat; qualifying
-- states the intent at the point of ambiguity instead of changing name
-- resolution for the whole function.
CREATE OR REPLACE FUNCTION public.update_lead_score_and_stage(
  lead_uuid uuid, user_uuid uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  new_score INTEGER; new_stage TEXT; old_stage TEXT; old_sub_stage TEXT;
  old_score INTEGER; has_override BOOLEAN; is_active_chat BOOLEAN; has_booking BOOLEAN;
BEGIN
  SELECT lead_stage, sub_stage, lead_score, stage_override,
         all_leads.is_active_chat,
         EXISTS(SELECT 1 FROM web_sessions
                 WHERE lead_id = lead_uuid AND booking_status IN ('pending','confirmed'))
    INTO old_stage, old_sub_stage, old_score, has_override, is_active_chat, has_booking
    FROM all_leads WHERE id = lead_uuid;

  IF NOT FOUND THEN RETURN jsonb_build_object('error','Lead not found'); END IF;

  new_score := calculate_lead_score(lead_uuid);
  IF has_override THEN new_stage := old_stage;
  ELSE new_stage := determine_lead_stage(new_score, is_active_chat, has_booking);
  END IF;

  UPDATE all_leads
     SET lead_score = new_score, lead_stage = new_stage, last_scored_at = NOW()
   WHERE id = lead_uuid;

  IF (old_stage IS DISTINCT FROM new_stage OR old_score IS DISTINCT FROM new_score)
     AND user_uuid IS NOT NULL THEN
    INSERT INTO lead_stage_changes (
      lead_id, old_stage, new_stage, old_sub_stage, new_sub_stage,
      old_score, new_score, changed_by, is_automatic, change_reason
    ) VALUES (
      lead_uuid, old_stage, new_stage, old_sub_stage, NULL,
      old_score, new_score, user_uuid, NOT has_override,
      CASE WHEN has_override THEN 'Manual override maintained'
           ELSE 'Automatic score-based update' END
    );
  END IF;

  RETURN jsonb_build_object('lead_id', lead_uuid, 'old_score', old_score,
    'new_score', new_score, 'old_stage', old_stage, 'new_stage', new_stage,
    'updated_at', NOW());
END;
$$;


-- 5 ─ update_lead_metrics still reads a table that was renamed --------------
-- `messages` became `conversations` during bootstrap and this function was not
-- updated with it, so both of its reads pointed at a relation that does not
-- exist (42P01). Only surfaced when something finally inserted into
-- conversations.
CREATE OR REPLACE FUNCTION public.update_lead_metrics(lead_uuid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  msg_count INTEGER; touchpoint_count INTEGER;
  last_interaction TIMESTAMP WITH TIME ZONE; days_inactive_calc INTEGER;
BEGIN
  SELECT COUNT(*) INTO msg_count
    FROM conversations WHERE lead_id = lead_uuid AND sender = 'customer';

  SELECT COUNT(*) INTO touchpoint_count FROM (
    SELECT 1 FROM web_sessions      WHERE lead_id = lead_uuid
    UNION ALL SELECT 1 FROM whatsapp_sessions WHERE lead_id = lead_uuid
    UNION ALL SELECT 1 FROM voice_sessions    WHERE lead_id = lead_uuid
    UNION ALL SELECT 1 FROM social_sessions   WHERE lead_id = lead_uuid
  ) AS touchpoints;

  SELECT MAX(created_at) INTO last_interaction
    FROM conversations WHERE lead_id = lead_uuid;

  IF last_interaction IS NOT NULL THEN
    days_inactive_calc := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  ELSE
    SELECT created_at INTO last_interaction FROM all_leads WHERE id = lead_uuid;
    days_inactive_calc := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;
  END IF;

  UPDATE all_leads
     SET response_count = msg_count,
         total_touchpoints = touchpoint_count,
         days_inactive = GREATEST(0, days_inactive_calc),
         last_interaction_at = COALESCE(last_interaction, last_interaction_at, created_at)
   WHERE id = lead_uuid;
END;
$$;


-- 6 ─ activities.created_by is typed uuid but holds an email ----------------
-- BCON records who logged an activity as an email address, so the import
-- failed with 22P02. The FK could not hold anyway: it referenced accounts that
-- do not exist in this project (auth users cannot be moved over PostgREST).
-- activities is an audit log, so a readable "who" is worth more than a foreign
-- key to absent rows. Widening uuid -> text is lossless.
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_created_by_fkey;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'activities' AND column_name = 'created_by'
                AND data_type = 'uuid') THEN
    ALTER TABLE activities ALTER COLUMN created_by TYPE TEXT USING created_by::text;
  END IF;
END $$;


-- 7 ─ columns BCON has that this schema lacked ------------------------------
-- Found by diffing the two live tables before migrating. Without them the
-- import silently drops real data. All nullable, so existing rows are
-- unaffected.
ALTER TABLE all_leads         ADD COLUMN IF NOT EXISTS disqualification_reason TEXT;
ALTER TABLE web_sessions      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS booking_created_at TIMESTAMPTZ;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS reminder_30m_sent BOOLEAN DEFAULT FALSE;
