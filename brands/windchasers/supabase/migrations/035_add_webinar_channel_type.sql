-- Webinar registrations (Zoom → Pabbly → /api/agent/leads/inbound) stamp
-- first/last_touchpoint = 'webinar'. Same enum gotcha as 034: the value must
-- exist on channel_type or every webinar-registration insert 500s with 22P02.
ALTER TYPE public.channel_type ADD VALUE IF NOT EXISTS 'webinar';
