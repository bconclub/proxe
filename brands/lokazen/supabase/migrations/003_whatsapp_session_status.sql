-- Migration 003 (Lokazen): add session_status to whatsapp_sessions / web_sessions
--
-- Symptom (Lokazen prod logs, 2026-07-13):
--   [sessionManager] Failed to create session
--   { code: 'PGRST204', message: "Could not find the 'session_status' column
--     of 'whatsapp_sessions' in the schema cache" }
--
-- Root cause: core sessionManager.ts inserts `session_status: 'active'` on
-- every WhatsApp/web session create/update. Older brands have this column
-- (added past the master schema, which only carries `conversation_status` on
-- whatsapp_sessions); Lokazen's newer DB never got it, so every session write
-- 400s and is swallowed — sessions silently never persist. Non-fatal (the reply
-- still sends), but it degrades session telemetry. Additive + idempotent.

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS session_status TEXT DEFAULT 'active';

ALTER TABLE web_sessions
  ADD COLUMN IF NOT EXISTS session_status TEXT DEFAULT 'active';

-- Backfill any pre-existing rows to a sane value.
UPDATE whatsapp_sessions SET session_status = 'active' WHERE session_status IS NULL;
UPDATE web_sessions      SET session_status = 'active' WHERE session_status IS NULL;
