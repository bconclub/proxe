CREATE TABLE IF NOT EXISTS changelog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  category TEXT NOT NULL,
  changes JSONB NOT NULL,
  gpfc_ref TEXT,
  deployed_by TEXT DEFAULT 'bconclub'
);

CREATE INDEX idx_changelog_date ON changelog(date DESC);

INSERT INTO changelog (version, category, changes, gpfc_ref) VALUES
('1.0.0', 'core', '["Initial platform setup"]', 'foundation'),
('1.1.0', 'bcon', '["Added web widget prompt", "Fixed sync script", "Updated BCON positioning", "Widget preview 30/70 layout", "Dynamic mobile quick buttons"]', 'session-apr-07');
