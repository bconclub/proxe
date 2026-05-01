# Aria (WindChasers Chat Agent) Audit

> Audit-only — no code modified. Captures the state of `main` at the time of writing.
> File paths are relative to repo root (`PROXe/`). Brand scope: **windchasers** only.

---

## 1. Architecture summary

| Concern | Value |
|---|---|
| LLM provider | **Anthropic Claude** via official `@anthropic-ai/sdk` |
| Model id | `claude-haiku-4-5-20251001` (env override: `CLAUDE_MODEL`) — [`claudeClient.ts:22`](brands/windchasers/agent/src/lib/agent-core/claudeClient.ts#L22) |
| Agent framework | **Custom** — no LangChain, no Vercel AI SDK. Hand-rolled streaming + tool-use loop. |
| Flow type | **Hybrid.** Deterministic button-flow state machine (`ChatWidget.tsx`) drives *which* buttons render next; LLM (prompt-driven) generates the response *text*. |
| System prompt source | [`brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts`](brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts) (web) and [`windchasers-prompt.ts`](brands/windchasers/agent/src/configs/prompts/windchasers-prompt.ts) (whatsapp/voice/social) |
| Prompt selector | [`promptBuilder.ts:29-43`](brands/windchasers/agent/src/lib/agent-core/promptBuilder.ts#L29) — switches by `brand` and `channel` |
| Flow definitions | Hardcoded inline in [`ChatWidget.tsx:2497-2551`](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2497) (`flowRule` IIFE) |
| Welcome buttons | [`brand.config.ts:84-88`](brands/windchasers/agent/src/configs/brand.config.ts#L84) `quickButtons` |
| Explore buttons | [`brand.config.ts:90-95`](brands/windchasers/agent/src/configs/brand.config.ts#L90) `exploreButtons` |
| Streaming transport | Server-Sent Events from [`/api/agent/web/chat/route.ts`](brands/windchasers/agent/src/app/api/agent/web/chat/route.ts) |
| Engine entrypoint | [`engine.ts:processStream`](brands/windchasers/agent/src/lib/agent-core/engine.ts) at line 176 — yields `{type:'chunk'}`, `{type:'followUps'}`, `{type:'done'}`, `{type:'error'}` |
| Knowledge base | Supabase table `knowledge_base` + `knowledge_base_chunks`; hybrid RPC FTS + ILIKE fallback in [`knowledgeSearch.ts`](brands/windchasers/agent/src/lib/agent-core/knowledgeSearch.ts) |

**Generation params** (engine.ts:245-249): `max_tokens: 768` for web, no explicit `temperature` (Anthropic SDK default ≈ 1.0). Up to 3 tool-use rounds. Follow-up button generation uses a **second** Claude call capped at 60 tokens ([`followUpGenerator.ts:299`](brands/windchasers/agent/src/lib/agent-core/followUpGenerator.ts#L299)).

---

## 2. System prompt

### 2a. Web prompt (the one running on the live widget)

**File:** [`brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts`](brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts) — full text:

```ts
export function getWindchasersWebSystemPrompt(context: string, messageCount?: number): string {
  return `You are Aria, Windchasers' AI aviation advisor on the website.

Persona: Warm, direct, professional aviation advisor.
Vibe: Clear guidance, concise replies, no fluff.
Core: Guide users through pilot-path decisions and move qualified users to consultation booking.

=================================================================================
RESPONSE RULES
=================================================================================
- Max 2 sentences per response.
- No emojis.
- Keep course details lean, knowledge base handles specifics.
- Output only conversational response text.
- Never re-introduce yourself after the first assistant message in the same chat.

=================================================================================
FIRST MESSAGE (messageCount: ${messageCount || 0})
=================================================================================
Use this exact greeting ONLY for the first assistant message in a brand-new chat:
"Hi! I'm Aria, Windchasers' AI aviation advisor. Let's get you on the right path. What are you looking for?"

If there is already any assistant message in history, do not repeat the greeting.

=================================================================================
CONVERSATIONAL RESPONSE FLOW
=================================================================================
When user clicks "Start Pilot Training":
- Say exactly: "Are you looking to fly an airplane or a helicopter?"

When user selects Airplane or Helicopter:
- Say exactly: "Great choice. Have you completed your DGCA exams, or are you starting fresh?"

When user says Yes Completed DGCA:
- Say exactly: "Great! Where would you like to complete your flying hours?"

When user selects a country:
- Say one brief sentence about that location.
- Then say exactly: "Want to set up a 1:1 consultation with our team?"

When user says No Starting Fresh:
- Say exactly: "No problem. Have you completed 12th grade with Physics and Maths?"

When user says Yes Completed 12th:
- Say exactly: "Got it. Quick question — how old are you?"

When user picks "Under 18" or "18-21":
- Say exactly: "You're at the right age for pilot training. Want to set up a 1:1 consultation?"

When user picks "22-25" or "26+":
- Say exactly: "Got it. What are you doing right now — studying, working, or taking a break?"

When user picks Studying, Working, or Taking a Break:
- Say one brief sentence acknowledging their situation.
- Then say exactly: "Pilot training is still very feasible. Want to set up a 1:1 consultation to map out a plan?"

When user says Still in School:
- Say exactly: "No problem. Complete your 12th with Physics and Maths and you'll be eligible. Want us to keep you updated?"

When user clicks "Book a Demo Session" or asks to book a consultation:
- Say exactly: "Let me pull up available slots for you."

=================================================================================
DATA COLLECTION FLOW
=================================================================================
- Collect details naturally over conversation, never all at once.
- Ask name early if missing.
- Ask phone and email before finalizing consultation handoff.
- If user declines sharing contact details, stay helpful and continue with guidance.

=================================================================================
PRICING RULES
=================================================================================
- Never volunteer pricing unless user asks directly.
- When asked, reply with factual range and timeline: 40-75 lakhs, 18-24 months.
- Keep pricing replies concise and transparent, no upsell language.

=================================================================================
DE-ESCALATION RULES
=================================================================================
- If user is frustrated, acknowledge briefly and calmly in one sentence.
- Avoid defensiveness, avoid blame, and guide to one clear next step.
- If user asks for a human, offer consultation/callback path clearly.

=================================================================================
CRITICAL RULES
=================================================================================
- Name is Aria. Never say BCON or PROXe.
- Max 2 sentences.
- Never list time slots in text.
- Never volunteer pricing unless asked.
- Pricing when asked: 40-75 lakhs, 18-24 months.
- No emojis.
- Never output button labels or any button-generation instructions in assistant text.

=================================================================================
KNOWLEDGE BASE
=================================================================================
${context}

Use the knowledge base for detailed course facts and policy specifics only when needed.`;
}
```

### 2b. Non-web prompt

**File:** [`brands/windchasers/agent/src/configs/prompts/windchasers-prompt.ts`](brands/windchasers/agent/src/configs/prompts/windchasers-prompt.ts) — 319 lines. Used for **WhatsApp / voice / social** channels and as a fallback. Not running on the website widget. Notable divergences from the web prompt:

- Different persona tone (more aggressive: "No BS. No emojis. No sales-y language", a hard-coded "FRUSTRATED CUSTOMER" de-escalation block)
- Still references **PPL / CPL** as the first qualifier question ([`windchasers-prompt.ts:31`](brands/windchasers/agent/src/configs/prompts/windchasers-prompt.ts#L31)) — out of sync with the simplified web flow
- Still lists **Drone Training** as a specialized course ([line 169](brands/windchasers/agent/src/configs/prompts/windchasers-prompt.ts#L169)) even though Drone was removed from the explore buttons
- Has its own qualification questions block (`user_type`, `class_12_science`, `plan_to_fly`, `course_interest`) at lines 122-152

### Notes — what the prompt instructs vs what users actually see

| Instruction | Reality |
|---|---|
| First-message greeting from prompt: *"Hi! I'm Aria, Windchasers' AI aviation advisor. Let's get you on the right path. What are you looking for?"* | The **first thing the user sees** is a hardcoded welcome bubble *"Hi! Welcome to Windchasers, I am here to help you with our Aviation Training Queries"* injected by [`ChatWidget.tsx:159`](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L159) (`bconWelcomeSequence` constant — yes, *bcon*). The prompt's greeting fires only after the user types or clicks. Two greetings, two voices. |
| "Never list time slots in text" | Enforced by surrendering scheduling to `BookingCalendarWidget` instead of text. Holds. |
| "Output only conversational response text" + "Max 2 sentences" + "Never output button labels" | When the user clicks a button that has **no exact rule** above (e.g. "Cabin Crew", "Pilot Training", "Helicopter Pilot", "Flight Schools"), Aria improvises. With max-2-sentences and a long list of *never*-rules, this can collapse to an empty completion → loading bubble spins forever (the "stuck" symptom you reported). |

---

## 3. Persona

**"Aria"** is named in two places:

- [`windchasers-web-prompt.ts:2`](brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts#L2) — *"You are Aria, Windchasers' AI aviation advisor on the website."*
- [`windchasers-prompt.ts:25`](brands/windchasers/agent/src/configs/prompts/windchasers-prompt.ts#L25) — *"You are Windchasers – an honest, warm, professional aviation career advisor."* and [line 95](brands/windchasers/agent/src/configs/prompts/windchasers-prompt.ts#L95) *"❌ Your name is Aria. Never say you are BCON or PROXe."*

**Header in the chat panel** says **"Windchasers AI"** — the name "Aria" only appears in the LLM's first response. There is no `personaName` field in `BrandConfig`; the name is embedded inside the prompt strings.

---

## 4. Welcome screen

| Element | Source | Hardcoded / Config / DB |
|---|---|---|
| Greeting text | [`ChatWidget.tsx:159`](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L159) — `bconWelcomeSequence` array | **Hardcoded** (and the variable name still says *bcon*) |
| Greeting render | [`ChatWidget.tsx:1805`](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L1805) via `streamWelcomeMessage()` | Streamed locally, NOT a server LLM call |
| 3 CTAs | [`brand.config.ts:84-88`](brands/windchasers/agent/src/configs/brand.config.ts#L84) `quickButtons: ['Start Pilot Training', 'Book a Demo Session', 'Explore Training Options']` | **Config** |
| CTA renderer | [`ChatWidget.tsx:2553-2572`](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2553) `renderWelcomeButtons` | — |
| Brand-config interface | [`proxe.config.ts:1-84`](brands/windchasers/agent/src/configs/proxe.config.ts#L1) `BrandConfig` | — |

**`BrandConfig` field inventory** (everything the runtime can read about the brand):
`name`, `brand`, `apiUrl`, `supabase?`, `systemPrompt?`, `styles?`, `chatStructure?`, `colors`, `quickButtons`, `exploreButtons?`, `followUpButtons`, `firstMessageButtons?`, `showWelcomeVideo?`, `welcomeVideoUrl?`, `welcomeVideoTitle?`.

There is **no** `greeting`, `personaName`, `bookingUrl`, or `eligibilityCriteria` field — anything along those lines is currently embedded in either prompt text or hardcoded JSX.

---

## 5. Conversation flow

The flow is a **two-layer machine**:

1. **Button flow** (deterministic) — `flowRule` IIFE in [`ChatWidget.tsx:2497-2551`](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2497) maps a clicked button label → next button set.
2. **Response text** (LLM) — the click also sends the label as a user message; Aria replies according to the prompt's "exactly say" rules, falling back to free-form when no rule matches.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Welcome bubble (hardcoded): "Hi! Welcome to Windchasers..."         │
│ Renders quickButtons: [Start Pilot Training] [Book a Demo Session]  │
│                       [Explore Training Options]                    │
└─────────────────────────────────────────────────────────────────────┘
   │                   │                          │
   ▼                   ▼                          ▼
[Start Pilot]       [Book a Demo]          [Explore Training]
   │                   │                          │
   ▼                   ▼                          ▼
Airplane | Helicopter   triggers              Pilot Training |
   │                    BookingCalendar       Flight Schools |
   ▼                    keyword path          Helicopter Pilot |
Yes, Completed DGCA   ──────────────────►      Cabin Crew
   │ │                                              │
   │ └─► No, Starting Fresh                         ▼
   │      │                                   ┌──────────────┐
   │      ▼                                   │ NO FLOW RULE │
   │  Yes, Completed 12th Science |           │ LLM improvises│
   │  Still in School                         │ next button = │
   │      │                                   │ Claude pick   │
   │      ▼                                   │ from whitelist│
   │  Under 18 | 18-21 | 22-25 | 26+          │ (quickButtons │
   │      │                                   │  + explore-   │
   │      ▼                                   │  Buttons)     │
   │  ┌─ Under 18 / 18-21 ───► Book a         │ ✗ no Airplane │
   │  └─ 22-25 / 26+                          │   in pool ⇒   │
   │       │                                  │   dead end    │
   │       ▼                                  └──────────────┘
   │   Studying | Working | Taking a Break
   │       │
   │       ▼
   │   Book a Consultation
   ▼
USA | Canada | Hungary | New Zealand | Thailand | Australia
   │
   ▼
Book a Consultation
   │
   ▼
[Inline name/email/phone capture if missing]
   │  (thresholds: name on msg 0,
   │   email at interactionCountRef ≥ 5,
   │   phone at interactionCountRef ≥ 7
   │   — ChatWidget.tsx:236-237, 873-931)
   ▼
BookingCalendarWidget (date → time → form → confirm)
```

**Free-text input** is always available — the input is never disabled ([`ChatWidget.tsx:3451-3475`](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L3451)); only the *send button* is disabled while a stream is in flight ([line 3518](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L3518)).

**Free-text replies** go through the LLM with the active prompt rules. There is no NLU / intent classifier on the inbound message — the only "intent extraction" is keyword-spotting in [`intentExtractor.ts:11-73`](brands/windchasers/agent/src/lib/agent-core/intentExtractor.ts#L11) for `userType`, `courseInterest`, `timeline`, `questionsAsked`, and these results are **not written to the lead row** (extracted, returned to engine, used to nudge prompt context — but not persisted).

---

## 6. The "Explore Training Options" trace

User journey, step by step:

| Step | Action | What fires | Bot reply (file:line) | Buttons rendered next |
|---|---|---|---|---|
| 1 | Click **"Explore Training Options"** | `handleQuickButtonClick` → `flowRule` matches at [ChatWidget.tsx:2545-2548](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2545) → returns `config.exploreButtons` | LLM has **no exact rule** for this label in the web prompt → improvises (typically: "Sure! Which area interests you?") | `Pilot Training`, `Flight Schools`, `Helicopter Pilot`, `Cabin Crew` (forced via `pendingFlowOverrideRef`) |
| 2 | Click **"Pilot Training"** | `flowRule` returns **`null`** (no case matches `pilot training`) → message sent to LLM, no override forced | LLM improvises (no exact rule for "Pilot Training" in [windchasers-web-prompt.ts](brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts)) | **AI-generated** via [`followUpGenerator.generateContextualButton`](brands/windchasers/agent/src/lib/agent-core/followUpGenerator.ts#L264) → restricted to whitelist `[...quickButtons, ...exploreButtons]` = `[Start Pilot Training, Book a Demo Session, Explore Training Options, Pilot Training, Flight Schools, Helicopter Pilot, Cabin Crew]` |
| 3 | Try to click **"Airplane"** | **No "Airplane" button exists.** It is not in the whitelist. The user must either (a) re-open the welcome flow by clicking *Start Pilot Training* if Claude happens to surface it, or (b) type "Airplane" by hand. | — | — |

**This is the choke point.** The Explore branch never connects to the Airplane/Helicopter qualifier branch:

- `Airplane` and `Helicopter` are only reachable from the *flow override* triggered by clicking `Start Pilot Training` ([line 2498-2500](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2498)).
- The follow-up-button whitelist for *Explore* mode is `quickButtons + exploreButtons` — it does not contain `Airplane` or `Helicopter`.
- So clicking a sub-area like *Pilot Training* is a soft dead-end: the user will see free-form Claude output and, at best, get rerouted to *Start Pilot Training* via the LLM's button pick.

A second related choke point ("Cabin Crew → Yes" hangs) — since there is no exact rule for "Cabin Crew" or "Yes" in this branch, the LLM sometimes returns an empty completion. The client adds a streaming bubble, never receives chunks, and the loading dot spins indefinitely. There is no client-side timeout in [`useChatStream.ts`](brands/windchasers/agent/src/hooks/useChatStream.ts) to clear an empty bubble.

---

## 7. All buttons and quick replies inventory

| Button label | Set | Defined at | Routes to (next buttons) | Notes |
|---|---|---|---|---|
| Start Pilot Training | quickButtons (welcome) | [brand.config.ts:85](brands/windchasers/agent/src/configs/brand.config.ts#L85) | `Airplane`, `Helicopter` | Flow rule [2498-2500](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2498) |
| Book a Demo Session | quickButtons (welcome) | [brand.config.ts:86](brands/windchasers/agent/src/configs/brand.config.ts#L86) | Calendar widget | Keyword `book` triggers calendar at [ChatWidget.tsx:998-1012](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L998) |
| Explore Training Options | quickButtons (welcome) | [brand.config.ts:87](brands/windchasers/agent/src/configs/brand.config.ts#L87) | exploreButtons | Flow rule [2545-2548](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2545) |
| Pilot Training | exploreButtons | [brand.config.ts:91](brands/windchasers/agent/src/configs/brand.config.ts#L91) | LLM-picked from whitelist (dead-end) | No flow rule |
| Flight Schools | exploreButtons | [brand.config.ts:92](brands/windchasers/agent/src/configs/brand.config.ts#L92) | LLM-picked (dead-end) | No flow rule |
| Helicopter Pilot | exploreButtons | [brand.config.ts:93](brands/windchasers/agent/src/configs/brand.config.ts#L93) | LLM-picked (dead-end) | No flow rule |
| Cabin Crew | exploreButtons | [brand.config.ts:94](brands/windchasers/agent/src/configs/brand.config.ts#L94) | LLM-picked (dead-end) | No flow rule; cause of "stuck" bug |
| Airplane | inline flow | [ChatWidget.tsx:2499](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2499) | `Yes, Completed DGCA`, `No, Starting Fresh` | Hardcoded |
| Helicopter | inline flow | [ChatWidget.tsx:2499](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2499) | `Yes, Completed DGCA`, `No, Starting Fresh` | Same as Airplane — no helicopter-specific path |
| Yes, Completed DGCA | inline flow | [ChatWidget.tsx:2506-2510](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2506) | `FLOW_COUNTRIES` (USA, Canada, Hungary, New Zealand, Thailand, Australia) | Country list at [line 48](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L48) |
| USA / Canada / Hungary / New Zealand / Thailand / Australia | inline flow | [ChatWidget.tsx:2511-2515](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2511) | `Book a Consultation` | — |
| No, Starting Fresh | inline flow | [ChatWidget.tsx:2516-2519](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2516) | `Yes, Completed 12th Science`, `Still in School` | — |
| Yes, Completed 12th Science | inline flow | [ChatWidget.tsx:2521-2524](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2521) | `Under 18`, `18-21`, `22-25`, `26+` | Age qualifier |
| Under 18 / 18-21 | inline flow | [ChatWidget.tsx:2526-2529](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2526) | `Book a Consultation` | — |
| 22-25 / 26+ | inline flow | [ChatWidget.tsx:2531-2534](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2531) | `Studying`, `Working`, `Taking a Break` | Activity qualifier |
| Studying / Working / Taking a Break | inline flow | [ChatWidget.tsx:2536-2543](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2536) | `Book a Consultation` | — |
| Still in School | (no flow rule) | — | LLM-picked from `followUpButtons` pool | Falls back to [brand.config.ts:96](brands/windchasers/agent/src/configs/brand.config.ts#L96) `['Book a Consultation', 'Ask a Question']` |
| Book a Consultation / Book a Demo / Book a Demo Session | calendar trigger | [ChatWidget.tsx:998-1012](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L998), keywords at [2404-2410](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2404) | `BookingCalendarWidget` inline | — |
| Ask a Question | followUpButtons fallback | [brand.config.ts:96](brands/windchasers/agent/src/configs/brand.config.ts#L96) | LLM-picked next | — |

**LLM follow-up generation pool** (when no flow override): brand-specific allowed list at [`followUpGenerator.ts:21-42`](brands/windchasers/agent/src/lib/agent-core/followUpGenerator.ts#L21):

```
firstMessage:    Explore Training Options, Book a Demo Session, Get Cost Breakdown,
                 Check Eligibility, Learn More
costButtons:     Get Cost Breakdown, Financing Options, Talk to Counselor
interestButtons: Book 1:1 Consultation, Book Demo Online, Get Course Timeline
genericButtons:  Book a Demo Session, Get Cost Breakdown, Check Eligibility,
                 Explore Training Options, Talk to Counselor
bookingAware:    Get Course Details, Check Eligibility, Financing Options
```

---

## 8. CTAs and handoffs

All booking CTAs converge on the same target — the inline `BookingCalendarWidget`.

| CTA | Trigger | File:line |
|---|---|---|
| **Book a Consultation** (button) | Keyword `book` matches `containsBookingKeywords` | [ChatWidget.tsx:998-1012](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L998), keywords [2404-2410](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2404) (`call`, `demo`, `book`, `schedule`, `meeting`, `appointment`, `audit`) |
| **Book a Demo / Book a Demo Session** (button) | Exact-match `isExactDemoBookingTrigger` | [ChatWidget.tsx:945-946](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L945) |
| User types **"Yes"** after AI mentions consultation | Regex `/^yes[.!?]*$/` against last AI text containing `set up a 1:1 consultation` or `book a consultation` | [ChatWidget.tsx:939-944](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L939) |
| User types booking-keyword sentence | Same `containsBookingKeywords` | [line 1003](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L1003) |
| Pre-booking gate: name | Required if missing on first message | [ChatWidget.tsx:873-906](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L873) |
| Pre-booking gate: email | After ≥ 5 interactions (`EMAIL_PROMPT_THRESHOLD`) | [ChatWidget.tsx:236, 908-920](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L908) |
| Pre-booking gate: phone | After ≥ 7 interactions (`PHONE_PROMPT_THRESHOLD`) | [ChatWidget.tsx:237, 922-931](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L922) |

**Booking destination:** internal `BookingCalendarWidget` ([file](brands/windchasers/agent/src/components/widget/BookingCalendarWidget.tsx)) — date/time → form → submit. No external Calendly / Cal.com link. Booking writes to the lead's `unified_context.windchasers.booking_*` fields and (for Google Workspace calendars) creates a Google Calendar event via [`bookingManager.ts`](brands/windchasers/agent/src/lib/services/bookingManager.ts).

---

## 9. FAQ / knowledge sources

| Layer | Where | What |
|---|---|---|
| Primary RAG-ish | Supabase RPC `search_knowledge_base()` over `knowledge_base_chunks` (FTS + optional pgvector) | [`knowledgeSearch.ts:26`](brands/windchasers/agent/src/lib/agent-core/knowledgeSearch.ts#L26), schema [`030_knowledge_base_chunks.sql`](brands/windchasers/supabase/migrations/030_knowledge_base_chunks.sql) |
| Fallback 1 | ILIKE on parent `knowledge_base.content` / `knowledge_base.title` | [`knowledgeSearch.ts:55-60`](brands/windchasers/agent/src/lib/agent-core/knowledgeSearch.ts#L55) |
| Fallback 2 | ILIKE across six other tables: `system_prompts`, `agents`, `conversation_states`, `cta_triggers`, `model_context`, `chatbot_responses` | [`knowledgeSearch.ts:83`](brands/windchasers/agent/src/lib/agent-core/knowledgeSearch.ts#L83) — *several of these tables don't exist in the current schema; calls return errors that are silently swallowed* |
| Hardcoded FAQ in prompt | None | Prompt only contains pricing (40-75 lakhs / 18-24 months) — everything else is delegated to KB |
| Knowledge base population | Manual entries via dashboard `/dashboard/knowledge` (62 rows currently in prod). Migration files have **no seed data**. | [`029_knowledge_base.sql`](brands/windchasers/supabase/migrations/029_knowledge_base.sql), [`031_knowledge_base_qa_columns.sql`](brands/windchasers/supabase/migrations/031_knowledge_base_qa_columns.sql) |

**`knowledge_base` schema:** `id, brand, type, title, source_url, content, file_name, file_size, file_type, chunks (jsonb), embeddings_status, error_message, metadata, question, answer, category, subcategory, tags (jsonb), created_at, updated_at`. RLS enabled with permissive policies. FTS GIN index on (title + content) and on (question + answer + content).

The KB result is dropped into the prompt's `${context}` placeholder ([`windchasers-web-prompt.ts:99`](brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts#L99)). Top-3 results are formatted as `[<title>] <content>` strings ([`knowledgeSearch.ts:39`](brands/windchasers/agent/src/lib/agent-core/knowledgeSearch.ts#L39)).

---

## 10. Eligibility logic

The 12th-PCM gate lives in **two places that must stay in sync**:

| Layer | Where | Behavior |
|---|---|---|
| Prompt text (what Aria says) | [`windchasers-web-prompt.ts:42`](brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts#L42) — *"No problem. Have you completed 12th grade with Physics and Maths?"* | Says it after user picks "No, Starting Fresh" |
| Button flow (what user can click) | [`ChatWidget.tsx:2516-2519`](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2516) — pops `Yes, Completed 12th Science` / `Still in School` | — |
| Yes branch | Prompt [line 44-45](brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts#L44) → ask age | Buttons [`ChatWidget.tsx:2521-2524`](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2521) |
| No / Still-in-School branch | Prompt [line 57-58](brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts#L57) — *"Complete your 12th with Physics and Maths and you'll be eligible. Want us to keep you updated?"* | **Soft dead-end** — there is no flow rule for `Still in School`, so next button comes from the AI follow-up generator pool |
| Age gate | Prompt [lines 47-55](brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts#L47), buttons [ChatWidget.tsx:2521-2543](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2521) | Under 18 / 18-21 → straight to consultation. 22-25 / 26+ → asks Studying/Working/Break |
| Eligibility *promise* | Prompt [line 48](brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts#L48) — *"You're at the right age for pilot training."* | Said based **only** on age + 12th-PCM. Ignores medical/vision/budget/time. |
| Storage | Intent extractor would write `windchasers.class_12_science`, `windchasers.user_age` etc., but [`intentExtractor.ts`](brands/windchasers/agent/src/lib/agent-core/intentExtractor.ts) does NOT actually persist these fields to the lead row. They live in conversation transcript only. | — |

The non-web prompt has its own parallel eligibility block ([`windchasers-prompt.ts:138-152`](brands/windchasers/agent/src/configs/prompts/windchasers-prompt.ts#L138)) with `class_12_science`, `plan_to_fly`, `course_interest` — also not persisted by the extractor.

---

## 11. PAT in chat

**Aria does not mention, link to, or trigger the Pilot Aptitude Test anywhere in the user-facing chat.**

The only PAT references in the entire `brands/windchasers/` tree are:

- [`LeadsTable.tsx:816-817`](brands/windchasers/agent/src/components/dashboard/LeadsTable.tsx#L816) — admin dashboard maps `form_type='pilot_aptitude_test'` to the display label **"PAT"** for lead source classification.

That is dashboard-only. There is no:
- Flow rule that surfaces a PAT button
- Prompt instruction telling Aria to direct users to the PAT
- CTA / link target pointing at a PAT page or test
- KB entry explaining what the PAT is (verified via `knowledge_base` schema; no PAT-specific seed data)

---

## 12. Gaps and observations

In rough order of how much the user feels them.

1. **The "Explore Training Options" branch is a soft dead-end.** Picking *Pilot Training*, *Flight Schools*, *Helicopter Pilot*, or *Cabin Crew* drops the user into a free-form LLM reply with a Claude-generated follow-up button drawn from `quickButtons + exploreButtons`. None of those is `Airplane` or `Helicopter`, so the user can't reach the qualifier without typing or backing out to *Start Pilot Training*. The whole *Explore* path is decorative.

2. **Cabin Crew → Yes hangs the bot.** No flow rule + no exact prompt rule + restrictive output rules ("max 2 sentences", "output only conversational text") ⇒ Claude sometimes returns an empty completion. `useChatStream.ts` has no timeout for empty streams, so the loading dot spins forever. This is the "stuck here" symptom you reported.

3. **Two different greetings, two different voices.**
   - Welcome bubble (hardcoded, [`ChatWidget.tsx:159`](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L159), variable name `bconWelcomeSequence`): *"Hi! Welcome to Windchasers, I am here to help you with our Aviation Training Queries."*
   - Prompt-driven first reply: *"Hi! I'm Aria, Windchasers' AI aviation advisor. Let's get you on the right path."*
   The persona "Aria" is invisible until after the user types.

4. **Web prompt and non-web prompt have drifted.**
   - Non-web ([`windchasers-prompt.ts`](brands/windchasers/agent/src/configs/prompts/windchasers-prompt.ts)) still asks PPL/CPL as the first qualifier, still lists Drone Training as a course, has its own "FRUSTRATED CUSTOMER" rules, has a different tone ("No BS"). WhatsApp users get a meaningfully different Aria than website users.

5. **Helicopter path is a clone of Airplane.** Same DGCA → 12th → age → activity questions. No mention of helicopter-specific timeline, regulatory differences, cost. If helicopter is a real offering it deserves its own qualifier; if it isn't, it shouldn't be a button.

6. **"You're eligible for pilot training" is a hard promise.** Said at [line 48](brands/windchasers/agent/src/configs/prompts/windchasers-web-prompt.ts#L48) based on **age + 12th-PCM only**. Ignores medical/Class-1, vision, budget (40–75 L is a non-trivial gate), and the user's actual aptitude. Brand can be put on the back foot at the consultation.

7. **No off-ramp for ineligible users.**
   - *Still in School* → "we'll keep you updated" — no email capture step, no "take the PAT now anyway", no helicopter/cabin-crew alternative.
   - 26+ + Working → consultation regardless. No filtering for users who realistically can't do an 18-24 month course.

8. **PAT is missing from the funnel.** The PAT is your top-of-funnel qualifier in the form world (per [`LeadsTable.tsx:816`](brands/windchasers/agent/src/components/dashboard/LeadsTable.tsx#L816)) but the chat never directs users there. Anyone who is ineligible today is dead-leaded; routing them into "Take the free PAT" would salvage the conversation.

9. **Hardcoded vs configurable strings — inventory.**
   | String | Configurability |
   |---|---|
   | Welcome bubble copy | **Hardcoded** ([ChatWidget.tsx:159](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L159)) |
   | First-reply greeting | **Hardcoded in prompt** |
   | quickButtons (welcome CTAs) | Config (good) |
   | exploreButtons | Config (good) |
   | Country list `FLOW_COUNTRIES` | **Hardcoded** ([line 48](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L48)) |
   | Age buckets | **Hardcoded** ([2521-2534](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2521)) |
   | Activity options | **Hardcoded** ([2531-2534](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2531)) |
   | Pricing strings | **Hardcoded in prompt** |
   | "Powered by PROXe" footer | Hardcoded |

10. **Intent extraction runs but does not persist.** [`intentExtractor.ts`](brands/windchasers/agent/src/lib/agent-core/intentExtractor.ts) computes `userType`, `courseInterest`, `timeline`, `questionsAsked` on every turn but the result is only fed back into the prompt. None of those values land in `all_leads.unified_context.windchasers` — the dashboard cannot show "this lead said they're 22-25 and working." The TYPE / COURSE columns we just surfaced on the lead modal will only fill in for leads that came in via *form*, not chat.

11. **Anonymous chats are not stored where the dashboard reads them.** Confirmed via DB query: `conversations` is empty and `web_sessions` is empty, even though leads with `first_touchpoint='form'` exist. The widget's `postProcess` ([chat/route.ts:182-209](brands/windchasers/agent/src/app/api/agent/web/chat/route.ts#L182)) only creates an `all_leads` row when email or phone is provided. Pre-contact chats land nowhere visible.

12. **KB fallback queries six tables that probably don't exist.** [`knowledgeSearch.ts:83`](brands/windchasers/agent/src/lib/agent-core/knowledgeSearch.ts#L83) ILIKEs against `system_prompts`, `agents`, `conversation_states`, `cta_triggers`, `model_context`, `chatbot_responses` — none are in the migration files. Errors are swallowed. Wasted RTT on every chat turn.

13. **No client-side stream timeout.** [`useChatStream.ts`](brands/windchasers/agent/src/hooks/useChatStream.ts) starts a streaming bubble, removes the loading bubble (line 197), and has no `setTimeout` to detect the case where zero chunks arrive. The empty bubble persists; user sees the chat hang.

14. **Booking trigger is keyword-shaped.** [Line 2404](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L2404) checks for `call`, `demo`, `book`, `schedule`, `meeting`, `appointment`, `audit`. Spelling variants ("scheduale"), Hindi/Hinglish ("milna chahta hu"), or roundabout phrases ("can I talk to someone") miss.

15. **`bookingAware` follow-up pool collides with the qualifier flow.** When a lead already has a booking, [`followUpGenerator.ts:142`](brands/windchasers/agent/src/lib/agent-core/followUpGenerator.ts#L142) swaps the entire button pool for `Get Course Details`, `Check Eligibility`, `Financing Options`, `Reschedule Call`, `View Booking Details` — these aren't wired to any flow rule, so they too risk dead-ending.

16. **Variable naming leaks BCON branding into Windchasers.** `bconWelcomeSequence` ([line 159](brands/windchasers/agent/src/components/widget/ChatWidget.tsx#L159)), `BCON_INTRO_LINE_REGEXES` ([useChatStream.ts:19](brands/windchasers/agent/src/hooks/useChatStream.ts#L19)). Cosmetic but a sign the widget was forked, not built brand-aware.

---

*End of audit. No code modified.*
