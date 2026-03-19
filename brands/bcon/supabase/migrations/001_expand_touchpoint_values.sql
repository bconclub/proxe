-- Expand allowed first_touchpoint and last_touchpoint values on all_leads
-- to support inbound lead sources from Pabbly, Facebook, Google, website forms, etc.

-- Drop existing inline CHECK constraints
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_first_touchpoint_check;
ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_last_touchpoint_check;

-- Re-add with expanded values
ALTER TABLE all_leads ADD CONSTRAINT all_leads_first_touchpoint_check
  CHECK (first_touchpoint IN ('web', 'whatsapp', 'voice', 'social', 'facebook', 'google', 'pabbly', 'manual', 'form'));

ALTER TABLE all_leads ADD CONSTRAINT all_leads_last_touchpoint_check
  CHECK (last_touchpoint IN ('web', 'whatsapp', 'voice', 'social', 'facebook', 'google', 'pabbly', 'manual', 'form'));
