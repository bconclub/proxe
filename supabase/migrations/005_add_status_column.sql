-- Add status column to sessions table for custom lead status management
-- Initial statuses: "New Lead" (default) or "Call Booked" (if booking_status = 'confirmed')

-- Add status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sessions' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'New Lead';
  END IF;
END $$;

-- Set initial status based on booking_status
-- If booking is confirmed, set to "Call Booked", otherwise "New Lead"
UPDATE sessions
SET status = CASE 
  WHEN booking_status = 'confirmed' THEN 'Call Booked'
  ELSE 'New Lead'
END
WHERE status IS NULL OR status = '';

-- Add constraint to ensure status is one of the allowed values
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'sessions_status_check'
  ) THEN
    ALTER TABLE sessions DROP CONSTRAINT sessions_status_check;
  END IF;
  
  -- Add new constraint
  ALTER TABLE sessions ADD CONSTRAINT sessions_status_check 
    CHECK (status IN (
      'New Lead',
      'Follow Up',
      'RNR (No Response)',
      'Interested',
      'Wrong Enquiry',
      'Call Booked',
      'Closed'
    ));
END $$;

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Add comment to column
COMMENT ON COLUMN sessions.status IS 'Custom lead status: New Lead, Follow Up, RNR (No Response), Interested, Wrong Enquiry, Call Booked, Closed';

