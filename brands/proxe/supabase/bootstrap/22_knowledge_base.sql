-- Migration 023: Knowledge Base
-- Stores uploaded documents, scraped URLs, and manual text entries for AI agent context

-- ============================================
-- 1. CREATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL DEFAULT 'proxe',
  type TEXT NOT NULL CHECK (type IN ('pdf', 'doc', 'url', 'text')),
  title TEXT NOT NULL,
  source_url TEXT,
  content TEXT,
  file_name TEXT,
  file_size INTEGER,
  file_type TEXT,
  chunks JSONB DEFAULT '[]'::jsonb,
  embeddings_status TEXT NOT NULL DEFAULT 'pending' CHECK (embeddings_status IN ('pending', 'processing', 'ready', 'error')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_knowledge_base_brand ON knowledge_base(brand);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_type ON knowledge_base(type);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_status ON knowledge_base(embeddings_status);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_created_at ON knowledge_base(created_at DESC);

-- Full-text search index on title + content
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content_fts
  ON knowledge_base USING GIN(
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  );

-- ============================================
-- 3. ROW LEVEL SECURITY (auth disabled — matches 018_disable_auth_requirements.sql)
-- ============================================

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all users to view knowledge_base" ON knowledge_base;
CREATE POLICY "Allow all users to view knowledge_base"
  ON knowledge_base FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow all users to insert knowledge_base" ON knowledge_base;
CREATE POLICY "Allow all users to insert knowledge_base"
  ON knowledge_base FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users to update knowledge_base" ON knowledge_base;
CREATE POLICY "Allow all users to update knowledge_base"
  ON knowledge_base FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all users to delete knowledge_base" ON knowledge_base;
CREATE POLICY "Allow all users to delete knowledge_base"
  ON knowledge_base FOR DELETE USING (true);

-- ============================================
-- 4. AUTO-UPDATE TRIGGER (reuse existing function from 001_dashboard_schema.sql)
-- ============================================

DROP TRIGGER IF EXISTS update_knowledge_base_updated_at ON knowledge_base;
CREATE TRIGGER update_knowledge_base_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. GRANTS
-- ============================================

GRANT ALL ON knowledge_base TO anon;
GRANT ALL ON knowledge_base TO authenticated;
