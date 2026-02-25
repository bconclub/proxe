-- Migration 024: Bridge existing PROXe knowledge_base + add chunks table
-- PROXe's knowledge_base already has: id, content, category, subcategory,
-- question, answer, tags, created_at, updated_at, created_by, embedding, metadata
-- This migration adds missing columns and creates the chunks table for RAG search.

-- ============================================
-- 1. ADD MISSING COLUMNS to existing knowledge_base
-- ============================================

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS chunks JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS embeddings_status TEXT DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Backfill title from question for existing rows
UPDATE knowledge_base SET title = question WHERE title IS NULL AND question IS NOT NULL;
UPDATE knowledge_base SET title = 'Untitled' WHERE title IS NULL;

-- Backfill embeddings_status for existing rows
UPDATE knowledge_base SET embeddings_status = 'ready' WHERE embeddings_status IS NULL;

-- ============================================
-- 2. ENABLE pgvector EXTENSION
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 3. CREATE knowledge_base_chunks TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  char_start INTEGER,
  char_end INTEGER,
  token_estimate INTEGER,
  embedding vector(384),
  fts_vector tsvector,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 4. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb_id
  ON knowledge_base_chunks(knowledge_base_id);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_fts
  ON knowledge_base_chunks USING GIN(fts_vector);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
  ON knowledge_base_chunks USING hnsw (embedding vector_cosine_ops);

-- Full-text search on parent table (question + answer + content)
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

-- ============================================
-- 5. TRIGGER: auto-compute fts_vector on chunks
-- ============================================

CREATE OR REPLACE FUNCTION kb_chunks_update_fts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fts_vector := to_tsvector('english', coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kb_chunks_fts ON knowledge_base_chunks;
CREATE TRIGGER trg_kb_chunks_fts
  BEFORE INSERT OR UPDATE OF content ON knowledge_base_chunks
  FOR EACH ROW EXECUTE FUNCTION kb_chunks_update_fts();

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE knowledge_base_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all kb_chunks select" ON knowledge_base_chunks FOR SELECT USING (true);
CREATE POLICY "Allow all kb_chunks insert" ON knowledge_base_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all kb_chunks update" ON knowledge_base_chunks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow all kb_chunks delete" ON knowledge_base_chunks FOR DELETE USING (true);

GRANT ALL ON knowledge_base_chunks TO anon;
GRANT ALL ON knowledge_base_chunks TO authenticated;

-- ============================================
-- 7. RPC: search_knowledge_base (hybrid search)
-- ============================================

CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_text TEXT,
  query_embedding vector(384) DEFAULT NULL,
  match_limit INTEGER DEFAULT 5,
  filter_brand TEXT DEFAULT NULL,
  filter_category TEXT DEFAULT NULL,
  filter_subcategory TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  knowledge_base_id UUID,
  content TEXT,
  chunk_index INTEGER,
  title TEXT,
  source_type TEXT,
  relevance FLOAT,
  search_method TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  ts_query tsquery;
BEGIN
  ts_query := plainto_tsquery('english', query_text);

  RETURN QUERY
  WITH ranked AS (
    -- 1. Chunk-level full-text search
    SELECT
      c.id,
      c.knowledge_base_id,
      c.content,
      c.chunk_index,
      kb.title,
      kb.type AS source_type,
      ts_rank_cd(c.fts_vector, ts_query)::FLOAT AS relevance,
      'fulltext'::TEXT AS search_method
    FROM knowledge_base_chunks c
    JOIN knowledge_base kb ON kb.id = c.knowledge_base_id
    WHERE c.fts_vector @@ ts_query
      AND kb.embeddings_status = 'ready'

    UNION ALL

    -- 2. Q&A direct search on parent table
    SELECT
      kb.id,
      kb.id AS knowledge_base_id,
      COALESCE(kb.answer, kb.content, '') AS content,
      0 AS chunk_index,
      COALESCE(kb.question, kb.title) AS title,
      kb.type AS source_type,
      ts_rank_cd(
        to_tsvector('english',
          coalesce(kb.question, '') || ' ' ||
          coalesce(kb.answer, '') || ' ' ||
          coalesce(kb.content, '')
        ),
        ts_query
      )::FLOAT AS relevance,
      'qa_match'::TEXT AS search_method
    FROM knowledge_base kb
    WHERE to_tsvector('english',
        coalesce(kb.question, '') || ' ' ||
        coalesce(kb.answer, '') || ' ' ||
        coalesce(kb.content, '')
      ) @@ ts_query
      AND kb.embeddings_status = 'ready'
      AND (filter_category IS NULL OR kb.category = filter_category)
      AND (filter_subcategory IS NULL OR kb.subcategory = filter_subcategory)

    UNION ALL

    -- 3. Vector similarity search
    SELECT
      c.id,
      c.knowledge_base_id,
      c.content,
      c.chunk_index,
      kb.title,
      kb.type AS source_type,
      (1 - (c.embedding <=> query_embedding))::FLOAT AS relevance,
      'vector'::TEXT AS search_method
    FROM knowledge_base_chunks c
    JOIN knowledge_base kb ON kb.id = c.knowledge_base_id
    WHERE query_embedding IS NOT NULL
      AND c.embedding IS NOT NULL
      AND kb.embeddings_status = 'ready'
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_limit
  ),
  deduplicated AS (
    SELECT DISTINCT ON (ranked.id)
      ranked.*
    FROM ranked
    ORDER BY ranked.id, ranked.relevance DESC
  )
  SELECT
    deduplicated.id,
    deduplicated.knowledge_base_id,
    deduplicated.content,
    deduplicated.chunk_index,
    deduplicated.title,
    deduplicated.source_type,
    deduplicated.relevance,
    deduplicated.search_method
  FROM deduplicated
  ORDER BY deduplicated.relevance DESC
  LIMIT match_limit;
END;
$$;

-- ============================================
-- 8. BACKFILL: existing Q&A rows into chunks table
-- ============================================

INSERT INTO knowledge_base_chunks (
  knowledge_base_id,
  chunk_index,
  content
)
SELECT
  kb.id,
  0,
  COALESCE(kb.question, '') || E'\n\n' || COALESCE(kb.answer, kb.content, '')
FROM knowledge_base kb
WHERE (kb.answer IS NOT NULL OR kb.content IS NOT NULL)
  AND kb.embeddings_status = 'ready'
ON CONFLICT DO NOTHING;
