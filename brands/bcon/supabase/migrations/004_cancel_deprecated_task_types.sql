-- Cancel all existing post_booking_followup and booking_reminder_1h tasks
-- These task types are deprecated and no longer created by the system.
UPDATE agent_tasks
SET status = 'cancelled',
    completed_at = NOW(),
    error_message = 'Deprecated task type — cancelled by migration 004'
WHERE task_type IN ('post_booking_followup', 'booking_reminder_1h')
  AND status IN ('pending', 'queued', 'in_queue', 'awaiting_approval');
