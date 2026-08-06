'use client'

import { useEffect, useState } from 'react'
import { createClient } from '../lib/supabase/client'
import { getCurrentBrandId } from '@/configs'

interface Lead {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  first_touchpoint: string | null
  last_touchpoint: string | null
  brand: string | null
  timestamp: string
  last_interaction_at: string | null
  booking_date: string | null
  booking_time: string | null
  status: string | null
  metadata?: any
  unified_context?: any
  lead_score?: number | null
  lead_stage?: string | null
  sub_stage?: string | null
  stage_override?: boolean | null
  last_scored_at?: string | null
  is_active_chat?: boolean | null
  // POP-only constituent columns (present on POP's all_leads only; selected
  // and mapped solely when the active brand is pop, so other brands' DBs are
  // never queried for columns they don't have).
  constituency?: string | null
  district?: string | null
  booth?: string | null
  language?: string | null
  lean?: string | null
  magnet?: string | null
  grievance_category?: string | null
  grievance_text?: string | null
  salience?: number | null
  action_intent?: string | null
  loop_status?: string | null
  engagement_type?: string | null
  intensity?: number | null
}

// Extra columns that exist ONLY on POP's all_leads (migration 022). Appended to
// the select string for the pop brand only - keeps the shared query intact for
// every other brand whose schema lacks these columns.
const POP_COLUMNS =
  ', constituency, district, booth, language, lean, magnet, grievance_category, grievance_text, salience, action_intent, loop_status, engagement_type, intensity'

export function useRealtimeLeads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const brand = getCurrentBrandId()
    const isPop = brand === 'pop'

    // booking_date / booking_time do NOT exist on every brand's all_leads -
    // windchasers has neither. Selecting a missing column makes PostgREST
    // return "column ... does not exist", whose message contains "does not
    // exist", which used to trip the table-missing fallback below and silently
    // send the whole dashboard to `unified_leads`. That view has no owner_id,
    // no created_at and no updated_at, so ownership vanished from the leads
    // list and incremental sync was impossible. Ask only for what exists.
    // Same story for `status`: present on other brands' all_leads, absent on
    // windchasers. It is only echoed into the CSV export - statusFilter runs
    // off lead_stage - so omitting it costs nothing here.
    const hasLegacyCols = brand !== 'windchasers'
    // needs_human_followup exists on some brands' all_leads and not others
    // (Lokazen has never had it). Selecting it there returns 42703 "column does
    // not exist", which failed the WHOLE query - the leads page rendered only
    // "Error: column all_leads.needs_human_followup does not exist" and the
    // Activity feed stayed empty. Keep it OPTIONAL: try with it, and if the
    // column is missing, retry once without it instead of breaking the page.
    const WISHLIST =
      'id, customer_name, email, phone, created_at, updated_at, last_interaction_at, ' +
      'lead_score, lead_stage, sub_stage, stage_override, unified_context, ' +
      'first_touchpoint, last_touchpoint, brand, metadata, needs_human_followup, owner_id' +
      (hasLegacyCols ? ', status, booking_date, booking_time' : '') +
      (isPop ? POP_COLUMNS : '')

    // The five brand DBs have drifted apart: owner_id is Windchasers-only
    // (migration 036), needs_human_followup reached Lokazen only in 006,
    // windchasers lacks status/booking_*, and so on. Hand-maintaining "which
    // brand has which column" is what broke this page twice - Lokazen died on
    // needs_human_followup, then BCON died on owner_id, each showing nothing but
    // a bare "column ... does not exist" where the table should be.
    //
    // So stop guessing. Ask for everything, and when Postgres says a column is
    // missing (42703) it also NAMES it - drop that one and retry. Any brand
    // loads with whatever subset it actually has, and the next divergence is
    // handled without a code change. mapLead already defaults every field, so a
    // dropped column reads as null rather than breaking a row.
    let columns = WISHLIST.split(',').map((c) => c.trim()).filter(Boolean)
    const selectList = () => columns.join(', ')

    // Columns we cannot run without: `id` is the paging cursor, and the other
    // two drive incremental sync and the display sort. If one of THESE is
    // missing the brand is genuinely misconfigured and the error should show.
    const ESSENTIAL = new Set(['id', 'updated_at', 'last_interaction_at'])

    /** Name of the column in a Postgres "undefined column" (42703) error, if any. */
    const missingColumn = (err: any): string | null => {
      if (!err) return null
      const message = String(err?.message || '')
      if (err?.code !== '42703' && !/column .* does not exist/i.test(message)) return null
      // e.g. `column all_leads.owner_id does not exist`
      const m = /column\s+(?:[\w".]+\.)?"?([a-zA-Z0-9_]+)"?\s+does not exist/i.exec(message)
      return m?.[1] ?? null
    }

    /**
     * Run a query, shedding optional columns this brand's table lacks.
     * `any` in/out on purpose: callers hand back a PostgrestFilterBuilder, which
     * is thenable rather than a real Promise, so a generic signature does not
     * unify (same reason the rest of this file's Supabase reads use `any`).
     */
    const withColumnFallback = async (run: () => any): Promise<any> => {
      // Bounded: one pass per droppable column, never an unbounded retry loop.
      for (let attempt = 0; attempt < 8; attempt++) {
        const res: any = await run()
        const col = missingColumn(res?.error)
        if (!col || ESSENTIAL.has(col) || !columns.includes(col)) return res
        console.warn(`[useRealtimeLeads] all_leads has no "${col}" on this brand - retrying without it`)
        columns = columns.filter((c) => c !== col)
      }
      return run()
    }

    const mapLead = (lead: any): Lead => ({
      id: lead.id,
      name: lead.customer_name || lead.name || null,
      email: lead.email || null,
      phone: lead.phone || null,
      source: lead.first_touchpoint || lead.last_touchpoint || lead.source || 'web',
      first_touchpoint: lead.first_touchpoint || null,
      last_touchpoint: lead.last_touchpoint || null,
      brand: lead.brand || null,
      timestamp: lead.created_at || lead.timestamp || new Date().toISOString(),
      last_interaction_at: lead.last_interaction_at || null,
      booking_date: lead.booking_date || null,
      booking_time: lead.booking_time || null,
      status: lead.status || null,
      metadata: lead.metadata || null,
      unified_context: lead.unified_context || null,
      lead_score: lead.lead_score ?? null,
      lead_stage: lead.lead_stage || null,
      sub_stage: lead.sub_stage || null,
      stage_override: lead.stage_override ?? null,
      last_scored_at: lead.last_scored_at || null,
      is_active_chat: lead.is_active_chat ?? null,
      ...(isPop ? {
        constituency: lead.constituency ?? null,
        district: lead.district ?? null,
        booth: lead.booth ?? null,
        language: lead.language ?? null,
        lean: lead.lean ?? null,
        magnet: lead.magnet ?? null,
        grievance_category: lead.grievance_category ?? null,
        grievance_text: lead.grievance_text ?? null,
        salience: lead.salience ?? null,
        action_intent: lead.action_intent ?? null,
        loop_status: lead.loop_status ?? null,
        engagement_type: lead.engagement_type ?? null,
        intensity: lead.intensity ?? null,
      } : {}),
    } as Lead)

    let cancelled = false
    // High-water mark for the incremental poll. Set from the first full load.
    let lastSync: string | null = null

    /**
     * Full load, once, on mount. Keyset paged on id so it is O(N) - offset
     * paging re-walks every skipped row, which is why this was capped at 1000
     * and why webinar registrations older than the cutoff were invisible.
     *
     * Renders progressively: each page is appended as it lands, so the table
     * paints on the first batch instead of waiting for the whole table.
     */
    const loadAll = async () => {
      const PAGE = 1000
      let cursor: string | null = null
      const acc: Lead[] = []
      for (let i = 0; i < 60; i++) {
        const runPage = async () => {
          let q = supabase.from('all_leads').select(selectList()).order('id', { ascending: true }).limit(PAGE)
          if (cursor) q = q.gt('id', cursor)
          return q
        }
        const { data, error: pageErr } = await withColumnFallback(runPage)
        if (pageErr) {
          if (acc.length === 0) { setError(pageErr.message || 'Failed to fetch leads'); setLoading(false) }
          return
        }
        if (cancelled) return
        if (!data || data.length === 0) break
        acc.push(...data.map(mapLead))
        cursor = (data[data.length - 1] as any)?.id ?? null
        // Newest first for display; the query order is an implementation detail.
        setLeads([...acc].sort((a, b) =>
          String(b.last_interaction_at || b.timestamp).localeCompare(String(a.last_interaction_at || a.timestamp))))
        setLoading(false)
        if (data.length < PAGE || !cursor) break
      }
      lastSync = new Date().toISOString()
      setLoading(false)
    }

    /**
     * Incremental sync. Pulls only rows changed since the last pass and merges
     * them in by id.
     *
     * The old poll refetched everything and replaced the array wholesale every
     * 30s, which rebuilt every row underneath whoever was using the page. Now
     * an untouched row keeps its identity, so the table stops reshuffling while
     * someone is reading or typing.
     */
    const syncChanges = async () => {
      if (!lastSync) return
      const since = lastSync
      lastSync = new Date().toISOString()
      const { data, error: syncErr } = await withColumnFallback(() =>
        supabase
          .from('all_leads')
          .select(selectList())
          .gte('updated_at', since)
          .limit(500)
      )
      if (syncErr || !data || data.length === 0 || cancelled) return
      setLeads((prev) => {
        const byId = new Map(prev.map((l) => [l.id, l]))
        for (const row of data) byId.set((row as any).id, mapLead(row))
        return [...byId.values()].sort((a, b) =>
          String(b.last_interaction_at || b.timestamp).localeCompare(String(a.last_interaction_at || a.timestamp)))
      })
    }

    loadAll()
    // Realtime postgres_changes on all_leads caused 19s lock contention that
    // made the whole DB unresponsive, so this stays a poll - just a cheap one.
    const interval = setInterval(syncChanges, 30_000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return { leads, loading, error }
}
