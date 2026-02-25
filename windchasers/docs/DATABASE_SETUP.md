# Windchasers Database Setup Guide

## Quick Fix: Create dashboard_users Table

If you're getting the error `relation "dashboard_users" does not exist`, run this SQL in your Supabase SQL Editor:

```sql
-- Dashboard Users Table
CREATE TABLE IF NOT EXISTS dashboard_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true
);

-- User Invitations Table
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  invited_by UUID REFERENCES dashboard_users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dashboard Settings Table
CREATE TABLE IF NOT EXISTS dashboard_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES dashboard_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies for dashboard_users
ALTER TABLE dashboard_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON dashboard_users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all users"
  ON dashboard_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can update their own profile"
  ON dashboard_users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can update any user"
  ON dashboard_users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Function to create dashboard user on auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO dashboard_users (id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    'viewer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating dashboard_user for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create dashboard_user when auth user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

## Complete Database Setup

### Step 1: Run Dashboard Schema (Required for Login)
Run the SQL above to create `dashboard_users` table.

### Step 2: Run Windchasers Lead Tracking Schema
Run the `windchasers-schema.sql` file to create all lead tracking tables.

### Step 3: Create Your First Admin User

1. **Create user in Supabase Auth:**
   - Go to Authentication > Users
   - Click "Add user" → "Create new user"
   - Enter email and password
   - Copy the user ID

2. **Set admin role:**
   ```sql
   -- Insert or update dashboard_users with admin role
   INSERT INTO dashboard_users (id, email, role)
   VALUES ('YOUR_USER_ID_HERE', 'your-email@example.com', 'admin')
   ON CONFLICT (id) 
   DO UPDATE SET role = 'admin';
   ```

### Step 4: Login
Go to `http://localhost:4001/auth/login` and use your credentials.
