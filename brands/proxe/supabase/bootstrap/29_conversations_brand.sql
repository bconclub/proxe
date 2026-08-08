-- ============================================================================
-- 29. conversations.brand — the missing scope column
-- ============================================================================
-- One Supabase now holds BCON service leads and PROXe product leads side by
-- side, and the dashboard filters every table by `brand`. `all_leads`,
-- `web_sessions` and `agent_tasks` all carry that column. `conversations` does
-- NOT — which is why the Chats inbox showed every brand's messages no matter
-- which workspace was selected. It was never a missing WHERE clause; there was
-- nothing to put in one.
--
-- Safe to re-run.
-- ============================================================================

-- 1. The column. Nullable on purpose: a NOT NULL default would silently stamp
--    'bcon' onto rows whose real owner we can still derive below.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS brand text;

-- 2. Backfill from the lead each message belongs to. This is the authoritative
--    source — a conversation's brand IS its lead's brand, by definition.
UPDATE public.conversations c
SET    brand = l.brand
FROM   public.all_leads l
WHERE  c.lead_id = l.id
  AND  c.brand IS DISTINCT FROM l.brand;

-- 3. Orphans (lead deleted, or lead_id never set) fall back to the brand that
--    predates the merge. Everything in this table before PROXe existed was
--    BCON's, so this is a statement of history, not a guess.
UPDATE public.conversations
SET    brand = 'bcon'
WHERE  brand IS NULL;

-- 4. Keep it correct going forward without touching every write path in the
--    app: derive the brand from the lead on insert whenever the caller did not
--    supply one. A trigger is used rather than a DEFAULT because the value
--    depends on another table.
CREATE OR REPLACE FUNCTION public.set_conversation_brand()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.brand IS NULL AND NEW.lead_id IS NOT NULL THEN
    -- Qualified as all_leads.id to avoid 42702: `id` alone would be ambiguous
    -- against the NEW record inside a trigger body.
    SELECT all_leads.brand INTO NEW.brand
    FROM public.all_leads
    WHERE all_leads.id = NEW.lead_id;
  END IF;

  IF NEW.brand IS NULL THEN
    NEW.brand := 'bcon';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_conversation_brand ON public.conversations;
CREATE TRIGGER trg_set_conversation_brand
  BEFORE INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_conversation_brand();

-- 5. Every dashboard read filters on this, so it needs an index. Composite with
--    created_at because the inbox orders by recency within a brand.
CREATE INDEX IF NOT EXISTS idx_conversations_brand_created
  ON public.conversations (brand, created_at DESC);

-- ── Verify ──────────────────────────────────────────────────────────────────
-- SELECT brand, count(*) FROM public.conversations GROUP BY brand ORDER BY 2 DESC;
-- Expect: no NULL row, and the split to mirror all_leads.
