export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentBrandId, getBrandConfig } from '@/configs'
import { getDefaultBrandPrompt } from '@/lib/agent-core/promptBuilder'
import { getAgentPrompts } from '@/lib/promptConfig'
import { getBrainConfig } from '@/lib/brain/brainConfig'

/**
 * GET /api/knowledge-base/graph
 *
 * Read-only inventory of EVERYTHING the agent "knows" - the uploaded knowledge
 * base PLUS every prompt across the system - assembled into a { nodes, links }
 * graph for the Knowledge Base highlight view. Brand-neutral: all content comes
 * from the active brand's files / config / DB, nothing hardcoded per brand.
 *
 * Every source is wrapped in try/catch so a single failing source (DB down, a
 * brand without voice prompts, …) degrades that branch instead of the page.
 */

type Kind = 'root' | 'hub' | 'leaf'
type Group =
  | 'root' | 'knowledge' | 'prompts' | 'voice' | 'brain' | 'channels' | 'templates'

interface GNode {
  id: string
  label: string
  kind: Kind
  group: Group
  /** short one-line descriptor shown under the title in the side panel */
  meta?: string
  /** full text (view-only) shown in the side panel */
  content?: string
  /** char count for a quick "how big is this prompt" badge */
  chars?: number
  /** whether a dashboard editor exists for this node */
  editHref?: string
  /** true when a saved DB override is active (vs the file default) */
  overridden?: boolean
  status?: string
}
interface GLink { source: string; target: string }

const HUB = (id: string, label: string, group: Group): GNode => ({
  id, label, kind: 'hub', group,
})

export async function GET() {
  const brandId = getCurrentBrandId()
  let brandName = brandId
  try { brandName = getBrandConfig().name || brandId } catch { /* keep id */ }

  const nodes: GNode[] = []
  const links: GLink[] = []
  const add = (n: GNode) => { nodes.push(n) }
  const link = (source: string, target: string) => { links.push({ source, target }) }

  // ── Root: the brand's agent brain ────────────────────────────────────────
  const ROOT = 'root'
  add({ id: ROOT, label: brandName, kind: 'root', group: 'root', meta: 'AI agent brain' })

  // ── Hubs (only added if they end up with children) ───────────────────────
  const hubs = {
    knowledge: HUB('hub:knowledge', 'Knowledge Base', 'knowledge'),
    prompts: HUB('hub:prompts', 'Prompts', 'prompts'),
    voice: HUB('hub:voice', 'Voice', 'voice'),
    brain: HUB('hub:brain', 'Brain', 'brain'),
    channels: HUB('hub:channels', 'Channels', 'channels'),
    templates: HUB('hub:templates', 'Templates', 'templates'),
  }
  const hubUsed = new Set<string>()
  const useHub = (h: GNode) => {
    if (!hubUsed.has(h.id)) { add(h); link(ROOT, h.id); hubUsed.add(h.id) }
  }

  let knowledgeCount = 0
  let promptCount = 0
  let templateCount = 0

  // ── 1. Knowledge base rows (grouped by type sub-clusters) ────────────────
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('knowledge_base')
      .select('id,type,title,source_url,file_name,file_size,embeddings_status,content,created_at')
      .order('created_at', { ascending: false })
      .limit(300)
    const rows = data || []
    knowledgeCount = rows.length
    const typeLabel: Record<string, string> = {
      pdf: 'PDF Files', doc: 'Documents', url: 'Web Pages', text: 'Text Notes',
    }
    const seenType = new Set<string>()
    for (const r of rows) {
      useHub(hubs.knowledge)
      const t = String(r.type || 'text')
      const subId = `kb:type:${t}`
      if (!seenType.has(t)) {
        add({ id: subId, label: typeLabel[t] || t, kind: 'hub', group: 'knowledge' })
        link(hubs.knowledge.id, subId)
        seenType.add(t)
      }
      const preview = typeof r.content === 'string' ? r.content.slice(0, 4000) : ''
      add({
        id: `kb:${r.id}`,
        label: r.title || r.file_name || r.source_url || 'Untitled',
        kind: 'leaf', group: 'knowledge',
        meta: [t.toUpperCase(), r.source_url || r.file_name].filter(Boolean).join(' · '),
        content: preview,
        chars: typeof r.content === 'string' ? r.content.length : undefined,
        status: r.embeddings_status || undefined,
        editHref: '/dashboard/settings/knowledge-base',
      })
      link(subId, `kb:${r.id}`)
    }
  } catch (e) {
    console.error('[kb-graph] knowledge source failed', e)
  }

  // ── 2. Agent persona prompts (System / Web / Voice) ──────────────────────
  try {
    const saved = (await getAgentPrompts()) || {}
    const channels: { key: 'system' | 'web' | 'voice'; label: string; ch?: 'web' | 'voice'; chan: string }[] = [
      { key: 'system', label: 'System Prompt', ch: undefined, chan: 'whatsapp' },
      { key: 'web', label: 'Web Prompt', ch: 'web', chan: 'web' },
      { key: 'voice', label: 'Voice Prompt', ch: 'voice', chan: 'voice' },
    ]
    for (const c of channels) {
      let def = ''
      try { def = getDefaultBrandPrompt(brandId, c.ch) } catch { /* skip */ }
      const override = (saved as any)[c.key] as string | undefined
      const effective = override && override.trim() ? override : def
      if (!effective) continue
      promptCount++
      useHub(hubs.prompts)
      const id = `prompt:${c.key}`
      add({
        id, label: c.label, kind: 'leaf', group: 'prompts',
        meta: override && override.trim() ? 'Custom (dashboard override)' : 'Default (brand file)',
        content: effective,
        chars: effective.length,
        overridden: !!(override && override.trim()),
        editHref: '/dashboard/settings/prompt',
      })
      link(hubs.prompts.id, id)
      // Cross-link the persona to the channel it drives → the "web" look.
      useHub(hubs.channels)
      const chId = `chan:${c.chan}`
      if (!hubUsed.has(chId)) {
        const chLabel = c.chan === 'whatsapp' ? 'WhatsApp' : c.chan === 'web' ? 'Web Chat' : 'Voice'
        add({ id: chId, label: chLabel, kind: 'hub', group: 'channels' })
        link(hubs.channels.id, chId)
        hubUsed.add(chId)
      }
      link(id, chId)
    }
  } catch (e) {
    console.error('[kb-graph] persona prompts failed', e)
  }

  // ── 3. Voice grievance prompts (per language) ────────────────────────────
  try {
    const mod = await import('@/lib/server/voicePromptConfig')
    const editable = await mod.getEditableVoicePrompts()
    const langLabel: Record<string, string> = { pa: 'Punjabi', hi: 'Hindi', en: 'English' }
    for (const [lang, v] of Object.entries(editable)) {
      const body = [v.opening, v.body, v.closing].filter(Boolean).join('\n\n')
      if (!body.trim()) continue
      promptCount++
      useHub(hubs.voice)
      const id = `voice:${lang}`
      add({
        id, label: `${langLabel[lang] || lang} Call`, kind: 'leaf', group: 'voice',
        meta: 'Opening · Body · Closing',
        content: body, chars: body.length,
        editHref: '/dashboard/settings/voice-prompts',
      })
      link(hubs.voice.id, id)
      // Voice prompts feed the Voice channel node if it exists.
      if (hubUsed.has('chan:voice')) link(id, 'chan:voice')
    }
  } catch (e) {
    console.error('[kb-graph] voice prompts failed (brand may have none)', e)
  }

  // ── 4. Brain prompts (summary / reflection / vocabulary) ─────────────────
  try {
    const brain = getBrainConfig()
    const brainNodes: { id: string; label: string; content?: string; meta: string }[] = [
      { id: 'brain:summary', label: 'Summary Prompt', content: brain.summaryPrompt, meta: 'How conversations get summarized' },
      { id: 'brain:reflection', label: 'Reflection Persona', content: brain.reflectionPersona, meta: 'Voice of the Brain reflections' },
      { id: 'brain:vocab', label: 'Vocabulary Rule', content: brain.vocabularyRule, meta: 'Word choice guardrail' },
      { id: 'brain:persona', label: 'Persona', content: brain.persona, meta: 'Brain personality' },
    ]
    for (const b of brainNodes) {
      if (!b.content || !b.content.trim()) continue
      promptCount++
      useHub(hubs.brain)
      add({
        id: b.id, label: b.label, kind: 'leaf', group: 'brain',
        meta: b.meta, content: b.content, chars: b.content.length,
        editHref: '/dashboard/settings/brain',
      })
      link(hubs.brain.id, b.id)
    }
  } catch (e) {
    console.error('[kb-graph] brain prompts failed', e)
  }

  // ── 5. WhatsApp template bodies (Meta-approved) ──────────────────────────
  try {
    const mod = await import('@/configs/template-bodies')
    const bodies = mod.TEMPLATE_BODIES || {}
    for (const [name, body] of Object.entries(bodies)) {
      if (!body) continue
      templateCount++
      useHub(hubs.templates)
      const id = `tpl:${name}`
      add({
        id, label: name, kind: 'leaf', group: 'templates',
        meta: 'Approved WhatsApp template',
        content: body, chars: body.length,
        editHref: '/dashboard/settings/whatsapp-templates',
      })
      link(hubs.templates.id, id)
      if (hubUsed.has('chan:whatsapp')) link(id, 'chan:whatsapp')
    }
  } catch (e) {
    console.error('[kb-graph] templates failed', e)
  }

  return NextResponse.json({
    brand: { id: brandId, name: brandName },
    counts: { knowledge: knowledgeCount, prompts: promptCount, templates: templateCount },
    nodes,
    links,
  })
}
