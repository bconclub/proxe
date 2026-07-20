'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LearningView - the recursive-learning readout, with real accounting:
//   · the loop itself: INGEST → REFLECT → ADJUST → VERIFY (live numbers on each)
//   · what it ingests (leads scanned, chats, notes, decisions - today + total)
//   · what its thinking costs (token_usage 'brain' bucket: today / 7d / all-time)
//   · the Sonnet-5 reflection (manual) + the measured token cost of THAT call
//   · honesty panel: which loop stages are live vs still manual
//   · AI-vs-human decision match rate (the verify signal)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, type ReactNode } from 'react'
import { MdPsychology, MdAutoAwesome, MdRefresh, MdMemory, MdToken, MdLoop } from 'react-icons/md'

type Bucket = { input_tokens: number; output_tokens: number; calls: number; cost_usd: number }
type Stats = {
  today_ist: string
  sources: { leads_scanned: number; chats_today: number; messages_today: number; decisions_today: number; decisions_total: number; notes_today: number; notes_total: number }
  usage: { brain_today: Bucket; brain_7d: Bucket; brain_all_time: Bucket; all_categories_today: Bucket }
}
type ChatRef = { n: number; lead_id: string | null; name: string }
type Reflection = {
  chats_analyzed: number
  sources?: Stats['sources']
  reflection_usage?: { input_tokens: number; output_tokens: number; cost_usd: number }
  chat_map?: ChatRef[]
  biggest_learning: string | null
  understanding_shifts: string[]
  objection_patterns: string[]
  recursive_actions?: string[]
  note?: string
  generated_at?: string
}

// Turn every "Chat N" reference the reflection cites into a clickable link that
// opens that exact conversation in the inbox - so the reviewer can jump straight
// to the chat the learning came from instead of guessing which one "Chat 7" is.
function linkifyChats(text: string, chatMap?: ChatRef[]): ReactNode {
  if (!text) return text
  const parts = text.split(/(Chat\s+\d+)/g)
  return parts.map((part, i) => {
    const m = part.match(/^Chat\s+(\d+)$/)
    if (!m) return <span key={i}>{part}</span>
    const n = parseInt(m[1], 10)
    const ref = chatMap?.find((c) => c.n === n)
    if (!ref?.lead_id) return <span key={i}>{part}</span>
    return (
      <a
        key={i}
        href={`/dashboard/inbox?lead=${ref.lead_id}`}
        title={`Open ${ref.name}'s conversation`}
        style={{ color: 'var(--accent-primary)', fontWeight: 600, textDecoration: 'none', borderBottom: '1px dashed var(--accent-primary)' }}
      >
        {part}
      </a>
    )
  })
}
type LearnData = {
  total: number
  matchRate: number
  byAction: Record<string, number>
  byStageAction: Array<{ stage: string; count: number; top_action: string; top_count: number }>
  recent: Array<{ lead_name: string; ai_action: string; human_action: string; matched: boolean; reason: string | null; stage: string | null; intent: string | null }>
}

const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
const usd = (n: number) => n < 0.01 && n > 0 ? '<$0.01' : `$${n.toFixed(2)}`

export default function LearningView() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [decisions, setDecisions] = useState<LearnData | null>(null)
  const [reflection, setReflection] = useState<Reflection | null>(null)
  const [reflecting, setReflecting] = useState(false)
  const [reflectErr, setReflectErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/brain/learning-summary').then((r) => r.json()).then((d) => { if (!d?.error) setStats(d) }).catch(() => {})
    fetch('/api/dashboard/brain/decisions').then((r) => r.json()).then((d) => { if (!d?.error) setDecisions(d) }).catch(() => {})
  }, [])

  const reflect = async () => {
    setReflecting(true); setReflectErr(null)
    try {
      const r = await fetch('/api/dashboard/brain/learning-summary', { method: 'POST' })
      const d = await r.json()
      if (d?.error) setReflectErr(d.error)
      else setReflection(d)
    } catch (e: any) { setReflectErr(e?.message || 'Failed') }
    finally { setReflecting(false) }
  }

  const s = stats?.sources
  const u = stats?.usage
  const matchRate = decisions?.matchRate ?? null

  // The four loop stages with their live numbers.
  const LOOP_STAGES = [
    { id: 'ingest', label: 'INGEST', color: '#22c55e', lines: [`${s?.chats_today ?? '-'} chats today`, `${s?.notes_today ?? '-'} notes · ${s?.decisions_today ?? '-'} decisions`, `${s?.leads_scanned ?? '-'} leads scanned`] },
    { id: 'reflect', label: 'REFLECT', color: '#8B5CF6', lines: ['Sonnet 5, on demand', reflection?.generated_at ? `last: ${new Date(reflection.generated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : 'not run today', u ? `${u.brain_today.calls} brain calls today` : ''] },
    { id: 'adjust', label: 'ADJUST', color: '#f59e0b', lines: ['interest labels cached', 'cadence by temperature', 'nudge timing by read receipts'] },
    { id: 'verify', label: 'VERIFY', color: '#3b82f6', lines: [matchRate != null ? `${matchRate}% AI matched human` : '- match rate', `${decisions?.total ?? '-'} decisions logged`] },
  ]

  return (
    <div style={{ height: '100%', overflowY: 'auto', borderTop: '1px solid var(--border-primary)', padding: '16px 18px 28px' }}>
      <style>{`
        @keyframes lvOrbit { from { stroke-dashoffset: 640; } to { stroke-dashoffset: 0; } }
        @keyframes lvPulse { 0%,100% { opacity: .75; } 50% { opacity: 1; } }
      `}</style>

      {/* ── The recursive loop ── */}
      <div style={{ padding: 16, borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <MdLoop size={17} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: 14, fontWeight: 800 }}>The recursive loop</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>every pass feeds the next - live numbers on each stage</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, position: 'relative' }}>
          {LOOP_STAGES.map((st, i) => (
            <div key={st.id} style={{ position: 'relative', padding: '12px 13px', borderRadius: 12, background: 'var(--bg-primary)', border: `1.5px solid ${st.color}55`, animation: 'lvPulse 3.2s ease-in-out infinite', animationDelay: `${i * 0.8}s` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: st.color }}>{st.label}</span>
                <span style={{ fontSize: 13, color: st.color }}>{i < 3 ? '→' : '↺'}</span>
              </div>
              {st.lines.filter(Boolean).map((l, j) => (
                <div key={j} style={{ fontSize: 11.5, color: j === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: j === 0 ? 700 : 500, lineHeight: 1.5 }}>{l}</div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 10.5, color: 'var(--text-muted)' }}>
          Live today: interest caching, temperature cadences, read-receipt nudge timing, decision logging. Still manual: the reflection below does not yet rewrite prompts or sequences by itself - its "what to do differently" needs your sign-off.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 16, marginBottom: 16 }}>
        {/* ── What it ingests ── */}
        <div style={{ padding: 16, borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <MdMemory size={16} style={{ color: '#22c55e' }} />
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>What it reads</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>refreshes on load · {stats?.today_ist || ''}</span>
          </div>
          {!s ? <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading…</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {([
                ['Leads scanned (full context)', s.leads_scanned, null],
                ['Chats today', s.chats_today, `${s.messages_today} messages`],
                ['Team notes', s.notes_total, `${s.notes_today} today`],
                ['Human decisions', s.decisions_total, `${s.decisions_today} today`],
              ] as Array<[string, number, string | null]>).map(([label, v, sub]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border-primary)', paddingBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>
                    {fmt(v)}{sub && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 6 }}>{sub}</span>}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                Yes - every lead's chats, admin notes and decision log are in scope on each reflection.
              </div>
            </div>
          )}
        </div>

        {/* ── Token meter ── */}
        <div style={{ padding: 16, borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <MdToken size={16} style={{ color: '#f59e0b' }} />
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>What thinking costs</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>brain reasoning bucket</span>
          </div>
          {!u ? <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading…</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {([
                ['Today', u.brain_today],
                ['Last 7 days', u.brain_7d],
                ['All time', u.brain_all_time],
              ] as Array<[string, Bucket]>).map(([label, b]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border-primary)', paddingBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {b.calls} calls · {fmt(b.input_tokens)} in / {fmt(b.output_tokens)} out · <span style={{ color: '#f59e0b' }}>{usd(b.cost_usd)}</span>
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 2 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>All categories today</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {u.all_categories_today.calls} calls · <span style={{ color: '#f59e0b' }}>{usd(u.all_categories_today.cost_usd)}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Reflection ── */}
      <div style={{ padding: 16, borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MdAutoAwesome size={17} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: 14, fontWeight: 800 }}>What it learned today</span>
          </div>
          <button onClick={reflect} disabled={reflecting} style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '7px 12px',
            borderRadius: 8, border: '1px solid var(--accent-primary)', cursor: reflecting ? 'default' : 'pointer',
            background: 'var(--accent-subtle)', color: 'var(--accent-primary)', opacity: reflecting ? 0.6 : 1,
          }}>
            <MdRefresh size={14} /> {reflecting ? 'Reflecting…' : reflection ? 'Reflect again' : 'Reflect on today'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Sonnet 5 reads today's chats, team notes and human decisions, then reports what changed in its understanding - and what this exact reflection cost.
        </p>
        {reflectErr && <div style={{ fontSize: 12, color: '#ef4444' }}>{reflectErr}</div>}
        {!reflection && !reflectErr && !reflecting && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Tap "Reflect on today" - costs one Sonnet 5 call, measured below.</div>
        )}
        {reflection && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              read {reflection.chats_analyzed} chat{reflection.chats_analyzed === 1 ? '' : 's'}
              {reflection.sources ? ` · ${reflection.sources.notes_today} notes · ${reflection.sources.decisions_today} decisions` : ''}
              {reflection.reflection_usage ? ` - this reflection: ${fmt(reflection.reflection_usage.input_tokens)} in / ${fmt(reflection.reflection_usage.output_tokens)} out · ${usd(reflection.reflection_usage.cost_usd)}` : ''}
            </div>
            {reflection.note && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{reflection.note}</div>}
            {reflection.biggest_learning && (
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--accent-subtle)', border: '1px solid var(--accent-primary)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color: 'var(--accent-primary)', marginBottom: 4 }}>BIGGEST LEARNING</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{linkifyChats(reflection.biggest_learning, reflection.chat_map)}</div>
              </div>
            )}
            {reflection.understanding_shifts.length > 0 && (
              <ListBlock title="understanding shifts" items={reflection.understanding_shifts} chatMap={reflection.chat_map} />
            )}
            {reflection.objection_patterns.length > 0 && (
              <ListBlock title="objection patterns" items={reflection.objection_patterns} chatMap={reflection.chat_map} />
            )}
            {(reflection.recursive_actions?.length || 0) > 0 && (
              <ListBlock title="what it should now do differently" items={reflection.recursive_actions!} accent chatMap={reflection.chat_map} />
            )}
          </div>
        )}
      </div>

      {/* ── Decisions vs the human (verify) ── */}
      <div style={{ padding: 16, borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <MdPsychology size={17} style={{ color: '#3b82f6' }} />
          <span style={{ fontSize: 14, fontWeight: 800 }}>Verify - decisions vs the human</span>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Every logged call teaches it. When the match rate climbs, the brain is ready to act on its own.
        </p>
        {!decisions ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading…</div>
        ) : decisions.total === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No decisions logged yet. Log a call and pick an action to start teaching it.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <Stat label="decisions" value={String(decisions.total)} />
              <Stat label="ai matched human" value={`${decisions.matchRate}%`} accent={decisions.matchRate >= 70 ? '#22c55e' : decisions.matchRate >= 40 ? '#f59e0b' : '#ef4444'} />
              <Stat label="actions used" value={String(Object.keys(decisions.byAction).length)} />
            </div>
            {decisions.byStageAction.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>patterns by stage</div>
                {decisions.byStageAction.map((p) => (
                  <div key={p.stage} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>
                    Leads at <span style={{ color: 'var(--text-primary)' }}>{p.stage}</span> → humans mostly chose <span style={{ color: 'var(--accent-primary)' }}>{p.top_action}</span> ({p.top_count}/{p.count})
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>recent decisions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {decisions.recent.slice(0, 10).map((e, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0, background: e.matched ? '#22c55e' : '#f59e0b' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)' }}>
                      {e.lead_name} · <span style={{ color: 'var(--text-secondary)' }}>{e.stage || 'unknown'}{e.intent ? ` · ${e.intent}` : ''}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      ai proposed <span style={{ color: 'var(--text-primary)' }}>{e.ai_action}</span>, human chose <span style={{ color: e.matched ? '#22c55e' : '#f59e0b' }}>{e.human_action}</span>
                      {e.reason ? ` - "${e.reason}"` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ListBlock({ title, items, accent, chatMap }: { title: string; items: string[]; accent?: boolean; chatMap?: ChatRef[] }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: accent ? 'var(--accent-primary)' : 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: accent ? 800 : 500 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((s, i) => (
          <li key={i} style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{linkifyChats(s, chatMap)}</li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', minWidth: 90 }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent || 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  )
}
