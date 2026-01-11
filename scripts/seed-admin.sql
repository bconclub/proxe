-- Seed script to create an admin user
-- Replace the email and user_id with your actual values

-- First, create the user in auth.users (or use Supabase Auth UI)
-- Then run this script to set them as admin

-- Example: Update existing user to admin role
-- UPDATE dashboard_users 
-- SET role = 'admin' 
-- WHERE email = 'admin@example.com';

-- Or insert a new dashboard user (if auth user already exists)
-- INSERT INTO dashboard_users (id, email, full_name, role)
-- VALUES (
--   'user-uuid-here',  -- Replace with actual auth.users.id
--   'admin@example.com',
--   'Admin User',
--   'admin'
-- );

-- To find your user ID:
-- SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';


