-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add 30-minute reminder tracking column
-- Run this in Supabase SQL Editor to support 30m booking reminders in task-worker.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS reminder_30m_sent BOOLEAN DEFAULT false;
