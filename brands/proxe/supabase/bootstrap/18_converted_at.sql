-- 037_add_converted_at.sql
-- Record WHEN a lead converted. The stage already auto-flips to 'Converted'
-- (via the note classifier / manual stage change), but the conversion DATE was
-- never stored — so conversions weren't dated or trackable. This column captures
-- it: set from the note's date when converting via a call/note, else the moment
-- the lead is moved to Converted. Nullable; only set on conversion.

ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS converted_at timestamptz;

-- Index for reporting/sorting converted leads by date.
CREATE INDEX IF NOT EXISTS idx_all_leads_converted_at
  ON all_leads (converted_at DESC)
  WHERE converted_at IS NOT NULL;
