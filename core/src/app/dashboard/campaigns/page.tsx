'use client'

// Campaigns - the AI campaign workspace (mock-faithful structure, brand theme
// colors): chat on the left, Templates / Audience summary / Campaign setup /
// Personalization rail on the right. "Previous Campaigns" opens the overview
// list. The chat pulls real audiences and templates; Review & Schedule saves
// the campaign as 'ready' with a send time - actual sending stays separate.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  MdCampaign, MdSend, MdPersonOutline, MdEdit,
  MdDeleteOutline, MdSearch, MdAutoAwesome, MdReplay,
  MdOutlineMarkEmailRead, MdOutlineVisibility, MdOutlineAdsClick,
  MdMoreVert, MdExpandLess, MdAttachFile, MdMicNone, MdWhatsapp,
  MdChevronRight, MdOutlineCalendarToday, MdOutlineArticle, MdAdd,
  MdHistory, MdCheckCircle, MdGroups, MdDoneAll,
  MdExpandMore, MdEventNote,
} from 'react-icons/md'
import { brandConfig } from '@/configs'
import { useFeatureFlags } from '@/lib/useFeatureFlags'

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
  kind?: string
  variables?: string[]
}
interface Reply {
  message: string
  audience: Audience | null
  templates: Tpl[]
  drafts: Tpl[]
  suggestedCampaignName: string | null
  goal?: string | null
}
interface Msg {
  role: 'user' | 'assistant'
  content: string
  at: number
  reply?: Reply
}
interface SavedCampaign {
  id: string
  name: string
  status: string
  audience: { description: string; count: number }
  template: { name: string; status: string } | null
  scheduled_at?: string | null
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
  webinar?: string | null
  description?: string | null
  recipients: number
  totals: { sent: number; delivered: number; read: number; clicked: number }
  sends: SentSend[]
  lastSent: string | null
}

const GREEN = '#22c55e', AMBER = '#f59e0b', PURPLE = '#8b5cf6', BLUE = '#3b82f6', RED = '#ef4444'

// The agent is PROXe everywhere - the product's assistant, brand-neutral.
const ASSISTANT = 'PROXe'

// Smart-suggestion chips. Neutral defaults ship to every brand; a brand can
// override with its own audience language via config.campaigns.suggestions -
// shared core never hardcodes one brand's taxonomy (no-bleed rule).
const DEFAULT_SUGGESTIONS = [
  'Reach people who replied once but never connected',
  'Re-engage leads who went quiet for 14+ days',
  'High-intent leads who never converted',
  'Follow up with everyone from the last 7 days',
  'Win back leads marked lost this month',
]
const SUGGESTION_ICONS = [<MdReplay size={15} key="r" />, <MdHistory size={15} key="h" />, <MdGroups size={15} key="g" />, <MdOutlineMarkEmailRead size={15} key="m" />, <MdPersonOutline size={15} key="p" />]
const SUGGESTIONS = (brandConfig.campaigns?.suggestions?.length ? brandConfig.campaigns.suggestions : DEFAULT_SUGGESTIONS)
  .slice(0, 6)
  .map((text, i) => ({ icon: SUGGESTION_ICONS[i % SUGGESTION_ICONS.length], text }))

// Default personalization variables when no template is selected. Brand-config
// driven; neutral fallback (name only) so no aviation "course" bleeds elsewhere.
const DEFAULT_VARIABLES = brandConfig.campaigns?.variables?.length
  ? brandConfig.campaigns.variables
  : ['customer_name']

const PLACEHOLDERS = [
  'Describe who you want to reach…',
  'Re-engage leads who went quiet…',
  'Send reminder to webinar registrants…',
]

const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function prettyTplName(name: string): string {
  return name
    .replace(new RegExp(`^${brandConfig.brand}_`, 'i'), '')
    .replace(/_v\d+$/i, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function varsOf(t: Tpl | null): string[] {
  if (!t) return []
  const found = new Set<string>(t.variables || [])
  for (const m of (t.body || '').matchAll(/\{\{([^}]+)\}\}/g)) found.add(m[1].trim())
  return [...found]
}

// ─── Small pieces ────────────────────────────────────────────────────────────

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

// The mock's "Here's what I've put together" summary card.
function PlanCard({ a, goal }: { a: Audience; goal?: string | null }) {
  const rows = [
    {
      icon: <MdGroups size={16} />, color: BLUE,
      title: 'Audience detected', sub: a.description,
      chip: `${a.count.toLocaleString()} leads`, chipColor: BLUE,
    },
    {
      icon: <MdWhatsapp size={16} />, color: GREEN,
      title: 'Channel', sub: 'WhatsApp',
      chip: `${(a.with_phone ?? a.count).toLocaleString()} reachable`, chipColor: GREEN,
    },
    ...(goal ? [{
      icon: <MdAutoAwesome size={16} />, color: AMBER,
      title: 'Goal', sub: goal,
      chip: 'Recommended', chipColor: AMBER,
    }] : []),
  ]
  return (
    <div className="rounded-xl border p-3 space-y-2.5" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}>
      {rows.map((r) => (
        <div key={r.title} className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0" style={{ background: `${r.color}1c`, color: r.color }}>{r.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{r.title}</div>
            <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{r.sub}</div>
          </div>
          <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-lg shrink-0" style={{ background: `${r.chipColor}18`, color: r.chipColor }}>{r.chip}</span>
        </div>
      ))}
    </div>
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
        background: 'var(--bg-primary)',
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

// ─── Schedule picker - a calendar + sorted hour/minute/AM-PM columns ─────────
// Value is a naive "YYYY-MM-DDTHH:mm" string (same shape as datetime-local) so
// the rest of the page is unchanged.

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad2 = (n: number) => String(n).padStart(2, '0')

function parseValue(v: string): { d: Date | null } {
  if (!v) return { d: null }
  const d = new Date(v)
  return { d: isNaN(d.getTime()) ? null : d }
}

function fmtValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function fmtDisplay(v: string): string {
  const { d } = parseValue(v)
  if (!d) return ''
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

// A vertical, sorted, scrollable column - the "sorted picker" columns.
function WheelColumn({ items, value, onPick, width }: {
  items: Array<{ label: string; value: number }>; value: number; onPick: (v: number) => void; width: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector('[data-active="true"]') as HTMLElement | null
    el?.scrollIntoView({ block: 'center' })
  }, [])
  return (
    <div ref={ref} className="overflow-y-auto py-1" style={{ width, maxHeight: 176, scrollbarWidth: 'thin' }}>
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            data-active={active}
            onClick={() => onPick(it.value)}
            className="w-full text-center text-[13px] font-semibold rounded-md py-1.5 my-0.5 transition-colors"
            style={{
              background: active ? 'var(--accent-primary)' : 'transparent',
              color: active ? 'var(--bg-primary)' : 'var(--text-secondary)',
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

function SchedulePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = parseValue(value).d
  // Working state - defaults to the next round hour from now (stamped when opened).
  const [draft, setDraft] = useState<Date | null>(selected)
  const [viewYM, setViewYM] = useState<{ y: number; m: number }>(() => {
    const base = selected || new Date()
    return { y: base.getFullYear(), m: base.getMonth() }
  })

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const openPicker = () => {
    const base = selected || (() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d })()
    setDraft(base)
    setViewYM({ y: base.getFullYear(), m: base.getMonth() })
    setOpen(true)
  }

  const d = draft || new Date()
  const hour12 = ((d.getHours() + 11) % 12) + 1
  const isPM = d.getHours() >= 12

  const setPart = (fn: (nd: Date) => void) => {
    const nd = new Date(draft || new Date())
    fn(nd)
    setDraft(nd)
  }

  // Calendar grid for viewYM
  const first = new Date(viewYM.y, viewYM.m, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(viewYM.y, viewYM.m + 1, 0).getDate()
  const cells: Array<number | null> = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const today = new Date()
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  const hours = Array.from({ length: 12 }, (_, i) => ({ label: pad2(i + 1), value: i + 1 }))
  const minutes = Array.from({ length: 12 }, (_, i) => ({ label: pad2(i * 5), value: i * 5 }))

  return (
    <div ref={wrapRef} className="ml-auto relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="flex items-center gap-1.5 text-[11.5px] font-semibold rounded-md border px-2 py-1"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)', color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}
      >
        <MdOutlineCalendarToday size={13} />
        {value ? fmtDisplay(value) : 'Pick a time'}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-1.5 rounded-xl border shadow-xl p-3 flex gap-3"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)', width: 360 }}
        >
          {/* Calendar */}
          <div style={{ width: 210 }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12.5px] font-bold" style={{ color: 'var(--text-primary)' }}>{MONTHS[viewYM.m]} {viewYM.y}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => setViewYM(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })} className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }}><MdChevronLeftIcon /></button>
                <button type="button" onClick={() => setViewYM(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })} className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }}><MdChevronRightIcon /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {DAY_LABELS.map((dl) => (
                <div key={dl} className="text-center text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>{dl}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, i) => {
                if (day === null) return <div key={i} />
                const cellDate = new Date(viewYM.y, viewYM.m, day)
                const isToday = sameDay(cellDate, today)
                const isSel = draft && sameDay(cellDate, draft)
                const past = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={past}
                    onClick={() => setPart((nd) => { nd.setFullYear(viewYM.y, viewYM.m, day) })}
                    className="text-center text-[11.5px] rounded-md py-1 transition-colors disabled:opacity-30"
                    style={{
                      background: isSel ? 'var(--accent-primary)' : 'transparent',
                      color: isSel ? 'var(--bg-primary)' : isToday ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontWeight: isSel || isToday ? 700 : 500,
                      cursor: past ? 'default' : 'pointer',
                    }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between mt-2 text-[11px] font-semibold">
              <button type="button" onClick={() => { setDraft(null); onChange(''); setOpen(false) }} style={{ color: 'var(--text-muted)' }}>Clear</button>
              <button type="button" onClick={() => { const n = new Date(); n.setMinutes(0, 0, 0); n.setHours(n.getHours() + 1); setDraft(n); setViewYM({ y: n.getFullYear(), m: n.getMonth() }) }} style={{ color: 'var(--accent-primary)' }}>Soon</button>
            </div>
          </div>

          {/* Sorted time columns */}
          <div className="flex gap-1 border-l pl-2" style={{ borderColor: 'var(--border-primary)' }}>
            <WheelColumn items={hours} value={hour12} width={40} onPick={(h) => setPart((nd) => nd.setHours((isPM ? 12 : 0) + (h % 12)))} />
            <WheelColumn items={minutes} value={d.getMinutes() - (d.getMinutes() % 5)} width={40} onPick={(mn) => setPart((nd) => nd.setMinutes(mn))} />
            <WheelColumn
              items={[{ label: 'AM', value: 0 }, { label: 'PM', value: 1 }]}
              value={isPM ? 1 : 0}
              width={38}
              onPick={(mer) => setPart((nd) => { const h = nd.getHours() % 12; nd.setHours(mer === 1 ? h + 12 : h) })}
            />
          </div>

          {/* Confirm */}
          <button
            type="button"
            onClick={() => { if (draft) onChange(fmtValue(draft)); setOpen(false) }}
            className="absolute bottom-2 right-3 text-[11.5px] font-bold px-2.5 py-1 rounded-md"
            style={{ background: 'var(--accent-primary)', color: 'var(--bg-primary)' }}
          >
            Set
          </button>
        </div>
      )}
    </div>
  )
}

// Local chevron glyphs so the picker doesn't pull extra icon imports.
function MdChevronLeftIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" /></svg> }
function MdChevronRightIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.6 7.4 10 6l6 6-6 6-1.4-1.4L13.2 12z" /></svg> }

// PROXe agent mark - the "cycle": an orbit ring with an accent node, in the
// brand accent. Used as the assistant avatar (the agent is PROXe, not a robot).
function ProxeMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, background: `color-mix(in srgb, var(--accent-primary) 16%, transparent)` }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8.5" stroke="var(--accent-primary)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="34 12" />
        <circle cx="12" cy="3.5" r="2.4" fill="var(--accent-primary)" />
        <circle cx="12" cy="12" r="2.6" fill="var(--accent-primary)" />
      </svg>
    </span>
  )
}

// Two-segment reach donut - stroke-dasharray over pathLength (never degenerates).
function ReachDonut({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <svg width={76} height={76} viewBox="0 0 42 42" className="-rotate-90 shrink-0" aria-hidden>
      <circle cx="21" cy="21" r="16" fill="none" stroke="var(--bg-hover)" strokeWidth="6" />
      {p > 0 && (
        <circle cx="21" cy="21" r="16" fill="none" stroke="var(--accent-primary)" strokeWidth="6" pathLength={100} strokeDasharray={`${p} ${100 - p}`} strokeLinecap="round" />
      )}
    </svg>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  // Runtime flags (config default + Settings → Features override) so the
  // toggle takes effect without a redeploy.
  const flags = useFeatureFlags()
  if (!flags.campaigns) {
    return (
      <div className="max-w-[560px] mx-auto text-center py-20">
        <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Campaigns isn't enabled for this brand</div>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Switch it on in <a href="/dashboard/settings/features" style={{ color: 'var(--accent-primary)' }}>Configure → Features</a> to use the campaign workspace.
        </div>
      </div>
    )
  }
  return <CampaignsRoot />
}

function CampaignsRoot() {
  const [view, setView] = useState<'workspace' | 'previous'>('workspace')
  const [wsKey, setWsKey] = useState(0) // remount workspace on "Create Campaign"

  return (
    <div className="max-w-[1240px] mx-auto flex flex-col" style={{ height: 'calc(100vh - 84px)' }}>
      {/* ── Page header ── */}
      <div className="flex items-center gap-3 flex-wrap pb-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl shrink-0" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', color: 'var(--accent-primary)' }}>
          <MdCampaign size={22} />
        </span>
        <div className="min-w-0 mr-auto">
          <h1 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Campaigns</h1>
          <p className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>AI-powered campaigns that reach the right people, at the right time.</p>
        </div>
        <button
          onClick={() => { setView('workspace'); setWsKey((k) => k + 1) }}
          className="flex items-center gap-1.5 text-[12.5px] font-bold px-3.5 py-2 rounded-xl border"
          style={{
            background: view === 'workspace' ? 'var(--bg-secondary)' : 'transparent',
            borderColor: view === 'workspace' ? 'var(--accent-primary)' : 'var(--border-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <MdAutoAwesome size={15} style={{ color: 'var(--accent-primary)' }} /> Create Campaign
        </button>
        <button
          onClick={() => setView('previous')}
          className="flex items-center gap-1.5 text-[12.5px] font-bold px-3.5 py-2 rounded-xl border"
          style={{
            background: view === 'previous' ? 'var(--bg-secondary)' : 'transparent',
            borderColor: view === 'previous' ? 'var(--accent-primary)' : 'var(--border-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <MdHistory size={15} style={{ color: 'var(--accent-primary)' }} /> Previous Campaigns <MdChevronRight size={15} />
        </button>
      </div>

      {view === 'workspace'
        ? <Workspace key={wsKey} onSaved={() => setView('previous')} />
        : <PreviousCampaigns />}
    </div>
  )
}

// ═══ WORKSPACE - chat left, rail right ═══════════════════════════════════════

function Workspace({ onSaved }: { onSaved: () => void }) {
  // Chat
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phIdx, setPhIdx] = useState(0)
  const [introAt] = useState(Date.now())
  const scrollRef = useRef<HTMLDivElement>(null)

  // Plan state
  const [campaignName, setCampaignName] = useState('New Campaign')
  const [editingName, setEditingName] = useState(false)
  const [selectedTpl, setSelectedTpl] = useState<Tpl | null>(null)
  const [sendTime, setSendTime] = useState('')
  const [customVars, setCustomVars] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  // Templates rail
  const [templates, setTemplates] = useState<Tpl[]>([])
  const [tplFilter, setTplFilter] = useState<'approved' | 'draft' | 'reminder' | 'nudge' | 'promo'>('approved')

  useEffect(() => {
    fetch('/api/dashboard/campaigns/templates')
      .then((r) => r.json())
      .then((d) => setTemplates(Array.isArray(d.templates) ? d.templates : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const id = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 4000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const latestReply = [...messages].reverse().find((m) => m.role === 'assistant' && m.reply)?.reply || null
  const audience = latestReply?.audience || null

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setError(null)
    setSavedMsg(null)
    setInput('')
    const next: Msg[] = [...messages, { role: 'user' as const, content: q, at: Date.now() }]
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
      setMessages((cur) => [...cur, { role: 'assistant', content: reply.message, at: Date.now(), reply }])
      if (reply.suggestedCampaignName) setCampaignName(reply.suggestedCampaignName)
      const firstTpl = reply.templates?.[0] || reply.drafts?.[0]
      if (firstTpl) setSelectedTpl((cur) => cur || { ...firstTpl, status: reply.templates?.[0] ? 'approved' : 'draft' })
    } catch (e: any) {
      setError(e.message)
      setMessages((cur) => cur.slice(0, -1))
      setInput(q)
    }
    setBusy(false)
  }

  const schedule = async () => {
    if (!audience || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim() || 'New Campaign',
          audience,
          template: selectedTpl,
          channel: 'whatsapp',
          scheduled_at: sendTime ? new Date(sendTime).toISOString() : null,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Save failed')
      setSavedMsg(`Saved "${d.campaign.name}" as ${d.campaign.status}. Sending is not wired yet, nobody gets messaged.`)
      setTimeout(onSaved, 1600)
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  const shownTemplates = templates.filter((t) => {
    if (tplFilter === 'approved') return t.status === 'approved'
    if (tplFilter === 'draft') return t.status === 'draft'
    return t.kind === tplFilter
  })

  // The variables this brand actually uses in WhatsApp: the union of {{vars}}
  // across every loaded template (approved registry + drafts). This is what
  // shows when no single template is picked, so Personalization mirrors real
  // WhatsApp usage, not a hardcoded guess.
  const templateVars = useMemo(() => {
    const set = new Set<string>()
    for (const t of templates) for (const v of varsOf(t)) set.add(v)
    return [...set]
  }, [templates])

  const variables = useMemo(() => {
    // A picked template's own {{vars}} win; else the brand's real template vars;
    // else the neutral config default.
    const base = varsOf(selectedTpl)
    const defaults = base.length > 0 ? base : (templateVars.length > 0 ? templateVars : DEFAULT_VARIABLES)
    return [...new Set([...defaults, ...customVars])]
  }, [selectedTpl, templateVars, customVars])

  const reachPct = audience && audience.count > 0
    ? Math.round(((audience.with_phone ?? audience.count) / audience.count) * 100)
    : 0

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-3.5">

      {/* ── LEFT: chat card ── */}
      <div className="flex flex-col min-h-0 rounded-2xl border" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        {/* Card header */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          {editingName ? (
            <input
              autoFocus
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false) }}
              maxLength={80}
              className="text-[14px] font-bold rounded-md border px-2 py-1 outline-none"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--accent-primary)', color: 'var(--text-primary)', width: 240 }}
            />
          ) : (
            <>
              <span className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{campaignName}</span>
              <button onClick={() => setEditingName(true)} className="p-1 opacity-60 hover:opacity-100" title="Rename campaign" style={{ color: 'var(--text-secondary)' }}>
                <MdEdit size={14} />
              </button>
            </>
          )}
          <div className="ml-auto flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            Channel:
            <span className="flex items-center gap-1 font-semibold rounded-lg border px-2 py-1" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}>
              <MdWhatsapp size={15} style={{ color: GREEN }} /> WhatsApp
            </span>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {/* Assistant intro - always first */}
          <div className="flex gap-2.5">
            <ProxeMark size={36} />
            <div className="max-w-[80%]">
              <div className="rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-line" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}>
                {`Hi, I'm ${ASSISTANT}, your AI campaign assistant.\nLet's build a campaign that gets results. Tell me who you want to reach, where you want to reach them, and what you want to achieve. I'll handle the rest.`}
              </div>
              <div className="text-[10px] mt-1 ml-1" style={{ color: 'var(--text-muted)' }}>{fmtTime(introAt)}</div>
            </div>
          </div>

          {messages.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} className="flex justify-end gap-2.5">
                <div className="max-w-[75%]">
                  <div className="rounded-2xl rounded-tr-md px-3.5 py-2.5 text-[13px] leading-relaxed" style={{ background: `color-mix(in srgb, var(--accent-primary) 15%, var(--bg-primary))`, color: 'var(--text-primary)' }}>
                    {m.content}
                  </div>
                  <div className="text-[10px] mt-1 mr-1 flex items-center gap-1 justify-end" style={{ color: 'var(--text-muted)' }}>
                    {fmtTime(m.at)} <MdDoneAll size={12} style={{ color: BLUE }} />
                  </div>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-full shrink-0" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}><MdPersonOutline size={18} /></span>
              </div>
            ) : (
              <div key={i} className="flex gap-2.5">
                <ProxeMark size={36} />
                <div className="max-w-[85%] min-w-0 flex-1 space-y-2.5">
                  <div className="rounded-2xl rounded-tl-md px-3.5 py-2.5 text-[13px] leading-relaxed inline-block" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}>
                    {m.content}
                  </div>
                  {m.reply?.audience && <PlanCard a={m.reply.audience} goal={m.reply.goal} />}
                  {((m.reply?.templates?.length || 0) + (m.reply?.drafts?.length || 0)) > 0 && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                      {[...(m.reply!.templates || []).map((t) => ({ ...t, status: 'approved' as const })), ...(m.reply!.drafts || []).map((t) => ({ ...t, status: 'draft' as const }))].map((t) => (
                        <TemplateCard key={t.name} t={t} selected={selectedTpl?.name === t.name} onSelect={() => setSelectedTpl(t)} />
                      ))}
                    </div>
                  )}
                  <div className="text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>{fmtTime(m.at)}</div>
                </div>
              </div>
            )
          ))}

          {/* Smart suggestions - under the latest assistant turn */}
          {!busy && (
            <div className="pl-[46px]">
              <div className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Smart suggestions</div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => send(s.text)}
                    className="flex items-center gap-2 text-[11.5px] px-3 py-2 rounded-xl border text-left transition-colors hover:opacity-80"
                    style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    <span style={{ color: 'var(--accent-primary)' }}>{s.icon}</span>
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {busy && (
            <div className="flex items-center gap-2 text-xs pl-[46px]" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: 'var(--accent-primary)' }} />
              Pulling the audience…
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="px-4 pb-2 pt-1">
          {error && <div className="text-xs mb-1.5" style={{ color: RED }}>{error}</div>}
          {savedMsg && <div className="text-xs mb-1.5" style={{ color: GREEN }}>{savedMsg}</div>}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input) }}
            className="flex items-center gap-2 rounded-2xl border px-3 py-2"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl shrink-0" style={{ background: `color-mix(in srgb, var(--accent-primary) 15%, transparent)`, color: 'var(--accent-primary)' }}>
              <MdAutoAwesome size={16} />
            </span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={PLACEHOLDERS[phIdx]}
              disabled={busy}
              className="flex-1 text-[13px] bg-transparent outline-none min-w-0"
              style={{ color: 'var(--text-primary)' }}
            />
            <button type="button" disabled className="p-1.5 shrink-0 opacity-40 cursor-not-allowed" title="Attachments (coming soon)" style={{ color: 'var(--text-muted)' }}>
              <MdAttachFile size={17} />
            </button>
            <button type="button" disabled className="p-1.5 shrink-0 opacity-40 cursor-not-allowed" title="Voice (coming soon)" style={{ color: 'var(--text-muted)' }}>
              <MdMicNone size={17} />
            </button>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full shrink-0 transition-opacity"
              style={{ background: 'var(--accent-primary)', color: 'var(--bg-primary)', opacity: busy || !input.trim() ? 0.4 : 1 }}
            >
              <MdSend size={16} />
            </button>
          </form>
          {/* Placeholder cycle dots */}
          <div className="flex justify-center gap-1.5 mt-1.5">
            {PLACEHOLDERS.map((_, i) => (
              <span key={i} className="inline-block h-1 w-1 rounded-full" style={{ background: i === phIdx ? 'var(--accent-primary)' : 'var(--border-primary)' }} />
            ))}
          </div>
          <div className="text-center text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {ASSISTANT} can make mistakes. Review before sending.
          </div>
        </div>
      </div>

      {/* ── RIGHT: rail ── */}
      <div className="min-h-0 overflow-y-auto space-y-3.5 pb-2">

        {/* Templates */}
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
          <div className="flex items-center mb-3">
            <span className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Templates</span>
            <a href="/dashboard/settings/whatsapp-templates" className="ml-auto text-[11.5px] font-semibold" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>View all</a>
          </div>
          <div className="flex gap-1 flex-wrap mb-3">
            {([['approved', 'Approved'], ['draft', 'Draft'], ['reminder', 'Reminder'], ['nudge', 'Nudge'], ['promo', 'Promo']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTplFilter(k)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
                style={{
                  background: tplFilter === k ? 'var(--bg-hover)' : 'transparent',
                  color: tplFilter === k ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
            {shownTemplates.length === 0 ? (
              <div className="text-[11.5px] py-3 text-center" style={{ color: 'var(--text-muted)' }}>
                {tplFilter === 'draft' ? 'Drafts appear when the chat writes new templates.' : 'No templates here yet.'}
              </div>
            ) : (
              shownTemplates.slice(0, 12).map((t) => {
                const tone = t.status === 'approved' ? GREEN : AMBER
                const selected = selectedTpl?.name === t.name
                return (
                  <button
                    key={t.name}
                    onClick={() => setSelectedTpl(t)}
                    className="w-full text-left flex items-start gap-2.5 rounded-xl border px-2.5 py-2 transition-all"
                    style={{
                      borderColor: selected ? 'var(--accent-primary)' : 'var(--border-primary)',
                      background: 'var(--bg-primary)',
                    }}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full shrink-0 mt-0.5" style={{ background: `${GREEN}1a`, color: GREEN }}>
                      <MdWhatsapp size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{prettyTplName(t.name)}</div>
                      <div className="text-[10.5px] leading-snug" style={{ color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {t.body}
                      </div>
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: `${tone}1c`, color: tone }}>
                      {t.status === 'approved' ? 'Approved' : 'Draft'}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Audience summary */}
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
          <div className="text-[14px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Audience summary</div>
          {audience ? (
            <div className="flex items-center gap-4">
              <div className="min-w-0">
                <div className="text-3xl font-black leading-tight tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {(audience.with_phone ?? audience.count).toLocaleString()}
                </div>
                <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Estimated reach</div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <ReachDonut pct={reachPct} />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <span className="h-2 w-2 rounded-full inline-block" style={{ background: 'var(--accent-primary)' }} />
                    WhatsApp <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{reachPct}%</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <span className="h-2 w-2 rounded-full inline-block" style={{ background: 'var(--bg-hover)' }} />
                    No phone <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{100 - reachPct}%</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11.5px] py-2" style={{ color: 'var(--text-muted)' }}>
              Describe your audience in the chat and the detected reach shows up here.
            </div>
          )}
        </div>

        {/* Campaign setup */}
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
          <div className="text-[14px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Campaign setup</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5" style={{ background: 'var(--bg-primary)' }}>
              <span style={{ color: 'var(--text-muted)' }}><MdOutlineArticle size={17} /></span>
              <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Channel</span>
              <span className="ml-auto flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                <MdWhatsapp size={15} style={{ color: GREEN }} /> WhatsApp
              </span>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5" style={{ background: 'var(--bg-primary)' }}>
              <span style={{ color: 'var(--text-muted)' }}><MdOutlineArticle size={17} /></span>
              <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Template</span>
              <span className="ml-auto text-[12px] font-semibold truncate max-w-[150px]" style={{ color: selectedTpl ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {selectedTpl ? prettyTplName(selectedTpl.name) : 'Pick a template'}
              </span>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5" style={{ background: 'var(--bg-primary)' }}>
              <span style={{ color: 'var(--text-muted)' }}><MdOutlineCalendarToday size={16} /></span>
              <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Send time</span>
              <SchedulePicker value={sendTime} onChange={setSendTime} />
            </div>
          </div>
          <button
            onClick={schedule}
            disabled={!audience || saving}
            className="w-full mt-3 flex items-center justify-center gap-2 text-[13px] font-bold px-3 py-2.5 rounded-xl transition-opacity"
            style={{ background: 'var(--accent-primary)', color: 'var(--bg-primary)', opacity: !audience || saving ? 0.4 : 1 }}
          >
            <MdAutoAwesome size={16} /> {saving ? 'Saving…' : 'Review & Schedule Campaign'}
          </button>
          {!audience && (
            <div className="text-[10.5px] mt-1.5 text-center" style={{ color: 'var(--text-muted)' }}>Detect an audience in the chat first.</div>
          )}
        </div>

        {/* Personalization */}
        <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
          <div className="text-[14px] font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Personalization <span className="font-normal text-[11.5px]" style={{ color: 'var(--text-muted)' }}>(Variables)</span></div>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <span key={v} className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg" style={{ background: `${PURPLE}18`, color: PURPLE }}>
                {`{{${v}}}`}
              </span>
            ))}
            <button
              onClick={() => {
                const v = window.prompt('Variable name (e.g. batch):')
                const clean = (v || '').trim().replace(/[^a-zA-Z0-9_]/g, '')
                if (clean) setCustomVars((cur) => [...new Set([...cur, clean])])
              }}
              className="flex items-center gap-0.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            >
              <MdAdd size={13} /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══ PREVIOUS CAMPAIGNS - the overview list ══════════════════════════════════

function PreviousCampaigns() {
  const [saved, setSaved] = useState<SavedCampaign[]>([])
  const [sent, setSent] = useState<SentCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleGroup = (w: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(w)) next.delete(w)
      else next.add(w)
      return next
    })

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

  const removeSaved = async (id: string) => {
    await fetch(`/api/dashboard/campaigns?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
    loadAll()
  }

  const STATS = [
    { label: 'Sent', value: agg.sent, sub: `across ${sent.length} campaign${sent.length !== 1 ? 's' : ''}`, color: PURPLE, icon: <MdSend size={18} /> },
    { label: 'Delivered', value: agg.delivered, sub: `${rate(agg.delivered)} delivery rate`, color: BLUE, icon: <MdOutlineMarkEmailRead size={18} /> },
    { label: 'Read', value: agg.read, sub: `${rate(agg.read)} read rate`, color: GREEN, icon: <MdOutlineVisibility size={18} /> },
    { label: 'Clicked', value: agg.clicked, sub: `${rate(agg.clicked)} click rate`, color: AMBER, icon: <MdOutlineAdsClick size={18} /> },
  ]

  const { rows, campaignCount } = useMemo(() => {
    const q = search.toLowerCase()
    const sentRows = sent.map((c) => ({
      kind: 'sent' as const,
      id: c.id,
      name: c.name,
      webinar: c.webinar || null,
      target: c.description || `Target: ${c.recipients} people · ${c.type}`,
      statusLabel: 'Live',
      statusColor: GREEN,
      since: c.lastSent ? `Since ${new Date(c.lastSent).toLocaleString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}` : '',
      deliveredPct: c.totals?.sent > 0 ? Math.round((c.totals.delivered / c.totals.sent) * 100) : 0,
      read: c.totals?.read ?? 0,
      clicked: c.totals?.clicked ?? 0,
      sentC: c as SentCampaign | undefined,
      savedC: undefined as SavedCampaign | undefined,
    }))
    const savedRows = saved.map((c) => ({
      kind: 'saved' as const,
      id: c.id,
      name: c.name,
      webinar: null as string | null,
      target: `Target: ${c.audience?.description || `${c.audience?.count ?? 0} people`}${c.scheduled_at ? ` · ${new Date(c.scheduled_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''}`,
      statusLabel: c.status === 'ready' ? 'Scheduled' : c.status === 'draft' ? 'Pending' : 'Completed',
      statusColor: c.status === 'ready' ? AMBER : c.status === 'draft' ? ('var(--text-muted)' as string) : BLUE,
      since: `Since ${new Date(c.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`,
      deliveredPct: null as number | null,
      read: null as number | null,
      clicked: null as number | null,
      sentC: undefined as SentCampaign | undefined,
      savedC: c as SavedCampaign | undefined,
    }))

    // Group the sent template cards by webinar so each webinar reads as one
    // block with its templates nested under a title header. A group is kept if
    // the webinar title OR any of its template names matches the search.
    const byWebinar = new Map<string, typeof sentRows>()
    const ungrouped: typeof sentRows = []
    for (const r of sentRows) {
      if (r.webinar) {
        const g = byWebinar.get(r.webinar) || []
        g.push(r)
        byWebinar.set(r.webinar, g)
      } else ungrouped.push(r)
    }

    type HeaderRow = { kind: 'header'; id: string; webinar: string; count: number; totals: { sent: number; delivered: number; read: number; clicked: number } }
    const out: Array<HeaderRow | (typeof sentRows)[number] | (typeof savedRows)[number]> = []
    let count = 0
    for (const [webinar, group] of byWebinar) {
      const webinarHit = !q || webinar.toLowerCase().includes(q)
      const visible = webinarHit ? group : group.filter((r) => r.name.toLowerCase().includes(q))
      if (!visible.length) continue
      const totals = visible.reduce(
        (a, r) => ({
          sent: a.sent + (r.sentC?.totals?.sent || 0),
          delivered: a.delivered + (r.sentC?.totals?.delivered || 0),
          read: a.read + (r.sentC?.totals?.read || 0),
          clicked: a.clicked + (r.sentC?.totals?.clicked || 0),
        }),
        { sent: 0, delivered: 0, read: 0, clicked: 0 },
      )
      out.push({ kind: 'header', id: `wh-${webinar}`, webinar, count: visible.length, totals })
      for (const r of visible) out.push(r)
      count += visible.length
    }
    for (const r of ungrouped) if (!q || r.name.toLowerCase().includes(q)) { out.push(r); count++ }
    for (const r of savedRows) if (!q || r.name.toLowerCase().includes(q)) { out.push(r); count++ }
    return { rows: out, campaignCount: count }
  }, [sent, saved, search])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 pb-4">
      <div className="relative w-[240px]">
        <MdSearch size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search campaigns…"
          className="text-[12.5px] rounded-lg border pl-8 pr-3 py-2 outline-none w-full"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        <div className="px-4 py-3 text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
          All campaigns <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({campaignCount})</span>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No campaigns yet</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Hit "Create Campaign" and describe who you want to reach.</div>
          </div>
        ) : (
          rows.map((r) => {
            // Webinar group header - a collapsible title bar summarising all its
            // template cards. Clicking folds/unfolds the group.
            if (r.kind === 'header') {
              const pct = r.totals.sent > 0 ? Math.round((r.totals.delivered / r.totals.sent) * 100) : 0
              const isOpen = !collapsed.has(r.webinar)
              return (
                <div
                  key={`header-${r.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 campaign-row cursor-pointer"
                  style={{ borderTop: '1px solid var(--border-primary)', background: 'var(--bg-primary)' }}
                  onClick={() => toggleGroup(r.webinar)}
                >
                  <span style={{ color: 'var(--text-muted)' }}>{isOpen ? <MdExpandLess size={18} /> : <MdExpandMore size={18} />}</span>
                  <MdEventNote size={16} style={{ color: PURPLE }} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{r.webinar}</div>
                    <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>Webinar · {r.count} template{r.count !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="ml-auto flex items-center gap-4 text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    <span className="tabular-nums">{r.totals.sent} sent</span>
                    <span className="tabular-nums">{pct}% delivered</span>
                    <span className="tabular-nums" style={{ color: GREEN }}>{r.totals.read} read</span>
                    <span className="tabular-nums" style={{ color: AMBER }}>{r.totals.clicked} clicked</span>
                  </div>
                </div>
              )
            }
            // Hide a grouped template card when its webinar group is collapsed.
            if (r.webinar && collapsed.has(r.webinar)) return null
            return (
            <div key={`${r.kind}-${r.id}`} style={{ borderTop: '1px solid var(--border-primary)' }}>
              <div
                className="grid grid-cols-1 md:grid-cols-[2.4fr_1.1fr_1.6fr_40px] gap-y-2 items-center px-4 py-3 campaign-row"
                style={{ cursor: r.sentC ? 'pointer' : 'default', paddingLeft: r.webinar ? 28 : undefined }}
                onClick={() => r.sentC && setExpanded(expanded === r.id ? null : r.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0" style={{ background: `${r.kind === 'sent' ? PURPLE : BLUE}1c`, color: r.kind === 'sent' ? PURPLE : BLUE }}>
                    <MdCampaign size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{r.name}</span>
                      <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: `${GREEN}1c`, color: GREEN }}>WHATSAPP</span>
                    </div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{r.target}</div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: r.statusColor }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: r.statusColor }} />
                    {r.statusLabel}
                  </div>
                  <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{r.since}</div>
                </div>
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
            )
          })
        )}
      </div>
      <style>{`.campaign-row:hover { background: var(--bg-hover); }`}</style>
    </div>
  )
}
