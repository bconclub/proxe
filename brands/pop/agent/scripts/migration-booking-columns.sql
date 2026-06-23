-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add booking Meet link, title, and reminder columns
-- Run this in Supabase SQL Editor BEFORE deploying the new booking flow.
-- ═══════════════════════════════════════════════════════════════════════════════

-- whatsapp_sessions
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS booking_meet_link TEXT;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS booking_title TEXT;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT false;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT false;

-- web_sessions (same columns for consistency)
ALTER TABLE web_sessions ADD COLUMN IF NOT EXISTS booking_meet_link TEXT;
ALTER TABLE web_sessions ADD COLUMN IF NOT EXISTS booking_title TEXT;
