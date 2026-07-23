#!/usr/bin/env node
/**
 * Daily-brief generator — runs on the always-on VPS via cron.
 *
 * Flow (per brand):
 *   1. GET https://<brand-domain>/api/briefs/aggregate?date=YYYY-MM-DD
 *      with Authorization: Bearer $BRIEFS_SECRET   (the token route we shipped)
 *   2. Feed the day's conversations/leads/stage-changes to a model, asking for a
 *      deep-pattern brief as Markdown.
 *   3. Push the brief to TWO sinks (both optional, at least one required):
 *      a. ARC (the fortress frontend) — POST /api/proxe/briefs, shows under the
 *         PROXe wing. This is the primary surface Z looks at.
 *      b. The git-synced Obsidian vault ($VAULT_DIR) — one MD file per brand per
 *         day, so the knowledge graph renders it. Secondary / backend.
 *
 * No secrets live in this file — everything comes from env (see .env alongside).
 *
 * Env:
 *   BRIEFS_SECRET        bearer token the aggregate route expects
 *   ARC_BASE             ARC base URL (e.g. https://arc-liard-two.vercel.app) — sink A
 *   ARC_INGEST_SECRET    bearer token ARC's /api/proxe/briefs expects
 *   VAULT_DIR            path to the git-synced Obsidian vault (optional) — sink B
 *   OPENROUTER_API_KEY   model key (OpenRouter). Optional if ANTHROPIC_API_KEY set.
 *   ANTHROPIC_API_KEY    fallback model provider
 *   BRIEF_MODEL          model id (default: anthropic/claude-sonnet-5 via OpenRouter)
 *   BRIEF_DATE           optional YYYY-MM-DD override (default: yesterday UTC)
 *
 * Brand list is below — each brand is hit on its OWN domain, so the route returns
 * only that brand's data (one-core deploys one brand per domain).
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const BRANDS = [
  { id: 'bcon',        domain: 'https://proxe.bconclub.com' },
  { id: 'windchasers', domain: 'https://proxe.windchasers.in' },
  { id: 'lokazen',     domain: 'https://proxe.lokazen.in' },
  { id: 'proxe',       domain: 'https://dash.goproxe.com' },
  { id: 'pop',         domain: 'https://pulse-punjab.vercel.app' },
]

const {
  BRIEFS_SECRET,
  ARC_BASE,
  ARC_INGEST_SECRET,
  VAULT_DIR,
  OPENROUTER_API_KEY,
  ANTHROPIC_API_KEY,
  BRIEF_MODEL = 'anthropic/claude-sonnet-5',
  BRIEF_DATE,
} = process.env

function die(msg) {
  console.error(`[daily-brief] FATAL: ${msg}`)
  process.exit(1)
}

const ARC_ENABLED = Boolean(ARC_BASE && ARC_INGEST_SECRET)
if (!BRIEFS_SECRET) die('BRIEFS_SECRET not set')
if (!ARC_ENABLED && !VAULT_DIR) die('need a sink: set ARC_BASE + ARC_INGEST_SECRET, and/or VAULT_DIR')
if (!OPENROUTER_API_KEY && !ANTHROPIC_API_KEY) die('need OPENROUTER_API_KEY or ANTHROPIC_API_KEY')

async function postToArc(agg, bodyMd) {
  const res = await fetch(`${ARC_BASE.replace(/\/$/, '')}/api/proxe/briefs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ARC_INGEST_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'brief',
      brand: agg.brand.id,
      brief_date: agg.date,
      title: `${agg.totals.new_leads} leads, ${agg.totals.conversations_with_summary} conversations`,
      body_md: bodyMd,
      totals: agg.totals,
      source: 'daily-brief',
    }),
  })
  if (!res.ok) throw new Error(`ARC ingest ${res.status}: ${await res.text()}`)
}

const yesterdayUTC = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
const DATE = BRIEF_DATE || yesterdayUTC()

async function fetchAggregate(brand) {
  const url = `${brand.domain}/api/briefs/aggregate?date=${DATE}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${BRIEFS_SECRET}` } })
  if (res.status === 503) {
    console.warn(`[daily-brief] ${brand.id}: route dark (secret not set on that deploy) — skipping`)
    return null
  }
  if (!res.ok) {
    console.warn(`[daily-brief] ${brand.id}: aggregate ${res.status} — skipping`)
    return null
  }
  return res.json()
}

const SYSTEM = `You are a growth analyst writing a founder's daily brief from one day of CRM activity.
Extract PATTERNS, not just counts. Be specific and honest. If a day is quiet, say so plainly.
Look for: recurring objections, repeated questions, sentiment shifts, lead-quality signals,
drop-off points, channel differences, and anything that changed versus a normal day.
Output GitHub-flavoured Markdown only. No preamble. Sections:
## Summary  (2-3 sentences)
## Numbers  (compact bullet list)
## Patterns  (the important part — themes with evidence)
## Notable conversations  (2-4, with the signal each carries)
## Watch / act  (concrete next actions)`

async function callModel(prompt) {
  if (OPENROUTER_API_KEY) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: BRIEF_MODEL,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
        temperature: 0.4,
      }),
    })
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`)
    const json = await res.json()
    return json.choices?.[0]?.message?.content?.trim() || ''
  }
  // Anthropic fallback
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: BRIEF_MODEL.replace(/^anthropic\//, ''),
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return json.content?.[0]?.text?.trim() || ''
}

function buildPrompt(agg) {
  // Keep it lean: summaries + facts, not raw transcripts (which we don't fetch).
  return [
    `Brand: ${agg.brand.name} (${agg.brand.id})`,
    `Date: ${agg.date}`,
    `Totals: ${JSON.stringify(agg.totals)}`,
    '',
    'New leads:',
    JSON.stringify(agg.new_leads?.slice(0, 50) ?? [], null, 0),
    '',
    'Conversations (channel + summary):',
    JSON.stringify(
      (agg.conversations ?? []).slice(0, 80).map((c) => ({
        channel: c.channel,
        messages: c.message_count,
        summary: c.conversation_summary,
      })),
      null,
      0,
    ),
    '',
    'Stage changes:',
    JSON.stringify(agg.stage_changes?.slice(0, 50) ?? [], null, 0),
  ].join('\n')
}

function frontmatter(agg) {
  return [
    '---',
    `brand: ${agg.brand.id}`,
    `date: ${agg.date}`,
    `type: daily-brief`,
    `tags: [daily-brief, brand/${agg.brand.id}]`,
    `leads: ${agg.totals.new_leads}`,
    `conversations: ${agg.totals.conversations_with_summary}`,
    '---',
    '',
  ].join('\n')
}

async function run() {
  console.log(`[daily-brief] date=${DATE} model=${BRIEF_MODEL}`)
  const indexLines = [`# Daily briefs — ${DATE}`, '']

  for (const brand of BRANDS) {
    try {
      const agg = await fetchAggregate(brand)
      if (!agg) continue
      if (agg.totals.new_leads === 0 && agg.totals.conversations_with_summary === 0) {
        console.log(`[daily-brief] ${brand.id}: no activity ${DATE} — skipping file`)
        continue
      }

      const body = await callModel(buildPrompt(agg))

      // Sink A — ARC fortress frontend (primary).
      if (ARC_ENABLED) {
        await postToArc(agg, body)
        console.log(`[daily-brief] ${brand.id}: pushed to ARC`)
      }

      // Sink B — git-synced Obsidian vault (optional, for the knowledge graph).
      if (VAULT_DIR) {
        const md = `${frontmatter(agg)}# ${agg.brand.name} — ${DATE}\n\n${body}\n\n---\n_Auto-generated. Source: /api/briefs/aggregate. Related: [[${brand.id}]]_\n`
        const dir = join(VAULT_DIR, 'briefs', brand.id)
        await mkdir(dir, { recursive: true })
        const file = join(dir, `${DATE}.md`)
        await writeFile(file, md, 'utf8')
        console.log(`[daily-brief] ${brand.id}: wrote ${file}`)
      }
      indexLines.push(`- [[briefs/${brand.id}/${DATE}|${agg.brand.name}]] — ${agg.totals.new_leads} leads, ${agg.totals.conversations_with_summary} convos`)
    } catch (err) {
      console.error(`[daily-brief] ${brand.id}: ${err.message}`)
    }
  }

  // A dated index note ties the day together for the Obsidian graph.
  if (VAULT_DIR && indexLines.length > 2) {
    const idxDir = join(VAULT_DIR, 'briefs', '_index')
    await mkdir(idxDir, { recursive: true })
    await writeFile(join(idxDir, `${DATE}.md`), indexLines.join('\n') + '\n', 'utf8')
  }
  console.log('[daily-brief] done')
}

run().catch((e) => die(e.stack || e.message))
