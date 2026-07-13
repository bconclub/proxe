-- 038_rename_converted_to_closed_won.sql
-- The "won" stage is renamed 'Converted' -> 'Closed Won' (pairs with the
-- existing 'Closed Lost'). This: drops the lead_stage CHECK constraint (by
-- whatever name it currently has), migrates existing 'Converted' rows, and
-- re-adds the constraint with 'Closed Won' in place of 'Converted' plus the
-- full stage set the app uses (incl. Not Qualified / R&R).
--
-- Run this BEFORE / alongside deploying the code rename — until it runs, the DB
-- CHECK rejects 'Closed Won' and the Convert action will 400.

-- 1. Drop every CHECK constraint on all_leads that references lead_stage
--    (name is auto-generated, so find it by definition).
DO $$
DECLARE cname text;
BEGIN
  FOR cname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'all_leads'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%lead_stage%'
  LOOP
    EXECUTE format('ALTER TABLE all_leads DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

-- 2. Migrate existing data.
UPDATE all_leads SET lead_stage = 'Closed Won' WHERE lead_stage = 'Converted';

-- 3. Re-add the constraint with the current full stage set ('Closed Won'
--    replaces 'Converted').
ALTER TABLE all_leads ADD CONSTRAINT all_leads_lead_stage_check CHECK (lead_stage IN (
  'New',
  'Engaged',
  'Qualified',
  'High Intent',
  'Booking Made',
  'Closed Won',
  'Closed Lost',
  'Not Qualified',
  'In Sequence',
  'Cold',
  'R&R'
));

-- NOTE: converted leads are stage_override=true, so the scoring function won't
-- re-score them regardless of name — no function change required.
