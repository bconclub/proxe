-- Create Admin User Script
-- Run this in Supabase SQL Editor after creating the user in Supabase Auth

-- Step 1: First, create the user in Supabase Auth Dashboard:
-- Go to Authentication > Users > Add User
-- Email: admin@master.com (or your domain)
-- Password: masterpass
-- Create User

-- Step 2: After creating the user, find their user ID from Authentication > Users
-- Then run this SQL (replace 'USER_ID_HERE' with the actual user ID):

-- Update the user to admin role
UPDATE dashboard_users 
SET role = 'admin' 
WHERE email = 'admin@master.com';

-- Or if you know the user ID:
-- UPDATE dashboard_users 
-- SET role = 'admin' 
-- WHERE id = 'USER_ID_HERE';

-- To verify:
-- SELECT id, email, role FROM dashboard_users WHERE email = 'admin@master.com';

