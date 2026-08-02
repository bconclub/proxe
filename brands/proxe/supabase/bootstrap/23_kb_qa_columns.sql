-- Migration 031: Add Q&A structure columns to knowledge_base
-- Enables structured question/answer entries with categories and tags.
-- The search RPC in 030 already handles these fields.

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS question TEXT,
  ADD COLUMN IF NOT EXISTS answer TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Index for Q&A full-text search
CREATE INDEX IF NOT EXISTS idx_kb_qa_fts
  ON knowledge_base USING GIN(
    to_tsvector('english',
      coalesce(question, '') || ' ' ||
      coalesce(answer, '') || ' ' ||
      coalesce(content, '')
    )
  );

CREATE INDEX IF NOT EXISTS idx_kb_category
  ON knowledge_base(category);
