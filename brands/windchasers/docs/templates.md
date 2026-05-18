# Windchasers WhatsApp Templates — Source of Truth

All WhatsApp message templates the PROXe system uses, in one place.
Register each one in **Meta Business Manager → WhatsApp Manager → Message Templates** with the exact name, category, body, variables, buttons, and sample values shown here.

If you ever change the wording, update this file in the SAME commit so the doc and reality stay in sync.

---

## Naming convention

`windchasers_<trigger>_<intent>`

- `<trigger>` — what caused the message (pat, demo, fb, call, etc.)
- `<intent>` — what the message does (welcome, result, confirmed, reminder, etc.)

This keeps templates self-describing in the Meta dashboard so anyone scanning the list knows what fires when.

---

## Status legend

| Symbol | Meaning |
|---|---|
| 🟢 LIVE | Already approved in Meta and firing in prod |
| 🟡 PENDING | Code is wired; waiting on Meta approval |
| 🔵 PLANNED | Not yet built — placeholder for future work |

---

# Templates in production / pending

## 1. `windchasers_pat_result_v1` 🟢 LIVE

**Trigger:** Customer completes the Pilot Aptitude Test on the website.
**Endpoint:** `POST /api/agent/leads/inbound` with `source: "pat"` or `form_type: "pilot_aptitude_test"`.
**Sender:** `sendPATResult()` in `src/lib/services/whatsappSender.ts`.

| Field | Value |
|---|---|
| Category | UTILITY |
| Language | English |
| Header | — |

**Body (4 variables):**
```
Hi {{1}}! Your Pilot Aptitude Test result is in.

Score: {{2}}/100
Tier: {{3}}

{{4}}

A counsellor will be in touch shortly.

- Team Windchasers
```

**Variables:**
| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | First name | `Yalamati` |
| `{{2}}` | Score on 0–100 scale | `58` |
| `{{3}}` | Tier label (`Premium` / `Strong` / `Moderate` / `Early Stage`) | `Early Stage` |
| `{{4}}` | Tier-specific next-step message (from `TIER_MESSAGES`) | `Strong foundation matters more than first score. Talk to a counsellor about prep options.` |

**Tier → {{3}} + {{4}} mapping (source of truth: `TIER_LABELS` + `TIER_MESSAGES` in `whatsappSender.ts`):**

| Internal key | {{3}} label | {{4}} message |
|---|---|---|
| `premium`   | Premium     | Strong fit for CPL track. A counsellor can walk you through timeline and next steps. |
| `strong`    | Strong      | You're well-positioned. Worth a 1:1 to map your training path. |
| `moderate`  | Moderate    | Good foundation. A counsellor can map out the right program for your goals. |
| `not-ready` | Early Stage | Strong foundation matters more than first score. Talk to a counsellor about prep options. |

**Buttons:** none.
**Footer:** optional.

---

## 2. `windchasers_demo_offline_v1` 🟡 PENDING

**Trigger:** Customer books an **offline (in-facility)** demo on the website.
**Endpoint:** `POST /api/agent/leads/inbound` with `notes: "demo_booked"` or `form_type: "demo_booked"` AND `custom_fields.demo_type: "offline"` (or unset — offline is the default).
**Sender:** `sendDemoConfirmation(..., format: 'offline')` in `src/lib/services/whatsappSender.ts`.

| Field | Value |
|---|---|
| Category | UTILITY |
| Language | English |
| Header | — |

**Body (3 variables):**
```
Hi {{1}}, your demo at the Windchasers facility is confirmed.

Date: {{2}}
Time: {{3}}

Address details and what to bring will follow shortly. Reply here if you need to reschedule.

- Team Windchasers
```

**Variables:**
| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | First name | `Priya` |
| `{{2}}` | Formatted date | `Mon, May 19` |
| `{{3}}` | Formatted time | `12:00 PM IST` |

**Buttons:** none (offline — no calendar/Meet link needed in this message).
**Footer:** optional.

---

## 3. `windchasers_demo_online_v1` 🟡 PENDING

**Trigger:** Customer books an **online** demo on the website.
**Endpoint:** `POST /api/agent/leads/inbound` with `notes: "demo_booked"` or `form_type: "demo_booked"` AND `custom_fields.demo_type: "online"`. The calendar event is created BEFORE the WA send so its `eventId` is available for the button URL.
**Sender:** `sendDemoConfirmation(..., format: 'online', calendarEventId)` in `src/lib/services/whatsappSender.ts`.

| Field | Value |
|---|---|
| Category | UTILITY |
| Language | English |
| Header | — |

**Body (3 variables):**
```
Hi {{1}}, your online demo with Windchasers is confirmed.

Date: {{2}}
Time: {{3}}

The Meet link will arrive 30 minutes before the session. Tap "Add to Calendar" below so you don't miss it.

- Team Windchasers
```

**Variables:**
| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | First name | `Priya` |
| `{{2}}` | Formatted date | `Mon, May 19` |
| `{{3}}` | Formatted time | `12:00 PM IST` |

**Button (URL, dynamic):**
- Type: Visit Website → Dynamic URL
- Text: `Add to Calendar`
- URL pattern (must match exactly what Meta has): `https://calendar.google.com/calendar/event?eid={{1}}`
- Button `{{1}}` sample: `MTk0MDQ1MzU2NjAg` (the base64 Google Calendar `eventId`)

> If Meta has a different domain (e.g. `www.google.com/calendar/event`), use whatever Meta has — they must match exactly.

---

## 3. `windchasers_facebook_welcome` 🟡 PENDING

**Trigger:** Lead submits a Facebook / Meta Lead Form (forwarded via Pabbly Connect).
**Endpoint:** `POST /api/agent/facebook-lead`.
**Sender:** `sendFacebookLeadWelcome()` in `src/lib/services/whatsappSender.ts`.

| Field | Value |
|---|---|
| Category | MARKETING |
| Language | English |
| Header | — (optional: Windchasers logo image) |

**Body:**
```
Hi {{1}}! Thanks for showing interest in Windchasers - India's leading aviation training academy.

We've got training paths for DGCA Ground Classes, Pilot Training, Cabin Crew, and more.

Reply with your career goal and our counsellor will guide you through the next steps.

- Team Windchasers
```

**Variables:**
| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | First name | `Rahul` |

**Buttons:** optional. Recommended quick replies:
- `I'm a Student`
- `I'm a Parent`
- `Tell me more`

**Footer:** optional, e.g. `Powered by Windchasers Aviation Academy`.

> If Meta rejects "India's leading" claim, soften to `India's top` or
> just `a leading`.

---

# Existing templates (already approved)

## 4. `windchasers_followup` 🟢 LIVE

**Trigger:** Generic first outreach for any inbound lead that doesn't match a specific path (PAT / Demo / FB). Used by both `sendFirstOutreach()` and the inbound endpoint fallback.

**Body** (registered in Meta — kept here for reference, don't edit unless re-submitting):
```
Hi {{1}}! Thanks for reaching out to Windchasers. Our counsellor will get back to you shortly with details about our training programs.

- Team Windchasers
```

| Var | Sample |
|---|---|
| `{{1}}` | First name |

---

## 5. `booking_confirmation` 🟢 LIVE (legacy — keep)

**Trigger:** Confirms a booking inside the 24-hour window (free-form text fallback handled in code).
**Sender:** `sendBookingConfirmation()`.

Body uses 3 variables + URL button (Add to Calendar). Variables: name, title, dateTime. Button URL: `https://calendar.google.com/calendar/event?eid={{1}}`.

---

## 6. `booking_reminder` 🟢 LIVE

**Trigger:** 24h / 1h / 30m reminders before a booking. Fired by `GET /api/cron/booking-reminders`.

Body uses 3 variables + URL button (Join Meeting). Variables: name, title, dateTime. Button URL: `https://meet.google.com/{{1}}`.

---

## 7. `missed_call_followup` 🟢 LIVE

**Trigger:** After a call is logged with outcome `No Answer` / `Voicemail` / `Busy`, fired by the note orchestrator's RNR sequence.
**Sender:** `sendMissedCallMessage()`.

Body uses 3 variables: name, title (e.g. "AI Lead Strategy Call"), booked time display.

---

# Future / planned templates 🔵

These aren't built yet — placeholders for when we expand follow-up sequences:

| Name | Trigger | Purpose |
|---|---|---|
| `windchasers_followup_day1` | Day 1 after first contact, no reply | Soft nudge with a question |
| `windchasers_followup_day3` | Day 3 silence | Different angle — value prop / social proof |
| `windchasers_followup_day5` | Day 5 silence | Last touch before going cold |
| `windchasers_reengage_quarterly` | 90 days after going cold | Quarterly check-in |
| `windchasers_demo_reminder_day_before` | 24h before demo | Booking reminder (currently uses generic `booking_reminder`) |
| `windchasers_pat_low_score_followup` | Low PAT score (early tier) | Encouragement + foundational course pitch |

Add the spec block here before building each one.

---

# Workflow when changing a template

1. Update the **body / variables / buttons** in this file first.
2. Update the matching sender function in `src/lib/services/whatsappSender.ts`.
3. In Meta Business Manager:
   - If only the body changed: edit the existing template → resubmit (treated as a new submission and needs re-approval).
   - If you renamed it: register the new name fresh, leave the old approved version in place until the new one is approved, then update the sender to use the new name.
4. Commit both files together (this `.md` + the sender code).

# How to test a template after approval

Once a template shows **Approved (green)** in Meta:

1. Pick a lead in PROXe and trigger the matching flow (or use the endpoint directly with `curl`).
2. Check Vercel logs for `[meta/webhook]` or the matching sender log.
3. If the Graph API returns an error like `"Template name does not exist in the translation"`, double-check the name + language code in this doc match what Meta has.

# Where else templates live in code

| Sender | File | Template name |
|---|---|---|
| `sendPATResult` | `src/lib/services/whatsappSender.ts` | `windchasers_pat_result_v1` |
| `sendDemoConfirmation` | `src/lib/services/whatsappSender.ts` | `windchasers_demo_offline_v1` · `windchasers_demo_online_v1` (format-aware) |
| `sendDemoBookedConfirmation` *(deprecated)* | `src/lib/services/whatsappSender.ts` | wraps `sendDemoConfirmation(..., 'offline')` |
| `sendFacebookLeadWelcome` | `src/lib/services/whatsappSender.ts` | `windchasers_facebook_welcome` |
| `sendFirstOutreach` | `src/lib/services/whatsappSender.ts` | `windchasers_followup` |
| `sendBookingConfirmation` | `src/lib/services/whatsappSender.ts` | `booking_confirmation` |
| `sendBookingReminder` | `src/lib/services/whatsappSender.ts` | `booking_reminder` |
| `sendMissedCallMessage` | `src/lib/services/whatsappSender.ts` | `missed_call_followup` |

When you change a template name in Meta, update both this doc AND the sender file in the same commit.
