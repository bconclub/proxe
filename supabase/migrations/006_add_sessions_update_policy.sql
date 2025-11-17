-- Add RLS policy to allow authenticated users to update sessions status

-- Enable RLS if not already enabled
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing update policy if it exists
DROP POLICY IF EXISTS "Authenticated users can update sessions status" ON sessions;

-- Create policy to allow authenticated users to update status column
CREATE POLICY "Authenticated users can update sessions status"
  ON sessions FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

