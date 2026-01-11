-- Dashboard Users Table
-- Extends Supabase auth.users with dashboard-specific roles and metadata
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

-- Dashboard Leads Table
-- Stores leads from all channels (Web, WhatsApp, Voice, Social)
-- This is separate from chat_sessions which is managed by the web agent
CREATE TABLE IF NOT EXISTS dashboard_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL CHECK (source IN ('web', 'whatsapp', 'voice', 'social')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'new',
  booking_date DATE,
  booking_time TIME,
  metadata JSONB,
  chat_session_id UUID, -- Optional reference to original chat_session if from web agent
  notes TEXT
);

-- Indexes for dashboard_leads
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_created_at ON dashboard_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_source ON dashboard_leads(source);
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_status ON dashboard_leads(status);
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_booking_date ON dashboard_leads(booking_date) WHERE booking_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dashboard_leads_chat_session_id ON dashboard_leads(chat_session_id);

-- RLS Policies for dashboard_leads
ALTER TABLE dashboard_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view dashboard_leads"
  ON dashboard_leads FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert dashboard_leads"
  ON dashboard_leads FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update dashboard_leads"
  ON dashboard_leads FOR UPDATE
  USING (auth.role() = 'authenticated');

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

-- RLS Policies for user_invitations
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all invitations"
  ON user_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can create invitations"
  ON user_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Anyone can view invitation by token"
  ON user_invitations FOR SELECT
  USING (true);

-- RLS Policies for dashboard_settings
ALTER TABLE dashboard_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view settings"
  ON dashboard_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can update settings"
  ON dashboard_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert settings"
  ON dashboard_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dashboard_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_dashboard_users_updated_at BEFORE UPDATE ON dashboard_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dashboard_settings_updated_at BEFORE UPDATE ON dashboard_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Realtime for dashboard_leads
-- This allows real-time updates in the dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE dashboard_leads;

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
    -- Log error but don't fail the user creation
    RAISE WARNING 'Error creating dashboard_user for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create dashboard_user when auth user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


