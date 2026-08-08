-- 007_scout_event_idempotency.sql
--
-- WHY
-- The Lokazen website forwards every scout lifecycle event to
-- /api/agent/leads/inbound, which sends the matching approved WhatsApp
-- template. Duplicate-suppression there was a read-then-write check
-- (wasTemplateRecentlySent): query "did we already send this?", then send.
--
-- That loses every race. Live on 06 Aug 2026 the website posted the same
-- payout event seven times inside one second; all seven requests ran the
-- read before any of them ran the write, all seven saw "not sent", and the
-- scout (Sarvesh, 919141837707) received seven identical payout messages.
-- Naufan received three the same way.
--
-- FIX
-- Claim before sending. The UNIQUE constraint below makes the claim atomic,
-- so exactly one concurrent request can win it and the rest are rejected by
-- the database rather than by a lookup that has already gone stale.
--
-- The existing time-window check stays in the code as a second layer: it
-- catches the case where a genuine repeat lands either side of a bucket
-- boundary, which the key alone would let through.
--
-- Safe to run more than once.

create table if not exists scout_event_sends (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references all_leads(id) on delete cascade,
  -- Canonical event, plus a coarse time bucket for the events that are
  -- legitimately repeatable. One-time lifecycle stages (signup, kyc_received,
  -- kyc_approved, upi_saved) use the bare event name, so they can only ever
  -- fire once per scout. submission buckets by day, payout by 5 minutes -
  -- a real second payout hours later still sends, a burst does not.
  event_key   text not null,
  template    text,
  created_at  timestamptz not null default now(),
  constraint scout_event_sends_lead_event_uniq unique (lead_id, event_key)
);

create index if not exists scout_event_sends_lead_created_idx
  on scout_event_sends (lead_id, created_at desc);

-- Service-role only. Nothing in the dashboard or the widget reads this table;
-- it exists purely as a send-once ledger for the inbound webhook.
alter table scout_event_sends enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'scout_event_sends' and policyname = 'scout_event_sends_service_role'
  ) then
    create policy scout_event_sends_service_role on scout_event_sends
      for all to service_role using (true) with check (true);
  end if;
end $$;

comment on table scout_event_sends is
  'Send-once ledger for Lokazen scout lifecycle WhatsApp templates. The unique (lead_id, event_key) constraint is what actually prevents duplicate sends; see migration 007 for the incident that motivated it.';
