-- 029: PROXe Listen SOURCES — the feeds/inputs a director adds and manages.
--
-- "Listen first, engage better." You add sources (RSS feeds, later APIs and
-- internal streams); a fetch pulls their items into listen_signals (source =
-- 'news' for RSS). This table is the managed registry behind the Sources panel.

CREATE TABLE IF NOT EXISTS listen_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'rss' CHECK (type IN ('rss','api','manual','internal')),
  url text,                         -- feed URL (rss/api)
  constituency text,               -- optional: tag items from this source to a seat
  issue_category text,             -- optional: default issue tag for items
  active boolean NOT NULL DEFAULT true,
  last_fetched_at timestamptz,
  last_item_count int DEFAULT 0,
  brand text NOT NULL DEFAULT 'pop'
);
CREATE INDEX IF NOT EXISTS idx_listen_sources_active ON listen_sources (active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_listen_sources_url_brand ON listen_sources (url, brand) WHERE url IS NOT NULL;

-- Dedup guard for fetched items: the same article URL should not create a
-- second signal. Plain unique on (url, brand) — NULL urls are distinct in
-- Postgres so seeded/manual null-url signals are unaffected, and a plain
-- (non-partial) index CAN be an ON CONFLICT target for the fetch upsert.
DROP INDEX IF EXISTS uq_listen_signals_url_brand;
CREATE UNIQUE INDEX IF NOT EXISTS uq_listen_signals_url_brand ON listen_signals (url, brand);
