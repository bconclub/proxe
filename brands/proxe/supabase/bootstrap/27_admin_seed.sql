-- 27_admin_seed.sql
-- Run AFTER creating the auth user in the Supabase Dashboard:
--   Authentication → Users → Add user
--     email: bconclubx@gmail.com   (Auto Confirm ✓, set a password)
-- The on_auth_user_created trigger (block 01) auto-inserts the matching
-- dashboard_users row with role 'viewer'; this promotes it to admin.
UPDATE dashboard_users SET role = 'admin' WHERE email = 'bconclubx@gmail.com';

-- Sanity: exactly one admin row expected.
SELECT id, email, role FROM dashboard_users WHERE email = 'bconclubx@gmail.com';
