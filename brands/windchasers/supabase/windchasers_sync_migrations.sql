-- ============================================================================
-- windchasers_sync_migrations.sql
-- Combined, idempotent rollout of BCON-origin migrations 001–007 & 999,
-- plus Windchasers all_leads column additions. Safe to run multiple times:
-- uses ADD COLUMN IF NOT EXISTS, CREATE IF NOT EXISTS, DROP IF EXISTS + ADD
-- for CHECK constraints, conditional changelog seeds, and guarded UPDATEs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- all_leads: extra columns (Windchasers sync) + follow-up tracking (999)
-- ----------------------------------------------------------------------------
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS needs_human_followup BOOLEAN DEFAULT FALSE;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS response_count INTEGER DEFAULT 0;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS days_inactive INTEGER DEFAULT 0;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS total_touchpoints INTEGER DEFAULT 0;

ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS last_follow_up_sent_at TIMESTAMPTZ;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS last_follow_up_template TEXT;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS follow_up_count INT DEFAULT 0;
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS follow_up_cooldown_until TIMESTAMPTZ;

COMMENT ON COLUMN all_leads.needs_human_followup IS 'When true, automated follow-ups must not run; human owns next step.';
COMMENT ON COLUMN all_leads.metadata IS 'Arbitrary JSON metadata for integrations and tooling.';
COMMENT ON COLUMN all_leads.response_count IS 'Count of user/agent responses used for follow-up cadence.';
COMMENT ON COLUMN all_leads.days_inactive IS 'Cached or derived inactivity window for scoring and follow-ups.';
COMMENT ON COLUMN all_leads.total_touchpoints IS 'Aggregate touchpoint count across channels.';
COMMENT ON COLUMN all_leads.last_follow_up_sent_at IS 'Timestamp of last automated follow-up message sent';
COMMENT ON COLUMN all_leads.last_follow_up_template IS 'Template name of last follow-up sent (for rotation)';
COMMENT ON COLUMN all_leads.follow_up_count IS 'Number of follow-ups sent in current sequence';
COMMENT ON COLUMN all_leads.follow_up_cooldown_until IS 'Pause follow-ups until this time (user replied, failure, etc)';

-- ----------------------------------------------------------------------------
-- 001_expand_touchpoint_values — expanded first/last_touchpoint allowed set
-- Use ::text + text[] so CHECK does NOT cast string literals to channel_type in
-- the same transaction as ALTER TYPE ADD VALUE (avoids PG 55P04: new enum
-- values must be committed before they can be used). Enum labels are added in
-- 001b below, after these CHECKs.
-- ----------------------------------------------------------------------------
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_first_touchpoint_check;
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_last_touchpoint_check;

ALTER TABLE all_leads ADD CONSTRAINT all_leads_first_touchpoint_check
  CHECK (
    first_touchpoint::text = ANY (ARRAY[
      'web', 'whatsapp', 'voice', 'social', 'facebook', 'google', 'form', 'manual',
      'pabbly', 'ads', 'referral', 'organic', 'meta_forms'
    ]::text[])
  );

ALTER TABLE all_leads ADD CONSTRAINT all_leads_last_touchpoint_check
  CHECK (
    last_touchpoint::text = ANY (ARRAY[
      'web', 'whatsapp', 'voice', 'social', 'facebook', 'google', 'form', 'manual',
      'pabbly', 'ads', 'referral', 'organic', 'meta_forms'
    ]::text[])
  );

-- ----------------------------------------------------------------------------
-- 001b — Extend public.channel_type (run after text-based CHECKs in one txn)
-- Lets INSERT/UPDATE set first_touchpoint/last_touchpoint to new labels.
-- Requires PG 15+ for IF NOT EXISTS. Omit this block if channel_type is absent.
-- ----------------------------------------------------------------------------
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'facebook';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'google';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'form';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'manual';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'pabbly';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'ads';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'referral';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'organic';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'meta_forms';

-- ----------------------------------------------------------------------------
-- 002_business_readiness_score.sql — calculate_lead_score with readiness
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  ai_score INTEGER := 0;
  activity_score INTEGER := 0;
  business_score INTEGER := 0;
  readiness_score INTEGER := 0;
  final_score INTEGER := 0;

  -- AI Analysis components
  engagement_quality_score INTEGER := 0;
  intent_signals_score INTEGER := 0;
  question_depth_score INTEGER := 0;

  -- Activity metrics
  response_rate NUMERIC := 0;
  days_inactive INTEGER := 0;
  touchpoint_count INTEGER := 0;

  -- Business metrics
  has_booking BOOLEAN := FALSE;
  is_reengaged BOOLEAN := FALSE;

  -- Readiness metrics
  form_data JSONB;
  business_intel JSONB;

  -- Lead data
  lead_data RECORD;
  last_interaction TIMESTAMP WITH TIME ZONE;
  message_count INTEGER := 0;
  conversation_summary TEXT;
  unified_context JSONB;
BEGIN
  -- Get lead data
  SELECT
    al.*,
    COALESCE(ws.message_count, 0) + COALESCE(whs.message_count, 0) + COALESCE(vs.call_duration_seconds, 0) / 60 AS total_interactions,
    COALESCE(ws.conversation_summary, whs.conversation_summary, vs.call_summary) AS summary,
    al.unified_context
  INTO lead_data
  FROM all_leads al
  LEFT JOIN web_sessions ws ON ws.lead_id = al.id
  LEFT JOIN whatsapp_sessions whs ON whs.lead_id = al.id
  LEFT JOIN voice_sessions vs ON vs.lead_id = al.id
  WHERE al.id = lead_uuid;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  last_interaction := COALESCE(lead_data.last_interaction_at, lead_data.created_at);
  message_count := COALESCE(lead_data.total_interactions, 0);
  conversation_summary := lead_data.summary;
  unified_context := COALESCE(lead_data.unified_context, '{}'::jsonb);
  form_data := COALESCE(unified_context->'form_data', '{}'::jsonb);
  business_intel := COALESCE(unified_context->'business_intel', '{}'::jsonb);

  -- Calculate days inactive
  days_inactive := EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 86400;

  -- Count touchpoints
  SELECT COUNT(*) INTO touchpoint_count
  FROM (
    SELECT 1 FROM web_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM whatsapp_sessions WHERE lead_id = lead_uuid
    UNION ALL
    SELECT 1 FROM voice_sessions WHERE lead_id = lead_uuid
  ) AS touchpoints;

  -- Check for booking
  SELECT EXISTS(
    SELECT 1 FROM web_sessions
    WHERE lead_id = lead_uuid
    AND booking_status IN ('pending', 'confirmed')
  ) INTO has_booking;

  -- ═══════════════════════════════════════════════
  -- AI Analysis (60 points max)
  -- ═══════════════════════════════════════════════
  IF message_count > 10 THEN
    engagement_quality_score := 20;
  ELSIF message_count > 5 THEN
    engagement_quality_score := 15;
  ELSIF message_count > 2 THEN
    engagement_quality_score := 10;
  ELSIF message_count > 0 THEN
    engagement_quality_score := 5;
  END IF;

  IF unified_context IS NOT NULL AND unified_context ? 'intent_signals' THEN
    intent_signals_score := LEAST(20, (unified_context->>'intent_signals')::INTEGER);
  ELSIF conversation_summary IS NOT NULL THEN
    IF conversation_summary ILIKE '%interested%' OR
       conversation_summary ILIKE '%want%' OR
       conversation_summary ILIKE '%need%' OR
       conversation_summary ILIKE '%book%' OR
       conversation_summary ILIKE '%schedule%' THEN
      intent_signals_score := 15;
    ELSIF conversation_summary ILIKE '%price%' OR
           conversation_summary ILIKE '%cost%' OR
           conversation_summary ILIKE '%information%' THEN
      intent_signals_score := 10;
    ELSE
      intent_signals_score := 5;
    END IF;
  END IF;

  IF unified_context IS NOT NULL AND unified_context ? 'question_depth' THEN
    question_depth_score := LEAST(20, (unified_context->>'question_depth')::INTEGER);
  ELSIF message_count > 5 THEN
    question_depth_score := 15;
  ELSIF message_count > 2 THEN
    question_depth_score := 10;
  ELSE
    question_depth_score := 5;
  END IF;

  ai_score := engagement_quality_score + intent_signals_score + question_depth_score;

  -- ═══════════════════════════════════════════════
  -- Activity Score (25 points max, was 30)
  -- ═══════════════════════════════════════════════
  IF days_inactive = 0 THEN
    response_rate := 1.0;
  ELSIF days_inactive <= 1 THEN
    response_rate := 0.8;
  ELSIF days_inactive <= 3 THEN
    response_rate := 0.6;
  ELSIF days_inactive <= 7 THEN
    response_rate := 0.4;
  ELSE
    response_rate := 0.2;
  END IF;

  -- Scaled to 25 max (was 30): response rate (12) + touchpoints (8) - inactivity (5)
  activity_score := ROUND((response_rate * 12) + LEAST(touchpoint_count * 2, 8) - LEAST(days_inactive / 7, 5));
  activity_score := GREATEST(0, LEAST(25, activity_score));

  -- ═══════════════════════════════════════════════
  -- Business Readiness Score (15 points max, NEW)
  -- ═══════════════════════════════════════════════

  -- has_website = true: +5
  IF (form_data->>'has_website')::boolean IS TRUE
     OR unified_context ? 'website_url' THEN
    readiness_score := readiness_score + 5;
  END IF;

  -- has_ai_systems = false (they NEED us): +3
  IF (form_data->>'has_ai_systems')::boolean IS FALSE THEN
    readiness_score := readiness_score + 3;
  END IF;

  -- urgency is extremely_urgent or asap: +4
  IF form_data->>'urgency' IN ('extremely_urgent', 'asap', 'immediately', 'right_now') THEN
    readiness_score := readiness_score + 4;
  ELSIF form_data->>'urgency' IN ('urgent', 'soon', 'this_week', 'this_month') THEN
    readiness_score := readiness_score + 2;
  END IF;

  -- monthly_leads > 50: +3
  IF form_data ? 'monthly_leads' THEN
    DECLARE
      leads_num INTEGER := 0;
    BEGIN
      -- Extract numeric part from strings like "50-100", "100+", "100"
      leads_num := COALESCE(
        (regexp_replace(form_data->>'monthly_leads', '[^0-9].*', '', 'g'))::INTEGER,
        0
      );
      IF leads_num > 50 THEN
        readiness_score := readiness_score + 3;
      ELSIF leads_num > 20 THEN
        readiness_score := readiness_score + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Skip if parsing fails
    END;
  END IF;

  -- website_live from crawl = true: +2 bonus
  IF (business_intel->>'website_live')::boolean IS TRUE THEN
    readiness_score := readiness_score + 2;
  END IF;

  readiness_score := LEAST(15, readiness_score);

  -- ═══════════════════════════════════════════════
  -- Business boost (booking = major boost)
  -- ═══════════════════════════════════════════════
  IF has_booking THEN
    business_score := 50;
  ELSIF days_inactive > 7 AND days_inactive <= 30 AND message_count > 0 THEN
    business_score := 20;
  END IF;

  -- Final: AI (60) + Activity (25) + Readiness (15) + business boost
  final_score := ai_score + activity_score + readiness_score + business_score;
  final_score := LEAST(100, final_score);

  RETURN final_score;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 003_smart_timing_read_receipts.sql
-- ----------------------------------------------------------------------------
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_lead_read
  ON conversations (lead_id, sender, created_at DESC)
  WHERE channel = 'whatsapp';

-- ----------------------------------------------------------------------------
-- 004_cancel_deprecated_task_types.sql (skip if agent_tasks not deployed)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.agent_tasks') IS NOT NULL THEN
    EXECUTE $qt$
      UPDATE agent_tasks
      SET status = 'cancelled',
          completed_at = NOW(),
          error_message = 'Deprecated task type — cancelled by migration 004'
      WHERE task_type IN ('post_booking_followup', 'booking_reminder_1h')
        AND status IN ('pending', 'queued', 'in_queue', 'awaiting_approval')
    $qt$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 005_one_touch_templates.sql (skip if follow_up_templates not deployed)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.follow_up_templates') IS NOT NULL THEN
    EXECUTE $m005$
INSERT INTO follow_up_templates (
  brand,
  stage,
  day,
  channel,
  variant,
  meta_template_name,
  meta_status,
  content,
  language,
  is_active,
  metadata
) VALUES
(
  'bcon',
  'one_touch',
  3,
  'whatsapp',
  'A',
  'bcon_onetouch_d3_followup_v1',
  'pending',
  'Hi {{1}}, we noticed you checked out BCON recently. Still exploring AI solutions for your business? Happy to answer any questions.',
  'en',
  true,
  '{
    "tone": "soft",
    "purpose": "Initial follow-up for low-engagement leads",
    "parameters": [{"index": 1, "name": "customer_name", "example": "John"}],
    "category": "UTILITY",
    "buttons": []
  }'::jsonb
),
(
  'bcon',
  'one_touch',
  3,
  'whatsapp',
  'B',
  'bcon_onetouch_d3_value_v1',
  'pending',
  'Hi {{1}}, following up on your interest in BCON. Many businesses like yours save 10+ hours/week with our AI systems. Worth a quick chat?',
  'en',
  true,
  '{
    "tone": "soft",
    "purpose": "Value-focused follow-up variant B",
    "parameters": [{"index": 1, "name": "customer_name", "example": "John"}],
    "category": "MARKETING",
    "buttons": []
  }'::jsonb
),
(
  'bcon',
  'one_touch',
  3,
  'whatsapp',
  'C',
  'bcon_onetouch_d3_question_v1',
  'pending',
  'Hi {{1}}, saw you were interested in AI for your business. What''s your biggest challenge with customer follow-ups right now?',
  'en',
  true,
  '{
    "tone": "soft",
    "purpose": "Question-based engagement variant C",
    "parameters": [{"index": 1, "name": "customer_name", "example": "John"}],
    "category": "UTILITY",
    "buttons": []
  }'::jsonb
),
(
  'bcon',
  'one_touch',
  7,
  'whatsapp',
  'A',
  'bcon_onetouch_d7_reminder_v1',
  'pending',
  'Hi {{1}}, wanted to share: our clients typically see 40% faster response times in the first month. Still interested in exploring this for your business?',
  'en',
  true,
  '{
    "tone": "soft",
    "purpose": "Value reminder with social proof",
    "parameters": [{"index": 1, "name": "customer_name", "example": "John"}],
    "category": "MARKETING",
    "buttons": []
  }'::jsonb
),
(
  'bcon',
  'one_touch',
  7,
  'whatsapp',
  'B',
  'bcon_onetouch_d7_case_study_v1',
  'pending',
  'Hi {{1}}, a {{2}} business similar to yours just automated 80% of their repetitive tasks with BCON. Curious how it might work for you?',
  'en',
  true,
  '{
    "tone": "soft",
    "purpose": "Case study approach variant B",
    "parameters": [
      {"index": 1, "name": "customer_name", "example": "John"},
      {"index": 2, "name": "business_type", "example": "retail"}
    ],
    "category": "MARKETING",
    "buttons": []
  }'::jsonb
),
(
  'bcon',
  'one_touch',
  7,
  'whatsapp',
  'C',
  'bcon_onetouch_d7_soft_check_v1',
  'pending',
  'Hi {{1}}, checking in - no pressure at all. If AI automation isn''t a priority right now, I understand. Just let me know either way?',
  'en',
  true,
  '{
    "tone": "soft",
    "purpose": "Soft check-in with low pressure",
    "parameters": [{"index": 1, "name": "customer_name", "example": "John"}],
    "category": "UTILITY",
    "buttons": []
  }'::jsonb
),
(
  'bcon',
  'one_touch',
  30,
  'whatsapp',
  'A',
  'bcon_onetouch_d30_monthly_v1',
  'pending',
  'Hi {{1}}, it''s been a few weeks since we connected. A lot has changed with AI capabilities since then - want a quick update on what''s possible for {{2}} businesses?',
  'en',
  true,
  '{
    "tone": "normal",
    "purpose": "Monthly check-in with new value",
    "parameters": [
      {"index": 1, "name": "customer_name", "example": "John"},
      {"index": 2, "name": "business_type", "example": "retail"}
    ],
    "category": "MARKETING",
    "buttons": []
  }'::jsonb
),
(
  'bcon',
  'one_touch',
  30,
  'whatsapp',
  'B',
  'bcon_onetouch_d30_reengagement_v1',
  'pending',
  'Hi {{1}}, we''re wrapping up a busy month helping businesses automate. Still thinking about AI for {{2}}? I have 10 minutes this week if you want to see what''s possible.',
  'en',
  true,
  '{
    "tone": "normal",
    "purpose": "Re-engagement with availability",
    "parameters": [
      {"index": 1, "name": "customer_name", "example": "John"},
      {"index": 2, "name": "business_type", "example": "retail"}
    ],
    "category": "MARKETING",
    "buttons": []
  }'::jsonb
),
(
  'bcon',
  'one_touch',
  30,
  'whatsapp',
  'C',
  'bcon_onetouch_d30_final_v1',
  'pending',
  'Hi {{1}}, this will be my last message unless you''re interested. If AI automation is something you want to explore in the future, just reply and we''ll pick up where we left off.',
  'en',
  true,
  '{
    "tone": "normal",
    "purpose": "Final attempt with open door",
    "parameters": [{"index": 1, "name": "customer_name", "example": "John"}],
    "category": "UTILITY",
    "buttons": []
  }'::jsonb
)
ON CONFLICT (brand, stage, day, channel, variant)
DO UPDATE SET
  meta_template_name = EXCLUDED.meta_template_name,
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();
    $m005$;
    EXECUTE $m005i$
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_bcon_onetouch
  ON follow_up_templates (brand, stage, day, channel, is_active)
  WHERE brand = 'bcon' AND stage = 'one_touch';
    $m005i$;
    EXECUTE $m005g$
GRANT ALL ON follow_up_templates TO authenticated, anon;
    $m005g$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 006_low_touch_templates.sql (skip if follow_up_templates not deployed)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.follow_up_templates') IS NOT NULL THEN
    EXECUTE $m006$
INSERT INTO follow_up_templates (
  brand,
  stage,
  day,
  channel,
  variant,
  meta_template_name,
  meta_status,
  content,
  language,
  is_active,
  metadata
) VALUES
(
  'bcon',
  'low_touch',
  1,
  'whatsapp',
  'A',
  'bcon_lowtouch_d1_v1',
  'approved',
  'Hi {{1}}, thanks for your interest in BCON! 🚀\n\nOur AI agents handle lead follow-ups 24/7 so you never miss an opportunity. Businesses using BCON see 2-3x more conversions.\n\nWant to see how it works for your {{2}} business?',
  'en',
  true,
  '{
    "tone": "friendly",
    "purpose": "Welcome and initial value proposition for qualified leads",
    "parameters": [
      {"index": 1, "name": "customer_name", "example": "John"},
      {"index": 2, "name": "business_type", "example": "retail"}
    ],
    "category": "UTILITY",
    "buttons": [
      {"type": "QUICK_REPLY", "text": "Show me how"},
      {"type": "QUICK_REPLY", "text": "Book a demo"}
    ]
  }'::jsonb
),
(
  'bcon',
  'low_touch',
  3,
  'whatsapp',
  'A',
  'bcon_lowtouch_d3_v1',
  'approved',
  'Hi {{1}}, quick update: A {{2}} business just like yours automated 80% of their customer follow-ups with BCON in their first month.\n\nThey went from missing 40% of leads to capturing 95%.\n\nCurious how this could work for you?',
  'en',
  true,
  '{
    "tone": "professional",
    "purpose": "Social proof with specific results",
    "parameters": [
      {"index": 1, "name": "customer_name", "example": "John"},
      {"index": 2, "name": "business_type", "example": "retail"}
    ],
    "category": "MARKETING",
    "buttons": [
      {"type": "QUICK_REPLY", "text": "Tell me more"},
      {"type": "QUICK_REPLY", "text": "See case study"}
    ]
  }'::jsonb
),
(
  'bcon',
  'low_touch',
  7,
  'whatsapp',
  'A',
  'bcon_lowtouch_d7_v1',
  'pending',
  'Hi {{1}}, just checking in! 👋\n\nNo pressure at all - we know timing matters. If AI automation isn''t a priority right now, totally understand.\n\nWhen you''re ready to explore, just reply here. We''ll pick up right where we left off.',
  'en',
  true,
  '{
    "tone": "soft",
    "purpose": "Low-pressure check-in with open door for future engagement",
    "parameters": [
      {"index": 1, "name": "customer_name", "example": "John"}
    ],
    "category": "UTILITY",
    "buttons": [
      {"type": "QUICK_REPLY", "text": "Let''s talk"},
      {"type": "QUICK_REPLY", "text": "Maybe later"}
    ]
  }'::jsonb
)
ON CONFLICT (brand, stage, day, channel, variant)
DO UPDATE SET
  meta_template_name = EXCLUDED.meta_template_name,
  meta_status = EXCLUDED.meta_status,
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();
    $m006$;
    EXECUTE $m006i$
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_bcon_lowtouch
  ON follow_up_templates (brand, stage, day, channel, is_active)
  WHERE brand = 'bcon' AND stage = 'low_touch';
    $m006i$;
    EXECUTE $m006g$
GRANT ALL ON follow_up_templates TO authenticated, anon;
    $m006g$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 007_add_changelog_table.sql (table + index + seed rows if missing)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS changelog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  category TEXT NOT NULL,
  changes JSONB NOT NULL,
  gpfc_ref TEXT,
  deployed_by TEXT DEFAULT 'bconclub'
);

CREATE INDEX IF NOT EXISTS idx_changelog_date ON changelog (date DESC);

INSERT INTO changelog (version, category, changes, gpfc_ref)
SELECT '1.0.0', 'core', '["Initial platform setup"]'::jsonb, 'foundation'
WHERE NOT EXISTS (
  SELECT 1 FROM changelog c WHERE c.version = '1.0.0' AND c.category = 'core' AND c.gpfc_ref = 'foundation'
);

INSERT INTO changelog (version, category, changes, gpfc_ref)
SELECT '1.1.0', 'bcon', '["Added web widget prompt", "Fixed sync script", "Updated BCON positioning", "Widget preview 30/70 layout", "Dynamic mobile quick buttons"]'::jsonb, 'session-apr-07'
WHERE NOT EXISTS (
  SELECT 1 FROM changelog c WHERE c.version = '1.1.0' AND c.category = 'bcon' AND c.gpfc_ref = 'session-apr-07'
);

-- ----------------------------------------------------------------------------
-- 999_add_follow_up_tracking.sql — indexes + one-time cooldown (idempotent)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_all_leads_follow_up_tracking
  ON all_leads (last_follow_up_sent_at, follow_up_cooldown_until)
  WHERE needs_human_followup = false;

CREATE INDEX IF NOT EXISTS idx_all_leads_stuck_follow_ups
  ON all_leads (last_interaction_at, follow_up_cooldown_until)
  WHERE lead_stage NOT IN ('Converted', 'Closed Won', 'Closed Lost');

-- Only set cooldown when not already scheduled (safe on re-run)
UPDATE all_leads
SET follow_up_cooldown_until = NOW() + INTERVAL '48 hours'
WHERE id IN (
    SELECT DISTINCT lead_id
    FROM conversations
    WHERE sender = 'agent'
      AND created_at > NOW() - INTERVAL '24 hours'
      AND lead_id IS NOT NULL
)
AND follow_up_cooldown_until IS NULL;

SELECT 'windchasers_sync_migrations.sql applied; all_leads row count = ' || COUNT(*)::text AS result
FROM all_leads;
