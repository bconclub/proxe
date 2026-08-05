-- 006: all_leads.needs_human_followup
--
-- The dashboard selects this column (useRealtimeLeads) and the agent WRITES it
-- whenever a lead is escalated (flagForHumanFollowup, failed template sends,
-- booking failures). Lokazen's all_leads never had it, so:
--   * the Leads page rendered only "column all_leads.needs_human_followup does
--     not exist" and the Activity feed stayed empty, and
--   * every escalation write failed silently, so no lead was ever flagged.
--
-- The dashboard now degrades gracefully without it, but adding it restores the
-- actual feature (flagged leads) and matches the other brands.

ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS needs_human_followup BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_all_leads_needs_human_followup
  ON all_leads(needs_human_followup) WHERE needs_human_followup;
