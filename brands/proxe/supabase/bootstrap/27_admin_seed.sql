-- 27_admin_seed.sql
-- Admin login mapping. Auth users created BEFORE this script ran predate the
-- on_auth_user_created trigger (block 01), so their dashboard_users rows were
-- never auto-created — backfill every existing auth user, then promote the
-- admin identities. Users added AFTER this script are handled by the trigger.
INSERT INTO dashboard_users (id, email, full_name, role)
SELECT u.id, COALESCE(u.email, ''), u.raw_user_meta_data->>'full_name', 'viewer'
  FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Covers both admin identities in use; a non-existent email is a no-op.
UPDATE dashboard_users SET role = 'admin'
 WHERE email IN ('brands@bconclub.com', 'bconclubx@gmail.com');

-- Sanity: at least one admin row expected.
SELECT id, email, role FROM dashboard_users
 WHERE email IN ('brands@bconclub.com', 'bconclubx@gmail.com');
