-- One-off backfill (run in Windchasers Supabase SQL editor, NOT a migration):
-- Pabbly hardcoded utm_source "Res1 Platform" into leads/inbound custom_fields,
-- so attribution.source = 'res1 platform' → SOURCE badge "RES1 PLATFORM".
-- These are all Meta lead-form leads; the per-lead placement (ig/fb) wasn't
-- captured back then, so the honest correction is source = meta_ads.
--
-- Preview what will change first:
SELECT id, customer_name,
       unified_context->'attribution'->>'source'       AS old_source,
       unified_context->'attribution'->>'source_label' AS old_label
FROM all_leads
WHERE brand = 'windchasers'
  AND lower(unified_context->'attribution'->>'source') LIKE 'res1%';

-- Then apply:
UPDATE all_leads
SET unified_context = jsonb_set(
      jsonb_set(unified_context, '{attribution,source}', '"meta_ads"'),
      '{attribution,source_label}', '"Meta Ads"'
    )
WHERE brand = 'windchasers'
  AND lower(unified_context->'attribution'->>'source') LIKE 'res1%';
