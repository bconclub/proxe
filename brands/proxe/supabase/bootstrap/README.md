# PROXe fresh-Supabase bootstrap

Complete schema bring-up for a **brand-new** Supabase project for the `proxe`
brand — assembled from the proven migrations of proxe/windchasers/bcon/lokazen,
with the fresh-project fixes the historical chain can't provide (it hard-fails
4× on an empty DB: legacy `sessions` backfill, 018↔019 ordering, missing KB
Q&A columns, missing `agent_tasks`).

Covers BOTH consumers of this database:
- the **platform** (`core/` dashboard, web/WhatsApp/voice agents), and
- the **goproxe.com landing site** (`all_leads` writes: form leads, bookings,
  Dodo billing events — incl. NULL-phone payer rows and the `'billing'`
  touchpoint).

## How to run

Supabase Dashboard → SQL editor. Paste and run each file **in filename order**
(each file = one transaction):

```
00_extensions.sql            pgvector
01_dashboard_schema.sql      dashboard_users/user_invitations/settings + auth trigger
02_dashboard_rls_fix.sql     RLS recursion fix
03_lead_schema.sql           all_leads + 4 session tables + messages   [edited 007]
04_sessions_parity.sql       columns core writes that 007 predates      [new]
05_unified_view.sql          scoring columns v1
06_scoring.sql               proxe scoring schema
07_activities.sql            activities (created_by nullable, no type CHECK) [edited 015]
08_stage_tracking.sql        stage change tracking
09_scoring_trigger.sql       score-on-message trigger
10_conversations_rename.sql  messages → conversations                   [order: BEFORE 11]
11_rls_loosen.sql            RLS loosening (needs conversations to exist)
12_delivery_receipts.sql     delivery status + status_sync_queue        [from lokazen]
13_agent_tasks.sql           agent_tasks + follow_up_templates (brand→proxe) [from wc]
14_agent_tasks_update.sql    agent_tasks column updates
15_agent_tasks_cascade.sql   cascade on lead delete
16_sync_parity.sql           touchpoint CHECKs(+landing_page/facebook_lead/billing),
                             readiness scoring, read receipts, changelog, follow-up
                             tracking — enum ALTERs + bcon seeds stripped [edited wc]
17_lead_ownership.sql        owner_id + access
18_converted_at.sql          converted_at column
19_closed_won.sql            'Closed Won' stage rename
20_final_view.sql            FINAL unified_leads view + grants
21_backfill_fns.sql          normalize fn + email/phone indexes
22_knowledge_base.sql        knowledge_base (brand default 'proxe')
23_kb_qa_columns.sql         Q&A columns 24 depends on                  [from wc 031]
24_kb_chunks.sql             chunks + pgvector hybrid search RPC
25_auto_create_leads.sql     session→lead auto-create trigger (brand→proxe)
26_whatsapp_connections.sql  dashboard embedded-signup WhatsApp connect
27_admin_seed.sql            AFTER creating auth user bconclubx@gmail.com
```

Then run `verification.sql` — every section states its expected result.

## Deliberate deviations from the historical chain

| Change | Why |
|---|---|
| 007 steps 15–18 removed | backfill from a `sessions` table that never exists on a fresh DB; v1 view superseded by block 20 |
| session `lead_id` nullable; web ON DELETE SET NULL | core creates sessions before leads exist (sessionManager); wc 032's contract |
| `messages/conversations.channel` + touchpoints include `landing_page`, `meta_forms`, `facebook_lead`, `billing` | core's landing-pages + facebook-lead routes and goproxe.com's Dodo webhook write these |
| `activities.created_by` nullable, no `activity_type` CHECK | core writes NULL for automation and `'automation'` type |
| 019 before 018 | 018 drops policies on `conversations`, which 019 creates |
| No `channel_type` enum ALTERs | proxe schema is TEXT+CHECK; the enum never existed here |
| bcon template/changelog seeds skipped | another brand's marketing copy |

## Not included (on purpose)

- Legacy `sessions` table — core only touches it as a 42P01 fallback.
- POP's `vw_war_room_*` views, d2d tables — feature-flagged off for proxe.
- Follow-up template rows — author PROXe messaging in the dashboard.
