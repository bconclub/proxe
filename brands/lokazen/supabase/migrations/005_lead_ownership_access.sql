-- 005: Per-user lead ownership + lead-type access control (features.leadAccess)
-- Lokazen port of windchasers migration 036.
--
-- 1. dashboard_users.allowed_lead_types — which audiences a user may see.
--    NULL = unrestricted (all). Values are Lokazen's canonical lead types
--    from core/src/configs/leadTypes.ts: Owner, Brand, Scout.
-- 2. user_invitations.allowed_lead_types — same, set at invite time and
--    carried onto dashboard_users when the invite is redeemed.
-- 3. all_leads.owner_id — ownership promoted to a real, indexed column so the
--    pipeline / humans views can filter in SQL (?owner=me / IS NULL open pool).
--    The unified_context.owner JSONB object stays as the display record
--    (name/email); both are written together by the app.
--
-- Safe to run before flipping features.leadAccess on for Lokazen. Assumes the
-- shared dashboard_users, user_invitations and all_leads tables already exist
-- in the Lokazen Supabase (they back the dashboard/auth that is already live).

ALTER TABLE dashboard_users  ADD COLUMN IF NOT EXISTS allowed_lead_types TEXT[] NULL;
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS allowed_lead_types TEXT[] NULL;

ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS owner_id UUID NULL
  REFERENCES dashboard_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_all_leads_owner_id ON all_leads(owner_id);

-- Backfill owner_id from any JSONB owner the app already assigned. The join
-- against dashboard_users guards both FK violations (owner no longer exists)
-- and malformed / non-uuid ids stored in JSONB.
UPDATE all_leads l SET owner_id = du.id
FROM dashboard_users du
WHERE l.owner_id IS NULL
  AND du.id::text = l.unified_context->'owner'->>'id';

-- Sanity check (run manually): backfilled vs JSONB owners
-- SELECT count(*) FILTER (WHERE owner_id IS NOT NULL) AS with_owner_col,
--        count(*) FILTER (WHERE unified_context->'owner'->>'id' IS NOT NULL) AS with_owner_jsonb
-- FROM all_leads;
