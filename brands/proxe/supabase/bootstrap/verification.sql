-- verification.sql — run AFTER all bootstrap blocks (00 → 27).
-- Every section states its expected result. Anything off = stop and fix
-- before pointing traffic at the project.

-- ── 1. Table inventory matches core's query surface ─────────────────────────
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1;
-- EXPECT (at minimum): activities, agent_tasks, all_leads, changelog,
-- conversations, dashboard_leads, dashboard_settings, dashboard_users,
-- follow_up_templates, knowledge_base, knowledge_base_chunks,
-- lead_stage_changes, social_sessions, status_sync_queue, user_invitations,
-- voice_sessions, web_sessions, whatsapp_connections, whatsapp_sessions

-- ── 2. Landing-site all_leads contract ──────────────────────────────────────
SELECT column_name, is_nullable FROM information_schema.columns
 WHERE table_name = 'all_leads' AND column_name IN
 ('customer_name','email','phone','customer_phone_normalized','first_touchpoint',
  'last_touchpoint','last_interaction_at','brand','unified_context');
-- EXPECT: 9 rows; customer_phone_normalized nullable (Dodo webhook inserts
-- payer-only leads with NULL phone).

-- NULL-phone insert must succeed (billing-only lead):
INSERT INTO all_leads (customer_name, email, first_touchpoint, last_touchpoint, brand)
 VALUES ('smoke', 'smoke@test.com', 'billing', 'billing', 'proxe');
-- Phone insert must succeed:
INSERT INTO all_leads (phone, customer_phone_normalized, first_touchpoint, last_touchpoint, brand)
 VALUES ('+911234567890', '1234567890', 'web', 'web', 'proxe');
-- Duplicate phone+brand must FAIL (unique partial index):
-- INSERT INTO all_leads (phone, customer_phone_normalized, first_touchpoint, last_touchpoint, brand)
--  VALUES ('+911234567890', '1234567890', 'web', 'web', 'proxe');

SELECT indexname FROM pg_indexes WHERE tablename = 'all_leads'
 AND indexname IN ('idx_all_leads_phone_brand', 'idx_all_leads_email');
-- EXPECT: both rows.

-- ── 3. Scoring trigger fires on conversation insert ─────────────────────────
INSERT INTO conversations (lead_id, channel, sender, content)
 SELECT id, 'web', 'customer', 'hello' FROM all_leads WHERE customer_name = 'smoke' LIMIT 1;
SELECT customer_name, lead_score, lead_stage, last_scored_at
  FROM all_leads WHERE customer_name = 'smoke';
-- EXPECT: lead_score > 0, lead_stage set, last_scored_at recent.

-- ── 4. View + RPC + extension ───────────────────────────────────────────────
SELECT * FROM unified_leads LIMIT 1;                       -- includes lead_score/lead_stage/status
SELECT * FROM search_knowledge_base('test', NULL, 5);      -- returns 0 rows, no error
SELECT extname FROM pg_extension WHERE extname = 'vector'; -- EXPECT: 1 row

-- ── 5. Constraints current ──────────────────────────────────────────────────
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'all_leads'::regclass AND contype = 'c';
-- EXPECT: touchpoint CHECKs include 'landing_page','facebook_lead','billing';
-- lead_stage list includes 'Closed Won'.
SELECT confdeltype FROM pg_constraint WHERE conname = 'agent_tasks_lead_id_fkey';
-- EXPECT: 'c' (CASCADE)
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'conversations'::regclass AND contype = 'c';
-- EXPECT: channel CHECK includes 'landing_page','meta_forms'.

-- ── 6. RLS + realtime + auth wiring ─────────────────────────────────────────
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY 1;
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
-- EXPECT: all_leads + session tables + conversations present.
-- whatsapp_connections must have RLS ON with NO policies (service-role only):
SELECT relrowsecurity FROM pg_class WHERE relname = 'whatsapp_connections'; -- true
SELECT count(*) FROM pg_policies WHERE tablename = 'whatsapp_connections';  -- 0

-- After creating the auth user (block 27 instructions):
SELECT id, email, role FROM dashboard_users;
-- EXPECT: bconclubx@gmail.com with role 'admin'.

-- ── 7. Cleanup smoke rows ───────────────────────────────────────────────────
DELETE FROM all_leads WHERE customer_name = 'smoke' OR customer_phone_normalized = '1234567890';
