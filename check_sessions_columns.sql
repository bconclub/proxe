-- Check what columns exist in the sessions table
-- Run this first to see the actual schema

SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'sessions'
ORDER BY ordinal_position;

