-- BCON follow-up template STARTER SET — DRAFT for review (do NOT apply blindly).
-- These power the auto follow-up sequences (templateLibrary + task-worker read
-- follow_up_templates by brand/stage/day/channel). They AUTO-SEND to real leads
-- once meta_status='approved', so:
--   1) Review/adjust the copy below (BCON voice, AI Brand Audit CTA).
--   2) Create matching templates in the Meta WhatsApp console (the meta_template_name
--      values below are placeholders — rename to your actual approved names).
--   3) Only then flip meta_status to 'approved' (kept 'pending' here = worker won't send).
-- {{1}} = lead first name (named-param 'customer_name' on the Meta side).
-- All: brand='bcon', channel='whatsapp', variant='A', language='en'.

INSERT INTO public.follow_up_templates
  (brand, stage, day, channel, variant, content, language, meta_template_name, meta_status, is_active)
VALUES
  ('bcon','one_touch',1,'whatsapp','A',
   'Hi {{1}}, it''s BCON. You reached out about using AI to grow your business — still keen? The best next step is a free AI Brand Audit where we map a custom AI system for you. Want me to set one up?',
   'en','bcon_followup_onetouch_d1','pending',true),

  ('bcon','low_touch',3,'whatsapp','A',
   'Hi {{1}}, following up from BCON. Most businesses we work with weren''t sure where AI fits — that''s exactly what the AI Brand Audit clears up. Happy to book yours whenever suits.',
   'en','bcon_followup_lowtouch_d3','pending',true),

  ('bcon','engaged',7,'whatsapp','A',
   'Hi {{1}}, quick one from BCON. If growing your customers and brand with AI is still on your mind, your free AI Brand Audit is ready when you are. Shall I lock in a time?',
   'en','bcon_followup_engaged_d7','pending',true),

  ('bcon','no_show',1,'whatsapp','A',
   'Hi {{1}}, sorry we missed you for the AI Brand Audit. No worries — want me to reschedule? It takes ~30 mins and you''ll leave with a clear AI plan for your business.',
   'en','bcon_followup_noshow_d1','pending',true),

  ('bcon','demo_taken',1,'whatsapp','A',
   'Hi {{1}}, thanks for taking the AI Brand Audit with BCON. Any questions on the plan we mapped out? Happy to help you take the next step whenever you''re ready.',
   'en','bcon_followup_demo_d1','pending',true),

  ('bcon','proposal_sent',3,'whatsapp','A',
   'Hi {{1}}, checking in on the proposal from BCON. Any questions, or shall we get started on building your AI system?',
   'en','bcon_followup_proposal_d3','pending',true)
ON CONFLICT (brand, stage, day, channel, variant) DO NOTHING;
