-- Setup Windchasers User - READY TO RUN
-- User UID: a1ecec86-e168-42b3-b1da-03c4dafdb690
-- Email: windchasersblr@gmail.com
-- Password: Wind#826991

-- Create dashboard_users entry with admin role
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

-- Verify the entry was created successfully
SELECT 
  id,
  email,
  role,
  is_active,
  created_at,
  updated_at
FROM dashboard_users 
WHERE email = 'windchasersblr@gmail.com';

-- Expected result: Should show one row with:
-- id: a1ecec86-e168-42b3-b1da-03c4dafdb690
-- email: windchasersblr@gmail.com
-- role: admin
-- is_active: true
