'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CallsView — the voice bench. Every call, with Vapi's REAL per-stage latency:
// who is doing the waiting — the providers (STT/LLM/TTS, "outside") vs our own
// endpointing config ("inside") vs the network round-trip. Everything in ms.
// Fills the viewport; only the call list scrolls. Web-test rows hidden by default.
// Data: /api/dashboard/brain/calls (Vapi, scoped to the brand's assistant).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { MdRefresh, MdExpandMore, MdExpandLess } from 'react-icons/md'

type Stages = { transcriber: number; model: number; voice: number; endpointing: number; transport: number }
type Perf = {
  turnAvg: number | null; worst: number | null; best: number | null; stages: Stages
  turnsDetail: Array<{ total: number; transcriber: number; model: number; voice: number; endpointing: number }>
}
type Call = {
  id: string; source: 'web' | 'phone'; engine: 'vapi' | 'elevenlabs'; callerName: string | null; callee: string
  createdAt: string | null; startedAt: string | null
  durationSec: number | null; waitSec: number | null; cost: number | null
  costBreakdown: { stt: number | null; llm: number | null; tts: number | null; vapi: number | null; total: number | null } | null
  status: string | null; endedReason: string | null; turns: number
  perf: Perf | null
  connector: { stt: string | null; model: string | null; tts: string | null }
  summary: string | null; recordingUrl: string | null
}
type EngineSplit = {
  calls: number; turnAvg: number | null
  transcriber: number | null; model: number | null; voice: number | null; endpointing: number | null; transport: number | null
}
type Agg = {
  total: number; phone: number; web: number; totalSpend: number; totalMinutes: number
  vapi: EngineSplit | null; elevenlabs: EngineSplit | null
}

// Colour a latency by magnitude. Sub-second good, ~1.5s borderline, beyond = stall.
function latColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)'
  if (v < 800) return '#22c55e'
  if (v < 1500) return '#eab308'
  return '#ef4444'
}
const M = (v: number | null) => (v == null ? '—' : `${v} ms`)
const fmtDur = (s: number | null) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
const fmtCost = (c: number | null) => (c == null ? '—' : `$${c.toFixed(3)}`)
const fmtWhen = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
}
const fmtEnded = (r: string | null) => (r ? r.replace(/-/g, ' ') : '—')

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

// A headline count/number card (calls, mins, spend, turn avg).
function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div style={{ padding: '8px 16px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', minWidth: 72 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: tone || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
    </div>
  )
}

// Which engine placed the call. V1 = Vapi pipeline (Azure STT · GPT · 11Labs voice),
// V2 = ElevenLabs end-to-end. Open a call to see each engine's actual stack.
function EngineBadge({ engine }: { engine: 'vapi' | 'elevenlabs' }) {
  const is2 = engine === 'elevenlabs'
  const tone = is2 ? '#f59e0b' : '#14b8a6'
  return (
    <span title={is2 ? 'V2 · ElevenLabs end-to-end' : 'V1 · Vapi pipeline (Azure · GPT · 11Labs voice)'} style={{
      fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, padding: '2px 8px', borderRadius: 999, flexShrink: 0,
      color: tone, background: `${tone}1f`, border: `1px solid ${tone}55`,
    }}>
      {is2 ? 'V2' : 'V1'}
    </span>
  )
}

// One engine's latency split as a single comparison row (Vapi shows endpointing +
// network; ElevenLabs manages turn-taking itself so it has neither).
function SplitRow({ engine, split }: { engine: 'vapi' | 'elevenlabs'; split: EngineSplit }) {
  const is11 = engine === 'elevenlabs'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <EngineBadge engine={engine} />
      <StageChip label="STT" value={split.transcriber} where="outside" />
      <StageChip label="LLM" value={split.model} where="outside" />
      <StageChip label="Voice" value={split.voice} where="outside" />
      {!is11 && <StageChip label="Endpoint" value={split.endpointing} where="inside" />}
      {!is11 && <StageChip label="Network" value={split.transport} where="network" />}
      <div style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', minWidth: 82 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Turn avg</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: latColor(split.turnAvg), fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{M(split.turnAvg)}</div>
      </div>
    </div>
  )
}

const GRID = '132px 1fr 56px 48px 46px 78px 78px 66px 26px'

export default function CallsView() {
  const [calls, setCalls] = useState<Call[]>([])
  const [agg, setAgg] = useState<Agg | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [configured, setConfigured] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [showWeb, setShowWeb] = useState(false)

  const load = async () => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/brain/calls', { cache: 'no-store' })
      const d = await r.json()
      setCalls(Array.isArray(d.calls) ? d.calls : [])
      setAgg(d.agg || null)
      setConfigured(d.configured !== false)
      if (d.error) setErr(d.error)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load calls')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => calls.filter((c) => showWeb || c.source === 'phone'), [calls, showWeb])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-primary)' }}>
      {/* ── fixed header: stats left · per-engine latency comparison right ── */}
      <div style={{ flexShrink: 0, padding: '12px 18px 10px', display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        {/* headline stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StatCard label="Calls" value={agg?.phone ?? 0} />
          <StatCard label="Mins" value={agg?.totalMinutes ?? 0} />
          <StatCard label="Spend" value={`$${(agg?.totalSpend ?? 0).toFixed(2)}`} />
        </div>

        {/* right column: controls, then a comparison row per engine */}
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {(agg?.web ?? 0) > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={showWeb} onChange={(e) => setShowWeb(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
                web tests ({agg?.web})
              </label>
            )}
            <button onClick={load} disabled={loading} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 9,
              border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: loading ? 'default' : 'pointer',
            }}>
              <MdRefresh size={15} /> {loading ? '…' : 'Refresh'}
            </button>
          </div>
          {agg?.vapi && <SplitRow engine="vapi" split={agg.vapi} />}
          {agg?.elevenlabs && <SplitRow engine="elevenlabs" split={agg.elevenlabs} />}
        </div>
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
            No calls yet. Place a test call from the Voice agent tab and refresh.
          </div>
        )}
        {err && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', fontSize: 12.5, marginBottom: 12 }}>{err}</div>}

        {shown.length > 0 && (
          <div style={{ border: '1px solid var(--border-primary)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '9px 14px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)', fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: 'var(--text-muted)', textTransform: 'uppercase', position: 'sticky', top: 0, zIndex: 1 }}>
              <span>When</span><span>Callee</span><span>Dur</span><span>Turns</span><span>Wait</span><span>Turn avg</span><span>Worst</span><span>Cost</span><span />
            </div>
            {shown.map((c) => {
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
                            <StageChip label="Network" value={c.perf.stages.transport} where="network" />
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
