-- Migration: Add Business Readiness component to lead scoring
-- Rebalances: AI 60%, Activity 25% (was 30%), Engagement 15% (implicit in AI), Readiness 15% (new)
-- Readiness factors: has_website, no AI systems yet, urgency, monthly leads, website_live from crawl

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
