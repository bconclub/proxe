-- 024: widen first/last_touchpoint to the POP campaign entry channels.
--
-- WHY: /api/agent/d2d/log stamps first_touchpoint='d2d' on a met visit, but the
-- master-schema CHECK only allowed ('web','whatsapp','voice','social') — the
-- violation killed the WHOLE enrichment update (magnet, lean, constituency all
-- lost). Touchpoints now accept the same campaign channels as `magnet` (023).
--
-- Idempotent: drop + recreate the CHECKs with the widened set.

ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_first_touchpoint_check;
ALTER TABLE all_leads ADD CONSTRAINT all_leads_first_touchpoint_check
  CHECK (first_touchpoint IN ('web', 'whatsapp', 'voice', 'social', 'pulse_app', 'qr', 'missed_call', 'd2d', 'event', 'landing'));

ALTER TABLE all_leads DROP CONSTRAINT IF EXISTS all_leads_last_touchpoint_check;
ALTER TABLE all_leads ADD CONSTRAINT all_leads_last_touchpoint_check
  CHECK (last_touchpoint IN ('web', 'whatsapp', 'voice', 'social', 'pulse_app', 'qr', 'missed_call', 'd2d', 'event', 'landing'));
