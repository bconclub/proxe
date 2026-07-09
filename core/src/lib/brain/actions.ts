// Brain ACTIONS — the structured trailer that lets the Brain drive the
// dashboard. The model emits one final line ("ACTIONS: [...]") after its
// answer, mirroring the proven FOLLOWUPS trailer: one model call, no tool-use
// loop, works identically for Claude (chat route) and Groq (voice route).
// The server strips + validates the trailer against the lead snapshot it just
// sent to the model, so a hallucinated id can never reach the client.
//
// Consent model: `auto` may only ride on navigation (open_lead / open_page)
// when the operator explicitly asked to see something. `dial` is NEVER auto —
// the chat button click is the consent, and the voice client ignores dial
// entirely (v1).

// What the model is asked to emit (raw, untrusted).
export type ModelAction = {
  type?: string
  id?: string
  page?: string
  label?: string
  auto?: boolean
}

// What the client receives (validated, phone attached server-side).
export type BrainAction =
  | { type: 'open_lead'; leadId: string; channel: 'whatsapp' | 'web' | 'voice'; leadName: string; label: string; auto?: boolean }
  | { type: 'open_page'; page: 'leads' | 'pipeline' | 'dashboard' | 'inbox'; label: string; auto?: boolean }
  | { type: 'dial'; leadId: string | null; leadName: string; phone: string; label: string }

export const PAGE_ROUTES: Record<string, string> = {
  dashboard: '/dashboard',
  leads: '/dashboard/leads',
  pipeline: '/dashboard/pipeline',
  inbox: '/dashboard/inbox',
}

export type LeadIndexEntry = {
  id: string
  name: string
  phone: string | null
  channel: 'whatsapp' | 'web' | 'voice'
}

// id8 = first 8 chars of the uuid — short enough for the model to copy
// reliably, unique enough across a 2000-row snapshot (first-wins on the
// astronomically rare collision).
export function id8(id: string): string {
  return String(id).slice(0, 8)
}

// The channel the inbox deep-link should open — where this lead actually
// talked. unified_context keys are the ground truth; last_touchpoint is the
// fallback signal; default web.
function channelOf(row: any): 'whatsapp' | 'web' | 'voice' {
  const uc = row?.unified_context || {}
  if (uc.whatsapp) return 'whatsapp'
  if (uc.voice) return 'voice'
  if (uc.web) return 'web'
  const tp = String(row?.last_touchpoint || '').toLowerCase()
  if (tp.includes('whatsapp')) return 'whatsapp'
  if (tp.includes('voice') || tp.includes('call')) return 'voice'
  return 'web'
}

export function buildLeadIndex(rows: any[]): Map<string, LeadIndexEntry> {
  const map = new Map<string, LeadIndexEntry>()
  for (const r of rows || []) {
    if (!r?.id) continue
    const key = id8(r.id)
    if (map.has(key)) continue
    map.set(key, {
      id: String(r.id),
      name: r.customer_name || 'Unknown',
      phone: r.phone || null,
      channel: channelOf(r),
    })
  }
  return map
}

// Strip the trailing "ACTIONS: [...]" line and parse it. Run this BEFORE the
// FOLLOWUPS regex — that one matches across newlines and would swallow a
// trailing ACTIONS line into the followups.
export function parseActionsTrailer(raw: string): { text: string; actions: ModelAction[] } {
  const m = raw.match(/\n?ACTIONS:\s*(\[.*\])\s*$/s)
  if (!m) return { text: raw, actions: [] }
  const text = raw.slice(0, m.index).trimEnd()
  try {
    const parsed = JSON.parse(m[1])
    return { text, actions: Array.isArray(parsed) ? parsed : [] }
  } catch {
    return { text, actions: [] }
  }
}

// Validate the model's actions against the snapshot it saw. Anything that
// doesn't check out is dropped silently — the prose answer still stands.
export function validateActions(actions: ModelAction[], idMap: Map<string, LeadIndexEntry>): BrainAction[] {
  const out: BrainAction[] = []
  const findLead = (a: ModelAction): LeadIndexEntry | null => {
    const key = String(a.id || '').trim()
    if (key && idMap.has(key)) return idMap.get(key)!
    // Fallback: the model sometimes echoes the name instead of the id.
    const name = key.toLowerCase()
    if (name) {
      for (const entry of idMap.values()) {
        if (entry.name.toLowerCase() === name) return entry
      }
    }
    return null
  }
  for (const a of actions || []) {
    if (out.length >= 2) break
    if (!a || typeof a !== 'object') continue
    const label = typeof a.label === 'string' && a.label.trim() ? a.label.trim().slice(0, 60) : ''
    if (a.type === 'open_lead') {
      const lead = findLead(a)
      if (!lead) continue
      out.push({ type: 'open_lead', leadId: lead.id, channel: lead.channel, leadName: lead.name, label: label || `Open ${lead.name}'s conversation`, auto: a.auto === true })
    } else if (a.type === 'open_page') {
      const page = String(a.page || '').toLowerCase()
      if (!(page in PAGE_ROUTES)) continue
      out.push({ type: 'open_page', page: page as any, label: label || `Open ${page}`, auto: a.auto === true })
    } else if (a.type === 'dial') {
      const lead = findLead(a)
      if (!lead || !lead.phone) continue
      // dial is NEVER auto — consent is the button click (chat) and voice
      // ignores dial entirely in v1.
      out.push({ type: 'dial', leadId: lead.id, leadName: lead.name, phone: lead.phone, label: label || `Call ${lead.name}` })
    }
  }
  return out
}

// The prompt paragraph both brain routes append when the brand has
// features.brainActions on. `spoken` switches the wording for the voice route.
export function actionsPromptSpec(spoken: boolean): string {
  const base = `ACTIONS: after ${spoken ? 'your words' : 'the FOLLOWUPS line'}, you may output ONE final line starting with "ACTIONS:" followed by a JSON array (max 2) of UI actions the dashboard executes:
- {"type":"open_lead","id":"<id from DATA>","label":"Open <name>'s conversation"} — when your answer centers on one specific lead/person that exists in DATA (their id is next to their name).
- {"type":"open_page","page":"leads|pipeline|dashboard|inbox","label":"Open <page>"} — when the answer is page-shaped (lead counts/breakdowns → leads or pipeline).
- {"type":"dial","id":"<id from DATA>","label":"Call <name>"} — when a phone call to that person is on the table.
Rules: ids MUST be copied exactly from DATA — never invent one. No action for generic answers. Omit the line entirely when no action fits.`
  if (spoken) {
    return `${base}
Add "auto":true to open_lead/open_page — you are speaking, so say what you're doing naturally ("I'll open that for you now"). NEVER emit a dial action — if a call makes sense, suggest they use the Call button in the chat or inbox instead. The ACTIONS line is stripped before your words are voiced: NEVER speak ids, JSON, or the word ACTIONS aloud.`
  }
  return `${base}
Add "auto":true ONLY when the operator explicitly asked to see/open/show it (e.g. "show me the top lead") — the UI then opens it immediately. For proposals ("want to see them?") omit auto — the UI renders a button. For dial: attaching the action is the proposal; the operator's button click is the consent — also ask naturally in prose ("Want me to call them?").`
}
