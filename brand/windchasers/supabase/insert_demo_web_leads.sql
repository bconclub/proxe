-- ============================================================================
-- DEMO WEB LEADS FOR WINDCHASERS
-- ============================================================================
-- This script inserts demo leads into web_sessions for Windchasers
-- Includes aviation-specific data in unified_context
-- ============================================================================

BEGIN;

-- Demo Lead 1: High-intent student interested in DGCA course
WITH lead_1 AS (
  INSERT INTO all_leads (
    customer_name,
    email,
    phone,
    customer_phone_normalized,
    first_touchpoint,
    last_touchpoint,
    brand,
    lead_stage,
    lead_score,
    unified_context,
    last_interaction_at,
    created_at,
    updated_at
  ) VALUES (
    'Rajesh Kumar',
    'rajesh.kumar@email.com',
    '+91 98765 43210',
    '919876543210',
    'web',
    'web',
    'windchasers',
    'Qualified',
    85,
    '{
      "windchasers": {
        "user_type": "student",
        "course_interest": "DGCA",
        "plan_to_fly": "1-3mo",
        "city": "Bangalore",
        "budget_awareness": "aware"
      }
    }'::jsonb,
    NOW() - INTERVAL '1 hour',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 hour'
  )
  RETURNING id
)
INSERT INTO web_sessions (
  lead_id,
  brand,
  customer_name,
  customer_email,
  customer_phone,
  customer_phone_normalized,
  external_session_id,
  chat_session_id,
  website_url,
  booking_status,
  booking_date,
  booking_time,
  conversation_summary,
  user_inputs_summary,
  message_count,
  last_message_at,
  session_status,
  channel_data,
  created_at,
  updated_at
)
SELECT 
  lead_1.id,
  'windchasers',
  'Rajesh Kumar',
  'rajesh.kumar@email.com',
  '+91 98765 43210',
  '919876543210',
  'web_session_' || gen_random_uuid()::text,
  'chat_' || gen_random_uuid()::text,
  'https://windchasers.com',
  'pending',
  CURRENT_DATE + INTERVAL '7 days',
  '10:00:00',
  'Student interested in DGCA course. Asked about course duration, fees, and placement assistance. High engagement, multiple questions.',
  '{
    "questions_asked": [
      "What is the duration of DGCA course?",
      "What are the fees?",
      "Do you provide placement assistance?",
      "What are the eligibility criteria?"
    ],
    "engagement_level": "high",
    "pages_visited": ["/courses/dgca", "/about", "/contact"]
  }'::jsonb,
  12,
  NOW() - INTERVAL '1 hour',
  'active',
  '{
    "device": "desktop",
    "browser": "Chrome",
    "referrer": "google",
    "landing_page": "/courses/dgca"
  }'::jsonb,
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '1 hour'
FROM lead_1;

-- Demo Lead 2: Parent inquiring for child
WITH lead_2 AS (
  INSERT INTO all_leads (
    customer_name,
    email,
    phone,
    customer_phone_normalized,
    first_touchpoint,
    last_touchpoint,
    brand,
    lead_stage,
    lead_score,
    unified_context,
    last_interaction_at,
    created_at,
    updated_at
  ) VALUES (
    'Priya Sharma',
    'priya.sharma@email.com',
    '+91 91234 56789',
    '919123456789',
    'web',
    'web',
    'windchasers',
    'Engaged',
    72,
    '{
      "windchasers": {
        "user_type": "parent",
        "course_interest": "Flight",
        "plan_to_fly": "6+mo",
        "city": "Mumbai",
        "budget_awareness": "aware"
      }
    }'::jsonb,
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '3 hours'
  )
  RETURNING id
)
INSERT INTO web_sessions (
  lead_id,
  brand,
  customer_name,
  customer_email,
  customer_phone,
  customer_phone_normalized,
  external_session_id,
  chat_session_id,
  website_url,
  booking_status,
  booking_date,
  conversation_summary,
  user_inputs_summary,
  message_count,
  last_message_at,
  session_status,
  channel_data,
  created_at,
  updated_at
)
SELECT 
  lead_2.id,
  'windchasers',
  'Priya Sharma',
  'priya.sharma@email.com',
  '+91 91234 56789',
  '919123456789',
  'web_session_' || gen_random_uuid()::text,
  'chat_' || gen_random_uuid()::text,
  'https://windchasers.com',
  'confirmed',
  CURRENT_DATE + INTERVAL '14 days',
  'Parent inquiring about Flight training for 18-year-old son. Interested in career prospects and course structure. Booked demo session.',
  '{
    "questions_asked": [
      "What are the career opportunities after flight training?",
      "Is the course recognized internationally?",
      "What is the pass rate?",
      "Can we visit the campus?"
    ],
    "engagement_level": "medium",
    "pages_visited": ["/courses/flight", "/careers", "/campus"]
  }'::jsonb,
  8,
  NOW() - INTERVAL '3 hours',
  'completed',
  '{
    "device": "mobile",
    "browser": "Safari",
    "referrer": "facebook",
    "landing_page": "/courses/flight"
  }'::jsonb,
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '3 hours'
FROM lead_2;

-- Demo Lead 3: Professional pilot seeking advanced training
WITH lead_3 AS (
  INSERT INTO all_leads (
    customer_name,
    email,
    phone,
    customer_phone_normalized,
    first_touchpoint,
    last_touchpoint,
    brand,
    lead_stage,
    lead_score,
    unified_context,
    last_interaction_at,
    created_at,
    updated_at
  ) VALUES (
    'Captain Vikram Singh',
    'vikram.singh@email.com',
    '+91 99887 66554',
    '919988766554',
    'web',
    'web',
    'windchasers',
    'High Intent',
    92,
    '{
      "windchasers": {
        "user_type": "professional",
        "course_interest": "Heli",
        "plan_to_fly": "asap",
        "city": "Delhi",
        "budget_awareness": "aware"
      }
    }'::jsonb,
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '30 minutes'
  )
  RETURNING id
)
INSERT INTO web_sessions (
  lead_id,
  brand,
  customer_name,
  customer_email,
  customer_phone,
  customer_phone_normalized,
  external_session_id,
  chat_session_id,
  website_url,
  booking_status,
  booking_date,
  booking_time,
  conversation_summary,
  user_inputs_summary,
  message_count,
  last_message_at,
  session_status,
  channel_data,
  created_at,
  updated_at
)
SELECT 
  lead_3.id,
  'windchasers',
  'Captain Vikram Singh',
  'vikram.singh@email.com',
  '+91 99887 66554',
  '919988766554',
  'web_session_' || gen_random_uuid()::text,
  'chat_' || gen_random_uuid()::text,
  'https://windchasers.com',
  'pending',
  CURRENT_DATE + INTERVAL '3 days',
  '14:00:00',
  'Experienced pilot with CPL seeking helicopter training. Very specific questions about helicopter courses, advanced training, and career progression. High-value lead.',
  '{
    "questions_asked": [
      "Do you offer advanced helicopter training?",
      "What is the curriculum for helicopter course?",
      "Are there job placement opportunities?",
      "What is the instructor-to-student ratio?"
    ],
    "engagement_level": "very_high",
    "pages_visited": ["/courses/heli", "/instructors", "/fleet", "/careers"]
  }'::jsonb,
  18,
  NOW() - INTERVAL '30 minutes',
  'active',
  '{
    "device": "desktop",
    "browser": "Chrome",
    "referrer": "direct",
    "landing_page": "/courses/heli"
  }'::jsonb,
  NOW() - INTERVAL '1 day',
  NOW() - INTERVAL '30 minutes'
FROM lead_3;

-- Demo Lead 4: Student interested in Cabin Crew course
WITH lead_4 AS (
  INSERT INTO all_leads (
    customer_name,
    email,
    phone,
    customer_phone_normalized,
    first_touchpoint,
    last_touchpoint,
    brand,
    lead_stage,
    lead_score,
    unified_context,
    last_interaction_at,
    created_at,
    updated_at
  ) VALUES (
    'Ananya Reddy',
    'ananya.reddy@email.com',
    '+91 98765 12345',
    '919876512345',
    'web',
    'web',
    'windchasers',
    'New',
    65,
    '{
      "windchasers": {
        "user_type": "student",
        "course_interest": "Cabin",
        "plan_to_fly": "1yr+",
        "city": "Hyderabad",
        "budget_awareness": "exploring"
      }
    }'::jsonb,
    NOW() - INTERVAL '10 minutes',
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '10 minutes'
  )
  RETURNING id
)
INSERT INTO web_sessions (
  lead_id,
  brand,
  customer_name,
  customer_email,
  customer_phone,
  customer_phone_normalized,
  external_session_id,
  chat_session_id,
  website_url,
  conversation_summary,
  user_inputs_summary,
  message_count,
  last_message_at,
  session_status,
  channel_data,
  created_at,
  updated_at
)
SELECT 
  lead_4.id,
  'windchasers',
  'Ananya Reddy',
  'ananya.reddy@email.com',
  '+91 98765 12345',
  '919876512345',
  'web_session_' || gen_random_uuid()::text,
  'chat_' || gen_random_uuid()::text,
  'https://windchasers.com',
  'Student interested in Cabin Crew training. Asked about course duration, fees, and job opportunities in airlines. Moderate engagement.',
  '{
    "questions_asked": [
      "What is the duration of cabin crew course?",
      "What are the job opportunities?",
      "Is there placement assistance?",
      "What is the fee structure?"
    ],
    "engagement_level": "medium",
    "pages_visited": ["/courses/cabin", "/careers"]
  }'::jsonb,
  6,
  NOW() - INTERVAL '10 minutes',
  'active',
  '{
    "device": "mobile",
    "browser": "Chrome",
    "referrer": "instagram",
    "landing_page": "/courses/cabin"
  }'::jsonb,
  NOW() - INTERVAL '3 hours',
  NOW() - INTERVAL '10 minutes'
FROM lead_4;

-- Demo Lead 5: Drone course inquiry
WITH lead_5 AS (
  INSERT INTO all_leads (
    customer_name,
    email,
    phone,
    customer_phone_normalized,
    first_touchpoint,
    last_touchpoint,
    brand,
    lead_stage,
    lead_score,
    unified_context,
    last_interaction_at,
    created_at,
    updated_at
  ) VALUES (
    'Mohammed Ali',
    'mohammed.ali@email.com',
    '+91 91234 98765',
    '919123498765',
    'web',
    'web',
    'windchasers',
    'Engaged',
    58,
    '{
      "windchasers": {
        "user_type": "student",
        "course_interest": "Drone",
        "plan_to_fly": "1-3mo",
        "city": "Chennai",
        "budget_awareness": "exploring"
      }
    }'::jsonb,
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '1 day'
  )
  RETURNING id
)
INSERT INTO web_sessions (
  lead_id,
  brand,
  customer_name,
  customer_email,
  customer_phone,
  customer_phone_normalized,
  external_session_id,
  chat_session_id,
  website_url,
  conversation_summary,
  user_inputs_summary,
  message_count,
  last_message_at,
  session_status,
  channel_data,
  created_at,
  updated_at
)
SELECT 
  lead_5.id,
  'windchasers',
  'Mohammed Ali',
  'mohammed.ali@email.com',
  '+91 91234 98765',
  '919123498765',
  'web_session_' || gen_random_uuid()::text,
  'chat_' || gen_random_uuid()::text,
  'https://windchasers.com',
  'Student with hobby drone experience interested in professional drone pilot training. Asked about DGCA certification and commercial opportunities.',
  '{
    "questions_asked": [
      "Do you provide DGCA drone license training?",
      "What are commercial drone opportunities?",
      "What is the course fee?",
      "How long is the training?"
    ],
    "engagement_level": "medium",
    "pages_visited": ["/courses/drone", "/certifications"]
  }'::jsonb,
  5,
  NOW() - INTERVAL '1 day',
  'abandoned',
  '{
    "device": "desktop",
    "browser": "Firefox",
    "referrer": "google",
    "landing_page": "/courses/drone"
  }'::jsonb,
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '1 day'
FROM lead_5;

-- Add conversation messages for Lead 1 (high engagement)
INSERT INTO conversations (lead_id, channel, sender, content, message_type, created_at)
SELECT 
  id,
  'web',
  'customer',
  'Hi, I am interested in DGCA course. Can you tell me more about it?',
  'text',
  NOW() - INTERVAL '2 days' + INTERVAL '5 minutes'
FROM all_leads WHERE email = 'rajesh.kumar@email.com' AND brand = 'windchasers' LIMIT 1;

INSERT INTO conversations (lead_id, channel, sender, content, message_type, created_at)
SELECT 
  id,
  'web',
  'agent',
  'Hello! I would be happy to help you with information about our DGCA course. The course duration is 18 months and covers all aspects of commercial pilot training.',
  'text',
  NOW() - INTERVAL '2 days' + INTERVAL '6 minutes'
FROM all_leads WHERE email = 'rajesh.kumar@email.com' AND brand = 'windchasers' LIMIT 1;

INSERT INTO conversations (lead_id, channel, sender, content, message_type, created_at)
SELECT 
  id,
  'web',
  'customer',
  'What are the fees and do you provide placement assistance?',
  'text',
  NOW() - INTERVAL '2 days' + INTERVAL '8 minutes'
FROM all_leads WHERE email = 'rajesh.kumar@email.com' AND brand = 'windchasers' LIMIT 1;

INSERT INTO conversations (lead_id, channel, sender, content, message_type, created_at)
SELECT 
  id,
  'web',
  'agent',
  'The course fee is 8.5 Lakhs. Yes, we have a dedicated placement cell that assists students in securing positions with leading airlines.',
  'text',
  NOW() - INTERVAL '2 days' + INTERVAL '10 minutes'
FROM all_leads WHERE email = 'rajesh.kumar@email.com' AND brand = 'windchasers' LIMIT 1;

-- Add conversation for Lead 3 (professional pilot)
INSERT INTO conversations (lead_id, channel, sender, content, message_type, created_at)
SELECT 
  id,
  'web',
  'customer',
  'I am a CPL holder with 500+ hours. I am interested in helicopter training. What advanced courses do you offer?',
  'text',
  NOW() - INTERVAL '1 day' + INTERVAL '2 minutes'
FROM all_leads WHERE email = 'vikram.singh@email.com' AND brand = 'windchasers' LIMIT 1;

INSERT INTO conversations (lead_id, channel, sender, content, message_type, created_at)
SELECT 
  id,
  'web',
  'agent',
  'Welcome! We offer comprehensive helicopter training programs including Commercial Helicopter Pilot License (CHPL) and advanced mountain flying courses. Given your experience, you may be eligible for accelerated training.',
  'text',
  NOW() - INTERVAL '1 day' + INTERVAL '4 minutes'
FROM all_leads WHERE email = 'vikram.singh@email.com' AND brand = 'windchasers' LIMIT 1;

INSERT INTO conversations (lead_id, channel, sender, content, message_type, created_at)
SELECT 
  id,
  'web',
  'customer',
  'That sounds great. Can I schedule a campus visit to see the facilities?',
  'text',
  NOW() - INTERVAL '1 day' + INTERVAL '6 minutes'
FROM all_leads WHERE email = 'vikram.singh@email.com' AND brand = 'windchasers' LIMIT 1;

INSERT INTO conversations (lead_id, channel, sender, content, message_type, created_at)
SELECT 
  id,
  'web',
  'agent',
  'Absolutely! I can help you schedule a campus visit. We have availability this week. Would you prefer a morning or afternoon slot?',
  'text',
  NOW() - INTERVAL '30 minutes'
FROM all_leads WHERE email = 'vikram.singh@email.com' AND brand = 'windchasers' LIMIT 1;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these after insertion to verify the data:

-- SELECT COUNT(*) FROM all_leads WHERE brand = 'windchasers';
-- SELECT COUNT(*) FROM web_sessions WHERE brand = 'windchasers';
-- SELECT customer_name, email, lead_stage, lead_score, unified_context->'windchasers'->>'course_interest' as course 
--   FROM all_leads WHERE brand = 'windchasers' ORDER BY created_at DESC;
-- SELECT * FROM web_sessions WHERE brand = 'windchasers' ORDER BY created_at DESC LIMIT 5;
-- SELECT COUNT(*) FROM conversations WHERE lead_id IN (SELECT id FROM all_leads WHERE brand = 'windchasers');
