# PAT (Pilot Aptitude Test) Scoring — Reference

**Brand:** Windchasers
**Last updated:** 2026-05-16

The PAT is delivered on the Windchasers website. Every completion POSTs to the PROXe
ingest endpoint `/api/agent/leads/inbound` with the payload defined below. PROXe is
the system of record — the website only keeps the tier and total for the thank-you
display.

---

## Structure

3 sections, 20 scored questions (Q15 deprecated), 150 total points.

| Section       | Questions          | Max | What it measures                                  |
| ------------- | ------------------ | --- | ------------------------------------------------- |
| Qualification | Q1–Q4 (4 Qs)       | 50  | Age + 12th academics                              |
| Aptitude      | Q5–Q18 (13 Qs)     | 50  | Aviation IQ + Math + English + Decision-making   |
| Readiness     | Q19–Q21 (3 Qs)     | 50  | Funding + Timeline + Research depth               |

### Section 1 — Qualification (50 pts)

| Q | Question         | Points              | Notes                                                                   |
| - | ---------------- | ------------------- | ----------------------------------------------------------------------- |
| 1 | Age              | 10 / 5              | 17–30 = 10, else = 5                                                    |
| 2 | Education status | 15 / 12 / 8 / 0     | 12th PCM = 15, In 12th PCM = 12, 12th BiCom/Arts = 8, Below 12th = 0    |
| 3 | Physics %        | 12.5 / 8 / 6 / 4    | >60 = 12.5, 50–60 = 8, Not appeared = 6, <50 = 4                        |
| 4 | Mathematics %    | 12.5 / 8 / 6 / 4    | Same scale as Physics                                                   |

### Section 2 — Aptitude (50 pts)

| Sub-bucket       | Questions          | Per Q                    | Total |
| ---------------- | ------------------ | ------------------------ | ----- |
| Aviation IQ      | Q5–Q9 (5 Qs)       | 3 pts each (correct only)| 15    |
| Math Aptitude    | Q10–Q13 (4 Qs)     | 3.75 pts each            | 15    |
| Communication    | Q14, Q16 (2 Qs)    | 5 pts each               | 10    |
| Decision-making  | Q17–Q18 (2 Qs)     | 5 / 3 / 1 / 0 graded     | 10    |

Aviation IQ / Math / Communication: only the correct option scores; all others = 0.
Decision-making: graded (best = 5, weak = 3 or 2, worst = 0).

### Section 3 — Readiness (50 pts)

| Q  | Question                                | Points              |
| -- | --------------------------------------- | ------------------- |
| 19 | Financial preparedness (₹60–80L)        | 20 / 15 / 10 / 5    |
| 20 | When to start training                  | 15 / 12 / 8 / 4     |
| 21 | Research depth                          | 15 / 12 / 8 / 4     |

---

## Tier mapping (on the /150 scale)

| Tier        | Min total | UX label                                       | Color  | Rank percentile |
| ----------- | --------- | ---------------------------------------------- | ------ | --------------- |
| `premium`   | 140       | Premium Tier — You are flight ready            | Gold   | Top 15%         |
| `strong`    | 120       | Strong Tier — You are qualified                | Green  | Top 30%         |
| `moderate`  | 90        | Moderate Tier — You have potential             | Yellow | Top 50%         |
| `not-ready` | 0         | Not Ready Yet — Build your foundation          | Red    | Top 70%         |

**Tier names are fixed strings — `premium | strong | moderate | not-ready`.**

PROXe re-derives the tier from `total_score` on every ingest. The `tier` field in
the payload is ignored to prevent spoofing.

---

## Display-only conversion

* Internal/stored everywhere = `/150` (preserves decimal precision)
* User-facing (website thank-you AND PROXe dashboard) = `Math.round(score × 100 / 150)` shown as `/100`
* The tier still uses 150-scale thresholds — so a `premium` cutoff (140) shows as 93/100

---

## PROXe ingest payload (every PAT completion)

```json
{
  "name": "...",
  "phone": "+91...",
  "email": "...",
  "city": "...",
  "source": "pat",
  "brand": "windchasers",
  "campaign": "<utm_campaign or null>",
  "custom_fields": {
    "form_type": "pilot_aptitude_test",
    "audience": "student | parent | early_stage",
    "page_url": "...",
    "tier": "premium | strong | moderate | not-ready",
    "total_score": 0,             // 0-150 (decimal allowed)
    "qualification_score": 0,     // 0-50
    "aptitude_score": 0,          // 0-50 (decimal allowed — 3.75 per Math Q)
    "readiness_score": 0,         // 0-50
    "eligible_class_12_pass": true,
    "answers": [
      { "question_id": 1, "answer": "23" },
      { "question_id": 2, "answer": "0" }
      // …20 rows
    ],
    "utm_source": "...",
    "utm_medium": "...",
    "utm_campaign": "...",
    "utm_term": "...",
    "utm_content": "..."
  }
}
```

---

## Storage in PROXe

A PAT submission writes to `all_leads.unified_context`:

```jsonc
{
  "<brand>": {
    "pat_score":                   87,              // raw, 0–150 (kept for precision)
    "pat_score_100":               58,              // rounded display value, 0–100
    "pat_tier":                    "not-ready",     // server-derived from pat_score
    "pat_qualification_score":     30,              // 0–50
    "pat_aptitude_score":          22,              // 0–50
    "pat_readiness_score":         35,              // 0–50
    "pat_eligible_class_12_pass":  true,
    "pat_max_score":               150,
    "pat_completed_at":            "2026-05-16T…"
  },
  "raw_form_fields": {
    /* the full custom_fields object verbatim — answers[], page_url, utm_*, etc. */
  }
}
```

`pat_tier` is always recomputed on the server from `pat_score` using the cutoffs
above. The client-sent `tier` field is logged for comparison but not trusted.

---

## Recommended PROXe table columns (if you ever flatten this out of JSON)

```text
leads (or pat_leads)
├── lead_id (uuid, PK)
├── created_at (timestamp)
├── name, phone, email, city                      -- identity
├── source                                        -- "pat"
├── brand                                         -- "windchasers"
├── campaign                                      -- utm_campaign mirror
├── tier                                          -- enum: premium|strong|moderate|not-ready
├── total_score          decimal(5,2)             -- 0-150 (decimal due to 3.75 / 12.5)
├── qualification_score  decimal(4,2)             -- 0-50
├── aptitude_score       decimal(4,2)             -- 0-50
├── readiness_score      decimal(4,2)             -- 0-50
├── eligible_class_12_pass (bool)
├── page_url             text
├── audience             enum: student|parent|early_stage
├── utm_source, utm_medium, utm_campaign, utm_term, utm_content (varchar)
└── answers              jsonb                    -- full 20-row array

-- Optional secondary table for per-question analytics:
pat_answers
├── lead_id (FK → leads)
├── question_id (int 1-21)
├── answer (varchar)
├── points (decimal)
└── section (enum: qualification|aptitude|readiness)
```

---

## Notes

1. Use `decimal(5,2)` for `total_score` and `decimal(4,2)` for sub-scores —
   not `int`. Math questions are 3.75 pts each and Physics/Math grade brackets
   are 12.5 pts, so totals can carry 0.25 / 0.5 / 0.75 fractions.
2. Tier is **always** recomputed on the server from `total_score`. The
   client-sent tier is informational only.
3. `audience` enum is `student | parent | early_stage`. Any other value falls
   through to `raw_form_fields` but is not surfaced on the dashboard.
