-- Migration: Clean up task system bugs
-- 1. Cancel all pending post_booking_followup tasks
-- 2. Fix tasks where lead_phone is "From WhatsApp" by looking up actual phone
-- 3. Remove duplicate tasks (keep oldest per lead_id + task_type)
-- 4. Cancel all failed tasks so they stop showing in the dashboard

-- 1. Cancel all pending post_booking_followup tasks
UPDATE agent_tasks
SET status = 'cancelled',
    completed_at = NOW(),
    error_message = 'Cancelled: post_booking_followup removed — humans confirm calls'
WHERE task_type = 'post_booking_followup'
  AND status IN ('pending', 'queued');

-- 2. Fix tasks where lead_phone is "From WhatsApp" (or other bad values)
UPDATE agent_tasks t
SET lead_phone = al.customer_phone_normalized
FROM all_leads al
WHERE t.lead_id = al.id
  AND al.customer_phone_normalized IS NOT NULL
  AND (
    t.lead_phone = 'From WhatsApp'
    OR t.lead_phone IS NULL
    OR t.lead_phone = ''
    OR t.lead_phone !~ '^\d{10}$'
  );

-- 3. Remove duplicate tasks: keep only the oldest per lead_id + task_type
-- (for pending/queued tasks only — don't touch completed history)
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id, task_type
      ORDER BY created_at ASC
    ) AS rn
  FROM agent_tasks
  WHERE status IN ('pending', 'queued')
    AND lead_id IS NOT NULL
)
UPDATE agent_tasks
SET status = 'cancelled',
    completed_at = NOW(),
    error_message = 'Cancelled: duplicate task — kept oldest'
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- 4. Cancel all failed tasks so they stop showing in the dashboard
UPDATE agent_tasks
SET status = 'cancelled',
    error_message = COALESCE(error_message, '') || ' [bulk-cancelled]'
WHERE status IN ('failed', 'failed_24h_window');
