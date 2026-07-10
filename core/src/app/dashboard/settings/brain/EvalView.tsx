'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EvalView — plain-language message studio.
// Pick how a lead arrives + what happens next → see the EXACT WhatsApp
// conversation that follows (nudges included), each message as a WhatsApp-style
// bubble with its Meta template name, real buttons, and a "Send to my WhatsApp"
// so you can feel every message on your own phone before a lead ever does.
// Bodies fill with a sample lead (toggle to see the raw variables).
// Display truth = configs/journeys.ts (mirrors the worker's routing).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, Fragment } from 'react'
import { MdSend, MdCheckCircle, MdErrorOutline, MdWhatsapp, MdShield, MdExpandMore, MdExpandLess } from 'react-icons/md'
import { JOURNEYS as BCON_JOURNEYS, GATES as BCON_GATES, TEMPLATE_BUTTONS as BCON_BUTTONS, bodyFor as bconBodyFor, type Journey, type JourneyStep } from '@/configs/journeys'
import { POP_JOURNEYS, POP_GATES, POP_TEMPLATE_BUTTONS, popBodyFor, POP_SAMPLE, POP_VAR_LABEL, POP_OUTCOMES } from '@/configs/journeys.pop'
import { LOKAZEN_JOURNEYS, LOKAZEN_GATES, LOKAZEN_TEMPLATE_BUTTONS, lokazenBodyFor, LOKAZEN_SAMPLE, LOKAZEN_VAR_LABEL, LOKAZEN_OUTCOMES } from '@/configs/journeys.lokazen'
import { getBrainConfig } from '@/lib/brain/brainConfig'
import { getBrandConfig } from '@/configs'

// Which journey set this brand evaluates. The bench is brand-specific truth,
// not one generic ladder: POP = voter grievance loop, Lokazen = CRE match +
// site-visit loop, everyone else = the BCON lead-gen ladder. Brands with
// evalJourneys 'none' never mount this view (the Eval tab is hidden).
const IS_POP = getBrainConfig().evalJourneys === 'pop'
const IS_LOKAZEN = getBrandConfig().brand === 'lokazen'
const JOURNEYS = IS_POP ? POP_JOURNEYS : IS_LOKAZEN ? LOKAZEN_JOURNEYS : BCON_JOURNEYS
const GATES = IS_POP ? POP_GATES : IS_LOKAZEN ? LOKAZEN_GATES : BCON_GATES
const TEMPLATE_BUTTONS = IS_POP ? POP_TEMPLATE_BUTTONS : IS_LOKAZEN ? LOKAZEN_TEMPLATE_BUTTONS : BCON_BUTTONS
const bodyFor = IS_POP ? popBodyFor : IS_LOKAZEN ? lokazenBodyFor : bconBodyFor

// The sample every preview is filled with — a citizen for POP, a CRE lead for
// Lokazen, a business lead for everyone else (same fixture as the test bench).
const SAMPLE: Record<string, string> = IS_POP ? POP_SAMPLE : IS_LOKAZEN ? LOKAZEN_SAMPLE : {
  customer_name: 'Shiv',
  brand_name: "Shiv's Laundry",
  business_name: "Shiv's Laundry",
  service_interest: 'AI customer acquisition',
  booking_time: 'tomorrow, 4:00 PM',
  pain_point: 'getting consistent leads',
  probe_question: "What's the one thing you want to fix first?",
}
const VAR_LABEL: Record<string, string> = IS_POP ? POP_VAR_LABEL : IS_LOKAZEN ? LOKAZEN_VAR_LABEL : {
  customer_name: 'name', brand_name: 'brand', business_name: 'brand',
  service_interest: 'goal', booking_time: 'time', pain_point: 'challenge', probe_question: 'probe',
}

/** Fill {{vars}} with sample values (plain string — used for the actual test send). */
function fillPlain(text: string): string {
  return text.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => SAMPLE[k] || k)
}

/** Render body: sample values highlighted, or raw variable chips. */
function renderBody(text: string, showVars: boolean) {
  return text.split(/(\{\{\s*[\w]+\s*\}\})/g).map((p, i) => {
    const m = p.match(/^\{\{\s*([\w]+)\s*\}\}$/)
    if (!m) return <Fragment key={i}>{p}</Fragment>
    const k = m[1]
    return (
      <span key={i} style={{
        borderBottom: '1.5px dashed var(--accent-primary)', color: showVars ? 'var(--accent-primary)' : 'var(--text-primary)',
        fontWeight: 700, padding: '0 1px',
      }} title={`variable: ${VAR_LABEL[k] || k}`}>
        {showVars ? `[${VAR_LABEL[k] || k}]` : (SAMPLE[k] || k)}
      </span>
    )
  })
}

// One message as a WhatsApp-style bubble + template chip + test-send button.
function Bubble({ step, tone, showVars, onSend, sendState }: {
  step: JourneyStep; tone: string; showVars: boolean
  onSend?: () => void; sendState?: 'idle' | 'sending' | 'sent' | 'error'
}) {
  const body = step.freeform || bodyFor(step.template)
  // Free-form steps can carry their own quick-reply chips (step.buttons);
  // template steps get theirs from the TEMPLATE_BUTTONS map.
  const buttons = step.buttons ?? (step.template ? TEMPLATE_BUTTONS[step.template] : undefined)
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
      {/* timing rail */}
      <div style={{ width: 76, flexShrink: 0, textAlign: 'right', paddingTop: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: tone }}>{step.delay}</div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.3 }}>{step.label}</div>
      </div>
      <div style={{ width: 2, background: `${tone}44`, borderRadius: 2, flexShrink: 0 }} />
      {/* the message */}
      <div style={{ flex: 1, minWidth: 0, maxWidth: 460 }}>
        {body ? (
          <>
            <div style={{
              padding: '9px 12px', borderRadius: '2px 12px 12px 12px',
              background: 'rgba(34,197,94,0.09)', border: '1px solid rgba(34,197,94,0.25)',
              fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
            }}>
              {renderBody(body, showVars)}
            </div>
            {buttons && buttons.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {buttons.map((b, i) => (
                  <span key={i} style={{ fontSize: 10.5, padding: '4px 11px', borderRadius: 999, border: '1px solid rgba(34,197,94,.4)', color: '#22c55e', background: 'rgba(34,197,94,.07)', fontWeight: 700 }}>{b}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic', paddingTop: 6 }}>{step.note || 'No message fires here.'}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          {step.template && (
            <span style={{ fontSize: 9.5, fontFamily: 'ui-monospace, monospace', color: 'var(--text-muted)', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '2px 7px' }}>
              template: {step.template}
            </span>
          )}
          {!step.template && step.freeform && (
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>free-form · AI-written, inside the 24h window</span>
          )}
          {body && onSend && (
            <button onClick={onSend} disabled={sendState === 'sending'} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800,
              padding: '4px 10px', borderRadius: 999, border: 'none', cursor: sendState === 'sending' ? 'default' : 'pointer',
              background: sendState === 'sent' ? 'rgba(34,197,94,.15)' : sendState === 'error' ? 'rgba(239,68,68,.15)' : '#22c55e',
              color: sendState === 'sent' ? '#22c55e' : sendState === 'error' ? '#ef4444' : '#fff',
              opacity: sendState === 'sending' ? 0.6 : 1,
            }}>
              {sendState === 'sent' ? (<><MdCheckCircle size={12} /> On your WhatsApp</>)
                : sendState === 'error' ? (<><MdErrorOutline size={12} /> Failed - retry</>)
                : sendState === 'sending' ? 'Sending…'
                : (<><MdWhatsapp size={12} /> Send to my WhatsApp</>)}
            </button>
          )}
        </div>
        {body && step.note && <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>{step.note}</div>}
      </div>
    </div>
  )
}

const OUTCOMES: Array<{ id: string; label: string }> = IS_POP ? POP_OUTCOMES : IS_LOKAZEN ? LOKAZEN_OUTCOMES : [
  { id: 'ghost', label: 'Never replies' },
  { id: 'nudge', label: 'Goes quiet mid-chat' },
  { id: 'engaged', label: 'Chats, does not book' },
  { id: 'rnr', label: 'Call rings, no answer' },
  { id: 'demo', label: 'Demo / proposal done' },
  { id: 'booked', label: 'Books the call' },
  { id: 'longtail', label: 'Fades out slowly' },
]

export default function EvalView() {
  const entry = JOURNEYS.find((j) => j.id === 'entry')!
  const [source, setSource] = useState(0)
  const [outcome, setOutcome] = useState('rnr')
  const [showVars, setShowVars] = useState(false)
  const [openJourney, setOpenJourney] = useState<string | null>(null)
  const [sendState, setSendState] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({})

  const chosen = JOURNEYS.find((j) => j.id === outcome)!
  const nudgeJourney = JOURNEYS.find((j) => j.id === 'nudge')!
  const entryStep = entry.steps[source]

  // Fire any step's real message at the test number (server clamps to it).
  const sendStep = async (key: string, step: JourneyStep) => {
    const raw = step.freeform || bodyFor(step.template)
    if (!raw) return
    setSendState((s) => ({ ...s, [key]: 'sending' }))
    try {
      const r = await fetch('/api/dashboard/brain/test-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: fillPlain(raw),
          buttons: (step.buttons ?? (step.template ? TEMPLATE_BUTTONS[step.template] : []) ?? []).slice(0, 3),
          label: step.label,
        }),
      })
      const d = await r.json()
      setSendState((s) => ({ ...s, [key]: d?.success ? 'sent' : 'error' }))
    } catch {
      setSendState((s) => ({ ...s, [key]: 'error' }))
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', borderTop: '1px solid var(--border-primary)', padding: '16px 18px 28px' }}>
      {/* plain-words intro */}
      <div style={{ marginBottom: 16, padding: '12px 15px', borderRadius: 12, background: 'var(--accent-subtle)', border: '1px solid var(--accent-primary)' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>Every message PROXe can send, in one place.</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>
          {IS_POP
            ? <>Pick how a citizen arrives and what happens next. You&apos;ll see the exact WhatsApp messages in order - filled in for a sample person - with the template behind each one. Tap <strong>Send to my WhatsApp</strong> on any message to feel it on your own phone. Real people are never touched.</>
            : <>Pick how a lead arrives and what happens next. You&apos;ll see the exact WhatsApp messages in order - filled in for a sample lead - with the template behind each one. Tap <strong>Send to my WhatsApp</strong> on any message to feel it on your own phone. Real leads are never touched.</>}
        </div>
      </div>

      {/* ── the simulator ── */}
      <div style={{ padding: 16, borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>{IS_POP ? '1 · HOW DOES THE PERSON ARRIVE?' : '1 · HOW DOES THE LEAD ARRIVE?'}</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {entry.steps.map((s, i) => (
                <button key={s.label} onClick={() => setSource(i)} style={{
                  fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${i === source ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  background: i === source ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                  color: i === source ? 'var(--accent-primary)' : 'var(--text-secondary)',
                }}>{s.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>2 · THEN WHAT HAPPENS?</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {OUTCOMES.map((o) => (
                <button key={o.id} onClick={() => setOutcome(o.id)} style={{
                  fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${o.id === outcome ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  background: o.id === outcome ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                  color: o.id === outcome ? 'var(--accent-primary)' : 'var(--text-secondary)',
                }}>{o.label}</button>
              ))}
            </div>
          </div>
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', alignSelf: 'flex-end' }}>
            <input type="checkbox" checked={showVars} onChange={(e) => setShowVars(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
            show variables instead of the sample lead
          </label>
        </div>

        <div style={{ borderTop: '1px dashed var(--border-primary)', margin: '12px 0 16px' }} />

        {/* the conversation, in order */}
        <Bubble
          step={{ ...entryStep, label: entryStep.label }}
          tone="#8B5CF6" showVars={showVars}
          onSend={() => sendStep('entry', entryStep)} sendState={sendState['entry'] || 'idle'}
        />

        {/* the mid-chat nudge is part of REAL life on every path except a booked call */}
        {outcome !== 'nudge' && outcome !== 'booked' && (
          <div style={{ margin: '0 0 14px 90px', padding: '8px 12px', borderRadius: 10, background: 'rgba(168,85,247,.06)', border: '1px dashed rgba(168,85,247,.35)', fontSize: 11, color: 'var(--text-secondary)', maxWidth: 460 }}>
            <strong style={{ color: '#a855f7' }}>Quiet after the chat?</strong> A tiered nudge fires first (hot 1h · warm 2h · cool 3h, 30 min after they read). Pick <em>"Goes quiet mid-chat"</em> above to see those three messages.
          </div>
        )}

        <div style={{ margin: '0 0 14px 90px', fontSize: 11.5, fontWeight: 800, color: chosen.tone }}>
          ↓ {chosen.trigger} — {chosen.stop}
        </div>

        {(outcome === 'nudge' ? nudgeJourney : chosen).steps.map((s, i) => (
          <Bubble
            key={`${chosen.id}-${i}`} step={s} tone={chosen.tone} showVars={showVars}
            onSend={() => sendStep(`${chosen.id}-${i}`, s)} sendState={sendState[`${chosen.id}-${i}`] || 'idle'}
          />
        ))}
      </div>

      {/* ── all journeys (secondary, collapsed) ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>
          All journeys <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>· the full library, {JOURNEYS.reduce((a, j) => a + j.steps.length, 0)} messages</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {JOURNEYS.map((j: Journey) => {
            const open = openJourney === j.id
            return (
              <div key={j.id} style={{ borderRadius: 12, border: `1px solid ${open ? j.tone : 'var(--border-primary)'}`, background: 'var(--bg-secondary)' }}>
                <button onClick={() => setOpenJourney(open ? null : j.id)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, textAlign: 'left', padding: '11px 14px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  <div>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)' }}>{j.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>{j.who}</span>
                  </div>
                  <span style={{ color: j.tone, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>
                    {j.steps.length} steps {open ? <MdExpandLess size={16} /> : <MdExpandMore size={16} />}
                  </span>
                </button>
                {open && (
                  <div style={{ padding: '4px 14px 10px' }}>
                    {j.steps.map((s, i) => (
                      <Bubble
                        key={i} step={s} tone={j.tone} showVars={showVars}
                        onSend={() => sendStep(`lib-${j.id}-${i}`, s)} sendState={sendState[`lib-${j.id}-${i}`] || 'idle'}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── gates, one light row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: '#ec4899' }}>
          <MdShield size={14} /> Before anything sends:
        </span>
        {GATES.map((g) => (
          <span key={g.label} title={g.detail} style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'rgba(236,72,153,.06)', border: '1px solid rgba(236,72,153,.25)', color: 'var(--text-secondary)', cursor: 'help' }}>
            {g.label}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--text-muted)' }}>
        Hover a gate to see what it does. Test sends go only to the team test number <MdSend size={10} style={{ verticalAlign: '-1px' }} /> - never to a lead.
      </div>
    </div>
  )
}
