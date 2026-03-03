# PROXe System Prompts — Complete Reference

All prompts used by the PROXe agent engine, where they live, and how they're assembled.

---

## Architecture Overview

```
User message
    │
    ▼
engine.ts ──► knowledgeSearch.ts (fetches KB context from Supabase)
    │
    ▼
promptBuilder.ts
    ├── buildSystemPrompt()
    │     ├── getBrandSystemPrompt() ──► bcon-prompt.ts OR windchasers-prompt.ts
    │     ├── + user name line
    │     ├── + channel instructions (WhatsApp / voice / web)
    │     └── + cross-channel context
    │
    └── buildUserPrompt()
          ├── conversation summary
          ├── recent history
          ├── booking status
          ├── formatting instructions (per channel)
          ├── date context (WhatsApp only)
          ├── firstMessageGuidance (messageCount === 0 or 1)
          ├── thirdMessageGuidance (messageCount === 3)
          └── latest user message
    │
    ▼
claudeClient.ts ──► Claude API (stream or sync)
    │
    ▼
Post-processing:
    ├── followUpGenerator.ts (generates contextual buttons — web only)
    ├── summarizer.ts (generates/updates conversation summary)
    └── intentExtractor.ts (keyword-based intent classification)
```

---

## 1. BCON System Prompt (Primary)

**File:** `brands/bcon/agent/src/configs/prompts/bcon-prompt.ts`
**Mirror:** `master/agent/src/configs/prompts/bcon-prompt.ts`
**Function:** `getBconSystemPrompt(context: string, messageCount?: number): string`
**Used when:** `brand === 'bcon'` (default fallback brand)

### What it contains:
- **Identity:** BCON Club — Human X AI business solutions
- **Tone:** Bold, confident, direct. WhatsApp texting style.
- **Response format rules:** Max 2-3 short lines, one idea per message
- **First response rules:** Warm opener from form data (name + brand), no qualifying, no parroting form data back
- **Form data handling:** Absorb silently, never re-ask, use for booking later
- **Core strategy:** Understand first → Probe → Connect → Book a quick call
- **Call framing:** Never say "AI Brand Audit" — use casual language ("quick call with the team")
- **Conversation flow:** 4 phases (Warm Open → Probe → Connect → Book)
- **Services list:** Only mentioned when relevant to their problem
- **Probing questions:** Bank of natural questions, one at a time
- **Tone calibration:** Adapts to business size (local/mid-size/startup/education)
- **Rules:** DOs and DON'Ts
- **No double/triple messages:** Combine multi-message sequences
- **Objection handling:** Scripts for cost, info requests, thinking, industry
- **Calendar booking flow:** Detailed tool usage (check_availability → book_consultation)
- **Booking rules:** Title generation, ambiguity resolution, no loops
- **Simple greeting handlers:** Fallback for "Hi"/"Hello" without form data
- **Knowledge base injection:** `${context}` placeholder filled at runtime

### Dynamic behavior:
- `isFirstMessage` (messageCount 0 or 1): Injects the full FIRST RESPONSE RULES block
- Knowledge base context: Injected from Supabase search results

---

## 2. Windchasers System Prompt

**File:** `brands/bcon/agent/src/configs/prompts/windchasers-prompt.ts`
**Mirror:** `master/agent/src/configs/prompts/windchasers-prompt.ts`
**Function:** `getWindchasersSystemPrompt(context: string, messageCount?: number): string`
**Used when:** `brand === 'windchasers'`

### What it contains:
- **Identity:** Windchasers — DGCA-approved aviation training academy
- **Tone:** Honest, warm, professional. No emojis. No BS.
- **First message restrictions:** No qualification questions until messageCount >= 3
- **Canned first responses:** "Start Pilot Training", "What is WindChasers?", greetings
- **Message length:** Absolute max 2 sentences per response
- **Pricing gate:** Only mention ₹40-75 lakhs when user explicitly asks
- **Data collection flow:** Name (after 3 msgs) → Phone (after 5) → Email (after 7)
- **Qualification questions:** User type, education, timeline, course interest (after msg 3+)
- **Programs:** CPL, Helicopter, Cabin Crew, Drone
- **Response formatting:** HTML `<br><br>` for web, **bolding** for key info
- **Button generation rules:** 3-2-1 structure (first → 2 buttons → 1 button per msg)
- **Knowledge base injection:** `${context}` placeholder

---

## 3. Prompt Builder (Orchestrator)

**File:** `brands/bcon/agent/src/lib/agent-core/promptBuilder.ts`
**Mirror:** `master/agent/src/lib/agent-core/promptBuilder.ts`
**Function:** `buildPrompt(options: PromptOptions): { systemPrompt, userPrompt }`

### System prompt assembly:
1. `getBrandSystemPrompt()` — selects BCON or Windchasers prompt based on brand
2. Appends user name line (if available)
3. Appends channel instructions (WhatsApp, voice, or web)
4. Appends cross-channel context (if user chatted on another channel before)

### User prompt assembly:
1. Conversation summary (from summarizer)
2. Recent conversation history (formatted as `User: ... / Assistant: ...`)
3. Booking status reminder (if already booked)
4. Channel formatting instructions:
   - **WhatsApp:** Plain text only, max 2 sentences
   - **Web:** HTML formatting, `<br><br>` spacing
5. Date context (WhatsApp only — today's date for resolving "tomorrow")
6. `firstMessageGuidance` — reinforcement for messageCount 0/1 (no qualifying)
7. `thirdMessageGuidance` — "encourage scheduling a call" at message 3
8. Latest user message + "Craft your reply:"

### Channel instructions (appended to system prompt):
- **WhatsApp:** Plain text only, no HTML/markdown, 1-2 sentences, booking tools section
- **Voice:** Very brief, natural-sounding, no formatting
- **Web:** No extra instructions (HTML allowed by default)

---

## 4. Summarizer Prompt

**File:** `brands/bcon/agent/src/lib/agent-core/summarizer.ts`
**Mirror:** `master/agent/src/lib/agent-core/summarizer.ts`
**Function:** `generateSummary(previousSummary, history): Promise<string>`
**Model:** Uses Claude (via `generateResponse`) with max 60 tokens

### System prompt (hardcoded):
> You are an AI conversation summarizer. Create a SHORT, focused summary (1 sentence, max ~50 tokens) focusing ONLY on:
> - User's intent (what they want)
> - Next steps (what action is needed or in progress)
> - Booking status (if they have booked something: date/time/status)
> - Topic/question category (what the question is related to)

### User prompt template:
```
Previous summary: [previous or "(none)"]
New conversation: [formatted history]
Create a very short summary (1 sentence max)...
```

---

## 5. Follow-Up Button Generator Prompt

**File:** `brands/bcon/agent/src/lib/agent-core/followUpGenerator.ts`
**Mirror:** `master/agent/src/lib/agent-core/followUpGenerator.ts`
**Function:** `generateFollowUps(params): Promise<string[]>`
**Used:** Web channel only (WhatsApp gets no buttons)

### Claude prompt for contextual button generation:
> You create one short, direct follow-up call-to-action button label for [brand context]...
> BUTTON GENERATION RULES:
> - First user message: Generate 1 button most relevant to their question
> - Subsequent messages: Generate 1 button for the next logical step
> - 3-7 words. Title case. No emojis.

### Brand-specific button pools (hardcoded fallbacks):
- **BCON:** Explore AI Solutions, Book a Strategy Call, See Our Work, How It Works
- **Windchasers:** Explore Training Options, Book a Demo Session, Get Cost Breakdown
- **PROXe:** Deploy PROXe, Book a Demo, PROXe Pricing, See Features

---

## 6. Intent Extractor (No LLM — Keyword-based)

**File:** `brands/bcon/agent/src/lib/agent-core/intentExtractor.ts`
**Mirror:** `master/agent/src/lib/agent-core/intentExtractor.ts`
**Function:** `extractIntent(message, usedButtons): ExtractedIntent`

No Claude prompt — uses keyword matching to detect:
- Cost/pricing interest
- Eligibility questions
- Timeline questions
- Course/program interest
- User type (student/parent/professional)
- Booking intent

---

## 7. Knowledge Base (Supabase — Runtime Context)

**Table:** `knowledge_base` + `knowledge_base_chunks`
**Search:** `knowledgeSearch.ts` via RPC `search_knowledge_base`

Knowledge base content is fetched at runtime and injected into the system prompt at the `${context}` placeholder. This is NOT a prompt file — it's dynamic data from Supabase.

---

## Brand Resolution

The brand is resolved in this priority order (in `promptBuilder.ts`):
1. Explicit `brand` parameter passed to `buildPrompt()`
2. `process.env.NEXT_PUBLIC_BRAND_ID`
3. `process.env.NEXT_PUBLIC_BRAND`
4. Default: `'bcon'`

Brand → prompt mapping:
| Brand | Prompt Function | File |
|-------|----------------|------|
| `bcon` | `getBconSystemPrompt()` | `bcon-prompt.ts` |
| `windchasers` | `getWindchasersSystemPrompt()` | `windchasers-prompt.ts` |
| *(default)* | `getBconSystemPrompt()` | `bcon-prompt.ts` |

---

## File Locations Summary

| Prompt | Brand Path | Master Path |
|--------|-----------|-------------|
| BCON system prompt | `brands/bcon/agent/src/configs/prompts/bcon-prompt.ts` | `master/agent/src/configs/prompts/bcon-prompt.ts` |
| Windchasers system prompt | `brands/bcon/agent/src/configs/prompts/windchasers-prompt.ts` | `master/agent/src/configs/prompts/windchasers-prompt.ts` |
| Prompt builder | `brands/bcon/agent/src/lib/agent-core/promptBuilder.ts` | `master/agent/src/lib/agent-core/promptBuilder.ts` |
| Summarizer | `brands/bcon/agent/src/lib/agent-core/summarizer.ts` | `master/agent/src/lib/agent-core/summarizer.ts` |
| Follow-up generator | `brands/bcon/agent/src/lib/agent-core/followUpGenerator.ts` | `master/agent/src/lib/agent-core/followUpGenerator.ts` |
| Intent extractor | `brands/bcon/agent/src/lib/agent-core/intentExtractor.ts` | `master/agent/src/lib/agent-core/intentExtractor.ts` |

> **Note:** `brands/bcon/` is the deployed version. `master/` is the template. Both should stay in sync.
