-- Fix Existing Windchasers User
-- User UID: a1ecec86-e168-42b3-b1da-03c4dafdb690
-- Email: windchasersblr@gmail.com
-- Password: Wind#826991

-- Step 1: Create dashboard_users entry for existing auth user
INSERT INTO dashboard_users (id, email, role, full_name, is_active)
VALUES (
  'a1ecec86-e168-42b3-b1da-03c4dafdb690'::uuid,
  'windchasersblr@gmail.com',
  'admin',
  'Windchasers Admin',
  true
)
ON CONFLICT (id) 
DO UPDATE SET 
  role = 'admin',
  email = 'windchasersblr@gmail.com',
  is_active = true,
  updated_at = NOW();

-- Step 2: Verify the entry was created
SELECT 
  id,
  email,
  role,
  is_active,
  created_at,
  updated_at
FROM dashboard_users 
WHERE email = 'windchasersblr@gmail.com';

-- Step 3: Check if user exists in auth.users (should exist)
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at
FROM auth.users 
WHERE email = 'windchasersblr@gmail.com';
