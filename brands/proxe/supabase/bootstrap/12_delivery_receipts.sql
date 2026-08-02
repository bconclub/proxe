-- ============================================================================
-- Lokazen — WhatsApp delivery + read receipts (replicates Windchasers)
-- ============================================================================
-- WHY: Lokazen's `conversations` table was created with only the base columns
-- (channel, content, created_at, id, lead_id, message_type, metadata, sender).
-- The delivery-status code (core/src/app/api/agent/whatsapp/meta/route.ts →
-- handleStatusUpdates, and the inbox delivery ticks) writes/reads
-- delivered_at / read_at / delivery_status, which DID NOT EXIST on this DB —
-- so every Meta status webhook update threw and was swallowed, and no
-- delivered/read receipt ever showed. Windchasers' Supabase already has these
-- (its migrations 003 + 019); this file brings Lokazen to parity.
--
-- Run once in the Lokazen Supabase SQL editor (project egwwpngaoaeqemieawcx).
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Read-receipt timestamp columns (Windchasers migration 003) ---------------
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS read_at      timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- 2. Delivery-status columns (Windchasers migration 019) ----------------------
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS delivery_status TEXT
  CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status_error      TEXT;

-- 3. Lead cooldown for failed sends -------------------------------------------
ALTER TABLE all_leads ADD COLUMN IF NOT EXISTS follow_up_cooldown_until TIMESTAMPTZ;

-- 4. Indexes for fast webhook lookups by WhatsApp message id (wamid) ----------
-- The status webhook matches on metadata->>wa_message_id; the sync cron also
-- checks metadata->>whatsapp_message_id. Index both shapes.
CREATE INDEX IF NOT EXISTS idx_conversations_wa_message_id
  ON conversations USING BTREE ((metadata->>'wa_message_id'))
  WHERE metadata->>'wa_message_id' IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_message_id
  ON conversations USING BTREE ((metadata->>'whatsapp_message_id'))
  WHERE metadata->>'whatsapp_message_id' IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_delivery_status
  ON conversations(delivery_status) WHERE delivery_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_all_leads_cooldown
  ON all_leads(follow_up_cooldown_until) WHERE follow_up_cooldown_until IS NOT NULL;

-- 5. Race-condition queue (webhook arrives before the send row is written) -----
CREATE TABLE IF NOT EXISTS status_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_message_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  retry_count INTEGER DEFAULT 0,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_status_sync_queue_unprocessed
  ON status_sync_queue(created_at) WHERE processed_at IS NULL;
GRANT ALL ON status_sync_queue TO authenticated, anon;

-- 6. Live dashboard updates ---------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 7. Backfill existing rows so old sends don't all read as "no receipt" -------
UPDATE conversations SET delivery_status = 'sent', status_updated_at = created_at
  WHERE channel = 'whatsapp' AND sender = 'agent' AND delivery_status IS NULL;
UPDATE conversations SET delivery_status = 'read', status_updated_at = created_at
  WHERE channel = 'whatsapp' AND sender = 'customer' AND delivery_status IS NULL;

-- ============================================================================
-- Done. Delivered/read receipts will populate as Meta posts status webhooks to
-- /api/agent/whatsapp/meta. Ensure the Lokazen Meta app's webhook is subscribed
-- to the `messages` field (which carries statuses) and points at this deployment.
-- ============================================================================
