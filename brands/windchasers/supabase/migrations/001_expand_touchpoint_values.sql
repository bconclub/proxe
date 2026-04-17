-- Expand allowed first_touchpoint and last_touchpoint values on all_leads
-- to support inbound lead sources from Pabbly, Facebook, Google, website forms, etc.
--
-- CHECK uses ::text + text[] so literals are not coerced to channel_type in the
-- same transaction as ALTER TYPE ADD VALUE (PostgreSQL 55P04 otherwise).
-- Enum extension runs after CHECKs.

-- Drop existing inline CHECK constraints
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_first_touchpoint_check;
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_last_touchpoint_check;

-- Re-add with expanded values (text comparison; works for enum or text columns)
ALTER TABLE all_leads ADD CONSTRAINT all_leads_first_touchpoint_check
  CHECK (
    first_touchpoint::text = ANY (ARRAY[
      'web', 'whatsapp', 'voice', 'social', 'facebook', 'google', 'form', 'manual',
      'pabbly', 'ads', 'referral', 'organic', 'meta_forms'
    ]::text[])
  );

ALTER TABLE all_leads ADD CONSTRAINT all_leads_last_touchpoint_check
  CHECK (
    last_touchpoint::text = ANY (ARRAY[
      'web', 'whatsapp', 'voice', 'social', 'facebook', 'google', 'form', 'manual',
      'pabbly', 'ads', 'referral', 'organic', 'meta_forms'
    ]::text[])
  );

-- Extend enum so rows can store new touchpoints (safe after text-only CHECK above)
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'facebook';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'google';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'form';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'manual';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'pabbly';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'ads';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'referral';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'organic';
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'meta_forms';
