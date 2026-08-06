-- SUPERSEDED - DO NOT RUN. Kept for history only.
--
-- This targeted BCON's ORIGINAL project (yvkauaiyranysldubnqv), on the plan
-- where PROXe leads moved INTO it. The consolidation went the other way: BCON
-- moved to ocduyhevwgfexqaxqdsz, which already allowed 'billing' because it was
-- built from the proxe bootstrap pack. Nothing here is needed on the live
-- database, and the original project is being decommissioned.
--
-- The equivalent live fixes are in
-- brands/proxe/supabase/bootstrap/28_live_fixes.sql.
--
-- ---------------------------------------------------------------------------
-- Original note follows.
--
-- Allow 'billing' as a touchpoint on all_leads.
--
-- WHY: PROXe product leads are moving into this (BCON's) Supabase alongside
-- BCON's service leads, segmented by the `brand` column. The goproxe.com landing
-- site records Dodo Payments events by writing first_touchpoint/last_touchpoint
-- = 'billing' (app/lib/leadsSupabase.ts -> recordBillingEvent), which is the only
-- path that can create a lead row for someone who paid without ever filling in
-- the form.
--
-- Verified against this database before writing this file: inserting
-- brand='proxe' with touchpoint='web' SUCCEEDS (there is no restrictive brand
-- CHECK here), but touchpoint='billing' fails with
--   23514  new row for relation "all_leads" violates check constraint
--          "all_leads_first_touchpoint_check"
-- Without this migration every Dodo payment event would be rejected by the
-- database and silently swallowed by the landing site's non-throwing error
-- handling: the customer is charged and no record of it ever reaches the
-- dashboard. That is the failure this file exists to prevent.
--
-- The value list below is 001_expand_touchpoint_values.sql's list plus
-- 'billing'. Nothing is removed, so existing rows stay valid and this is safe
-- to re-run.
--
-- As in 001: compare on ::text so the literals are not coerced to channel_type,
-- and keep the enum extension in a SEPARATE statement after the CHECKs
-- (PostgreSQL 55P04 if a newly added enum value is used in the same
-- transaction that added it).

ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_first_touchpoint_check;
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_last_touchpoint_check;

ALTER TABLE all_leads ADD CONSTRAINT all_leads_first_touchpoint_check
  CHECK (
    first_touchpoint::text = ANY (ARRAY[
      'web', 'whatsapp', 'voice', 'social', 'facebook', 'google', 'form', 'manual',
      'pabbly', 'ads', 'referral', 'organic', 'meta_forms', 'billing'
    ]::text[])
  );

ALTER TABLE all_leads ADD CONSTRAINT all_leads_last_touchpoint_check
  CHECK (
    last_touchpoint::text = ANY (ARRAY[
      'web', 'whatsapp', 'voice', 'social', 'facebook', 'google', 'form', 'manual',
      'pabbly', 'ads', 'referral', 'organic', 'meta_forms', 'billing'
    ]::text[])
  );

-- Defensive: the probe returned 23514 (CHECK) rather than 22P02 (invalid enum
-- input), so these columns are almost certainly TEXT here and this line is a
-- no-op. It costs nothing and makes the migration correct on a database where
-- the columns are the channel_type enum instead.
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'billing';
