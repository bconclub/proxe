'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  MdRefresh, MdEdit, MdCheck, MdClose as MdX,
  MdPersonOutline, MdChatBubbleOutline, MdVerifiedUser, MdStar,
  MdCheckCircle, MdDescription, MdEmojiEvents,
  MdEventBusy, MdPause, MdClose, MdOutlineInfo,
} from 'react-icons/md'
import { createClient } from '@/lib/supabase/client'
import { BRAND_ID, brandConfig } from '@/configs'
import { PIPELINE_STAGE_GROUPS } from '@/configs/lead-stages'

// Stage groups → the DB lead_stage values they roll up ('High Intent' folds
// into Qualified, 'In Sequence' → New…). Canonical map lives in
// configs/lead-stages.ts so the Leads list expands deep links the same way.
type GroupKey = 'new' | 'engaged' | 'qualified' | 'keyEvent' | 'demoDone' | 'offerMade' | 'won' | 'noShow' | 'parked' | 'lost'

const GROUPS = Object.fromEntries(
  PIPELINE_STAGE_GROUPS.map((g) => [g.key, g.values]),
) as Record<GroupKey, string[]>

const GROUP_LABELS = Object.fromEntries(
  PIPELINE_STAGE_GROUPS.map((g) => [g.key, g.label]),
) as Record<GroupKey, string>
type Counts = Record<GroupKey, number> & { total: number }

const BLUE = '#3B82F6', PURPLE = '#8b5cf6', INDIGO = '#6366f1', GREEN = '#22c55e', AMBER = '#f59e0b', GRAY = '#8a8a8a', RED = '#ef4444'

// The chevron flow - order matters; the % under each step is that stage's
// share of ALL leads.
const FLOW: Array<{ key: GroupKey; label: string; color: string }> = [
  { key: 'new',       label: 'New',        color: BLUE },
  { key: 'engaged',   label: 'Engaged',    color: PURPLE },
  { key: 'qualified', label: 'Qualified',  color: INDIGO },
  { key: 'keyEvent',  label: 'Demo Booked', color: PURPLE },
  { key: 'demoDone',  label: 'Demo Done',  color: GREEN },
  { key: 'offerMade', label: 'Offer Made', color: AMBER },
  { key: 'won',       label: 'Won',        color: GREEN },
  { key: 'lost',      label: 'Lost',       color: RED },
]

// The "Lost" DB values double as the loss reason - Cold and Not Qualified say
// why, the rest are unspecified. Extend once brands log richer reasons.
const LOST_REASON_LABELS: Record<string, string> = {
  'Cold': 'Went cold',
  'Not Qualified': 'Unqualified',
  'Closed Lost': 'Unspecified',
  'Lost': 'Unspecified',
}

// --- Small visual pieces ---

// Rising sparkline of lead arrivals (cumulative over the last 30 days).
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const id = React.useId()
  const pts = points.length >= 2 ? points : [0, 0]
  const max = Math.max(1, ...pts)
  const w = 84, h = 28
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

// Progress ring - dashed track (the mock's dashed circle at 0), solid arc when
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

// A pipeline stat card - tinted by its accent, clicks through to the leads list.
function StageCard({ icon, label, value, color, onClick, ring, right, extra }: {
  icon: React.ReactNode; label: string; value: number; color: string
  onClick?: () => void; ring?: number; right?: React.ReactNode; extra?: React.ReactNode
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={`text-left rounded-xl border px-3.5 py-2.5 flex items-center gap-3 min-h-[64px] transition-all ${onClick ? 'hover:opacity-90 cursor-pointer' : 'cursor-default'}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 7%, var(--bg-secondary))`,
        borderColor: `color-mix(in srgb, ${color} 26%, var(--border-primary))`,
      }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold" style={{ color }}>{label}</div>
        <div className="text-[22px] font-bold leading-tight flex items-baseline gap-1.5" style={{ color: 'var(--text-primary)' }}>
          {value}
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{value === 1 ? 'lead' : 'leads'}</span>
        </div>
        {extra}
      </div>
      {right}
      {ring !== undefined && <MiniRing pct={ring} color={color} />}
    </button>
  )
}

// --- Chevron clip-paths ---
const NOTCH = 10

function chevronClip(position: 'first' | 'middle' | 'last'): string {
  if (position === 'first') return `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%)`
  if (position === 'last') return `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${NOTCH}px 50%)`
  return `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%, ${NOTCH}px 50%)`
}

// --- Loading skeleton ---
function Skeleton() {
  return (
    <div className="h-full px-4 sm:px-6 md:px-8 py-4 flex flex-col gap-3">
      <div style={{ height: 44, width: 320, background: 'var(--bg-hover)', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 64, background: 'var(--bg-hover)', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <div style={{ height: 130, background: 'var(--bg-hover)', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ height: 64, background: 'var(--bg-hover)', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <div style={{ height: 80, background: 'var(--bg-hover)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  )
}

// --- Main Page ---

// features.leadAccess: the pipeline becomes per-user - non-admins see their
// own claimed leads ("My Pipeline") plus the unclaimed open pool; admins get a
// selector to view any team member's pipeline (deep-linkable via ?user=<id>).
const LEAD_ACCESS_ON = !!brandConfig.features?.leadAccess

const DEFAULT_KEY_EVENT = brandConfig.pipeline?.keyEventLabel || 'Demo Booked'

const SPARK_KEYS = ['new', 'engaged', 'qualified', 'keyEvent'] as const
type SparkKey = typeof SPARK_KEYS[number]

export default function PipelinePage() {
  const router = useRouter()

  // Funnel data (exact head counts, owner-scoped)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [sparks, setSparks] = useState<Record<SparkKey, number[]>>({ new: [], engaged: [], qualified: [], keyEvent: [] })
  const [lostReasons, setLostReasons] = useState<Array<{ reason: string; count: number }>>([])
  const [reloadKey, setReloadKey] = useState(0)

  // Key event label - brand default, admin-overridable. The override persists
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
        // Gig workers (scout + connector) are not sales leads - exclude them
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
        const [totalQ, vals, sparkRows, lostRows] = await Promise.all([
          scope(supabase.from('all_leads').select('id', { count: 'exact', head: true })),
          Promise.all(keys.map((k) => countFor(GROUPS[k]))),
          Promise.all(SPARK_KEYS.map((k) =>
            scope(supabase.from('all_leads').select('created_at').in('lead_stage', GROUPS[k] as unknown as string[]).gte('created_at', since).limit(2000)),
          )),
          scope(supabase.from('all_leads').select('lead_stage').in('lead_stage', GROUPS.lost as unknown as string[]).limit(2000)),
        ])
        if (cancelled) return

        const obj = { total: totalQ.count || 0 } as Counts
        keys.forEach((k, i) => { obj[k] = vals[i] })
        setCounts(obj)

        // Sparklines: cumulative arrivals over the last 30d, 14 buckets.
        const BUCKETS = 14
        const span = 30 * 86400000
        const start = Date.now() - span
        const built = {} as Record<SparkKey, number[]>
        SPARK_KEYS.forEach((k, i) => {
          const perBucket = new Array(BUCKETS).fill(0)
          for (const row of (sparkRows[i].data || [])) {
            const t = new Date(row.created_at).getTime()
            if (!isFinite(t) || t < start) continue
            perBucket[Math.min(BUCKETS - 1, Math.floor(((t - start) / span) * BUCKETS))]++
          }
          let acc = 0
          built[k] = perBucket.map((n: number) => (acc += n))
        })
        setSparks(built)

        const tally: Record<string, number> = {}
        for (const row of (lostRows.data || [])) {
          const label = LOST_REASON_LABELS[row.lead_stage as string] || row.lead_stage || 'Unspecified'
          tally[label] = (tally[label] || 0) + 1
        }
        setLostReasons(Object.entries(tally).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count))
      } catch { if (!cancelled) setCounts(null) }
    })()
    return () => { cancelled = true }
  }, [viewOwner, myId, reloadKey])

  const saveLabel = async () => {
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
  }

  // --- Computed ---

  const c: Counts = counts || {
    total: 0, new: 0, engaged: 0, qualified: 0, keyEvent: 0,
    demoDone: 0, offerMade: 0, won: 0, noShow: 0, parked: 0, lost: 0,
  }

  const pctNum = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0)
  const pctStr = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '-')

  // Chevron % = the stage's share of all leads.
  const flowPcts = useMemo(
    () => FLOW.map((f) => (c.total > 0 ? `${Math.round((c[f.key] / c.total) * 100)}%` : '-')),
    [c],
  )

  const qualToKey = pctNum(c.keyEvent, c.qualified)
  // Deep link into the Leads list. stageLabel rides along so the list's chip
  // shows the funnel's name for the group (incl. the brand's key event name).
  const goStage = (key: GroupKey) => {
    const label = key === 'keyEvent' ? keyEventLabel : GROUP_LABELS[key]
    router.push(`/dashboard/leads?stage=${encodeURIComponent(GROUPS[key][0])}&stageLabel=${encodeURIComponent(label)}`)
  }

  const brandMark = brandConfig.markPath || brandConfig.iconPath || '/logo.png'

  if (!counts && reloadKey === 0) return <Skeleton />

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-2.5 px-4 sm:px-6 md:px-8 py-3.5 md:justify-between" style={{ minHeight: '100%' }}>

        {/* Header: brand mark + title + refresh (+ owner tabs when leadAccess) */}
        <div className="flex items-center gap-3 flex-wrap">
          <img src={brandMark} alt="" className="h-9 w-9 rounded-lg object-contain shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Pipeline Overview</h1>
            <div className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>Track your leads and conversions at a glance.</div>
          </div>
          {LEAD_ACCESS_ON && viewOwner && (
            <div className="flex items-center gap-1.5 flex-wrap ml-2">
              {(isAdmin
                ? [{ id: 'all', label: 'All Leads' }, { id: 'unassigned', label: 'Open Pool' }, { id: 'me', label: 'My Pipeline' }]
                : [{ id: 'me', label: 'My Pipeline' }, { id: 'unassigned', label: 'Open Pool' }]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setViewOwner(tab.id)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors"
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
                  className="px-2 py-1 rounded-md text-[11px] border cursor-pointer"
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
            </div>
          )}
          <button
            onClick={() => { setCounts(null); setReloadKey((k) => k + 1) }}
            className="ml-auto flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md"
            style={{ color: 'var(--accent-primary)' }}
          >
            <MdRefresh size={14} /> Refresh
          </button>
        </div>

        {/* Top row - New / Engaged / Qualified / key event, each with sparkline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <StageCard icon={<MdPersonOutline size={19} />} label="New" value={c.new} color={BLUE} onClick={() => goStage('new')} right={<Sparkline points={sparks.new} color={BLUE} />} />
          <StageCard icon={<MdChatBubbleOutline size={19} />} label="Engaged" value={c.engaged} color={PURPLE} onClick={() => goStage('engaged')} right={<Sparkline points={sparks.engaged} color={PURPLE} />} />
          <StageCard icon={<MdVerifiedUser size={19} />} label="Qualified" value={c.qualified} color={GREEN} onClick={() => goStage('qualified')} right={<Sparkline points={sparks.qualified} color={GREEN} />} />
          <StageCard icon={<MdStar size={19} />} label={keyEventLabel} value={c.keyEvent} color={AMBER} onClick={() => goStage('keyEvent')} right={<Sparkline points={sparks.keyEvent} color={AMBER} />} />
        </div>

        {/* KEY MILESTONE hero */}
        <div
          className="rounded-2xl border px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6"
          style={{
            background: `linear-gradient(105deg, color-mix(in srgb, ${PURPLE} 13%, var(--bg-secondary)), color-mix(in srgb, ${PURPLE} 4%, var(--bg-secondary)))`,
            borderColor: `color-mix(in srgb, ${PURPLE} 38%, var(--border-primary))`,
          }}
        >
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${PURPLE} 24%, transparent)`, color: PURPLE }}><MdStar size={28} /></span>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: PURPLE }}>Key Milestone</div>
              {editingLabel ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    autoFocus
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') setEditingLabel(false) }}
                    maxLength={40}
                    className="text-2xl font-bold rounded-md border px-2 py-0.5 outline-none min-w-0"
                    style={{ background: 'var(--bg-primary)', borderColor: PURPLE, color: 'var(--text-primary)', width: 240 }}
                  />
                  <button onClick={saveLabel} disabled={savingLabel} className="p-1 rounded-md" style={{ color: GREEN }} title="Save"><MdCheck size={18} /></button>
                  <button onClick={() => setEditingLabel(false)} className="p-1 rounded-md" style={{ color: 'var(--text-muted)' }} title="Cancel"><MdX size={18} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <button type="button" className="text-2xl sm:text-3xl font-bold truncate text-left" style={{ color: 'var(--text-primary)' }} onClick={() => goStage('keyEvent')}>{keyEventLabel}</button>
                  {cfgAdmin && (
                    <button
                      onClick={() => { setLabelDraft(keyEventLabel); setEditingLabel(true) }}
                      className="p-1 rounded-md shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                      style={{ color: PURPLE }}
                      title="Rename this brand's key milestone"
                    >
                      <MdEdit size={16} />
                    </button>
                  )}
                </div>
              )}
              <div className="text-[11.5px] mt-0.5 hidden sm:block max-w-[340px]" style={{ color: 'var(--text-secondary)' }}>
                This is the critical milestone that drives the rest of your pipeline.
              </div>
            </div>
          </div>
          <button type="button" onClick={() => goStage('keyEvent')} className="text-left shrink-0 flex items-baseline gap-2">
            <span className="text-5xl sm:text-6xl font-black" style={{ color: PURPLE }}>{c.keyEvent}</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{c.keyEvent === 1 ? 'lead' : 'leads'}</span>
          </button>
          <div className="hidden sm:block w-px self-stretch my-2" style={{ background: 'var(--border-primary)' }} />
          <div className="shrink-0 sm:w-[300px]">
            <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Qualified → {keyEventLabel} Conversion
            </div>
            <div className="flex items-center gap-2.5">
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: `color-mix(in srgb, ${PURPLE} 18%, var(--bg-hover))` }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, qualToKey)}%`, background: PURPLE }} />
              </div>
              <span className="text-base font-bold" style={{ color: PURPLE }}>{pctStr(c.keyEvent, c.qualified)}</span>
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              {c.keyEvent} of {c.qualified} qualified leads
            </div>
          </div>
        </div>

        {/* POST KEY EVENT */}
        <div>
          <SectionLabel>Post key event</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-1">
            <StageCard icon={<MdCheckCircle size={19} />} label="Demo Done" value={c.demoDone} color={GREEN} onClick={() => goStage('demoDone')} ring={pctNum(c.demoDone, c.keyEvent)} />
            <StageCard icon={<MdDescription size={19} />} label="Offer Made" value={c.offerMade} color={GREEN} onClick={() => goStage('offerMade')} ring={pctNum(c.offerMade, c.keyEvent)} />
            <StageCard icon={<MdEmojiEvents size={19} />} label="Won" value={c.won} color={GREEN} onClick={() => goStage('won')} ring={pctNum(c.won, c.keyEvent)} />
          </div>
        </div>

        {/* EXIT STATES */}
        <div>
          <SectionLabel>Exit states</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-1">
            <StageCard icon={<MdEventBusy size={19} />} label="No Show" value={c.noShow} color={AMBER} onClick={() => goStage('noShow')} ring={pctNum(c.noShow, c.keyEvent)} />
            <StageCard icon={<MdPause size={19} />} label="Parked" value={c.parked} color={GRAY} onClick={() => goStage('parked')} ring={pctNum(c.parked, c.total)} />
            <StageCard
              icon={<MdClose size={19} />} label="Lost" value={c.lost} color={RED} onClick={() => goStage('lost')} ring={pctNum(c.lost, c.won + c.lost)}
              extra={lostReasons.length > 0 ? (
                <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {lostReasons.slice(0, 3).map((r) => `${r.count} ${r.reason}`).join(' · ')}
                </div>
              ) : undefined}
            />
          </div>
        </div>

        {/* PIPELINE FLOW - chevrons, % of all leads under each */}
        <div>
          <SectionLabel>
            Pipeline flow
            <span
              title="Every stage as a step. The % under each is that stage's share of all leads. Click a step to open those leads."
              className="cursor-help inline-flex"
              style={{ color: 'var(--text-muted)' }}
            >
              <MdOutlineInfo size={13} />
            </span>
          </SectionLabel>
          <div className="chevron-scroll flex overflow-x-auto -ml-1 mt-1.5" style={{ WebkitOverflowScrolling: 'touch' }}>
            {FLOW.map((stage, i) => {
              const position = i === 0 ? 'first' : i === FLOW.length - 1 ? 'last' : 'middle'
              const label = stage.key === 'keyEvent' ? keyEventLabel : stage.label
              return (
                <div key={stage.key} className="flex flex-col" style={{ flex: '1 0 100px', minWidth: 100, marginLeft: i === 0 ? 4 : -4, zIndex: FLOW.length - i, position: 'relative' }}>
                  <button
                    onClick={() => goStage(stage.key)}
                    className="chevron-btn"
                    style={{
                      height: 68,
                      width: '100%',
                      background: `color-mix(in srgb, ${stage.color} ${stage.key === 'keyEvent' ? 24 : 13}%, var(--bg-secondary))`,
                      clipPath: chevronClip(position),
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      padding: `0 ${NOTCH + 4}px`,
                      transition: 'filter 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: stage.color, lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {c[stage.key]}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {flowPcts[i]}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <style>{`
        .chevron-scroll { -ms-overflow-style: none; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .chevron-scroll::-webkit-scrollbar { display: none; }
        .chevron-btn:hover { filter: brightness(1.1); }
      `}</style>
    </div>
  )
}
