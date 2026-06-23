-- =============================================================================
-- Seed: First Admin User
-- =============================================================================
--
-- Run this AFTER 000_master_schema.sql to create your first admin account.
--
-- Prerequisites:
--   1. The user must already exist in Supabase Auth (sign up via the app or
--      create manually in the Supabase dashboard → Authentication → Users).
--   2. The handle_new_user() trigger will auto-create a dashboard_users row
--      with role = 'viewer'. This script upgrades that row to 'admin'.
--
-- Usage:
--   Replace 'admin@yourbrand.com' with the actual email, then run in the
--   Supabase SQL Editor.
-- =============================================================================

-- Option A: Upgrade an existing Auth user to admin
UPDATE dashboard_users
SET role = 'admin', is_active = true
WHERE email = 'admin@yourbrand.com';

-- Option B: Insert directly (if the Auth trigger hasn't fired yet)
-- Uncomment and fill in the auth.users UUID:
--
-- INSERT INTO dashboard_users (id, email, role, is_active)
-- VALUES (
--   '00000000-0000-0000-0000-000000000000',  -- ← auth.users UUID
--   'admin@yourbrand.com',
--   'admin',
--   true
-- )
-- ON CONFLICT (id) DO UPDATE SET role = 'admin', is_active = true;
