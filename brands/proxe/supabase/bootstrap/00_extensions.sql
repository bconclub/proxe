-- 00_extensions.sql
-- Fresh-project prerequisites. gen_random_uuid() is built into Postgres 13+;
-- pgvector powers knowledge_base_chunks (block 24).
CREATE EXTENSION IF NOT EXISTS vector;
