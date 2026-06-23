-- ============================================================================
-- WAR ROOM — read-only aggregation VIEWS (ADDITIVE, POP DB ONLY)
-- ============================================================================
-- These are CREATE OR REPLACE VIEW only. They do NOT alter base tables, add
-- columns, or write data. Safe to re-run. Scoped to brand='pop'.
--
-- PRIVACY: the base view projects ONLY display-safe fields. phone and email are
-- EXCLUDED so they can never reach the client. No caste/religion/community
-- field exists or is selected.
-- ============================================================================

-- Privacy-projected, filterable base. The war-room API reads THIS (with filters)
-- and aggregates. All named views below derive from it.
CREATE OR REPLACE VIEW vw_war_room_base AS
SELECT
  id,
  customer_name        AS name,
  constituency,
  district,
  language,
  lean,
  magnet,
  grievance_category,
  grievance_text,
  salience,
  action_intent,
  loop_status,
  created_at,
  updated_at
FROM all_leads
WHERE brand = 'pop';

-- 1. grievance by category (+ salience-weighted score)
CREATE OR REPLACE VIEW vw_grievance_by_category AS
SELECT
  COALESCE(grievance_category, 'other') AS grievance_category,
  COUNT(*)                              AS count,
  ROUND(COUNT(*) * COALESCE(AVG(salience), 1), 1) AS salience_weighted
FROM vw_war_room_base
GROUP BY 1
ORDER BY count DESC;

-- 2. lean by constituency (for swing analysis)
CREATE OR REPLACE VIEW vw_lean_by_constituency AS
SELECT
  constituency,
  COUNT(*)                                            AS total,
  COUNT(*) FILTER (WHERE lean = 'supporter')          AS supporter,
  COUNT(*) FILTER (WHERE lean = 'leaning')            AS leaning,
  COUNT(*) FILTER (WHERE lean = 'undecided')          AS undecided,
  COUNT(*) FILTER (WHERE lean = 'opposed')            AS opposed
FROM vw_war_room_base
WHERE constituency IS NOT NULL
GROUP BY constituency;

-- 3. mobilization (action_intent funnel)
CREATE OR REPLACE VIEW vw_mobilization AS
SELECT
  COALESCE(action_intent, 'none') AS action_intent,
  COUNT(*)                        AS count
FROM vw_war_room_base
GROUP BY 1;

-- 4. channel mix (magnet share)
CREATE OR REPLACE VIEW vw_channel_mix AS
SELECT
  COALESCE(magnet, 'other') AS magnet,
  COUNT(*)                  AS count
FROM vw_war_room_base
GROUP BY 1
ORDER BY count DESC;

-- 5. loop health
CREATE OR REPLACE VIEW vw_loop_health AS
SELECT
  COUNT(*)                                         AS raised,
  COUNT(*) FILTER (WHERE loop_status = 'resolved') AS resolved,
  CASE WHEN COUNT(*) = 0 THEN 0
       ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE loop_status = 'resolved') / COUNT(*)) END AS resolved_pct
FROM vw_war_room_base;

-- 6. live feed (latest, display-safe; no phone)
CREATE OR REPLACE VIEW vw_live_feed AS
SELECT id, name, constituency, grievance_category, created_at
FROM vw_war_room_base
ORDER BY created_at DESC
LIMIT 60;

-- Grants so the API roles can read the views (service_role + authenticated).
GRANT SELECT ON vw_war_room_base, vw_grievance_by_category, vw_lean_by_constituency,
  vw_mobilization, vw_channel_mix, vw_loop_health, vw_live_feed
  TO anon, authenticated, service_role;
