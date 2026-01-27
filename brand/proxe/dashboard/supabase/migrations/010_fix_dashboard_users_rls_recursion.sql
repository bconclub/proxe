-- Fix infinite recursion in dashboard_users RLS policies
-- The issue: Policies check dashboard_users table, which triggers the same policy check

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all users" ON dashboard_users;
DROP POLICY IF EXISTS "Admins can update any user" ON dashboard_users;

-- Create a SECURITY DEFINER function to check admin role
-- This function bypasses RLS to check if a user is an admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM dashboard_users 
    WHERE id = user_id AND role = 'admin'
  );
END;
$$;

-- Recreate the policies using the function (avoids recursion)
CREATE POLICY "Admins can view all users"
  ON dashboard_users FOR SELECT
  USING (
    auth.uid() = id OR is_admin(auth.uid())
  );

CREATE POLICY "Admins can update any user"
  ON dashboard_users FOR UPDATE
  USING (
    auth.uid() = id OR is_admin(auth.uid())
  );

-- Also fix the policies for other tables that reference dashboard_users
-- These don't cause recursion but should use the function for consistency

-- Fix dashboard_settings policies
DROP POLICY IF EXISTS "Admins can update settings" ON dashboard_settings;
DROP POLICY IF EXISTS "Admins can insert settings" ON dashboard_settings;

CREATE POLICY "Admins can update settings"
  ON dashboard_settings FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert settings"
  ON dashboard_settings FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Fix user_invitations policies
DROP POLICY IF EXISTS "Admins can view all invitations" ON user_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON user_invitations;

CREATE POLICY "Admins can view all invitations"
  ON user_invitations FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can create invitations"
  ON user_invitations FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Grant execute permission on the function to authenticated users
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;

