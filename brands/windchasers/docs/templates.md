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

## 1. `windchasers_pat_welcome` 🟡 PENDING

**Trigger:** Customer completes the Pilot Aptitude Test on the website.
**Endpoint:** `POST /api/agent/leads/inbound` with `source: "pat"` or `form_type: "pilot_aptitude_test"`.
**Sender:** `sendPATResult()` in `src/lib/services/whatsappSender.ts`.

| Field | Value |
|---|---|
| Category | UTILITY |
| Language | English |
| Header | — |

**Body:**
```
Hi {{1}}! Your Pilot Aptitude Test result is in.

Score: {{2}}/100
Tier: {{3}}

Our counsellor will reach out shortly with personalised next steps. Excited to chat soon!

- Team Windchasers
```

**Variables:**
| Var | Meaning | Sample |
|---|---|---|
| `{{1}}` | First name | `Yalamati` |
| `{{2}}` | Score on 0–100 scale | `58` |
| `{{3}}` | Tier label | `Moderate` |

**Buttons:** none.
**Footer:** optional, e.g. `Powered by Windchasers Aviation Academy`.

> Note: template was originally named `windchasers_pat_result` in code.
> If you prefer that name in Meta, register as `windchasers_pat_result`
> and update the `sendPATResult` template name to match. Either name
> works as long as it matches what's registered.

---

## 2. `windchasers_demo_confirmed` 🟡 PENDING

**Trigger:** Customer books a demo session on the website.
**Endpoint:** `POST /api/agent/leads/inbound` with `notes: "demo_booked"` or `form_type: "demo_booked"`. Calendar event is created first; this message fires after with the meet link.
**Sender:** `sendDemoBookedConfirmation()` in `src/lib/services/whatsappSender.ts`.

| Field | Value |
|---|---|
| Category | UTILITY |
| Language | English |
| Header | — |

**Body:**
```
Hi {{1}}, your demo session with Windchasers is confirmed.

Date: {{2}}
Time: {{3}}

You'll receive the meeting link 30 minutes before the session. Reply here if you need to reschedule.

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
- Text: `Join Meeting`
- URL pattern: `https://meet.google.com/{{1}}`
- Button `{{1}}` sample: `abc-defg-hij` (the Google Meet code suffix)

> Note: code currently uses `windchasers_demo_booked`. Pick one name and
> stay consistent across Meta + code.

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
| `sendPATResult` | `src/lib/services/whatsappSender.ts` | `windchasers_pat_result` |
| `sendDemoBookedConfirmation` | `src/lib/services/whatsappSender.ts` | `windchasers_demo_booked` |
| `sendFacebookLeadWelcome` | `src/lib/services/whatsappSender.ts` | `windchasers_facebook_welcome` |
| `sendFirstOutreach` | `src/lib/services/whatsappSender.ts` | `windchasers_followup` |
| `sendBookingConfirmation` | `src/lib/services/whatsappSender.ts` | `booking_confirmation` |
| `sendBookingReminder` | `src/lib/services/whatsappSender.ts` | `booking_reminder` |
| `sendMissedCallMessage` | `src/lib/services/whatsappSender.ts` | `missed_call_followup` |

When you change a template name in Meta, update both this doc AND the sender file in the same commit.
