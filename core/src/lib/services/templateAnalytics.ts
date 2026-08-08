import { getWhatsAppCreds } from '@/lib/services/whatsappCreds'

/**
 * Per-template delivered and read, from Meta.
 *
 * Our own receipts only exist for sends we logged with their wa_message_id,
 * and the first campaign predates that - 154 messages with no way to match a
 * receipt back. Meta keeps the numbers anyway, per template per day, so the
 * history is recoverable from the authoritative source rather than lost to
 * our bookkeeping.
 *
 * It is also the better source going forward: these are Meta's own counts, so
 * they include receipts that arrived while nothing of ours was listening.
 */

const GRAPH = 'https://graph.facebook.com/v21.0'

export interface TemplateDay {
  day: string        // YYYY-MM-DD, IST
  sent: number
  delivered: number
  read: number
}

export interface TemplateStats {
  templateId: string
  name?: string
  total: { sent: number; delivered: number; read: number }
  days: TemplateDay[]
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const istDay = (epochSeconds: number) =>
  new Date(epochSeconds * 1000 + IST_OFFSET_MS).toISOString().slice(0, 10)

/** Resolve template NAMES to the ids Meta's analytics wants. */
export async function resolveTemplateIds(
  names: string[],
): Promise<Map<string, { id: string; name: string }>> {
  const out = new Map<string, { id: string; name: string }>()
  if (!names.length) return out
  const c = await getWhatsAppCreds()
  if (!c?.accessToken) return out

  let wabaId = c.wabaId
  if (!wabaId) {
    try {
      const r = await fetch(`${GRAPH}/${c.phoneNumberId}?fields=whatsapp_business_account`, {
        headers: { Authorization: `Bearer ${c.accessToken}` },
        signal: AbortSignal.timeout(8000),
      })
      wabaId = (await r.json())?.whatsapp_business_account?.id || null
    } catch { return out }
  }
  if (!wabaId) return out

  try {
    const r = await fetch(`${GRAPH}/${wabaId}/message_templates?limit=250&fields=id,name`, {
      headers: { Authorization: `Bearer ${c.accessToken}` },
      signal: AbortSignal.timeout(12000),
    })
    const d = await r.json()
    const wanted = new Set(names.map((n) => n.toLowerCase()))
    for (const t of d?.data || []) {
      if (wanted.has(String(t.name).toLowerCase())) out.set(String(t.name), { id: String(t.id), name: String(t.name) })
    }
  } catch { /* fall through - callers degrade to their own counts */ }
  return out
}

/**
 * Daily sent/delivered/read for a set of template ids.
 *
 * Meta reports on UTC day boundaries; days are relabelled to IST so a report
 * about "yesterday" lines up with the working day everything else uses.
 */
export async function fetchTemplateAnalytics(
  templateIds: string[],
  since: Date,
  until: Date = new Date(),
): Promise<Map<string, TemplateStats>> {
  const out = new Map<string, TemplateStats>()
  if (!templateIds.length) return out
  const c = await getWhatsAppCreds()
  if (!c?.accessToken) return out

  let wabaId = c.wabaId
  if (!wabaId) {
    try {
      const r = await fetch(`${GRAPH}/${c.phoneNumberId}?fields=whatsapp_business_account`, {
        headers: { Authorization: `Bearer ${c.accessToken}` },
        signal: AbortSignal.timeout(8000),
      })
      wabaId = (await r.json())?.whatsapp_business_account?.id || null
    } catch { return out }
  }
  if (!wabaId) return out

  const start = Math.floor(since.getTime() / 1000)
  const end = Math.floor(until.getTime() / 1000)
  const url =
    `${GRAPH}/${wabaId}/template_analytics` +
    `?start=${start}&end=${end}&granularity=DAILY` +
    `&metric_types=${encodeURIComponent('["SENT","DELIVERED","READ"]')}` +
    `&template_ids=${encodeURIComponent(JSON.stringify(templateIds))}`

  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${c.accessToken}` },
      signal: AbortSignal.timeout(15000),
    })
    const d = await r.json()
    for (const block of d?.data || []) {
      for (const p of block?.data_points || []) {
        const id = String(p.template_id)
        const stats = out.get(id) || { templateId: id, total: { sent: 0, delivered: 0, read: 0 }, days: [] }
        // Meta emits a row per day including empty ones; those are noise in a
        // report, so only days with something in them are kept.
        if (p.sent || p.delivered || p.read) {
          stats.days.push({
            day: istDay(Number(p.start)),
            sent: Number(p.sent || 0),
            delivered: Number(p.delivered || 0),
            read: Number(p.read || 0),
          })
          stats.total.sent += Number(p.sent || 0)
          stats.total.delivered += Number(p.delivered || 0)
          stats.total.read += Number(p.read || 0)
        }
        out.set(id, stats)
      }
    }
  } catch (e: any) {
    console.error('[templateAnalytics] failed:', e?.message || e)
  }
  return out
}
