-- 032_seed_knowledge_base.sql
-- Dummy campaign-playbook knowledge base for POP so Ask PROXe / the agent draw on
-- real Punjab/campaign context instead of generic answers. Text + FTS only (no
-- embeddings needed — knowledge_base_chunks.fts_vector auto-computes on insert).
-- Idempotent: guarded by metadata->>'seed' = 'campaign_playbook_v1'.
-- Placeholder content — refine with the campaign's own positions when ready.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM knowledge_base
    WHERE brand = 'pop' AND metadata->>'seed' = 'campaign_playbook_v1'
  ) THEN
    INSERT INTO knowledge_base (brand, type, title, content, question, answer, category, tags, chunks, embeddings_status, metadata) VALUES
    -- ── Issue positions / talking points ──
    ('pop','text','Stand on the water crisis',
     'Water is the number one issue across the state. Our message: every household and farm deserves fair, reliable water. We push for canal-water equity, cleaning of polluted sources, and fast repair of supply lines. At the doorstep, log the specific water complaint (supply, quality, or canal share) so the team can route it.',
     'What is our stand on the Punjab water crisis?',
     'Water is the number one issue across the state. Our message: every household and farm deserves fair, reliable water. We push for canal-water equity, cleaning of polluted sources, and fast repair of supply lines. At the doorstep, log the specific water complaint (supply, quality, or canal share) so the team can route it.',
     'Issues','["water","issue","talking-point"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Position on the drug problem',
     'The drug crisis has hurt a generation. Our stand: de-addiction and jobs over stigma. We back Nasha-Mukt ward drives, more rehab access, and youth employment so recovery lasts. When a voter reports a local drug problem, mark it as a grievance and never name individuals publicly.',
     'What is our position on the drug problem?',
     'The drug crisis has hurt a generation. Our stand: de-addiction and jobs over stigma. We back Nasha-Mukt ward drives, more rehab access, and youth employment so recovery lasts. When a voter reports a local drug problem, mark it as a grievance and never name individuals publicly.',
     'Issues','["drugs","issue","talking-point"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Jobs for youth',
     'Unemployment pushes our youth to migrate. Our focus: local industry, skilling, and government vacancies filled on time. Talking point: a job in Punjab for every young person who wants one.',
     'What are we doing about jobs for youth?',
     'Unemployment pushes our youth to migrate. Our focus: local industry, skilling, and government vacancies filled on time. Talking point: a job in Punjab for every young person who wants one.',
     'Issues','["jobs","issue","talking-point"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Farmer debt and fair prices',
     'Farmers are the backbone of Punjab. We support a legal guarantee on fair prices, relief on crushing debt, and timely procurement. At farm-belt booths, water and debt are usually the top two issues raised together.',
     'What is our position on farmer debt and fair prices?',
     'Farmers are the backbone of Punjab. We support a legal guarantee on fair prices, relief on crushing debt, and timely procurement. At farm-belt booths, water and debt are usually the top two issues raised together.',
     'Issues','["farm_debt","issue","talking-point"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Stand on electricity',
     'Affordable, reliable power for homes and farms. Talking point: no family should choose between the light bill and the grocery bill. Log any billing or outage complaint as a power grievance.',
     'What is our stand on electricity?',
     'Affordable, reliable power for homes and farms. Talking point: no family should choose between the light bill and the grocery bill. Log any billing or outage complaint as a power grievance.',
     'Issues','["power","issue","talking-point"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Roads and infrastructure',
     'Broken link roads cut villages off from markets and schools. We commit to repairing rural roads and street lighting ward by ward, tracked openly so people can see progress.',
     'What about roads and infrastructure?',
     'Broken link roads cut villages off from markets and schools. We commit to repairing rural roads and street lighting ward by ward, tracked openly so people can see progress.',
     'Issues','["roads","issue","talking-point"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Education agenda',
     'Strong government schools and colleges close to home. Focus: teacher vacancies filled, working labs, and scholarships so no student drops out for money.',
     'What is our education agenda?',
     'Strong government schools and colleges close to home. Focus: teacher vacancies filled, working labs, and scholarships so no student drops out for money.',
     'Issues','["education","issue","talking-point"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Health plan',
     'Working hospitals within reach, stocked medicines, and staff on duty. Talking point: healthcare should not depend on how far you can travel.',
     'What is our health plan?',
     'Working hospitals within reach, stocked medicines, and staff on duty. Talking point: healthcare should not depend on how far you can travel.',
     'Issues','["health","issue","talking-point"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    -- ── Grievance-handling scripts ──
    ('pop','text','Water grievance script',
     'Listen first and acknowledge the problem. Ask three things: is it supply, quality, or canal share; how long it has been happening; and the exact location. Log it in the app so it routes to the right team. Do not promise a date; promise that it will be raised.',
     'How should a volunteer respond to a water grievance at the doorstep?',
     'Listen first and acknowledge the problem. Ask three things: is it supply, quality, or canal share; how long it has been happening; and the exact location. Log it in the app so it routes to the right team. Do not promise a date; promise that it will be raised.',
     'Grievance Handling','["water","script","d2d"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Angry voter about jobs',
     'Do not argue. Acknowledge the frustration, note the person and their skill or trade, and log it as a jobs grievance. A calm, logged response builds more trust than a defensive one.',
     'How do we handle an angry voter about unemployment?',
     'Do not argue. Acknowledge the frustration, note the person and their skill or trade, and log it as a jobs grievance. A calm, logged response builds more trust than a defensive one.',
     'Grievance Handling','["jobs","script"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Drug report script',
     'Thank them for trusting you. Keep it confidential, never name anyone at the door, and log it as a drugs grievance with the locality only. Mention the Nasha-Mukt ward effort if relevant.',
     'What to say when someone reports a drug problem in their area?',
     'Thank them for trusting you. Keep it confidential, never name anyone at the door, and log it as a drugs grievance with the locality only. Mention the Nasha-Mukt ward effort if relevant.',
     'Grievance Handling','["drugs","script","d2d"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Logging a grievance during D2D',
     'Open the D2D app on the knock, capture the person, pick the issue category, add one line of detail and the location, and save. Each logged knock merges into the person record and shows up in the War Room.',
     'How does a volunteer log a grievance during a door-to-door visit?',
     'Open the D2D app on the knock, capture the person, pick the issue category, add one line of detail and the location, and save. Each logged knock merges into the person record and shows up in the War Room.',
     'Grievance Handling','["d2d","script","how-to"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    -- ── Event FAQs ──
    ('pop','text','Event RSVP process',
     'People can mark interested or confirmed from any channel. Confirmed counts feed the event card, and volunteers follow up with confirmed attendees the day before.',
     'What is the RSVP process for a campaign event?',
     'People can mark interested or confirmed from any channel. Confirmed counts feed the event card, and volunteers follow up with confirmed attendees the day before.',
     'Events','["events","faq"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Who attends a booth meeting',
     'Any supporter or volunteer in that booth area. Cadre lead the meeting; new supporters are welcome and are a chance to move them up the ladder.',
     'Who can attend a booth meeting?',
     'Any supporter or volunteer in that booth area. Cadre lead the meeting; new supporters are welcome and are a chance to move them up the ladder.',
     'Events','["events","booth","faq"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Booth assignment',
     'Booth assignment comes from the cadre registry. A volunteer is mapped to their home booth first; the D2D tab shows priority booths that need more coverage.',
     'How do volunteers get assigned to a booth?',
     'Booth assignment comes from the cadre registry. A volunteer is mapped to their home booth first; the D2D tab shows priority booths that need more coverage.',
     'Events','["booth","d2d","faq"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    -- ── Campaign playbook / ops ──
    ('pop','text','One-line campaign message',
     'Pulse of Punjab: your issues heard, logged, and acted on, ward by ward.',
     'What is our one-line campaign message?',
     'Pulse of Punjab: your issues heard, logged, and acted on, ward by ward.',
     'Playbook','["message","playbook"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','The intensity ladder',
     'Everyone starts as a Contact. A Contact who engages becomes a Voter, then a Supporter, then a Volunteer who works, and finally Cadre who lead. The job of every touch is to move a person one step up.',
     'How do we explain the intensity ladder to a new volunteer?',
     'Everyone starts as a Contact. A Contact who engages becomes a Voter, then a Supporter, then a Volunteer who works, and finally Cadre who lead. The job of every touch is to move a person one step up.',
     'Playbook','["ladder","playbook","onboarding"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','Channels people can reach us on',
     'WhatsApp, a missed call, a QR scan, a voice call, a door-to-door knock, or the web form. Every channel funnels into the same person record.',
     'What channels can people reach the campaign on?',
     'WhatsApp, a missed call, a QR scan, a voice call, a door-to-door knock, or the web form. Every channel funnels into the same person record.',
     'Playbook','["channels","playbook"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','About Pulse of Punjab',
     'It is a listening-first campaign. We capture what people across Punjab actually raise, focus on the issues that matter most in each seat, and close the loop on grievances instead of only making speeches.',
     'What is the Pulse of Punjab campaign about?',
     'It is a listening-first campaign. We capture what people across Punjab actually raise, focus on the issues that matter most in each seat, and close the loop on grievances instead of only making speeches.',
     'Playbook','["about","playbook"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb),

    ('pop','text','How PROXe helps the campaign',
     'PROXe is the engine behind the campaign. It captures every voter touch across channels, gauges where each person stands, tracks the frontline ladder, and surfaces it all in the War Room, D2D, Listener, and leader app.',
     'How does PROXe help the campaign?',
     'PROXe is the engine behind the campaign. It captures every voter touch across channels, gauges where each person stands, tracks the frontline ladder, and surfaces it all in the War Room, D2D, Listener, and leader app.',
     'Playbook','["proxe","platform","playbook"]'::jsonb,'[]'::jsonb,'ready','{"seed":"campaign_playbook_v1","extractionMethod":"seed"}'::jsonb);
  END IF;
END $$;

-- One searchable chunk per seeded entry (fts_vector auto-computes via trigger).
INSERT INTO knowledge_base_chunks (knowledge_base_id, chunk_index, content, char_start, char_end, token_estimate)
SELECT kb.id, 0,
       coalesce(kb.question, '') || ' — ' || coalesce(kb.content, ''),
       0,
       length(coalesce(kb.question, '') || ' — ' || coalesce(kb.content, '')),
       ceil(length(coalesce(kb.question, '') || ' — ' || coalesce(kb.content, '')) / 4.0)::int
FROM knowledge_base kb
WHERE kb.brand = 'pop'
  AND kb.metadata->>'seed' = 'campaign_playbook_v1'
  AND NOT EXISTS (
    SELECT 1 FROM knowledge_base_chunks c WHERE c.knowledge_base_id = kb.id
  );
