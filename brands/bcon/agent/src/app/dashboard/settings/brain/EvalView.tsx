'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EvalView — every message a lead can ever receive, by permutation.
//  1. Journey simulator: pick Source × What happened → the exact composed path,
//     each step with its real body ({{vars}} rendered as chips) + buttons.
//  2. The full matrix: all journeys, all steps, all templates.
//  3. The gates every send passes through.
//  4. Test bench: fire any engaged-journey stage to YOUR WhatsApp (never a lead).
// Display truth = configs/journeys.ts (mirrors the worker's routing).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, Fragment } from 'react'
import { MdSend, MdCheckCircle, MdErrorOutline, MdWhatsapp, MdScience, MdAltRoute, MdShield } from 'react-icons/md'
import { JOURNEYS, GATES, TEMPLATE_BUTTONS, bodyFor, type Journey, type JourneyStep } from '@/configs/journeys'

// Render {{variable}} slots as visible chips.
function varChips(text: string) {
  return text.split(/(\{\{\s*[\w]+\s*\}\})/g).map((p, i) => {
    const m = p.match(/^\{\{\s*([\w]+)\s*\}\}$/)
    if (!m) return <Fragment key={i}>{p}</Fragment>
    const label = m[1].replace(/^customer_name$/, 'name').replace(/^service_interest$/, 'goal').replace(/^brand_name$/, 'brand').replace(/^business_name$/, 'brand').replace(/^booking_time$/, 'time').replace(/^pain_point$/, 'challenge').replace(/^probe_question$/, 'probe')
    return (
      <span key={i} style={{
        display: 'inline-block', padding: '0 5px', margin: '0 1px', borderRadius: 5, fontSize: '0.88em',
        fontWeight: 700, color: 'var(--accent-primary)', background: 'var(--accent-subtle)',
        border: '1px solid var(--accent-primary)', lineHeight: 1.45, whiteSpace: 'nowrap',
      }}>{label}</span>
    )
  })
}

function StepCard({ step, tone, idx }: { step: JourneyStep; tone: string; idx: number }) {
  const body = step.freeform || bodyFor(step.template)
  const buttons = step.template ? TEMPLATE_BUTTONS[step.template] : undefined
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ width: 22, height: 22, borderRadius: 999, background: tone, color: '#0a0a0a', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</span>
        <span style={{ flex: 1, width: 2, background: 'var(--border-primary)', marginTop: 4 }} />
      </div>
      <div style={{ flex: 1, paddingBottom: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{step.label}</span>
          <span style={{ fontSize: 10.5, color: tone, fontWeight: 700 }}>{step.delay}</span>
          {step.template && <span style={{ fontSize: 9.5, fontFamily: 'ui-monospace, monospace', color: 'var(--text-muted)' }}>{step.template}</span>}
          {!step.template && !step.freeform && <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>no message</span>}
          {!step.template && step.freeform && <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>free-form (24h window)</span>}
        </div>
        {body && (
          <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: '2px 10px 10px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {varChips(body)}
          </div>
        )}
        {buttons && buttons.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {buttons.map((b, i) => (
              <span key={i} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 999, border: `1px solid ${tone}55`, color: tone, background: `${tone}12`, fontWeight: 600 }}>{b}</span>
            ))}
          </div>
        )}
        {step.note && <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--text-muted)' }}>{step.note}</div>}
      </div>
    </div>
  )
}

const OUTCOMES: Array<{ id: string; label: string }> = [
  { id: 'ghost', label: 'Never replied' },
  { id: 'nudge', label: 'Went quiet mid-chat' },
  { id: 'engaged', label: 'Chatting, not booked' },
  { id: 'rnr', label: 'Call rang, no answer' },
  { id: 'demo', label: 'Demo / proposal done' },
  { id: 'booked', label: 'Booked the call' },
  { id: 'longtail', label: 'Faded — long-tail' },
]

export default function EvalView() {
  const entry = JOURNEYS.find((j) => j.id === 'entry')!
  const [source, setSource] = useState(0)
  const [outcome, setOutcome] = useState('ghost')
  const [openMatrix, setOpenMatrix] = useState<string | null>(null)

  const totalSteps = JOURNEYS.reduce((a, j) => a + j.steps.length, 0)
  const templates = new Set<string>()
  JOURNEYS.forEach((j) => j.steps.forEach((s) => s.template && templates.add(s.template)))
  const permutations = entry.steps.length * OUTCOMES.length

  const chosenJourney = JOURNEYS.find((j) => j.id === outcome)!
  const entryStep = entry.steps[source]

  return (
    <div style={{ height: '100%', overflowY: 'auto', borderTop: '1px solid var(--border-primary)', padding: '16px 18px 28px' }}>
      {/* coverage stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          [String(permutations), 'source × outcome paths'],
          [String(JOURNEYS.length), 'journeys'],
          [String(totalSteps), 'distinct steps'],
          [String(templates.size), 'Meta templates'],
          [String(GATES.length), 'gates on every send'],
        ].map(([v, l]) => (
          <div key={l} style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)' }}>{v}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* ── 1 · Journey simulator ── */}
      <div style={{ padding: 16, borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <MdAltRoute size={17} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: 14, fontWeight: 800 }}>Journey simulator</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>pick a permutation, see every message that fires</span>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 5 }}>SOURCE</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {entry.steps.map((s, i) => (
                <button key={s.label} onClick={() => setSource(i)} style={{
                  fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${i === source ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  background: i === source ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                  color: i === source ? 'var(--accent-primary)' : 'var(--text-secondary)',
                }}>{s.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 5 }}>THEN WHAT HAPPENED</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {OUTCOMES.map((o) => (
                <button key={o.id} onClick={() => setOutcome(o.id)} style={{
                  fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${o.id === outcome ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  background: o.id === outcome ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                  color: o.id === outcome ? 'var(--accent-primary)' : 'var(--text-secondary)',
                }}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '4px 0 0' }}>
          <StepCard step={{ ...entryStep, label: `Entry — ${entryStep.label}` }} tone="#8B5CF6" idx={0} />
          <div style={{ margin: '0 0 12px 32px', fontSize: 10.5, color: chosenJourney.tone, fontWeight: 700 }}>
            ↓ {chosenJourney.trigger} · {chosenJourney.stop}
          </div>
          {chosenJourney.steps.map((s, i) => (
            <StepCard key={`${chosenJourney.id}-${i}`} step={s} tone={chosenJourney.tone} idx={i + 1} />
          ))}
        </div>
      </div>

      {/* ── 2 · The full matrix ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <MdScience size={17} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: 14, fontWeight: 800 }}>Every message in the system</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>click a journey to expand its steps</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 10 }}>
          {JOURNEYS.map((j: Journey) => {
            const open = openMatrix === j.id
            return (
              <div key={j.id} style={{ borderRadius: 12, border: `1px solid ${open ? j.tone : 'var(--border-primary)'}`, background: 'var(--bg-secondary)', overflow: 'hidden', gridColumn: open ? '1 / -1' : undefined }}>
                <button onClick={() => setOpenMatrix(open ? null : j.id)} style={{ width: '100%', textAlign: 'left', padding: '11px 13px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{j.title}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: j.tone }}>{j.steps.length} steps {open ? '▴' : '▾'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>{j.who}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>stops: {j.stop}</div>
                </button>
                {open && (
                  <div style={{ padding: '4px 14px 8px' }}>
                    {j.steps.map((s, i) => <StepCard key={i} step={s} tone={j.tone} idx={i} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 3 · Gates ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <MdShield size={17} style={{ color: '#ec4899' }} />
          <span style={{ fontSize: 14, fontWeight: 800 }}>Gates on every single send</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
          {GATES.map((g) => (
            <div key={g.label} style={{ padding: '9px 12px', borderRadius: 10, background: 'rgba(236,72,153,.05)', border: '1px solid rgba(236,72,153,.25)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: '#ec4899' }}>{g.label}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>{g.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4 · Test bench ── */}
      <StageTestBench />
    </div>
  )
}

// ── Test bench — fire the engaged-journey stages at YOUR test number ─────────
type TestStage = { id: string; label: string; when: string; body: string; buttons: string[] }

function StageTestBench() {
  const [stages, setStages] = useState<TestStage[]>([])
  const [testNumber, setTestNumber] = useState('')
  const [status, setStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({})
  const [errorMsg, setErrorMsg] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/dashboard/brain/test-stage')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.stages)) setStages(d.stages)
        if (d?.testNumber) setTestNumber(d.testNumber)
      })
      .catch(() => {})
  }, [])

  const send = async (id: string) => {
    setStatus((s) => ({ ...s, [id]: 'sending' }))
    try {
      const r = await fetch('/api/dashboard/brain/test-stage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: id }),
      })
      const d = await r.json()
      if (d?.success) setStatus((s) => ({ ...s, [id]: 'sent' }))
      else { setStatus((s) => ({ ...s, [id]: 'error' })); setErrorMsg((m) => ({ ...m, [id]: d?.error || 'Send failed' })) }
    } catch (e: any) {
      setStatus((s) => ({ ...s, [id]: 'error' })); setErrorMsg((m) => ({ ...m, [id]: e?.message || 'Send failed' }))
    }
  }

  if (!stages.length) return null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <MdWhatsapp size={16} style={{ color: '#22c55e' }} />
        <span style={{ fontSize: 14, fontWeight: 800 }}>Live test bench</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          fires the real message to your test number {testNumber || '…'} — your chat only, never a real lead
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 10 }}>
        {stages.map((s) => {
          const st = status[s.id] || 'idle'
          return (
            <div key={s.id} style={{ border: '1px solid var(--border-primary)', borderRadius: 10, padding: '10px 11px', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{s.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.when}</span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{s.body}</div>
              {s.buttons?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {s.buttons.map((b, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(99,102,241,.3)', color: 'rgba(139,142,255,.95)', background: 'rgba(99,102,241,.08)' }}>{b}</span>
                  ))}
                </div>
              )}
              <button
                onClick={() => send(s.id)} disabled={st === 'sending'}
                style={{
                  marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 700,
                  padding: '7px 10px', borderRadius: 8, border: 'none', cursor: st === 'sending' ? 'default' : 'pointer',
                  background: st === 'sent' ? 'rgba(34,197,94,.15)' : st === 'error' ? 'rgba(239,68,68,.15)' : '#22c55e',
                  color: st === 'sent' ? '#22c55e' : st === 'error' ? '#ef4444' : '#fff', opacity: st === 'sending' ? 0.6 : 1,
                }}
              >
                {st === 'sent' ? (<><MdCheckCircle size={14} /> Sent to your WhatsApp</>)
                  : st === 'error' ? (<><MdErrorOutline size={14} /> Failed — retry</>)
                  : st === 'sending' ? ('Sending…')
                  : (<><MdSend size={13} /> Send to my WhatsApp</>)}
              </button>
              {st === 'error' && errorMsg[s.id] && (
                <div style={{ fontSize: 10, color: '#ef4444' }} title={errorMsg[s.id]}>{String(errorMsg[s.id]).slice(0, 90)}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
