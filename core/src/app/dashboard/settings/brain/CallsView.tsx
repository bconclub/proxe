'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CallsView — the voice bench. Every call, with Vapi's REAL per-stage latency:
// who is doing the waiting — the providers (STT/LLM/TTS, "outside") vs our own
// endpointing config ("inside") vs the network round-trip. Everything in ms.
// Fills the viewport; only the call list scrolls. Web-test rows hidden by default.
// Data: /api/dashboard/brain/calls (Vapi, scoped to the brand's assistant).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { MdRefresh, MdExpandMore, MdExpandLess, MdBolt } from 'react-icons/md'

type Stages = { transcriber: number; model: number; voice: number; endpointing: number; transport: number }
type Perf = {
  turnAvg: number | null; worst: number | null; best: number | null; stages: Stages
  turnsDetail: Array<{ total: number; transcriber: number; model: number; voice: number; endpointing: number }>
}
type Call = {
  id: string; source: 'web' | 'phone'; engine: 'vapi' | 'elevenlabs' | 'sarvam'; language: string | null; callerName: string | null; callee: string
  createdAt: string | null; startedAt: string | null
  durationSec: number | null; waitSec: number | null; cost: number | null
  costBreakdown: { stt: number | null; llm: number | null; tts: number | null; vapi: number | null; total: number | null } | null
  status: string | null; endedReason: string | null; turns: number
  perf: Perf | null
  connector: { stt: string | null; model: string | null; tts: string | null }
  summary: string | null; recordingUrl: string | null
}
type EngineSplit = {
  calls: number; turnAvg: number | null; cost: number; costPerMin: number | null
  transcriber: number | null; model: number | null; voice: number | null; endpointing: number | null; transport: number | null
  groqCalls: number
}
type Agg = {
  total: number; phone: number; web: number; totalSpend: number; totalMinutes: number
  vapi: EngineSplit | null; elevenlabs: EngineSplit | null; sarvam: EngineSplit | null
}

// Colour a latency by magnitude. Sub-second good, ~1.5s borderline, beyond = stall.
function latColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)'
  if (v < 800) return '#22c55e'
  if (v < 1500) return '#eab308'
  return '#ef4444'
}
const M = (v: number | null) => (v == null ? '—' : `${v} ms`)

// A call only counts toward the eval aggregates (latency, cost, turn avg) if it
// was a REAL conversation — more than 20s AND more than one turn. Calls that drop
// in the first few seconds with no back-and-forth otherwise flatter the averages
// and make the system look faster than it is. The call list still shows them all.
const MIN_QUAL_SECS = 20
const MIN_QUAL_TURNS = 1
const isQualified = (c: Call) => (c.durationSec ?? 0) > MIN_QUAL_SECS && (c.turns ?? 0) > MIN_QUAL_TURNS
const LANG_LABEL: Record<string, string> = { pa: 'Punjabi', hi: 'Hindi', en: 'English', other: 'Other' }
// Primary pivot: the whole eval reorganizes around the selected engine version.
const ENG_TABS = [
  { id: 'all', label: 'All', color: 'var(--accent-primary)' },
  { id: 'vapi', label: 'V1', color: '#14b8a6' },
  { id: 'elevenlabs', label: 'V2', color: '#f59e0b' },
  { id: 'sarvam', label: 'V3', color: '#8b5cf6' },
] as const
type Eng = (typeof ENG_TABS)[number]['id']
const fmtDur = (s: number | null) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
const fmtCost = (c: number | null) => (c == null ? '—' : `$${c.toFixed(3)}`)
const fmtWhen = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
}
const fmtEnded = (r: string | null) => (r ? r.replace(/-/g, ' ') : '—')

// When a call never connected (no duration), surface WHY inline from endedReason.
function failReason(c: Call): { label: string; color: string } | null {
  if ((c.durationSec ?? 0) > 0) return null // connected — nothing to flag
  const r = (c.endedReason || '').toLowerCase()
  if (/did-not-answer|no-answer|noanswer/.test(r)) return { label: 'No answer', color: '#eab308' }
  if (/voicemail/.test(r)) return { label: 'Voicemail', color: '#eab308' }
  if (/busy/.test(r)) return { label: 'Busy', color: '#eab308' }
  if (/credit|balance|funds/.test(r)) return { label: 'No credits', color: '#ef4444' }
  if (/fail|error|unavailable|declin|reject|invalid|unallocated|forbidden/.test(r)) return { label: c.endedReason!.replace(/-/g, ' '), color: '#ef4444' }
  if (r) return { label: c.endedReason!.replace(/-/g, ' '), color: '#f59e0b' }
  return { label: 'Did not connect', color: '#94a3b8' }
}

// One stage of the latency split — a labelled ms value with an "inside/outside" tag.
function StageChip({ label, value, where }: { label: string; value: number | null; where: 'inside' | 'outside' | 'network' }) {
  const tone = where === 'inside' ? '#8b5cf6' : where === 'network' ? '#64748b' : latColor(value)
  return (
    <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', minWidth: 92 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: tone, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{M(value)}</div>
      <div style={{ fontSize: 8.5, fontWeight: 700, color: where === 'inside' ? '#8b5cf6' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {where === 'inside' ? 'ours' : where === 'network' ? 'network' : 'provider'}
      </div>
    </div>
  )
}

// A tiny real-data bar sparkline (per-call values, chronological).
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const vals = data.filter((v) => typeof v === 'number')
  if (vals.length < 2) return <div style={{ height: 22, marginTop: 6 }} />
  const max = Math.max(...vals, 1)
  const n = vals.length, w = 104, h = 22, gap = 1.5
  const bw = (w - gap * (n - 1)) / n
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', marginTop: 6 }} aria-hidden="true">
      {vals.map((v, i) => {
        const bh = Math.max(1.5, (v / max) * h)
        return <rect key={i} x={i * (bw + gap)} y={h - bh} width={Math.max(0.8, bw)} height={bh} rx={0.7} fill={color} opacity={0.35 + 0.5 * (v / max)} />
      })}
    </svg>
  )
}

// A headline stat card with an optional per-call sparkline beneath the number.
function StatCard({ label, value, tone, spark, sparkColor }: { label: string; value: string | number; tone?: string; spark?: number[]; sparkColor?: string }) {
  return (
    <div style={{ padding: '11px 16px 9px', borderRadius: 13, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', minWidth: 118 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: 2, lineHeight: 1.1 }}>{value}</div>
      {spark && <Sparkline data={spark} color={sparkColor || 'var(--accent-primary)'} />}
    </div>
  )
}

// Which engine placed the call. V1 = Vapi pipeline (Azure STT · GPT · 11Labs voice),
// V2 = ElevenLabs end-to-end. V3 = our own pipeline (Sarvam STT · Groq LLM ·
// 11Labs voice on the VPS). Open a call to see each engine's actual stack.
const ENGINE_META = {
  vapi: { label: 'V1', tone: '#14b8a6', title: 'V1 · Vapi pipeline (Azure · GPT · 11Labs voice)' },
  elevenlabs: { label: 'V2', tone: '#f59e0b', title: 'V2 · ElevenLabs end-to-end' },
  sarvam: { label: 'V3', tone: '#8b5cf6', title: 'V3 · Own pipeline (Sarvam STT · Groq LLM · 11Labs voice)' },
} as const
type EngineId = keyof typeof ENGINE_META

function EngineBadge({ engine }: { engine: EngineId }) {
  const m = ENGINE_META[engine] || ENGINE_META.vapi
  return (
    <span title={m.title} style={{
      fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999, flexShrink: 0,
      color: m.tone, background: `${m.tone}1f`, border: `1px solid ${m.tone}55`,
    }}>
      {m.label}
    </span>
  )
}

// One engine's latency split as a single comparison row (Vapi shows endpointing +
// network; ElevenLabs and the V3 pipeline fold network into the measured turn).
function SplitRow({ engine, split }: { engine: EngineId; split: EngineSplit }) {
  // V3 (sarvam) now measures the Vobiz carrier leg (residual of the real
  // perceived latency). ElevenLabs still folds network into its metric; V3 only
  // folds when transport is missing (pre-telemetry-change records).
  const netLabel = engine === 'sarvam' ? 'Vobiz' : 'Network'
  const foldedNetwork = engine === 'elevenlabs' || (engine === 'sarvam' && split.transport == null)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
      <EngineBadge engine={engine} />
      {split.groqCalls > 0 && (
        <span title="Calls where the response actually came from Groq inference (custom-LLM bridge or the V3 pipeline), not the provider's own default model"
          style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, padding: '2px 8px', borderRadius: 999, color: '#22c55e', background: '#22c55e1f', border: '1px solid #22c55e55', flexShrink: 0 }}>
          Groq · {split.groqCalls}/{split.calls}
        </span>
      )}
      <StageChip label="STT" value={split.transcriber} where="outside" />
      <StageChip label="LLM" value={split.model} where="outside" />
      <StageChip label="Voice" value={split.voice} where="outside" />
      <StageChip label="Endpoint" value={split.endpointing} where="inside" />
      {/* Carrier/network leg. V1 = Vapi transport; V3 = the Vobiz stream round-trip. */}
      <StageChip label={netLabel} value={split.transport} where="network" />
      {foldedNetwork && <span title="This engine measures silence→audio directly; network is folded into that metric rather than reported separately" style={{ fontSize: 14, color: 'var(--text-muted)', cursor: 'help' }}>ⓘ</span>}
      <div style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', minWidth: 82 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Turn avg</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: latColor(split.turnAvg), fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{M(split.turnAvg)}</div>
      </div>
      {/* permanent cost per engine — total + per-minute, the A/B decision number */}
      <div style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', minWidth: 92 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cost</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>${split.cost.toFixed(2)}</div>
        <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{split.costPerMin != null ? `$${split.costPerMin.toFixed(2)}/min` : '—'}</div>
      </div>
    </div>
  )
}

// V3 (Sarvam) placeholder row — keeps the V1/V2/V3 stack aligned until live calls exist.
function V3Row() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', opacity: 0.72 }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999, flexShrink: 0, color: '#8b5cf6', background: '#8b5cf61f', border: '1px solid #8b5cf655' }}>V3</span>
      <StageChip label="STT" value={null} where="outside" />
      <StageChip label="LLM" value={null} where="outside" />
      <StageChip label="Voice" value={null} where="outside" />
      <StageChip label="Endpoint" value={null} where="inside" />
      <StageChip label="Network" value={null} where="network" />
      <div style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', minWidth: 82 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Turn avg</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>—</div>
      </div>
      <span title="Pipeline live (Sarvam STT · Groq LLM · 11Labs voice); stats appear after the first logged call" style={{ fontSize: 10.5, fontWeight: 700, color: '#8b5cf6', background: '#8b5cf618', border: '1px solid #8b5cf644', borderRadius: 999, padding: '4px 10px', cursor: 'help' }}>V3 · no calls yet</span>
    </div>
  )
}

// Aggregate a set of calls into one latency/cost split (engine- or language-
// agnostic). Latency only from calls that have real per-turn data.
function aggregateSplit(list: Call[]): EngineSplit | null {
  if (!list.length) return null
  const num = (arr: Array<number | null | undefined>) => {
    const xs = arr.filter((x): x is number => typeof x === 'number')
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null
  }
  const wp = list.filter((c) => c.perf && c.perf.turnAvg)
  const cost = list.reduce((a, c) => a + (c.cost || 0), 0)
  const mins = list.reduce((a, c) => a + (c.durationSec || 0), 0) / 60
  return {
    calls: list.length,
    cost: Number(cost.toFixed(3)),
    costPerMin: mins > 0 ? Number((cost / mins).toFixed(3)) : null,
    turnAvg: wp.length ? num(wp.map((c) => c.perf!.turnAvg)) : null,
    transcriber: wp.length ? num(wp.map((c) => c.perf!.stages.transcriber)) : null,
    model: wp.length ? num(wp.map((c) => c.perf!.stages.model)) : null,
    voice: wp.length ? num(wp.map((c) => c.perf!.stages.voice)) : null,
    endpointing: wp.length ? num(wp.map((c) => c.perf!.stages.endpointing)) : null,
    transport: wp.length ? num(wp.map((c) => c.perf!.stages.transport)) : null,
    groqCalls: list.filter((c) => c.connector.model?.startsWith('groq')).length,
  }
}

// One language's latency split — same columns as SplitRow, labelled by language.
function LangSplitRow({ lang, split, netLabel }: { lang: string; split: EngineSplit; netLabel: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, padding: '3px 10px', borderRadius: 999, flexShrink: 0, minWidth: 62, textAlign: 'center', color: 'var(--text-primary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
        {LANG_LABEL[lang] || lang}
      </span>
      <StageChip label="STT" value={split.transcriber} where="outside" />
      <StageChip label="LLM" value={split.model} where="outside" />
      <StageChip label="Voice" value={split.voice} where="outside" />
      <StageChip label="Endpoint" value={split.endpointing} where="inside" />
      <StageChip label={netLabel} value={split.transport} where="network" />
      <div style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', minWidth: 82 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Turn avg</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: latColor(split.turnAvg), fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{M(split.turnAvg)}</div>
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{split.calls} call{split.calls === 1 ? '' : 's'} · ${split.cost.toFixed(2)}</span>
    </div>
  )
}

const GRID = '132px 1fr 56px 48px 46px 78px 78px 66px 26px'

export default function CallsView() {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [configured, setConfigured] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [showWeb, setShowWeb] = useState(false)
  const [lang, setLang] = useState<string>('all')
  const [eng, setEng] = useState<Eng>('all')
  const [limit, setLimit] = useState<number | 'all'>(10)

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/brain/calls', { cache: 'no-store' })
      const d = await r.json()
      setCalls(Array.isArray(d.calls) ? d.calls : [])
      setConfigured(d.configured !== false)
      if (d.error) setErr(d.error)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load calls')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  // languages present across all calls (for the filter chips)
  const langsPresent = useMemo(
    () => Array.from(new Set(calls.map((c) => c.language).filter((x): x is string => !!x))),
    [calls],
  )
  // filtered view — web-tests toggle + language filter both apply
  const shown = useMemo(
    () => calls.filter((c) => (showWeb || c.source === 'phone') && (lang === 'all' || c.language === lang) && (eng === 'all' || c.engine === eng)),
    [calls, showWeb, lang, eng],
  )
  // "Last 5/10/All" caps BOTH the list and the aggregate stats above it — the
  // point is "what does the last N calls look like", not just a shorter list
  // under an unrelated fixed-history number.
  const visible = useMemo(() => (limit === 'all' ? shown : shown.slice(0, limit)), [shown, limit])
  // per-engine split + totals, recomputed from the visible (limit-applied) set
  // so the language/web filters AND the Last-N toggle both live-update the
  // header comparison.
  const view = useMemo(() => {
    const num = (arr: Array<number | null | undefined>) => {
      const xs = arr.filter((x): x is number => typeof x === 'number')
      return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null
    }
    const splitFor = (engine: EngineId): EngineSplit | null => {
      // Last-N is per-ENGINE, not "last N calls overall then split" — the combined
      // list interleaves V1/V2 chronologically, so slicing before splitting could
      // give V2 just 1-2 calls' worth of "last 5" stats depending on how the two
      // engines happened to interleave. This takes each engine's own last N.
      // Only qualified calls (>20s, >1 turn) feed the aggregate — a 5s no-turn
      // call must not flatter the turn average.
      const engAll = shown.filter((c) => c.engine === engine && isQualified(c))
      const eng = limit === 'all' ? engAll : engAll.slice(0, limit)
      if (!eng.length) return null
      const wp = eng.filter((c) => c.perf && c.perf.turnAvg) // latency only from real turns
      const cost = eng.reduce((a, c) => a + (c.cost || 0), 0)
      const mins = eng.reduce((a, c) => a + (c.durationSec || 0), 0) / 60
      return {
        calls: eng.length,
        cost: Number(cost.toFixed(3)),
        costPerMin: mins > 0 ? Number((cost / mins).toFixed(3)) : null,
        turnAvg: wp.length ? num(wp.map((c) => c.perf!.turnAvg)) : null,
        transcriber: wp.length ? num(wp.map((c) => c.perf!.stages.transcriber)) : null,
        model: wp.length ? num(wp.map((c) => c.perf!.stages.model)) : null,
        voice: wp.length ? num(wp.map((c) => c.perf!.stages.voice)) : null,
        endpointing: wp.length ? num(wp.map((c) => c.perf!.stages.endpointing)) : null,
        transport: wp.length ? num(wp.map((c) => c.perf!.stages.transport)) : null,
        groqCalls: eng.filter((c) => c.connector.model?.startsWith('groq')).length,
      }
    }
    const phones = visible.filter((c) => c.source === 'phone').slice().reverse() // oldest→newest for sparklines
    const vapi = splitFor('vapi'), elevenlabs = splitFor('elevenlabs'), sarvam = splitFor('sarvam')

    // Per-language comparison — Hindi vs English vs Punjabi latency, over the
    // current engine filter (all engines when eng==='all'), ignoring the language
    // filter so all three always show side by side. Last-N applied per language.
    const engBase = calls.filter((c) => (showWeb || c.source === 'phone') && (eng === 'all' || c.engine === eng) && isQualified(c))
    const langRows = langsPresent
      .map((l) => {
        const list = engBase.filter((c) => c.language === l)
        const capped = limit === 'all' ? list : list.slice(0, limit)
        return { lang: l, split: aggregateSplit(capped) }
      })
      .filter((r): r is { lang: string; split: EngineSplit } => !!r.split)

    // Transparency: how many calls fed the aggregate vs were excluded as too
    // short/no-turn, so the "faster" numbers can't hide a pile of dropped calls.
    const engBaseAll = calls.filter((c) => (showWeb || c.source === 'phone') && (eng === 'all' || c.engine === eng))
    const qualifiedCount = engBaseAll.filter(isQualified).length
    const excludedCount = engBaseAll.length - qualifiedCount
    // headline insight: fastest engine among those with latency data, with the
    // margin over the runner-up.
    let insight: { text: string; tone: string } | null = null
    const ranked = ([['vapi', vapi], ['elevenlabs', elevenlabs], ['sarvam', sarvam]] as const)
      .filter((e): e is [EngineId, EngineSplit] => e[1] != null && e[1].turnAvg != null)
      .sort((a, b) => a[1].turnAvg! - b[1].turnAvg!)
    if (ranked.length >= 2) {
      const [winId, win] = ranked[0]
      const runnerUp = ranked[1][1]
      const meta = ENGINE_META[winId]
      insight = { text: `${meta.label} is ${runnerUp.turnAvg! - win.turnAvg!} ms faster per turn`, tone: meta.tone }
    }
    return {
      phone: phones.length,
      webCount: calls.filter((c) => c.source === 'web').length,
      totalSpend: visible.reduce((a, c) => a + (c.cost || 0), 0),
      totalMinutes: visible.reduce((a, c) => a + (c.durationSec || 0), 0) / 60,
      sparkTurns: phones.map((c) => c.turns || 0),
      sparkMins: phones.map((c) => c.durationSec || 0),
      sparkCost: phones.map((c) => c.cost || 0),
      vapi, elevenlabs, sarvam, insight, langRows, qualifiedCount, excludedCount,
    }
  }, [visible, calls])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-primary)' }}>
      {/* ── fixed header: V1/V2/V3 pivot, then stats | per-engine comparison ── */}
      <div style={{ flexShrink: 0, padding: '12px 18px 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* PRIMARY PIVOT — the whole eval reorganizes around this */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 11, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
            {ENG_TABS.map((t) => {
              const on = eng === t.id
              return (
                <button key={t.id} onClick={() => setEng(t.id)} style={{
                  fontSize: 13.5, fontWeight: 800, padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: on ? (t.id === 'all' ? 'var(--bg-primary)' : `${t.color}22`) : 'transparent',
                  color: on ? t.color : 'var(--text-secondary)', boxShadow: on ? '0 1px 3px rgba(0,0,0,.18)' : 'none',
                }}>{t.label}</button>
              )
            })}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{eng === 'all' ? 'comparing all engines' : `${ENG_TABS.find((t) => t.id === eng)!.label} only`}</span>
        </div>

        {/* stats + controls row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <StatCard label="Calls" value={view.phone} spark={view.sparkTurns} sparkColor="#60a5fa" />
              <StatCard label="Mins" value={view.totalMinutes.toFixed(1)} spark={view.sparkMins} sparkColor="#a78bfa" />
              <StatCard label="Spend" value={`$${view.totalSpend.toFixed(2)}`} spark={view.sparkCost} sparkColor="#34d399" />
            </div>
            {langsPresent.length > 0 && (
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginRight: 2 }}>Language</span>
                {['all', ...langsPresent].map((L) => {
                  const on = lang === L
                  return (
                    <button key={L} onClick={() => setLang(L)} style={{
                      fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
                      border: `1px solid ${on ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                      background: on ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                      color: on ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    }}>{L === 'all' ? 'All' : (LANG_LABEL[L] || L)}</button>
                  )
                })}
              </div>
            )}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
              {([5, 10, 'all'] as const).map((n) => {
                const on = limit === n
                return (
                  <button key={n} onClick={() => setLimit(n)} style={{
                    fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: on ? 'var(--accent-subtle)' : 'transparent', color: on ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}>{n === 'all' ? 'All' : `Last ${n}`}</button>
                )
              })}
            </div>
            {limit !== 'all' && shown.length > visible.length && (
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{visible.length} of {shown.length}</span>
            )}
            {view.webCount > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={showWeb} onChange={(e) => setShowWeb(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
                web tests ({view.webCount})
              </label>
            )}
            <button onClick={load} disabled={loading} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 9,
              border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: loading ? 'default' : 'pointer',
            }}>
              <MdRefresh size={15} /> {loading ? '…' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* engine comparison — full-width block, V1/V2/V3 rows left-aligned into columns */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start' }}>
          {view.vapi && <SplitRow engine="vapi" split={view.vapi} />}
          {view.elevenlabs && <SplitRow engine="elevenlabs" split={view.elevenlabs} />}
          {view.sarvam
            ? <SplitRow engine="sarvam" split={view.sarvam} />
            : (eng === 'all' || eng === 'sarvam') && <V3Row />}
          {view.insight && eng === 'all' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: view.insight.tone, background: `${view.insight.tone}18`, border: `1px solid ${view.insight.tone}44`, borderRadius: 999, padding: '4px 11px' }}>
              <MdBolt size={13} /> {view.insight.text}
            </span>
          )}
          {eng !== 'sarvam' && !view.vapi && !view.elevenlabs && visible.length > 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>No latency metrics for this filter.</span>
          )}
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
            Aggregates count only real conversations — &gt;{MIN_QUAL_SECS}s &amp; &gt;{MIN_QUAL_TURNS} turn
            {' · '}{view.qualifiedCount} counted{view.excludedCount > 0 ? `, ${view.excludedCount} short call${view.excludedCount === 1 ? '' : 's'} excluded` : ''}
          </span>
        </div>

        {/* per-language comparison — Hindi vs English vs Punjabi latency */}
        {view.langRows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start', marginTop: 4, paddingTop: 10, borderTop: '1px dashed var(--border-primary)' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              By language{eng !== 'all' ? ` · ${ENG_TABS.find((t) => t.id === eng)!.label}` : ''}
            </span>
            {view.langRows.map((r) => (
              <LangSplitRow key={r.lang} lang={r.lang} split={r.split} netLabel={eng === 'sarvam' ? 'Vobiz' : 'Network'} />
            ))}
          </div>
        )}
      </div>

      {/* ── scrollable list ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 18px 18px' }}>
        {loading && calls.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>}
        {!loading && !configured && (
          <div style={{ padding: 24, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)', fontSize: 13 }}>
            Voice isn&apos;t configured for this brand (no <code>VAPI_ASSISTANT_ID</code> / <code>VAPI_PRIVATE_API_KEY</code>).
          </div>
        )}
        {!loading && configured && shown.length === 0 && !err && (
          <div style={{ padding: 24, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)', fontSize: 13 }}>
            {eng === 'sarvam'
              ? 'No V3 calls logged yet. Place a V3 test call from the Voice agent tab — telemetry lands here at hangup.'
              : 'No calls yet. Place a test call from the Voice agent tab and refresh.'}
          </div>
        )}
        {err && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', fontSize: 12.5, marginBottom: 12 }}>{err}</div>}

        {shown.length > 0 && (
          <div style={{ border: '1px solid var(--border-primary)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '9px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: 'var(--text-muted)', textTransform: 'uppercase', position: 'sticky', top: 0, zIndex: 1 }}>
              <span>When</span><span>Callee</span><span>Dur</span><span>Turns</span><span>Wait</span><span>Turn avg</span><span>Worst</span><span>Cost</span><span />
            </div>
            {visible.map((c) => {
              const isOpen = open === c.id
              return (
                <div key={c.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <button onClick={() => setOpen(isOpen ? null : c.id)} style={{
                    width: '100%', display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '10px 14px',
                    background: isOpen ? 'var(--bg-secondary)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', alignItems: 'center',
                    fontSize: 12, color: 'var(--text-primary)',
                  }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{fmtWhen(c.startedAt || c.createdAt)}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <EngineBadge engine={c.engine} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                        {c.callerName
                          ? <><b style={{ fontWeight: 700 }}>{c.callerName}</b> <span style={{ color: 'var(--text-muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{c.callee}</span></>
                          : <b style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.callee}</b>}
                      </span>
                      {c.source === 'web' && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: 'var(--bg-tertiary)', color: 'var(--text-muted)', flexShrink: 0 }}>WEB</span>}
                      {(() => {
                        const f = failReason(c)
                        return f ? (
                          <span title={c.endedReason || 'Call did not connect'} style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: f.color, background: `${f.color}1f`, border: `1px solid ${f.color}55`, flexShrink: 0, whiteSpace: 'nowrap' }}>
                            {f.label}
                          </span>
                        ) : null
                      })()}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtDur(c.durationSec)}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{c.turns || '—'}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{c.waitSec != null ? `${c.waitSec}s` : '—'}</span>
                    <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: latColor(c.perf?.turnAvg ?? null) }}>{M(c.perf?.turnAvg ?? null)}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: latColor(c.perf?.worst ?? null) }}>{M(c.perf?.worst ?? null)}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCost(c.cost)}</span>
                    <span style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'flex-end' }}>{isOpen ? <MdExpandLess size={16} /> : <MdExpandMore size={16} />}</span>
                  </button>

                  {isOpen && (
                    <div style={{ padding: '4px 16px 16px', background: 'var(--bg-secondary)' }}>
                      {/* per-call latency split */}
                      {c.perf ? (
                        <>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: 'var(--text-muted)', textTransform: 'uppercase', margin: '4px 0 8px' }}>
                            Latency split · avg per turn (total {M(c.perf.turnAvg)})
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                            <StageChip label="STT" value={c.perf.stages.transcriber} where="outside" />
                            <StageChip label="LLM" value={c.perf.stages.model} where="outside" />
                            <StageChip label="Voice" value={c.perf.stages.voice} where="outside" />
                            <StageChip label="Endpoint" value={c.perf.stages.endpointing} where="inside" />
                            <StageChip label={c.engine === 'sarvam' ? 'Vobiz' : 'Network'} value={c.perf.stages.transport} where="network" />
                          </div>
                          {/* per-turn totals — coloured RELATIVE to this call:
                              fastest turn green, slowest red, the rest amber, so the
                              worst turn jumps out at a glance. */}
                          {c.perf!.turnsDetail.length > 0 && (() => {
                            const totals = c.perf!.turnsDetail.map((t) => t.total)
                            const mn = Math.min(...totals), mx = Math.max(...totals)
                            const relColor = (v: number) => (mx === mn ? '#22c55e' : v === mn ? '#22c55e' : v === mx ? '#ef4444' : '#eab308')
                            return (
                              <div style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                                  Each turn ({totals.length}) · fastest {mn} → slowest {mx} ms
                                </div>
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                  {c.perf!.turnsDetail.map((t, i) => {
                                    const col = relColor(t.total)
                                    return (
                                      <span key={i} title={`STT ${t.transcriber} · LLM ${t.model} · Voice ${t.voice} · Endpoint ${t.endpointing} ms`}
                                        style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 7, background: `${col}14`, border: `1px solid ${col}66`, color: col, fontVariantNumeric: 'tabular-nums', cursor: 'help' }}>
                                        {t.total}
                                      </span>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })()}
                        </>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 12px' }}>
                          {c.source === 'web' ? 'Browser test — no phone-call latency metrics.' : 'No latency metrics for this call.'}
                        </div>
                      )}

                      {/* connector + ended + cost */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        {([['STT', c.connector.stt], ['Model', c.connector.model], ['TTS', c.connector.tts], ['Ended', fmtEnded(c.endedReason)]] as const).map(([k, v]) => (
                          <span key={k} style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
                            <span style={{ color: 'var(--text-muted)' }}>{k}:</span> {v || '—'}
                          </span>
                        ))}
                      </div>
                      {c.costBreakdown && (
                        <div style={{ display: 'flex', gap: 14, fontSize: 12, marginBottom: c.summary ? 10 : 0 }}>
                          {([['stt', c.costBreakdown.stt], ['llm', c.costBreakdown.llm], ['tts', c.costBreakdown.tts], ['vapi', c.costBreakdown.vapi]] as const).map(([k, v]) => (
                            <div key={k}><span style={{ color: 'var(--text-muted)', fontSize: 10.5, textTransform: 'uppercase' }}>{k} </span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{v == null ? '—' : `$${Number(v).toFixed(3)}`}</span></div>
                          ))}
                        </div>
                      )}
                      {c.summary && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 760 }}>{c.summary}</div>
                      )}
                      {c.recordingUrl && (
                        <a href={c.recordingUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 11.5, fontWeight: 700, color: 'var(--accent-primary)' }}>▶ Recording</a>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
