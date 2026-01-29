-- ============================================================================
-- Migration: Enhance Knowledge Base for Manual Entry (Like PROXe)
-- Creates table if needed, adds question, answer, subcategory columns and improves full-text search
-- Brand: windchasers
-- ============================================================================

-- Create knowledge_base table if it doesn't exist
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand TEXT NOT NULL CHECK (brand = 'windchasers'),
    content TEXT NOT NULL,
    category TEXT,
    keywords TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    title TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create basic indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_knowledge_base_brand ON knowledge_base(brand);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_keywords ON knowledge_base USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content ON knowledge_base USING GIN(to_tsvector('english', content));

-- Add new columns to match PROXe format
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS question TEXT,
  ADD COLUMN IF NOT EXISTS answer TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Create index on subcategory for filtering
CREATE INDEX IF NOT EXISTS idx_knowledge_base_subcategory ON knowledge_base(subcategory);

-- Create enhanced full-text search index combining question, answer, and content
-- This allows searching across all three fields simultaneously with ranking
CREATE INDEX IF NOT EXISTS idx_knowledge_base_fulltext 
ON knowledge_base 
USING GIN(
  to_tsvector('english', 
    coalesce(question, '') || ' ' || 
    coalesce(answer, '') || ' ' || 
    coalesce(content, '')
  )
);

-- Create function for full-text search with ranking
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_text TEXT,
  match_limit INTEGER DEFAULT 5,
  filter_category TEXT DEFAULT NULL,
  filter_subcategory TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  brand TEXT,
  content TEXT,
  category TEXT,
  subcategory TEXT,
  question TEXT,
  answer TEXT,
  title TEXT,
  description TEXT,
  keywords TEXT[],
  metadata JSONB,
  relevance REAL,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kb.id,
    kb.brand,
    kb.content,
    kb.category,
    kb.subcategory,
    kb.question,
    kb.answer,
    kb.title,
    kb.description,
    kb.keywords,
    kb.metadata,
    ts_rank(
      to_tsvector('english', 
        coalesce(kb.question, '') || ' ' || 
        coalesce(kb.answer, '') || ' ' || 
        coalesce(kb.content, '')
      ),
      plainto_tsquery('english', query_text)
    ) AS relevance,
    kb.created_at,
    kb.updated_at
  FROM knowledge_base kb
  WHERE kb.brand = 'windchasers'
    AND (
      to_tsvector('english', 
        coalesce(kb.question, '') || ' ' || 
        coalesce(kb.answer, '') || ' ' || 
        coalesce(kb.content, '')
      ) @@ plainto_tsquery('english', query_text)
    )
    AND (filter_category IS NULL OR kb.category = filter_category)
    AND (filter_subcategory IS NULL OR kb.subcategory = filter_subcategory)
  ORDER BY 
    -- Prioritize exact matches in question field
    CASE 
      WHEN kb.question ILIKE '%' || query_text || '%' THEN 1
      WHEN kb.answer ILIKE '%' || query_text || '%' THEN 2
      ELSE 3
    END,
    relevance DESC
  LIMIT match_limit;
END;
$$;

-- Add comment to function
COMMENT ON FUNCTION search_knowledge_base IS 'Full-text search function for knowledge_base with relevance ranking. Searches across question, answer, and content fields.';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
