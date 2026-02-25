-- Create Windchasers Admin User
-- Run this SQL in your Supabase SQL Editor

-- Step 1: First create the user in Supabase Auth UI
-- Go to: Authentication > Users > Add user > Create new user
-- Email: windchasersblr@gmail.com
-- Password: Wind#826991
-- Auto Confirm User: ✅ (checked)
-- Copy the User ID after creation

-- Step 2: After creating the user in Auth UI, run this SQL:
-- Replace 'YOUR_USER_ID_HERE' with the actual user ID from Step 1

-- Create dashboard_users entry with admin role
INSERT INTO dashboard_users (id, email, role, full_name, is_active)
VALUES (
  'YOUR_USER_ID_HERE'::uuid,  -- Replace with actual user ID from Supabase Auth
  'windchasersblr@gmail.com',
  'admin',
  'Windchasers Admin',
  true
)
ON CONFLICT (id) 
DO UPDATE SET 
  role = 'admin',
  email = 'windchasersblr@gmail.com',
  is_active = true;

-- Step 3: Verify the user was created
SELECT id, email, role, is_active, created_at 
FROM dashboard_users 
WHERE email = 'windchasersblr@gmail.com';
