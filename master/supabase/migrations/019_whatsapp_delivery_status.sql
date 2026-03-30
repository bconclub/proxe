-- ============================================================================
-- Migration: WhatsApp Delivery Status Tracking
-- Adds dedicated columns for tracking Meta WhatsApp message delivery status
-- ============================================================================
-- Created: 2026-03-30
-- Purpose: Enable automatic delivery status updates from Meta webhooks
-- ============================================================================

-- ============================================================================
-- 1. ADD NEW COLUMNS TO CONVERSATIONS TABLE
-- ============================================================================

-- Add delivery_status column with check constraint for valid Meta statuses
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS delivery_status TEXT 
CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed'));

COMMENT ON COLUMN conversations.delivery_status IS 
'Meta WhatsApp message delivery status: pending=awaiting send, sent=Meta accepted, delivered=received by device, read=opened by user, failed=delivery error';

-- Add status_updated_at timestamp column
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN conversations.status_updated_at IS 
'When the delivery_status was last updated from Meta webhook';

-- Add status error details column for failed messages
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS status_error TEXT;

COMMENT ON COLUMN conversations.status_error IS 
'Error message from Meta when delivery_status is failed';

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for fast webhook lookups by WhatsApp message ID
CREATE INDEX IF NOT EXISTS idx_conversations_metadata_whatsapp_msg_id 
ON conversations USING BTREE ((metadata->>'whatsapp_message_id'))
WHERE metadata->>'whatsapp_message_id' IS NOT NULL;

COMMENT ON INDEX idx_conversations_metadata_whatsapp_msg_id IS 
'Fast lookup of conversations by Meta WhatsApp message ID (wamid) for webhook status updates';

-- Index for filtering by delivery status
CREATE INDEX IF NOT EXISTS idx_conversations_delivery_status 
ON conversations(delivery_status)
WHERE delivery_status IS NOT NULL;

COMMENT ON INDEX idx_conversations_delivery_status IS 
'Filter conversations by delivery status for dashboard display and sync jobs';

-- Composite index for sync cron job (pending/sent messages within date range)
CREATE INDEX IF NOT EXISTS idx_conversations_status_sync 
ON conversations(delivery_status, created_at)
WHERE delivery_status IN ('pending', 'sent') AND created_at > NOW() - INTERVAL '7 days';

COMMENT ON INDEX idx_conversations_status_sync IS 
'Efficient queries for status sync cron job to find messages needing status check';

-- Index for lead lookup with pending/failed messages
CREATE INDEX IF NOT EXISTS idx_conversations_lead_delivery 
ON conversations(lead_id, delivery_status)
WHERE delivery_status IN ('pending', 'failed');

-- ============================================================================
-- 3. BACKFILL EXISTING DATA
-- ============================================================================

-- Set 'sent' for all existing agent WhatsApp messages (Meta confirmed receipt)
UPDATE conversations 
SET 
  delivery_status = 'sent',
  status_updated_at = created_at
WHERE 
  channel = 'whatsapp'
  AND sender = 'agent'
  AND delivery_status IS NULL
  AND created_at < NOW() - INTERVAL '24 hours';

-- Set 'pending' for recent agent WhatsApp messages (might still be processing)
UPDATE conversations 
SET 
  delivery_status = 'pending',
  status_updated_at = created_at
WHERE 
  channel = 'whatsapp'
  AND sender = 'agent'
  AND delivery_status IS NULL
  AND created_at >= NOW() - INTERVAL '24 hours';

-- Customer messages are always 'read' from our perspective (we received them)
UPDATE conversations 
SET 
  delivery_status = 'read',
  status_updated_at = created_at
WHERE 
  channel = 'whatsapp'
  AND sender = 'customer'
  AND delivery_status IS NULL;

-- ============================================================================
-- 4. ENABLE REALTIME FOR STATUS UPDATES
-- ============================================================================

-- Add conversations table to realtime publication for live dashboard updates
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ============================================================================
-- 5. CREATE HELPER FUNCTION FOR STATUS UPDATES
-- ============================================================================

-- Function to update delivery status with proper validation
CREATE OR REPLACE FUNCTION update_message_delivery_status(
  p_conversation_id UUID,
  p_status TEXT,
  p_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_valid_statuses TEXT[] := ARRAY['pending', 'sent', 'delivered', 'read', 'failed'];
BEGIN
  -- Validate status
  IF NOT (p_status = ANY(v_valid_statuses)) THEN
    RAISE EXCEPTION 'Invalid delivery status: %', p_status;
  END IF;
  
  -- Update conversation
  UPDATE conversations 
  SET 
    delivery_status = p_status,
    status_updated_at = NOW(),
    status_error = CASE WHEN p_status = 'failed' THEN p_error ELSE status_error END,
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{delivery_status}',
      to_jsonb(p_status)
    )
  WHERE id = p_conversation_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_message_delivery_status IS 
'Atomically update message delivery status with validation and metadata sync';

-- ============================================================================
-- 6. ADD COOLDOWN COLUMN TO ALL_LEADS (for failed message handling)
-- ============================================================================

ALTER TABLE all_leads 
ADD COLUMN IF NOT EXISTS follow_up_cooldown_until TIMESTAMPTZ;

COMMENT ON COLUMN all_leads.follow_up_cooldown_until IS 
'When status is failed, cooldown until this time before sending follow-up (24h from failure)';

CREATE INDEX IF NOT EXISTS idx_all_leads_cooldown 
ON all_leads(follow_up_cooldown_until) 
WHERE follow_up_cooldown_until IS NOT NULL;

-- ============================================================================
-- 7. CREATE STATUS SYNC QUEUE TABLE (for race condition handling)
-- ============================================================================

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
ON status_sync_queue(created_at) 
WHERE processed_at IS NULL;

COMMENT ON TABLE status_sync_queue IS 
'Temporary queue for status webhooks that arrived before DB write (race condition handling)';

-- ============================================================================
-- 8. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION update_message_delivery_status TO authenticated, anon;
GRANT ALL ON status_sync_queue TO authenticated, anon;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Deploy code changes to webhook handlers
-- 2. Deploy dashboard UI updates
-- 3. Test end-to-end delivery status flow
-- ============================================================================
