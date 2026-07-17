'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  MdSearch, MdChevronLeft, MdChevronRight, MdRefresh, MdEdit, MdCheck, MdClose as MdX,
  MdPersonOutline, MdChatBubbleOutline, MdVerifiedUser, MdStar,
  MdCheckCircle, MdDescription, MdEmojiEvents,
  MdEventBusy, MdPause, MdClose,
  MdTrendingUp, MdGroups, MdOutlineInfo, MdAutorenew, MdDonutLarge, MdTimer, MdPercent,
} from 'react-icons/md'
import LeadDetailsModal from '@/components/dashboard/LeadDetailsModal'
import { createClient } from '@/lib/supabase/client'
import { calculateLeadScore } from '@/lib/leadScoreCalculator'
import type { Lead as ScoredLead } from '@/types'
import { BRAND_ID, brandConfig } from '@/configs'

// --- Types ---

interface Lead {
  id: string
  name: string
  company?: string
  brand?: string
  lead_score: number | null
  first_touchpoint: string | null
  last_touchpoint: string | null
  last_interaction_at: string | null
  created_at?: string | null
  city: string | null
  lead_stage: string | null
  phone?: string
  unified_context?: Record<string, any>
}

// Stage groups → the DB lead_stage values they roll up. 'High Intent' is a
// LEGACY auto stage folded into Qualified; 'In Sequence' → New.
const GROUPS = {
  new: ['New', '', 'In Sequence'],
  engaged: ['Engaged'],
  qualified: ['Qualified', 'High Intent'],
  keyEvent: ['Booking Made'],
  demoDone: ['Call Done', 'Demo Done'],
  offerMade: ['Proposal Sent', 'Offer Made'],
  won: ['Closed Won', 'Converted', 'Won'],
  noShow: ['No Show'],
  parked: ['Parked'],
  lost: ['Closed Lost', 'Lost', 'Cold', 'Not Qualified'],
} as const

type GroupKey = keyof typeof GROUPS
type Counts = Record<GroupKey, number> & { total: number }

const BLUE = '#3B82F6', PURPLE = '#7f77dd', GREEN = '#22c55e', AMBER = '#f59e0b', GRAY = '#8a8a8a', RED = '#ef4444'

// The chevron flow — order matters; % under each = conversion from the previous
// step (Lost shows lost share of decided leads).
const FLOW: Array<{ key: GroupKey; label: string; color: string }> = [
  { key: 'new',       label: 'New',       color: BLUE },
  { key: 'engaged',   label: 'Engaged',   color: BLUE },
  { key: 'qualified', label: 'Qualified', color: BLUE },
  { key: 'keyEvent',  label: 'Demo Booked', color: PURPLE },
  { key: 'demoDone',  label: 'Demo / Call Done', color: GREEN },
  { key: 'offerMade', label: 'Proposal / Offer', color: AMBER },
  { key: 'won',       label: 'Won',       color: GREEN },
  { key: 'lost',      label: 'Lost',      color: RED },
]

// Table-badge mapping (includes exit states not shown as chevrons).
const BADGES: Array<{ key: GroupKey; label: string; color: string }> = [
  { key: 'new', label: 'New', color: BLUE },
  { key: 'engaged', label: 'Engaged', color: BLUE },
  { key: 'qualified', label: 'Qualified', color: BLUE },
  { key: 'keyEvent', label: 'Demo Booked', color: PURPLE },
  { key: 'demoDone', label: 'Demo Done', color: GREEN },
  { key: 'offerMade', label: 'Offer Made', color: AMBER },
  { key: 'won', label: 'Won', color: GREEN },
  { key: 'lost', label: 'Lost', color: RED },
  { key: 'noShow', label: 'No Show', color: AMBER },
  { key: 'parked', label: 'Parked', color: GRAY },
]

function groupOf(lead: Lead): GroupKey {
  const s = lead.lead_stage || ''
  for (const b of BADGES) {
    if ((GROUPS[b.key] as readonly string[]).includes(s)) return b.key
  }
  return 'new'
}

// The "Lost" DB values double as the loss reason — Cold and Not Qualified say
// why, the rest are unspecified. Extend once brands start logging richer reasons.
const LOST_REASON_LABELS: Record<string, string> = {
  'Cold': 'Went cold',
  'Not Qualified': 'Not qualified',
  'Closed Lost': 'Unspecified',
  'Lost': 'Unspecified',
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function daysBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000))
}

// --- Small visual pieces ---

// Rising sparkline of lead arrivals (cumulative over the last 30 days).
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const id = React.useId()
  const pts = points.length >= 2 ? points : [0, 0]
  const max = Math.max(1, ...pts)
  const w = 92, h = 30
  const step = w / (pts.length - 1)
  const xy = pts.map((p, i) => `${(i * step).toFixed(1)},${(h - 3 - (p / max) * (h - 8)).toFixed(1)}`)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 hidden lg:block" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${xy.join(' ')} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={xy.join(' ')} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// Progress ring — dashed track (the mock's dashed circle at 0), solid arc when
// >0. stroke-dasharray over pathLength so it never degenerates at 100%.
function MiniRing({ pct, color }: { pct: number; color: string }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <svg width={34} height={34} viewBox="0 0 36 36" className="shrink-0 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="2.5" strokeDasharray="3 4" strokeLinecap="round" />
      {p > 0 && (
        <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="2.5" pathLength={100} strokeDasharray={`${p} ${100 - p}`} strokeLinecap="round" />
      )}
    </svg>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-[0.08em] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>{children}</div>
}

// A pipeline stat card — tinted by its accent, clicks through to the leads list.
function StageCard({ icon, label, value, color, onClick, ring, right, extra }: {
  icon: React.ReactNode; label: string; value: number; color: string
  onClick?: () => void; ring?: number; right?: React.ReactNode; extra?: React.ReactNode
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={`text-left rounded-xl border px-3.5 py-2.5 flex items-center gap-3 min-h-[62px] transition-all ${onClick ? 'hover:opacity-90 cursor-pointer' : 'cursor-default'}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 7%, var(--bg-secondary))`,
        borderColor: `color-mix(in srgb, ${color} 26%, var(--border-primary))`,
      }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold" style={{ color }}>{label}</div>
        <div className="text-xl font-bold leading-tight flex items-baseline gap-1.5" style={{ color: 'var(--text-primary)' }}>
          {value}
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>leads</span>
        </div>
        {extra}
      </div>
      {right}
      {ring !== undefined && <MiniRing pct={ring} color={color} />}
    </button>
  )
}

function MetricCard({ icon, color, label, value, sub }: { icon: React.ReactNode; color: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5 min-w-0" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center gap-1.5 mb-1 min-w-0">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>{icon}</span>
        <span className="text-[10.5px] truncate" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{value}</div>
      <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  )
}

// --- Chevron clip-paths ---
const NOTCH = 9

function chevronClip(position: 'first' | 'middle' | 'last'): string {
  if (position === 'first') return `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%)`
  if (position === 'last') return `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${NOTCH}px 50%)`
  return `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%, ${NOTCH}px 50%)`
}

// --- Score dot ---
function ScoreDot({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>-</span>
  const color = score >= 60 ? '#34d399' : score >= 30 ? '#fbbf24' : '#f87171'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ color, fontSize: 11, fontWeight: 600 }}>{score}</span>
    </span>
  )
}

// --- Channel icon ---
function ChannelIcon({ lead }: { lead: Lead }) {
  const ch = lead.last_touchpoint || lead.first_touchpoint
  if (ch === 'whatsapp') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#34d399">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.293-.175-2.828.84.84-2.828-.175-.293A8 8 0 1112 20z" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#64748b">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
    </svg>
  )
}

// --- Loading skeleton ---
function Skeleton() {
  return (
    <div className="h-full px-4 sm:px-6 md:px-8 py-4 flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ height: 62, background: 'var(--bg-hover)', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <div style={{ height: 108, background: 'var(--bg-hover)', borderRadius: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ height: 62, background: 'var(--bg-hover)', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <div style={{ height: 72, background: 'var(--bg-hover)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  )
}

// --- Main Page ---

// features.leadAccess: the pipeline becomes per-user — non-admins see their
// own claimed leads ("My Pipeline") plus the unclaimed open pool; admins get a
// selector to view any team member's pipeline (deep-linkable via ?user=<id>).
const LEAD_ACCESS_ON = !!brandConfig.features?.leadAccess

const DEFAULT_KEY_EVENT = brandConfig.pipeline?.keyEventLabel || 'Demo Booked'

export default function PipelinePage() {
  const router = useRouter()
  const tableRef = useRef<HTMLDivElement>(null)

  const [leads, setLeads] = useState<Lead[]>([])
  // Same client-side score the leads table + lead detail show — the stored
  // lead_score column is 0/stale for many leads.
  const [calcScores, setCalcScores] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [activeStage, setActiveStage] = useState<GroupKey | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'score' | 'activity' | 'days'>('score')
  const [page, setPage] = useState(1)
  const perPage = 20
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false)

  // Funnel data (exact head counts, owner-scoped)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [sparks, setSparks] = useState<Record<'new' | 'engaged' | 'qualified', number[]>>({ new: [], engaged: [], qualified: [] })
  const [lostReasons, setLostReasons] = useState<Array<{ reason: string; count: number }>>([])
  const [avgCloseDays, setAvgCloseDays] = useState<number>(-1)
  const [reloadKey, setReloadKey] = useState(0)

  // Key event label — brand default, admin-overridable. The override persists
  // per brand in dashboard_settings so it sticks across users and sessions.
  const [keyEventLabel, setKeyEventLabel] = useState(DEFAULT_KEY_EVENT)
  const [cfgAdmin, setCfgAdmin] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [savingLabel, setSavingLabel] = useState(false)

  // Owner scope (features.leadAccess)
  const [viewOwner, setViewOwner] = useState<string | null>(LEAD_ACCESS_ON ? null : 'all')
  const [isAdmin, setIsAdmin] = useState(false)
  const [myId, setMyId] = useState<string | null>(null)
  const [members, setMembers] = useState<Array<{ id: string; name: string; email: string | null }>>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/settings/pipeline')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d?.config?.keyEventLabel) setKeyEventLabel(d.config.keyEventLabel)
        setCfgAdmin(!!d?.isAdmin)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!LEAD_ACCESS_ON) return
    let cancelled = false
    fetch('/api/dashboard/team-members')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setIsAdmin(!!d.isAdmin)
        setMyId(d?.me?.id || null)
        setMembers(Array.isArray(d.members) ? d.members : [])
        const urlUser = new URLSearchParams(window.location.search).get('user')
        setViewOwner(d.isAdmin ? (urlUser || 'all') : 'me')
      })
      .catch(() => { if (!cancelled) setViewOwner('me') })
    return () => { cancelled = true }
  }, [])

  // --- Funnel counts + sparklines + lost reasons (supabase, exact) ---
  useEffect(() => {
    if (LEAD_ACCESS_ON && (!viewOwner || (viewOwner === 'me' && !myId))) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        // Gig workers (scout + connector) are not sales leads — exclude them
        // from every count, mirroring the Leads table + Overview exclusion.
        const gigPath = `unified_context->${BRAND_ID}->>user_type`
        const scope = (q: any) => {
          if (brandConfig.features?.scouts) {
            q = q.or(`${gigPath}.is.null,and(${gigPath}.neq.scout,${gigPath}.neq.connector)`)
          }
          if (LEAD_ACCESS_ON && viewOwner && viewOwner !== 'all') {
            if (viewOwner === 'unassigned') q = q.is('owner_id', null)
            else q = q.eq('owner_id', viewOwner === 'me' ? myId : viewOwner)
          }
          return q
        }
        const countFor = async (stages: readonly string[]) => {
          const { count } = await scope(supabase.from('all_leads').select('id', { count: 'exact', head: true }).in('lead_stage', stages as string[]))
          return count || 0
        }
        const keys = Object.keys(GROUPS) as GroupKey[]
        const since = new Date(Date.now() - 30 * 86400000).toISOString()
        const [totalQ, vals, sparkRows, lostRows, wonRows] = await Promise.all([
          scope(supabase.from('all_leads').select('id', { count: 'exact', head: true })),
          Promise.all(keys.map((k) => countFor(GROUPS[k]))),
          Promise.all((['new', 'engaged', 'qualified'] as const).map((k) =>
            scope(supabase.from('all_leads').select('created_at').in('lead_stage', GROUPS[k] as unknown as string[]).gte('created_at', since).limit(2000)),
          )),
          scope(supabase.from('all_leads').select('lead_stage').in('lead_stage', GROUPS.lost as unknown as string[]).limit(2000)),
          scope(supabase.from('all_leads').select('created_at,last_interaction_at').in('lead_stage', GROUPS.won as unknown as string[]).limit(500)),
        ])
        if (cancelled) return

        const obj = { total: totalQ.count || 0 } as Counts
        keys.forEach((k, i) => { obj[k] = vals[i] })
        setCounts(obj)

        // Sparklines: cumulative arrivals over the last 30d, 14 buckets.
        const BUCKETS = 14
        const span = 30 * 86400000
        const start = Date.now() - span
        const built: Record<string, number[]> = {}
        ;(['new', 'engaged', 'qualified'] as const).forEach((k, i) => {
          const perBucket = new Array(BUCKETS).fill(0)
          for (const row of (sparkRows[i].data || [])) {
            const t = new Date(row.created_at).getTime()
            if (!isFinite(t) || t < start) continue
            perBucket[Math.min(BUCKETS - 1, Math.floor(((t - start) / span) * BUCKETS))]++
          }
          let acc = 0
          built[k] = perBucket.map((n: number) => (acc += n))
        })
        setSparks(built as any)

        const tally: Record<string, number> = {}
        for (const row of (lostRows.data || [])) {
          const label = LOST_REASON_LABELS[row.lead_stage as string] || row.lead_stage || 'Unspecified'
          tally[label] = (tally[label] || 0) + 1
        }
        setLostReasons(Object.entries(tally).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count))

        const won = (wonRows.data || []).filter((r: any) => r.created_at && r.last_interaction_at)
        setAvgCloseDays(won.length > 0
          ? Math.round(won.reduce((s: number, r: any) => s + daysBetween(r.created_at, r.last_interaction_at), 0) / won.length)
          : -1)
      } catch { if (!cancelled) setCounts(null) }
    })()
    return () => { cancelled = true }
  }, [viewOwner, myId, reloadKey])

  // --- Lead table data ---
  const fetchLeads = useCallback(async () => {
    if (LEAD_ACCESS_ON && !viewOwner) return
    try {
      const ownerParam = LEAD_ACCESS_ON && viewOwner && viewOwner !== 'all'
        ? `&owner=${encodeURIComponent(viewOwner)}`
        : ''
      const res = await fetch(`/api/dashboard/leads?limit=1000${ownerParam}`)
      const data = await res.json()
      const rawLeads: Lead[] = data.leads || []
      const GIG_TYPES = ['scout', 'connector']
      setLeads(
        brandConfig.features?.scouts
          ? rawLeads.filter((l) => !GIG_TYPES.includes(l?.unified_context?.[BRAND_ID]?.user_type as string))
          : rawLeads,
      )
      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch leads:', err)
      setLoading(false)
    }
  }, [viewOwner])

  useEffect(() => {
    fetchLeads()
    const interval = setInterval(fetchLeads, 60000)
    return () => clearInterval(interval)
  }, [fetchLeads])

  useEffect(() => {
    if (leads.length === 0) return
    let cancelled = false
    ;(async () => {
      const scores: Record<string, number> = {}
      await Promise.all(
        leads.map(async (lead) => {
          try {
            const r = await calculateLeadScore(lead as unknown as ScoredLead)
            scores[lead.id] = r.score
          } catch {
            scores[lead.id] = lead.lead_score ?? 0
          }
        }),
      )
      if (!cancelled) setCalcScores(scores)
    })()
    return () => { cancelled = true }
  }, [leads])

  const scoreOf = useCallback(
    (lead: Lead) => calcScores[lead.id] ?? lead.lead_score ?? 0,
    [calcScores],
  )

  const handleLeadClick = useCallback((lead: Lead) => {
    setSelectedLead({
      id: lead.id,
      name: lead.name || 'Unknown',
      email: '',
      phone: lead.phone || '',
      source: lead.first_touchpoint || lead.last_touchpoint || 'whatsapp',
      first_touchpoint: lead.first_touchpoint || null,
      last_touchpoint: lead.last_touchpoint || null,
      timestamp: lead.created_at || '',
      status: lead.lead_stage || null,
      booking_date: null,
      booking_time: null,
      lead_score: scoreOf(lead),
      lead_stage: lead.lead_stage,
    })
    setIsLeadModalOpen(true)
  }, [scoreOf])

  const updateLeadStatus = useCallback(async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/dashboard/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok && selectedLead?.id === leadId) {
        setSelectedLead({ ...selectedLead, status: newStatus })
      }
    } catch (err) {
      console.error('Failed to update lead status:', err)
    }
  }, [selectedLead])

  const saveLabel = useCallback(async () => {
    const draft = labelDraft.trim()
    setSavingLabel(true)
    try {
      const res = await fetch('/api/dashboard/settings/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyEventLabel: draft }),
      })
      const d = await res.json()
      if (res.ok) {
        setKeyEventLabel(d?.config?.keyEventLabel || DEFAULT_KEY_EVENT)
        setEditingLabel(false)
      }
    } catch { /* keep the editor open so the user can retry */ }
    setSavingLabel(false)
  }, [labelDraft])

  // --- Computed ---

  const c: Counts = counts || {
    total: 0, new: 0, engaged: 0, qualified: 0, keyEvent: 0,
    demoDone: 0, offerMade: 0, won: 0, noShow: 0, parked: 0, lost: 0,
  }

  const pctNum = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
  const pctStr = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—')

  const flowPcts = useMemo(() => FLOW.map((f, i) => {
    if (i === 0) return c.total > 0 ? '100%' : '—'
    if (f.key === 'lost') return c.won + c.lost > 0 ? `${pctNum(c.lost, c.won + c.lost)}%` : '—'
    const prev = c[FLOW[i - 1].key]
    return prev > 0 ? `${pctNum(c[f.key], prev)}%` : '0%'
  }), [c])

  const biggestDrop = useMemo(() => {
    let drop = { from: '', to: '', pct: -1 }
    for (let i = 1; i < FLOW.length - 1; i++) {
      const prev = c[FLOW[i - 1].key]
      const curr = c[FLOW[i].key]
      if (prev > 0 && curr < prev) {
        const p = Math.round(((prev - curr) / prev) * 100)
        if (p > drop.pct && p < 100) drop = { from: FLOW[i - 1].label, to: FLOW[i].label, pct: p }
      }
    }
    return drop
  }, [c])

  const activePipeline = Math.max(0, c.total - c.won - c.lost - c.noShow - c.parked)
  const winRate = c.won + c.lost > 0 ? `${Math.round((c.won / (c.won + c.lost)) * 100)}%` : '—'
  const qualToKey = pctNum(c.keyEvent, c.qualified)

  const tableLeads = useMemo(() => {
    let filtered = leads.filter((l) => {
      if (activeStage && groupOf(l) !== activeStage) return false
      if (search) {
        const q = search.toLowerCase()
        if (!(l.name || '').toLowerCase().includes(q) && !(l.phone || '').includes(q)) return false
      }
      return true
    })
    filtered.sort((a, b) => {
      if (sortBy === 'score') return scoreOf(b) - scoreOf(a)
      if (sortBy === 'activity') return new Date(b.last_interaction_at || 0).getTime() - new Date(a.last_interaction_at || 0).getTime()
      return daysBetween(b.created_at || null, b.last_interaction_at) - daysBetween(a.created_at || null, a.last_interaction_at)
    })
    return filtered
  }, [leads, activeStage, search, sortBy, scoreOf])

  const totalPages = Math.max(1, Math.ceil(tableLeads.length / perPage))
  const pagedLeads = tableLeads.slice((page - 1) * perPage, page * perPage)

  useEffect(() => { setPage(1); setActiveStage(null) }, [viewOwner])
  useEffect(() => { setPage(1) }, [activeStage, search, sortBy])

  const goStage = (key: GroupKey) => router.push(`/dashboard/leads?stage=${encodeURIComponent(GROUPS[key][0])}`)
  const filterStage = (key: GroupKey) => {
    const next = activeStage === key ? null : key
    setActiveStage(next)
    if (next) setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const badgeOf = (key: GroupKey) => BADGES.find((b) => b.key === key)!
  const stageDisplay = (key: GroupKey) => (key === 'keyEvent' ? keyEventLabel : badgeOf(key).label)

  if (loading && !counts) return <Skeleton />

  return (
    <div className="h-full overflow-y-auto">
      {/* ══ SCREEN 1: the funnel — sized to exactly one viewport on desktop ══ */}
      <div className="flex flex-col gap-2 px-4 sm:px-6 md:px-8 py-3 md:justify-between" style={{ minHeight: '100%' }}>

        {/* Header row: owner scope tabs + refresh */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {LEAD_ACCESS_ON && viewOwner && (
            <>
              {(isAdmin
                ? [{ id: 'all', label: 'All Leads' }, { id: 'unassigned', label: 'Open Pool' }, { id: 'me', label: 'My Pipeline' }]
                : [{ id: 'me', label: 'My Pipeline' }, { id: 'unassigned', label: 'Open Pool' }]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setViewOwner(tab.id)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors"
                  style={{
                    borderColor: 'var(--border-primary)',
                    background: viewOwner === tab.id ? 'var(--bg-hover)' : 'transparent',
                    color: viewOwner === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                  }}
                >
                  {tab.label}
                </button>
              ))}
              {isAdmin && members.length > 0 && (
                <select
                  value={members.some((m) => m.id === viewOwner) ? (viewOwner as string) : ''}
                  onChange={(e) => { if (e.target.value) setViewOwner(e.target.value) }}
                  className="px-2.5 py-1.5 rounded-md text-xs border cursor-pointer"
                  style={{
                    borderColor: 'var(--border-primary)',
                    background: members.some((m) => m.id === viewOwner) ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                    color: members.some((m) => m.id === viewOwner) ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  <option value="">Team member…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              )}
            </>
          )}
          <button
            onClick={() => { setCounts(null); setReloadKey((k) => k + 1); fetchLeads() }}
            className="ml-auto flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md"
            style={{ color: 'var(--accent-primary)' }}
          >
            <MdRefresh size={14} /> Refresh
          </button>
        </div>

        {/* PRE KEY EVENT — 3 cards with sparklines */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <StageCard icon={<MdPersonOutline size={18} />} label="New" value={c.new} color={BLUE} onClick={() => goStage('new')} right={<Sparkline points={sparks.new} color={BLUE} />} />
          <StageCard icon={<MdChatBubbleOutline size={18} />} label="Engaged" value={c.engaged} color={BLUE} onClick={() => goStage('engaged')} right={<Sparkline points={sparks.engaged} color={BLUE} />} />
          <StageCard icon={<MdVerifiedUser size={18} />} label="Qualified" value={c.qualified} color={BLUE} onClick={() => goStage('qualified')} right={<Sparkline points={sparks.qualified} color={BLUE} />} />
        </div>

        {/* KEY EVENT hero */}
        <div
          className="rounded-2xl border px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5"
          style={{
            background: `linear-gradient(105deg, color-mix(in srgb, ${PURPLE} 14%, var(--bg-secondary)), color-mix(in srgb, ${PURPLE} 5%, var(--bg-secondary)))`,
            borderColor: `color-mix(in srgb, ${PURPLE} 40%, var(--border-primary))`,
          }}
        >
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${PURPLE} 24%, transparent)`, color: PURPLE }}><MdStar size={24} /></span>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: PURPLE }}>Key Event</div>
              {editingLabel ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    autoFocus
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setEditingLabel(false) }}
                    maxLength={40}
                    className="text-xl font-bold rounded-md border px-2 py-0.5 outline-none min-w-0"
                    style={{ background: 'var(--bg-primary)', borderColor: PURPLE, color: 'var(--text-primary)', width: 220 }}
                  />
                  <button onClick={saveLabel} disabled={savingLabel} className="p-1 rounded-md" style={{ color: GREEN }} title="Save"><MdCheck size={18} /></button>
                  <button onClick={() => setEditingLabel(false)} className="p-1 rounded-md" style={{ color: 'var(--text-muted)' }} title="Cancel"><MdX size={18} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <button type="button" className="text-2xl font-bold truncate text-left" style={{ color: 'var(--text-primary)' }} onClick={() => goStage('keyEvent')}>{keyEventLabel}</button>
                  {cfgAdmin && (
                    <button
                      onClick={() => { setLabelDraft(keyEventLabel); setEditingLabel(true) }}
                      className="p-1 rounded-md shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                      style={{ color: PURPLE }}
                      title="Rename this brand's key event"
                    >
                      <MdEdit size={15} />
                    </button>
                  )}
                </div>
              )}
              <div className="text-[11px] mt-0.5 hidden sm:block" style={{ color: 'var(--text-secondary)' }}>
                This is the critical milestone that drives the rest of your pipeline.
              </div>
            </div>
          </div>
          <button type="button" onClick={() => goStage('keyEvent')} className="text-left shrink-0 flex items-baseline gap-1.5">
            <span className="text-4xl sm:text-5xl font-black" style={{ color: PURPLE }}>{c.keyEvent}</span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>leads</span>
          </button>
          <div className="hidden sm:block w-px self-stretch my-1" style={{ background: 'var(--border-primary)' }} />
          <div className="shrink-0 sm:w-[280px]">
            <div className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
              Qualified → {keyEventLabel} Conversion
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: `color-mix(in srgb, ${PURPLE} 18%, var(--bg-hover))` }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, qualToKey)}%`, background: PURPLE }} />
              </div>
              <span className="text-sm font-bold" style={{ color: PURPLE }}>{pctStr(c.keyEvent, c.qualified)}</span>
            </div>
            <div className="text-[10.5px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {c.keyEvent} of {c.qualified} qualified leads
            </div>
          </div>
        </div>

        {/* POST KEY EVENT */}
        <div>
          <SectionLabel>Post key event</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-1">
            <StageCard icon={<MdCheckCircle size={18} />} label="Demo Done" value={c.demoDone} color={GREEN} onClick={() => goStage('demoDone')} ring={pctNum(c.demoDone, c.keyEvent)} />
            <StageCard icon={<MdDescription size={18} />} label="Offer Made" value={c.offerMade} color={GREEN} onClick={() => goStage('offerMade')} ring={pctNum(c.offerMade, c.keyEvent)} />
            <StageCard icon={<MdEmojiEvents size={18} />} label="Won" value={c.won} color={GREEN} onClick={() => goStage('won')} ring={pctNum(c.won, c.keyEvent)} />
          </div>
        </div>

        {/* EXIT STATES */}
        <div>
          <SectionLabel>Exit states</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-1">
            <StageCard icon={<MdEventBusy size={18} />} label="No Show" value={c.noShow} color={AMBER} onClick={() => goStage('noShow')} ring={pctNum(c.noShow, c.keyEvent)} />
            <StageCard icon={<MdPause size={18} />} label="Parked" value={c.parked} color={GRAY} onClick={() => goStage('parked')} ring={pctNum(c.parked, c.total)} />
            <StageCard
              icon={<MdClose size={18} />} label="Lost" value={c.lost} color={RED} onClick={() => goStage('lost')} ring={pctNum(c.lost, c.won + c.lost)}
              extra={lostReasons.length > 0 ? (
                <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {lostReasons.slice(0, 3).map((r) => `${r.count} ${r.reason}`).join(' · ')}
                </div>
              ) : undefined}
            />
          </div>
        </div>

        {/* PIPELINE FLOW — chevrons with step conversion below */}
        <div>
          <SectionLabel>
            Pipeline flow
            <span
              title="The % under each step is conversion from the previous stage (Lost = share of decided leads). Click a step to filter the lead list below."
              className="cursor-help inline-flex"
              style={{ color: 'var(--text-muted)' }}
            >
              <MdOutlineInfo size={13} />
            </span>
          </SectionLabel>
          <div className="chevron-scroll flex overflow-x-auto -ml-1 mt-1" style={{ WebkitOverflowScrolling: 'touch' }}>
            {FLOW.map((stage, i) => {
              const isActive = activeStage === stage.key
              const position = i === 0 ? 'first' : i === FLOW.length - 1 ? 'last' : 'middle'
              const label = stage.key === 'keyEvent' ? keyEventLabel : stage.label
              return (
                <div key={stage.key} className="flex flex-col" style={{ flex: '1 0 96px', minWidth: 96, marginLeft: i === 0 ? 4 : -4, zIndex: FLOW.length - i, position: 'relative' }}>
                  <button
                    onClick={() => filterStage(stage.key)}
                    className="chevron-btn"
                    style={{
                      height: 52,
                      width: '100%',
                      background: `color-mix(in srgb, ${stage.color} ${isActive ? 28 : 13}%, var(--bg-secondary))`,
                      clipPath: chevronClip(position),
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      padding: `0 ${NOTCH + 4}px`,
                      transition: 'filter 0.15s, background 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 9.5, fontWeight: 600, color: stage.color, lineHeight: 1.2, letterSpacing: '0.02em', textTransform: 'uppercase', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {c[stage.key]}
                    </span>
                  </button>
                  <div className="text-center mt-1" style={{ fontSize: 10, fontWeight: 600, color: isActive ? stage.color : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {flowPcts[i]}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* INSIGHTS — 8 metric cards */}
        <div>
          <SectionLabel>Insights</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mt-1">
            <MetricCard icon={<MdTrendingUp size={14} />} color={BLUE} label="Key Event Rate" value={pctStr(c.keyEvent, c.total)} sub={`${keyEventLabel} / all leads`} />
            <MetricCard icon={<MdGroups size={14} />} color={PURPLE} label="Show-up Rate" value={pctStr(c.demoDone, c.keyEvent)} sub={`Demo Done / ${keyEventLabel}`} />
            <MetricCard icon={<MdEmojiEvents size={14} />} color={GREEN} label="True Win Rate" value={pctStr(c.won, c.demoDone)} sub="Won / Demo Done" />
            <MetricCard icon={<MdAutorenew size={14} />} color={GRAY} label="Revivable" value={String(c.noShow + c.parked)} sub="No Show + Parked" />
            <MetricCard icon={<MdDonutLarge size={14} />} color={BLUE} label="Active Pipeline" value={String(activePipeline)} sub="in progress" />
            <MetricCard icon={<MdTimer size={14} />} color={PURPLE} label="Avg Time to Close" value={avgCloseDays >= 0 ? `${avgCloseDays}d` : 'No data'} sub={avgCloseDays >= 0 ? 'days to win' : '—'} />
            <MetricCard icon={<MdTrendingUp size={14} />} color={AMBER} label="Biggest Drop-off" value={biggestDrop.pct > 0 ? `${biggestDrop.pct}%` : 'No data'} sub={biggestDrop.from ? `${biggestDrop.from} → ${biggestDrop.to === 'Demo Booked' ? keyEventLabel : biggestDrop.to}` : '—'} />
            <MetricCard icon={<MdPercent size={14} />} color={RED} label="Win Rate" value={winRate} sub="won vs lost" />
          </div>
        </div>
      </div>

      {/* ══ BELOW THE FOLD: lead list (chevron click filters + scrolls here) ══ */}
      <div ref={tableRef} className="px-4 sm:px-6 md:px-8 pb-6 pt-2">
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border-primary)' }}>
            <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 260 }}>
              <MdSearch size={15} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: 5, border: '1px solid var(--border-primary)', background: 'var(--bg-hover)', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['score', 'activity', 'days'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  style={{
                    padding: '4px 9px', borderRadius: 4, border: '1px solid var(--border-primary)',
                    background: sortBy === s ? 'var(--bg-hover)' : 'transparent',
                    color: sortBy === s ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  {s === 'score' ? 'Score' : s === 'activity' ? 'Activity' : 'Days'}
                </button>
              ))}
            </div>
            {activeStage && (
              <button
                onClick={() => setActiveStage(null)}
                style={{ padding: '4px 9px', borderRadius: 4, background: `color-mix(in srgb, ${badgeOf(activeStage).color} 20%, transparent)`, color: badgeOf(activeStage).color, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {stageDisplay(activeStage)}
                <span style={{ opacity: 0.6 }}>✕</span>
              </button>
            )}
            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
              {tableLeads.length} result{tableLeads.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Header */}
          <div className="table-grid" style={{ padding: '7px 14px', borderBottom: '1px solid var(--border-primary)', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span>Name</span>
            <span>Stage</span>
            <span>Score</span>
            <span>Ch</span>
            <span>Last Activity</span>
            <span>Days</span>
            <span>City</span>
          </div>

          {/* Rows */}
          {pagedLeads.length === 0 ? (
            <div style={{ padding: '36px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No leads found</div>
          ) : (
            pagedLeads.map((lead) => {
              const g = groupOf(lead)
              const badge = badgeOf(g)
              const days = daysBetween(lead.created_at || null, lead.last_interaction_at || new Date().toISOString())
              return (
                <div
                  key={lead.id}
                  className="table-grid pipeline-row"
                  style={{ padding: '9px 14px', borderBottom: '1px solid var(--border-primary)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      onClick={(e) => { e.stopPropagation(); handleLeadClick(lead) }}
                      style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.1px', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--border-primary)', textUnderlineOffset: 2 }}
                    >
                      {lead.name || 'Unknown'}
                    </div>
                    {lead.phone && <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 1 }}>{lead.phone}</div>}
                  </div>
                  <span>
                    <span style={{ background: `color-mix(in srgb, ${badge.color} 18%, transparent)`, color: badge.color, padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>
                      {stageDisplay(g)}
                    </span>
                  </span>
                  <span><ScoreDot score={scoreOf(lead)} /></span>
                  <span><ChannelIcon lead={lead} /></span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{relativeTime(lead.last_interaction_at)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{days > 0 ? `${days}d` : '<1d'}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.city || ''}</span>
                </div>
              )
            })
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--border-primary)' }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ background: 'none', border: 'none', cursor: page === 1 ? 'default' : 'pointer', color: page === 1 ? 'var(--border-primary)' : 'var(--text-muted)', padding: 2 }}>
                <MdChevronLeft size={18} />
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ background: 'none', border: 'none', cursor: page === totalPages ? 'default' : 'pointer', color: page === totalPages ? 'var(--border-primary)' : 'var(--text-muted)', padding: 2 }}>
                <MdChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedLead && (
        <LeadDetailsModal
          lead={selectedLead}
          isOpen={isLeadModalOpen}
          onClose={() => { setIsLeadModalOpen(false); setSelectedLead(null) }}
          onStatusUpdate={updateLeadStatus}
        />
      )}

      <style>{`
        .chevron-scroll { -ms-overflow-style: none; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .chevron-scroll::-webkit-scrollbar { display: none; }
        .chevron-btn:hover { filter: brightness(1.08); }
        .pipeline-row:hover { background: var(--bg-hover); }
        .table-grid { display: grid; grid-template-columns: 2.5fr 1fr 0.6fr 0.4fr 1fr 0.6fr 1fr; gap: 0; }
        @media (max-width: 767px) {
          /* Phone: keep Name · Stage · Last Activity, drop Score/Ch/Days/City —
             7 squeezed columns were unreadable at 375px. */
          .table-grid { grid-template-columns: 2fr 1fr 1fr; font-size: 11px; }
          .table-grid > :nth-child(3),
          .table-grid > :nth-child(4),
          .table-grid > :nth-child(6),
          .table-grid > :nth-child(7) { display: none; }
        }
      `}</style>
    </div>
  )
}
