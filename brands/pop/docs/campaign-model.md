# POP Campaign Model — beyond grievances

Post brand-discussion (Jul 2026): the campaign is not a grievance hotline. Grievance
is ONE entry reason. This doc is the working model for the full shape — person
intents, events/mobilization, and D2D field campaigns — and what the base
structure (migration 023) sets up.

## 1. Why people arrive — `engagement_type`

One primary reason per person (their FIRST reason; it can be updated as the
relationship deepens). Distinct from the existing fields:

| Field | Question it answers | Values |
|---|---|---|
| `engagement_type` (NEW) | Why did they engage? | grievance · support · volunteer · event · info · outreach |
| `action_intent` (exists) | What will they do? | vote · volunteer · rally · share · none |
| `lean` (exists) | Where do they stand? | supporter · leaning · undecided · opposed |
| `magnet` (exists) | Which channel hooked them? | whatsapp · voice · pulse_app · qr · missed_call · **d2d** · **event** · **landing** (NEW values) |

- **grievance** — came to raise an issue (current default flow).
- **support** — came to express support / join the wave. No grievance needed; the
  agent should welcome, capture area, and offer volunteer/updates — never force
  a grievance out of them.
- **volunteer** — raised their hand to work. Hand off to the constituency team.
- **event** — came in through/for an event ("this event on this topic near you").
- **info** — wants to know what we stand for. The agent must answer clearly
  (platform pillars in the KB), then invite, not interrogate.
- **outreach** — WE contacted them first (outbound calls, D2D) and they engaged.

## 2. Events & mobilization — `campaign_events` + `event_rsvps`

Events are the mobilization spine: "we're having this event here, on this topic
— it brings the people in."

- `campaign_events`: title, topic, constituency, district, venue, event_date,
  description, status (planned/live/done/cancelled).
- `event_rsvps`: person ↔ event with status (invited / interested / confirmed /
  attended / no_show). Attendance is a first-class mobilization signal — a
  confirmed-and-attended person is field-verified support.
- Entry path: an event QR / link sets `engagement_type='event'`, `magnet='qr'`,
  and an RSVP row. Post-event: attendance drives follow-up ladders (thank-you,
  volunteer invite) — ladders come after base structure.

## 3. D2D — door-to-door campaigns — `d2d_visits`

Karyakartas go door to door: talk, log the person, photograph the place.

- `d2d_visits`: one row per door knocked — `worker_name`/`worker_phone`,
  `lead_id` (nullable: a knock with no contact still counts), constituency,
  district, booth, `address_note`, `photo_url` (Supabase Storage bucket
  `d2d-photos`), `latitude`/`longitude` (optional), `outcome`
  (met / not_home / refused / revisit), `notes`, grievance fields if one came up.
- A "met" visit with contact details creates/merges a Person
  (phone = merge key) with `first_touchpoint='d2d'`, `magnet='d2d'`,
  `engagement_type='outreach'`.
- Intake: `POST /api/agent/d2d/log` (INBOUND_API_KEY-protected) — built for the
  field app / a Google-Form-to-webhook bridge until the field app exists.

### Privacy call-out (explicit decision needed)
The ask was: under People, see **how many** came via D2D — with their details/
images access controlled. Base structure keeps photos in a **private** storage
bucket (signed URLs only, no public read), and the People table shows the D2D
source + count without surfacing photos. Who gets photo access (war-room-level
roles?) is a follow-up decision — flagged, not silently decided.

## 4. "What we stand for" — positioning clarity

- Prompts (system + web) widened: multi-intent routing — grievance capture is
  one branch; support/volunteer/event/info each get their own handling. The
  agent never funnels a supporter into "so what's your grievance?".
- Platform pillars belong in the campaign KB (knowledge context) so `info`
  conversations get consistent answers. Content itself comes from the brand
  team — structure is ready for it.

## 5. Dashboard surfacing (base)

- People table: engagement-type visible; D2D arrivals identifiable via source;
  count of D2D people visible with a filter.
- War Room later: D2D coverage layer on the constituency map (knocks per booth)
  — natural extension, not in base.

## Out of scope for base structure (next phases)
- Field-worker app / mobile capture UI for D2D.
- Event follow-up ladders + attendance QR check-in.
- Role-based photo access controls.
- Landing-page grievance form wiring (separate repo, flagged earlier).
