'use client'

// Campaigns — overview first (stat cards + campaign table, the mock's
// structure in brand theme tokens), chat builder behind "New campaign".
// The builder: describe who you want to reach; the brain pulls the real
// audience, lines up approved WhatsApp templates or drafts fresh ones with
// {{variables}}, and the campaign saves as 'ready'. Sending stays separate.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  MdCampaign, MdSend, MdPersonOutline, MdCheckCircle, MdEditNote,
  MdDeleteOutline, MdOutlineSms, MdSearch, MdAdd, MdArrowBack,
  MdOutlineMarkEmailRead, MdOutlineVisibility, MdOutlineAdsClick,
  MdMoreVert, MdExpandMore, MdExpandLess,
} from 'react-icons/md'
import { brandConfig } from '@/configs'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Audience {
  description: string
  filters: Record<string, unknown>
  count: number
  with_phone: number
  sample: Array<{ name: string; phone?: string; stage?: string }>
}
interface Tpl {
  name: string
  body: string
  footer?: string | null
  buttons?: string[] | null
  status: 'approved' | 'draft'
  variables?: string[]
}
interface Reply {
  message: string
  audience: Audience | null
  templates: Tpl[]
  drafts: Tpl[]
  suggestedCampaignName: string | null
}
interface Msg {
  role: 'user' | 'assistant'
  content: string
  reply?: Reply
}
interface SavedCampaign {
  id: string
  name: string
  status: string
  audience: { description: string; count: number }
  template: { name: string; status: string } | null
  created_by?: string
  created_at: string
  updated_at?: string
}
interface SentSend {
  label: string
  audience?: string | null
  template: string | null
  sent: number
  delivered: number
  read: number
  clicked: number
}
interface SentCampaign {
  id: string
  name: string
  type: string
  description?: string | null
  recipients: number
  totals: { sent: number; delivered: number; read: number; clicked: number }
  sends: SentSend[]
  lastSent: string | null
}

const GREEN = '#22c55e', AMBER = '#f59e0b', PURPLE = '#8b5cf6', BLUE = '#3b82f6'

const SUGGESTIONS = [
  'Webinar registrants who never replied on WhatsApp',
  'Qualified pilot-training leads from the last 30 days',
  'Cabin Crew leads that came from Instagram',
  'Leads that went quiet for 14+ days — re-engagement',
]

type TabKey = 'live' | 'scheduled' | 'pending' | 'completed' | 'all'
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'live', label: 'Live campaigns' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
]

function relTime(iso?: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (!isFinite(diff)) return ''
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function sinceLabel(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `Since ${d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`
}

// ─── Shared chat pieces (builder) ────────────────────────────────────────────

function TplBody({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g)
  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((p, i) =>
        /^\{\{[^}]+\}\}$/.test(p)
          ? <span key={i} className="font-semibold px-1 rounded" style={{ background: `${PURPLE}22`, color: PURPLE }}>{p}</span>
          : <span key={i}>{p}</span>,
      )}
    </span>
  )
}

function TemplateCard({ t, selected, onSelect }: { t: Tpl; selected: boolean; onSelect: () => void }) {
  const tone = t.status === 'approved' ? GREEN : AMBER
  return (
    <button
      type="button"
      onClick={onSelect}
      className="text-left rounded-xl border p-3 w-full transition-all"
      style={{
        borderColor: selected ? 'var(--accent-primary)' : 'var(--border-primary)',
        boxShadow: selected ? '0 0 0 1px var(--accent-primary)' : 'none',
        background: 'var(--bg-secondary)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ background: `${tone}22`, color: tone }}>
          {t.status === 'approved' ? 'Approved' : 'Draft'}
        </span>
        <span className="text-[11px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{t.name}</span>
        {selected && <MdCheckCircle size={15} style={{ color: 'var(--accent-primary)', marginLeft: 'auto', flexShrink: 0 }} />}
      </div>
      <div className="rounded-lg px-3 py-2 text-[12.5px] leading-relaxed" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
        <TplBody text={t.body} />
        {t.footer && <div className="text-[10.5px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{t.footer}</div>}
      </div>
      {(t.buttons?.length || 0) > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {t.buttons!.map((b) => (
            <span key={b} className="text-[11px] px-2.5 py-1 rounded-md border" style={{ borderColor: 'var(--border-primary)', color: BLUE }}>{b}</span>
          ))}
        </div>
      )}
    </button>
  )
}

function AudienceCard({ a }: { a: Audience }) {
  const chips = Object.entries(a.filters || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: `color-mix(in srgb, ${BLUE} 35%, var(--border-primary))`, background: `color-mix(in srgb, ${BLUE} 6%, var(--bg-secondary))` }}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full shrink-0" style={{ background: `${BLUE}22`, color: BLUE }}><MdPersonOutline size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{a.with_phone ?? a.count}</span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>reachable on WhatsApp{a.count !== a.with_phone ? ` · ${a.count} matched total` : ''}</span>
          </div>
          <div className="text-[12px] truncate" style={{ color: 'var(--text-secondary)' }}>{a.description}</div>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex gap-1.5 mt-2.5 flex-wrap">
          {chips.map(([k, v]) => (
            <span key={k} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{k}: {String(v)}</span>
          ))}
        </div>
      )}
      {(a.sample?.length || 0) > 0 && (
        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          {a.sample.slice(0, 8).map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[11.5px] min-w-0">
              <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
              <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{s.phone}</span>
              {s.stage && <span className="shrink-0 text-[9.5px] px-1.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{s.stage}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  if (!brandConfig.features?.campaigns) {
    return (
      <div className="max-w-[560px] mx-auto text-center py-20">
        <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Campaigns isn't enabled for this brand</div>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Switch it on in the brand config (features.campaigns) to use the campaign builder.</div>
      </div>
    )
  }
  return <CampaignsHome />
}

function CampaignsHome() {
  const [view, setView] = useState<'list' | 'builder'>('list')
  const [saved, setSaved] = useState<SavedCampaign[]>([])
  const [sent, setSent] = useState<SentCampaign[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = () => {
    Promise.all([
      fetch('/api/dashboard/campaigns').then((r) => r.json()).catch(() => ({})),
      fetch('/api/dashboard/campaigns/stats').then((r) => r.json()).catch(() => ({})),
    ]).then(([a, b]) => {
      setSaved(Array.isArray(a.campaigns) ? a.campaigns : [])
      setSent(Array.isArray(b.campaigns) ? b.campaigns : [])
      setLoading(false)
    })
  }
  useEffect(loadAll, [])

  if (view === 'builder') {
    return (
      <CampaignsBuilder
        onBack={() => { setView('list'); loadAll() }}
      />
    )
  }
  return (
    <CampaignsList
      saved={saved}
      sent={sent}
      loading={loading}
      onNew={() => setView('builder')}
      onChanged={loadAll}
    />
  )
}

// ─── List view (the mock's overview) ─────────────────────────────────────────

function CampaignsList({ saved, sent, loading, onNew, onChanged }: {
  saved: SavedCampaign[]
  sent: SentCampaign[]
  loading: boolean
  onNew: () => void
  onChanged: () => void
}) {
  const [tab, setTab] = useState<TabKey>('live')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Cmd/Ctrl+K focuses search — the mock's ⌘K affordance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Aggregate stat cards across every SENT campaign — real numbers only.
  const agg = useMemo(() => {
    const t = { sent: 0, delivered: 0, read: 0, clicked: 0 }
    for (const c of sent) {
      t.sent += c.totals?.sent || 0
      t.delivered += c.totals?.delivered || 0
      t.read += c.totals?.read || 0
      t.clicked += c.totals?.clicked || 0
    }
    return t
  }, [sent])
  const rate = (n: number) => (agg.sent > 0 ? `${Math.round((n / agg.sent) * 100)}%` : '0%')

  // Merge sent (live) + saved (planned) into tab buckets.
  type Row = {
    kind: 'sent' | 'saved'
    id: string
    name: string
    badge: string
    target: string
    statusLabel: string
    statusColor: string
    since: string
    updated: string
    deliveredPct: number | null
    read: number | null
    clicked: number | null
    sentC?: SentCampaign
    savedC?: SavedCampaign
  }
  const rows: Row[] = useMemo(() => {
    const sentRows: Row[] = sent.map((c) => ({
      kind: 'sent',
      id: c.id,
      name: c.name,
      badge: 'WHATSAPP',
      target: c.description || `Target: ${c.recipients} people · ${c.type}`,
      statusLabel: 'Live',
      statusColor: GREEN,
      since: sinceLabel(c.lastSent),
      updated: relTime(c.lastSent),
      deliveredPct: c.totals?.sent > 0 ? Math.round((c.totals.delivered / c.totals.sent) * 100) : 0,
      read: c.totals?.read ?? 0,
      clicked: c.totals?.clicked ?? 0,
      sentC: c,
    }))
    const savedRows: Row[] = saved.map((c) => {
      const map: Record<string, { label: string; color: string }> = {
        ready: { label: 'Scheduled', color: AMBER },
        draft: { label: 'Pending', color: 'var(--text-muted)' as string },
        sent: { label: 'Completed', color: BLUE },
        archived: { label: 'Completed', color: 'var(--text-muted)' as string },
      }
      const st = map[c.status] || map.draft
      return {
        kind: 'saved' as const,
        id: c.id,
        name: c.name,
        badge: 'WHATSAPP',
        target: `Target: ${c.audience?.description || `${c.audience?.count ?? 0} people`}${c.created_by ? ` · Created by ${c.created_by.split('@')[0]}` : ''}`,
        statusLabel: st.label,
        statusColor: st.color,
        since: sinceLabel(c.created_at),
        updated: relTime(c.updated_at || c.created_at),
        deliveredPct: null,
        read: null,
        clicked: null,
        savedC: c,
      }
    })
    return [...sentRows, ...savedRows]
  }, [sent, saved])

  const counts: Record<TabKey, number> = useMemo(() => ({
    live: rows.filter((r) => r.statusLabel === 'Live').length,
    scheduled: rows.filter((r) => r.statusLabel === 'Scheduled').length,
    pending: rows.filter((r) => r.statusLabel === 'Pending').length,
    completed: rows.filter((r) => r.statusLabel === 'Completed').length,
    all: rows.length,
  }), [rows])

  const shown = rows.filter((r) => {
    if (tab === 'live' && r.statusLabel !== 'Live') return false
    if (tab === 'scheduled' && r.statusLabel !== 'Scheduled') return false
    if (tab === 'pending' && r.statusLabel !== 'Pending') return false
    if (tab === 'completed' && r.statusLabel !== 'Completed') return false
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const removeSaved = async (id: string) => {
    await fetch(`/api/dashboard/campaigns?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
    onChanged()
  }

  const STATS = [
    { label: 'Sent', value: agg.sent, sub: `across ${sent.length} campaign${sent.length !== 1 ? 's' : ''}`, color: PURPLE, icon: <MdSend size={18} /> },
    { label: 'Delivered', value: agg.delivered, sub: `${rate(agg.delivered)} delivery rate`, color: BLUE, icon: <MdOutlineMarkEmailRead size={18} /> },
    { label: 'Read', value: agg.read, sub: `${rate(agg.read)} read rate`, color: GREEN, icon: <MdOutlineVisibility size={18} /> },
    { label: 'Clicked', value: agg.clicked, sub: `${rate(agg.clicked)} click rate`, color: AMBER, icon: <MdOutlineAdsClick size={18} /> },
  ]

  const tabLabel = TABS.find((t) => t.key === tab)!.label

  return (
    <div className="max-w-[1100px] mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 mr-auto">
          <h1 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Campaigns</h1>
          <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-secondary)' }}>Create, manage and track all your outreach campaigns.</p>
        </div>
        <div className="relative">
          <MdSearch size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="text-[12.5px] rounded-lg border pl-8 pr-12 py-2 outline-none w-[220px]"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9.5px] font-bold px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-muted)' }}>⌘K</span>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 text-[12.5px] font-bold px-3.5 py-2 rounded-lg shrink-0"
          style={{ background: 'var(--accent-primary)', color: 'var(--bg-primary)' }}
        >
          <MdAdd size={17} /> New campaign
        </button>
      </div>

      {/* Status tabs */}
      <div className="inline-flex gap-1 mt-4 p-1 rounded-xl border" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
            style={{
              background: tab === t.key ? 'var(--accent-primary)' : 'transparent',
              color: tab === t.key ? 'var(--bg-primary)' : 'var(--text-secondary)',
            }}
          >
            {t.label}{counts[t.key] > 0 && tab !== t.key ? ` (${counts[t.key]})` : ''}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0" style={{ background: `${s.color}1c`, color: s.color }}>{s.icon}</span>
              <div className="min-w-0">
                <div className="text-2xl font-bold leading-tight tabular-nums" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
                <div className="text-[11.5px] font-semibold" style={{ color: s.color }}>{s.label}</div>
              </div>
            </div>
            <div className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Campaign table */}
      <div className="rounded-xl border mt-4 overflow-hidden" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        <div className="px-4 py-3 text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
          {tabLabel} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({shown.length})</span>
        </div>
        <div className="hidden md:grid px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ gridTemplateColumns: '2.4fr 1.1fr 1.6fr 0.7fr 40px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-primary)', borderBottom: '1px solid var(--border-primary)' }}>
          <span>Campaign</span>
          <span>Status</span>
          <span>Performance</span>
          <span>Updated</span>
          <span />
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No {tabLabel.toLowerCase()} yet</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Hit "New campaign" and describe who you want to reach.</div>
          </div>
        ) : (
          shown.map((r) => (
            <div key={`${r.kind}-${r.id}`} style={{ borderTop: '1px solid var(--border-primary)' }}>
              <div
                className="grid grid-cols-1 md:grid-cols-[2.4fr_1.1fr_1.6fr_0.7fr_40px] gap-y-2 items-center px-4 py-3 campaign-row"
                style={{ cursor: r.sentC ? 'pointer' : 'default' }}
                onClick={() => r.sentC && setExpanded(expanded === r.id ? null : r.id)}
              >
                {/* Campaign */}
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: `${r.kind === 'sent' ? PURPLE : BLUE}1c`, color: r.kind === 'sent' ? PURPLE : BLUE }}>
                    <MdCampaign size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{r.name}</span>
                      <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${GREEN}1c`, color: GREEN }}>{r.badge}</span>
                    </div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{r.target}</div>
                  </div>
                </div>
                {/* Status */}
                <div>
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: r.statusColor }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: r.statusColor }} />
                    {r.statusLabel}
                  </div>
                  <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{r.since}</div>
                </div>
                {/* Performance */}
                {r.deliveredPct !== null ? (
                  <div className="flex items-center gap-4">
                    <div className="min-w-[92px]">
                      <div className="text-[12.5px] font-bold" style={{ color: 'var(--text-primary)' }}>{r.deliveredPct}% <span className="font-normal text-[10.5px]" style={{ color: 'var(--text-muted)' }}>Delivered</span></div>
                      <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--bg-hover)', width: 92 }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.deliveredPct)}%`, background: 'var(--accent-primary)' }} />
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[14px] font-bold tabular-nums" style={{ color: GREEN }}>{r.read}</div>
                      <div className="text-[9.5px]" style={{ color: 'var(--text-muted)' }}>Read</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[14px] font-bold tabular-nums" style={{ color: AMBER }}>{r.clicked}</div>
                      <div className="text-[9.5px]" style={{ color: 'var(--text-muted)' }}>Clicked</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Not sent yet{r.savedC?.template ? ` · ${r.savedC.template.name}` : ' · no template'}</div>
                )}
                {/* Updated */}
                <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{r.updated}</div>
                {/* Actions */}
                <div className="flex justify-end">
                  {r.savedC ? (
                    <button onClick={(e) => { e.stopPropagation(); removeSaved(r.id) }} className="p-1.5 rounded-md" title="Delete" style={{ color: 'var(--text-muted)' }}>
                      <MdDeleteOutline size={16} />
                    </button>
                  ) : (
                    <span className="p-1.5" style={{ color: 'var(--text-muted)' }}>
                      {expanded === r.id ? <MdExpandLess size={16} /> : <MdMoreVert size={16} />}
                    </span>
                  )}
                </div>
              </div>
              {/* Sent-campaign expansion: per-send breakdown */}
              {r.sentC && expanded === r.id && (
                <div className="px-4 pb-3 space-y-1">
                  {r.sentC.sends.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] rounded-lg px-2.5 py-1.5" style={{ background: 'var(--bg-primary)' }}>
                      <span className="font-semibold shrink-0" style={{ color: 'var(--text-primary)' }}>{s.label}</span>
                      {s.audience && <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>→ {s.audience}</span>}
                      <span className="font-mono text-[9.5px] truncate hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{s.template}</span>
                      <span className="ml-auto tabular-nums shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {s.sent} sent · {s.delivered} delivered · {s.read} read · {s.clicked} clicked
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <style>{`.campaign-row:hover { background: var(--bg-hover); }`}</style>
    </div>
  )
}

// ─── Builder view (the chat) ─────────────────────────────────────────────────

function CampaignsBuilder({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTpl, setSelectedTpl] = useState<Tpl | null>(null)
  const [campaignName, setCampaignName] = useState('')
  const [saving, setSaving] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const latestReply = [...messages].reverse().find((m) => m.role === 'assistant' && m.reply)?.reply || null
  const audience = latestReply?.audience || null

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setError(null)
    setInput('')
    const next: Msg[] = [...messages, { role: 'user' as const, content: q }]
    setMessages(next)
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/campaigns/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Campaign brain failed')
      const reply: Reply = d.reply
      setMessages((cur) => [...cur, { role: 'assistant', content: reply.message, reply }])
      setSelectedTpl(null)
      if (reply.suggestedCampaignName) setCampaignName(reply.suggestedCampaignName)
    } catch (e: any) {
      setError(e.message)
      setMessages((cur) => cur.slice(0, -1))
      setInput(q)
    }
    setBusy(false)
  }

  const saveCampaign = async () => {
    if (!audience || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim() || `Campaign ${new Date().toLocaleDateString()}`,
          audience,
          template: selectedTpl,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Save failed')
      onBack()
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="max-w-[880px] mx-auto flex flex-col" style={{ height: 'calc(100vh - 96px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 pb-3">
        <button onClick={onBack} className="p-1.5 rounded-lg shrink-0" title="Back to campaigns" style={{ color: 'var(--text-secondary)' }}>
          <MdArrowBack size={19} />
        </button>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0" style={{ background: `${PURPLE}1c`, color: PURPLE }}>
          <MdCampaign size={22} />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>New campaign</h1>
          <p className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
            Say who you want to reach — {brandConfig.name} pulls the list and lines up the message.
          </p>
        </div>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${PURPLE}1c`, color: PURPLE }}><MdOutlineSms size={24} /></span>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Who do you want to reach?</div>
            <div className="text-xs max-w-[380px]" style={{ color: 'var(--text-secondary)' }}>
              Describe the audience in plain words. I'll pull the matching leads, show approved templates, or draft new ones with variables.
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-[560px] mt-1">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-[11.5px] px-3 py-1.5 rounded-full border transition-colors hover:opacity-80" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'space-y-2.5'}>
            {m.role === 'user' ? (
              <div className="rounded-2xl rounded-br-md px-3.5 py-2 max-w-[75%] text-[13px]" style={{ background: `color-mix(in srgb, var(--accent-primary) 16%, var(--bg-primary))`, color: 'var(--text-primary)' }}>
                {m.content}
              </div>
            ) : (
              <>
                <div className="rounded-2xl rounded-bl-md px-3.5 py-2 max-w-[85%] text-[13px] leading-relaxed" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}>
                  {m.content}
                </div>
                {m.reply?.audience && <AudienceCard a={m.reply.audience} />}
                {(m.reply?.templates?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Approved templates — pick one</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {m.reply!.templates.map((t) => (
                        <TemplateCard key={t.name} t={{ ...t, status: 'approved' }} selected={selectedTpl?.name === t.name} onSelect={() => setSelectedTpl({ ...t, status: 'approved' })} />
                      ))}
                    </div>
                  </div>
                )}
                {(m.reply?.drafts?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <MdEditNote size={13} /> Fresh drafts — need Meta approval before sending
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {m.reply!.drafts.map((t) => (
                        <TemplateCard key={t.name} t={{ ...t, status: 'draft' }} selected={selectedTpl?.name === t.name} onSelect={() => setSelectedTpl({ ...t, status: 'draft' })} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: PURPLE }} />
            Pulling the audience…
          </div>
        )}
      </div>

      {/* Save bar — appears once there's an audience */}
      {audience && (
        <div className="flex items-center gap-2 mt-2.5 rounded-xl border px-3 py-2.5 flex-wrap" style={{ borderColor: `color-mix(in srgb, ${GREEN} 35%, var(--border-primary))`, background: `color-mix(in srgb, ${GREEN} 5%, var(--bg-secondary))` }}>
          <span className="text-[11.5px] font-semibold shrink-0" style={{ color: 'var(--text-primary)' }}>
            {audience.with_phone ?? audience.count} people{selectedTpl ? ` · ${selectedTpl.name}` : ' · no template picked'}
          </span>
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="Campaign name…"
            className="flex-1 min-w-[160px] text-[12px] px-2.5 py-1.5 rounded-md border outline-none"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={saveCampaign}
            disabled={saving}
            className="text-[12px] font-bold px-3.5 py-1.5 rounded-md shrink-0"
            style={{ background: GREEN, color: '#08130b', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : selectedTpl ? 'Save campaign' : 'Save as draft'}
          </button>
        </div>
      )}

      {error && <div className="text-xs mt-2" style={{ color: '#ef4444' }}>{error}</div>}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input) }}
        className="flex items-center gap-2 mt-2.5 rounded-xl border px-3 py-2"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Try: "Qualified pilot leads from the last 30 days"'
          disabled={busy}
          className="flex-1 text-[13px] bg-transparent outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
        <button type="submit" disabled={busy || !input.trim()} className="p-1.5 rounded-lg shrink-0" style={{ color: input.trim() && !busy ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
          <MdSend size={18} />
        </button>
      </form>
    </div>
  )
}
