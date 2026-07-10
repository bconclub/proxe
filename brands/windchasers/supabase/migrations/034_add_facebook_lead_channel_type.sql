-- The app (facebook-lead route, LeadsTable UI, attribution.ts, backfill-attribution)
-- has always used 'facebook_lead' as the first/last_touchpoint value for Meta Lead Ad
-- form submits, but 001_expand_touchpoint_values.sql only ever added 'facebook' (and
-- 'meta_forms') to the channel_type enum — 'facebook_lead' was never added, so every
-- insert/update from /api/agent/facebook-lead has been failing with
-- 22P02 invalid input value for enum channel_type: "facebook_lead".
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'facebook_lead';
