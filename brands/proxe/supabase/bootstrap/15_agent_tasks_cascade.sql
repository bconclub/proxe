-- 032_agent_tasks_cascade_on_lead_delete.sql
--
-- Make agent_tasks.lead_id cascade when a lead is deleted.
--
-- Background: chat-originated leads always get a nudge_waiting agent_task
-- created at the engine level. The agent_tasks.lead_id FK was NO ACTION,
-- and the dashboard's per-lead DELETE handler tried to pre-delete the task
-- but the call was silently filtered out by RLS (no authenticated DELETE
-- policy on agent_tasks). The parent all_leads delete then failed on the
-- FK violation, leaving the lead undeletable from the UI.
--
-- Sibling tables (conversations, activities, messages, lead_stage_changes,
-- lead_stage_overrides, social_sessions, voice_sessions, whatsapp_sessions)
-- already cascade on lead delete; web_sessions uses SET NULL. agent_tasks
-- was the lone NO ACTION.

ALTER TABLE agent_tasks
  DROP CONSTRAINT IF EXISTS agent_tasks_lead_id_fkey;

ALTER TABLE agent_tasks
  ADD CONSTRAINT agent_tasks_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES all_leads(id) ON DELETE CASCADE;
