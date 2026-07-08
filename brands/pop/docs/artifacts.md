# POP Artifacts — Master Architecture

Pulse of Punjab is a **campaign OS**: the PROXe engine underneath (people,
conversations, channels, stats), and **artifacts** on top — purpose-built
surfaces for different users, all reading/writing the **same person variables**
in `all_leads`. One person, many lenses.

The dashboard's brand header (top-left) opens the **artifact switcher**
(`core/src/components/dashboard/ArtifactSwitcher.tsx`), driven by
`artifacts[]` in `brands/pop/config.ts`.

---

## Shared identity model (the spine)

Every artifact speaks the same vocabulary — columns on `all_leads`
(migrations `022_pop_constituent_model.sql`, `023_pop_campaign_model.sql`):

| Field | Meaning | Values |
|---|---|---|
| `phone` | **cross-channel merge key** — same phone = one constituent | partial unique per brand |
| `constituency` / `district` / `booth` | where they are | 117 ACs (`core/src/lib/war-room/constituencies.ts`) |
| `language` | preferred language | `pa / hi / en` |
| `magnet` | **which door they came through** | `whatsapp / voice / pulse_app / qr / missed_call / d2d / event / landing` |
| `engagement_type` | **why they engaged** | `grievance / support / volunteer / event / info / outreach` |
| `lean` | where they stand | `supporter / leaning / undecided / opposed` |
| `action_intent` | what they'll do | `vote / volunteer / rally / share / none` |
| `grievance_category` / `grievance_text` / `salience` | the voice raised | 9 categories, salience 1–3 |
| `loop_status` | grievance loop | `raised → routed → resolved` |

**Person-type definitions (used across all artifacts):**
- **Volunteer** = `engagement_type='volunteer'` OR `action_intent='volunteer'` (display: lead_stage 'Converted' relabels to "Volunteer")
- **Supporter** = `lean='supporter'` (display: 'Qualified' → "Supporter")
- **Cadre / field worker** = D2D workers — `worker_name`/`worker_phone` on `d2d_visits` (no account model yet)
- **How they came in** = `magnet` (entry channel) + `first_touchpoint` + `unified_context.attribution` (source/first-touch/last-touch)

Supporting tables (023): `campaign_events` (mobilization spine),
`event_rsvps` (person↔event, invited→attended), `d2d_visits` (one row per
knock), private `d2d-photos` bucket.

---

## 1. War Room — master artifact · **LIVE**

- **Users:** Directors of IM, campaign command
- **URL:** `/war-room` on pop-proxe.vercel.app
- **Reads:** privacy-projected view `vw_war_room_base` (no phone/email) via
  `GET /api/war-room/data` — KPIs, issues by salience, lean, 117-seat heat map,
  mobilization, channel mix, live feed, sentiment, **`d2d` coverage block**
  (knocks, met-rate, workers, per-seat coverage, aligned to `d2d_visits`)
- **Writes:** nothing — read-only by design, isolated route tree
- **Realtime:** Supabase `postgres_changes` on `all_leads` + `d2d_visits`
- **Files:** `core/src/app/war-room/*`, `core/src/app/api/war-room/data/route.ts`

## 2. Pulse Punjab — leader-facing · **WIP (separate build)**

- **Users:** the leader + inner circle
- **Build:** `C:\Users\user\Builds\Punjab` (Expo React-Native-for-Web PWA) →
  pulse-punjab.vercel.app. 117-seat choropleth, 2022 results, P1/P2/P3
  framework, voter-age analytics, scan→call journey. Currently bundled mock data.
- **Integration seam:** its `src/lib/api.ts` — set `EXPO_PUBLIC_API_URL` to the
  PROXe app and flip `USE_LOCAL` to go live. Contract mapping (PROXe side —
  **to build under `/api/leader/*`**, read-only, key- or session-protected):

| Punjab app calls | PROXe route (future) | Backed by |
|---|---|---|
| `GET /constituencies` | `/api/leader/constituencies` | `constituencies.ts` (static) |
| `GET /results` | `/api/leader/results` | bundled 2022 ECI data (static) |
| `GET /framework` | `/api/leader/framework` | campaign framework config |
| `GET /pulse`, `/pulse/:no` | `/api/leader/pulse` | same aggregation as war-room data, keyed by AC no — REAL numbers replace the seeded mock |
| `POST /grievances` | `/api/agent/leads/inbound` (exists) | grievance intake → `all_leads` with `magnet='pulse_app'` |
| `POST /subscribe` | `/api/agent/leads/inbound` (exists) | opt-in → `all_leads`, `engagement_type='info'` |
| `POST /devices` | future — push token store | not modeled yet |

- **Data in:** grievances + subscriptions land in `all_leads` (`magnet='pulse_app'`)
- **Data out:** real per-seat pulse metrics from engine data

## 3. D2D Field Tool — volunteer canvassing · **WIP (separate build)**

- **Users:** volunteers / karyakartas knocking doors
- **Status:** the tool itself is a separate build (kept aside). **The PROXe
  side is DONE** — data flows in and is visible today:
  - **Intake (built):** `POST /api/agent/d2d/log` (`x-api-key: INBOUND_API_KEY`)
    — one POST per knock: worker, person met, place, photo (private bucket),
    geo, outcome (`met/not_home/refused/revisit`), grievance, **`lean`**,
    `language`. Inserts `d2d_visits`; a met visit with phone **creates/merges
    the person** in `all_leads`: `magnet='d2d'`, `first_touchpoint='d2d'`,
    fill-if-null `constituency/district/booth/language`, grievance fields,
    and `lean` always-overwrite (latest canvass wins).
  - **Visibility (built):** War Room "D2D Coverage" panel (knocks, met-rate,
    active workers, knocks/day trend, top workers) + per-seat D2D line in the
    drawer + realtime pulse on new knocks.
- **Whatever UI the field tool ships (app / form / WhatsApp flow), it only has
  to POST to `/api/agent/d2d/log`** — enrichment + visibility come free.

## 4. Lead Now — citizen-facing · **COMING SOON**

- **Users:** citizens — QR scans at events, posters, D2D leave-behinds
- **Scope sketch:** landing page/app → QR scan (`magnet='qr'`), tap-to-call /
  missed-call (`magnet='missed_call'`, voice agent answers), volunteer/lead
  CTA (`engagement_type='volunteer'`/`action_intent`), news/updates, "share
  your voice" (grievance intake → same `all_leads` fields).
- **Model impact: none** — every input maps to existing columns. Intake via
  existing `/api/agent/web/chat` + `/api/agent/leads/inbound`; the existing
  chat widget (`/widget`) is the seed surface.

## 5. Listener / Live Overview · **COMING SOON**

- **Users:** GI/PI, ads & comms team, agency
- **Scope sketch:** state-wide live board — issues, updates, events, sentiment.
  Sources: WhatsApp media-scan group (ingest → classify → `grievance_category`
  + sentiment), social listening (Hootsuite-style), engine data (what citizens
  are actually saying, in their words/language → feed targeting + creative).
- **Model impact:** likely additive table for external mentions (not people);
  person-linked signals keep landing on `all_leads`. Sentiment vocabulary
  reuses `lean` + war-room sentiment scoring.

---

## Build notes

- **Deploying tree = `core/`** (one-core: Vercel Root Directory `core`,
  `NEXT_PUBLIC_BRAND=pop`). `brands/pop/agent` is the live-parity fork —
  sync changes there when doing a parity pass, core is the source of truth.
- Artifact switcher is generic: any brand that sets `artifacts[]` in its
  config gets it; brands without it keep their plain header (zero impact).
- All new intake paths must go through `ensureOrUpdateLead` (phone merge) so
  one person stays one row no matter how many artifacts touch them.
