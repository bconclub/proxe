-- Create Windchasers Admin User
-- Run this in Supabase SQL Editor

-- First, create the auth user (if using Supabase Dashboard, skip this and use UI)
-- Note: This is a simplified version. For production, use Supabase Dashboard > Authentication > Add User

-- Check if user exists
DO $$
DECLARE
  user_id UUID;
BEGIN
  -- Check if user already exists
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = 'windchasersblr@gmail.com';
  
  IF user_id IS NULL THEN
    RAISE NOTICE 'User does not exist. Please create user via Supabase Dashboard > Authentication > Add User';
    RAISE NOTICE 'Email: windchasersblr@gmail.com';
    RAISE NOTICE 'After creating user, run the dashboard_users insert below';
  ELSE
    RAISE NOTICE 'User found with ID: %', user_id;
    
    -- Create dashboard_users entry
    INSERT INTO dashboard_users (
      id,
      email,
      full_name,
      role,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      user_id,
      'windchasersblr@gmail.com',
      'Windchasers Admin',
      'admin',
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      is_active = true,
      updated_at = NOW();
    
    RAISE NOTICE 'Dashboard user created/updated successfully';
  END IF;
END $$;

-- Verify
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  d.full_name,
  d.role,
  d.is_active
FROM auth.users u
LEFT JOIN dashboard_users d ON u.id = d.id
WHERE u.email = 'windchasersblr@gmail.com';
