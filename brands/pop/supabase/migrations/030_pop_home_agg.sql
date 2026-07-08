-- 030: server-side aggregation for the POP home (Outreach Engine + heatmap +
-- priority seats + channel mix). The dashboard used to fetch every pop lead and
-- roll it up in JS — fine at 2k rows, ruinous at 27k (27 paginated round-trips
-- to a far region → 20s+ loads). This one function returns the whole home
-- payload as jsonb in a SINGLE query, so it stays instant at any volume.

CREATE OR REPLACE FUNCTION pop_home_agg() RETURNS jsonb
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  result jsonb;
  ladder jsonb;
  seats jsonb;
  sources jsonb;
  daily jsonb;
  weekhour jsonb;
  src_total int;
BEGIN
  -- intensity ladder + grievance totals (indexed counts)
  SELECT jsonb_build_object(
    'voters',     count(*) FILTER (WHERE intensity >= 1),
    'supporters', count(*) FILTER (WHERE intensity >= 2),
    'volunteers', count(*) FILTER (WHERE intensity >= 3),
    'cadre',      count(*) FILTER (WHERE intensity >= 4),
    'grievances', count(*) FILTER (WHERE grievance_category IS NOT NULL),
    'resolved',   count(*) FILTER (WHERE grievance_category IS NOT NULL AND loop_status = 'resolved')
  ) INTO ladder
  FROM all_leads WHERE brand = 'pop';

  -- priority constituencies: unresolved grievances weighted by salience + mood
  WITH seat AS (
    SELECT
      constituency,
      max(district) AS district,
      count(*) AS total,
      count(*) FILTER (WHERE grievance_category IS NOT NULL) AS grievances,
      count(*) FILTER (WHERE grievance_category IS NOT NULL AND loop_status <> 'resolved') AS unresolved,
      avg(salience) FILTER (WHERE grievance_category IS NOT NULL) AS avg_sal,
      avg(CASE lean WHEN 'supporter' THEN 1 WHEN 'leaning' THEN 0.5 WHEN 'opposed' THEN -1 ELSE 0 END)
        FILTER (WHERE lean IS NOT NULL) AS mood,
      count(*) FILTER (WHERE intensity >= 2) AS supporters,
      count(*) FILTER (WHERE intensity >= 3) AS volunteers,
      mode() WITHIN GROUP (ORDER BY grievance_category) FILTER (WHERE grievance_category IS NOT NULL) AS top_cat
    FROM all_leads WHERE brand = 'pop' AND constituency IS NOT NULL
    GROUP BY constituency
  )
  SELECT jsonb_agg(x) INTO seats FROM (
    SELECT
      constituency, district, total, grievances, unresolved,
      CASE WHEN grievances > 0 THEN round(100.0 * (grievances - unresolved) / grievances)::int ELSE 100 END AS "loopHealthPct",
      top_cat AS "topCategory",
      round(coalesce(mood, 0)::numeric, 2) AS mood,
      supporters, volunteers,
      (unresolved * (1 + coalesce(avg_sal, 0) / 3) * (CASE WHEN coalesce(mood, 0) < 0 THEN 1.5 ELSE 1 END)) AS attention
    FROM seat WHERE unresolved > 0
    ORDER BY attention DESC LIMIT 6
  ) x;

  -- entry-channel (magnet) mix: 7d byMagnet (share) + 30d mix with 7d-vs-prior-7d
  -- momentum (feeds the home "Activity Sources" panel).
  DECLARE src30 int; bymag jsonb; mix jsonb;
  BEGIN
    WITH w30 AS (
      SELECT coalesce(magnet, 'other') AS magnet,
        count(*)::int AS c30,
        count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS c7,
        count(*) FILTER (WHERE created_at < now() - interval '7 days' AND created_at >= now() - interval '14 days')::int AS prev7
      FROM all_leads WHERE brand = 'pop' AND created_at >= now() - interval '30 days'
      GROUP BY coalesce(magnet, 'other')
    ), tot AS (SELECT coalesce(sum(c7), 0)::int AS t7, coalesce(sum(c30), 0)::int AS t30 FROM w30)
    SELECT
      (SELECT t7 FROM tot), (SELECT t30 FROM tot),
      (SELECT jsonb_agg(jsonb_build_object('magnet', magnet, 'count', c7,
         'share', round(100.0 * c7 / NULLIF((SELECT t7 FROM tot), 0))::int) ORDER BY c7 DESC) FROM w30 WHERE c7 > 0),
      (SELECT jsonb_agg(jsonb_build_object('magnet', magnet, 'count', c30,
         'share', round(100.0 * c30 / NULLIF((SELECT t30 FROM tot), 0))::int,
         'delta7', CASE WHEN prev7 > 0 THEN round((c7 - prev7) * 100.0 / prev7)::int WHEN c7 > 0 THEN 100 ELSE 0 END) ORDER BY c30 DESC) FROM w30)
    INTO src_total, src30, bymag, mix;
    sources := jsonb_build_object('total7d', src_total, 'byMagnet', coalesce(bymag, '[]'::jsonb),
                                  'total30d', src30, 'mix', coalesce(mix, '[]'::jsonb));
  END;

  -- 30-day daily activity (ISO date → count), oldest first
  SELECT jsonb_agg(jsonb_build_object('date', d::date, 'count', coalesce(cnt, 0)) ORDER BY d) INTO daily
  FROM generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') g(d)
  LEFT JOIN (
    SELECT created_at::date AS day, count(*) cnt FROM all_leads
    WHERE brand = 'pop' AND created_at >= (now() - interval '29 days')::date GROUP BY 1
  ) a ON a.day = g.d::date;

  -- weekday x hour matrix (7 rows dow 0=Sun..6=Sat, 24 hrs), last 30 days
  SELECT jsonb_agg(hours ORDER BY dow) INTO weekhour FROM (
    SELECT dow, jsonb_agg(cnt ORDER BY hr) AS hours FROM (
      SELECT d.dow, h.hr, coalesce(g.cnt, 0)::int AS cnt
      FROM generate_series(0, 6) d(dow)
      CROSS JOIN generate_series(0, 23) h(hr)
      LEFT JOIN (
        SELECT extract(dow FROM created_at)::int AS dow, extract(hour FROM created_at)::int AS hr, count(*) cnt
        FROM all_leads WHERE brand = 'pop' AND created_at >= now() - interval '30 days'
        GROUP BY 1, 2
      ) g ON g.dow = d.dow AND g.hr = h.hr
      GROUP BY d.dow, h.hr, g.cnt
    ) per_hour GROUP BY dow
  ) per_dow;

  -- per-seat mobilizable base (all seats), so events can show volunteers/supporters
  DECLARE seatbase jsonb;
  BEGIN
    SELECT jsonb_object_agg(constituency, jsonb_build_object('volunteers', volunteers, 'supporters', supporters))
    INTO seatbase FROM (
      SELECT constituency,
             count(*) FILTER (WHERE intensity >= 3) AS volunteers,
             count(*) FILTER (WHERE intensity >= 2) AS supporters
      FROM all_leads WHERE brand = 'pop' AND constituency IS NOT NULL
      GROUP BY constituency
    ) z;

    result := jsonb_build_object(
      'ladder', ladder,
      'attentionSeats', coalesce(seats, '[]'::jsonb),
      'sources', sources,
      'dailyActivity', coalesce(daily, '[]'::jsonb),
      'weekHour', coalesce(weekhour, '[]'::jsonb),
      'seatBase', coalesce(seatbase, '{}'::jsonb)
    );
  END;
  RETURN result;
END $fn$;
