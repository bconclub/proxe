-- Smart Timing: Add read_at column to conversations for read receipt tracking
-- Also add delivered_at for delivery status tracking

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Index for quick lookups: find last agent message for a lead that has/hasn't been read
CREATE INDEX IF NOT EXISTS idx_conversations_lead_read
  ON conversations (lead_id, sender, created_at DESC)
  WHERE channel = 'whatsapp';
