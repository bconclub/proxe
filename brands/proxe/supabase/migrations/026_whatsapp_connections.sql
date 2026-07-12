-- 026_whatsapp_connections.sql
-- Stores WhatsApp Cloud API connections created via the dashboard's
-- embedded-signup flow (Agents → WhatsApp → Connect WhatsApp).
-- Service-role access only: RLS enabled with NO policies — anon/authed
-- clients can never read the access token.

CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  display_phone_number text,
  verified_name text,
  quality_rating text,
  access_token text NOT NULL,
  pin text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error')),
  error text,
  connected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- One ACTIVE connection per brand (history rows keep status 'disconnected').
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_connections_active
  ON whatsapp_connections (brand) WHERE status = 'active';
