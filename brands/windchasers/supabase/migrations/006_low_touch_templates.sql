-- ============================================================================
-- BCON Low Touch Templates
-- Templates for qualified leads (responded 1-2 times, need nurturing)
-- Timing: Day 1, Day 3, Day 7
-- Tone: Value-focused, educational
-- Channel: WhatsApp
-- ============================================================================

-- Insert Low Touch templates into follow_up_templates (no-op if table missing)
-- Status reflects current Meta approval state

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

-- ============================================
-- DAY 1: Welcome & Value Proposition
-- Status: approved (Active - Quality pending)
-- ============================================
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

-- ============================================
-- DAY 3: Social Proof & Case Study
-- Status: approved (Active - Quality pending)
-- ============================================
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

-- ============================================
-- DAY 7: Soft Check-in & Open Door
-- Status: pending (In review at Meta)
-- ============================================
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
  updated_at = NOW()
    $m006$;
    EXECUTE $m006i$
CREATE INDEX IF NOT EXISTS idx_follow_up_templates_bcon_lowtouch 
ON follow_up_templates(brand, stage, day, channel, is_active)
WHERE brand = 'bcon' AND stage = 'low_touch';
    $m006i$;
    EXECUTE $m006g$
GRANT ALL ON follow_up_templates TO authenticated, anon;
    $m006g$;
  END IF;
END $$;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- Template Status Summary:
-- - Day 1 (bcon_lowtouch_d1_v1): APPROVED ✓
-- - Day 3 (bcon_lowtouch_d3_v1): APPROVED ✓
-- - Day 7 (bcon_lowtouch_d7_v1): IN REVIEW ⏳
-- 
-- Coverage: 2/3 approved (67%)
-- Next: Monitor Day 7 approval status
-- ============================================
