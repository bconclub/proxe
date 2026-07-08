-- 029: grievance routing — move loop_status forward + assign to a ground-team
-- worker.
--
-- Every intake path (leader/intake, web chat, WhatsApp, voice webhook, d2d/log)
-- only ever writes loop_status='raised' (022). No route existed to route a
-- grievance to a d2d_workers ground-team member or mark it resolved — the loop
-- had a start but no middle or end. This adds the assignment link; the new
-- POST /api/leader/grievances/:id route (leader app) drives raised -> routed ->
-- resolved from here.
--
-- Idempotent / re-runnable.

ALTER TABLE all_leads
  ADD COLUMN IF NOT EXISTS assigned_worker_id uuid REFERENCES d2d_workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at         timestamptz;

CREATE INDEX IF NOT EXISTS idx_all_leads_assigned_worker ON all_leads (assigned_worker_id);
