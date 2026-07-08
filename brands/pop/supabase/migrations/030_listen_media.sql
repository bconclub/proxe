-- 030: PROXe Listen media — store the article/post image so the dashboard can
-- show real thumbnails (Signal Inbox right-side media, Evidence Board cards).
ALTER TABLE listen_signals ADD COLUMN IF NOT EXISTS image_url text;
