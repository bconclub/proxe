-- ============================================================================
-- BCON One Touch Templates
-- Templates for initial outreach stage (response_count < 2, silent 24-48h)
-- Timing: Day 3, Day 7, Day 30, Day 90
-- Tone: Soft to Normal
-- Channel: WhatsApp
-- ============================================================================

-- Insert One Touch templates into follow_up_templates
-- Note: meta_template_id and meta_status will be updated after Meta approval

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

-- ============================================
-- DAY 3: Initial Follow-up (Soft)
-- ============================================
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

-- ============================================
-- DAY 7: Value Reminder (Soft)
-- ============================================
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

-- ============================================
-- DAY 30: Monthly Check-in (Normal)
-- ============================================
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

-- ============================================
-- CREATE INDEX FOR ONE_TOUCH QUERIES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_follow_up_templates_bcon_onetouch 
ON follow_up_templates(brand, stage, day, channel, is_active)
WHERE brand = 'bcon' AND stage = 'one_touch';

-- ============================================
-- GRANTS
-- ============================================

GRANT ALL ON follow_up_templates TO authenticated, anon;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Template submission checklist:
-- 1. Run this migration on BCON Supabase project
-- 2. Submit templates to Meta via API or Manager
-- 3. Update meta_template_id and meta_status after approval
-- 4. Test with task-worker.js
-- ============================================
