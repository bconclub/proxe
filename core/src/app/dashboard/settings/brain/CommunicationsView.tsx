'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CommunicationsView — the CORE COMMUNICATIONS checklist (Eval → Communications).
//
// Every message the brand's agent must handle autonomously, as a slot that is
// visibly FILLED or not: welcome messages per lead source, AI replies to
// incoming messages, confirmations, reminders, follow-ups. Content comes from
// the brand pack (brain.communications — display truth mirroring the senders);
// this view renders the scorecard, per-category sections, WhatsApp-style
// previews, and the "Send to my WhatsApp" test bench (free-form send to the
// hardcoded test number via /api/dashboard/brain/test-stage).
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useState } from 'react'
import { MdCheckCircle, MdErrorOutline, MdWhatsapp, MdExpandMore, MdLanguage } from 'react-icons/md'
import { getBrainConfig } from '@/lib/brain/brainConfig'
import type { CoreCommunication } from '@/configs/types'

const COMMS = getBrainConfig().communications

type SendState = 'idle' | 'sending' | 'sent' | 'error'

const STATUS_META: Record<CoreCommunication['status'], { label: string; color: string }> = {
  live: { label: 'LIVE', color: '#22c55e' },
  partial: { label: 'PARTIAL', color: '#f59e0b' },
  missing: { label: 'MISSING', color: '#ef4444' },
  off: { label: 'OFF', color: '#9ca3af' },
}

const CATEGORIES: Array<{ id: CoreCommunication['category']; title: string; sub: string }> = [
  { id: 'welcome', title: 'Welcome messages', sub: 'New leads — one per source, sent the moment they arrive' },
  { id: 'inbound', title: 'Incoming message replies', sub: 'AI answers from the brand prompt + knowledge base' },
  { id: 'confirmation', title: 'Confirmations', sub: 'Transactional — bookings, demos, results' },
  { id: 'reminder', title: 'Reminders', sub: 'Time-driven, before the thing happens' },
  { id: 'followup', title: 'Follow-ups', sub: 'Re-engagement when the lead goes quiet' },
]

// Generic sample fill for {{vars}} — per-entry sampleParams override these.
const DEFAULT_SAMPLE: Record<string, string> = {
  customer_name: 'Rahul',
  parent_name: 'Mrs. Sharma',
  webinar_name: 'So You Want To Be A Pilot',
  webinar_date: 'Sun, Jul 20 · 5:00 PM',
}

function fillPlain(text: string, sample: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => sample[k] || k)
}

function renderBody(text: string, sample: Record<string, string>) {
  return text.split(/(\{\{\s*[\w]+\s*\}\})/g).map((p, i) => {
    const m = p.match(/^\{\{\s*([\w]+)\s*\}\}$/)
    if (!m) return <Fragment key={i}>{p}</Fragment>
    return (
      <span key={i} style={{ borderBottom: '1.5px dashed var(--accent-primary)', color: 'var(--text-primary)', fontWeight: 700, padding: '0 1px' }} title={`variable: ${m[1]}`}>
        {sample[m[1]] || m[1]}
      </span>
    )
  })
}

export default function CommunicationsView() {
  const [open, setOpen] = useState<string | null>(null)
  const [sendState, setSendState] = useState<Record<string, SendState>>({})

  const counts = COMMS.reduce(
    (a, c) => ({ ...a, [c.status]: (a[c.status] || 0) + 1 }),
    {} as Record<string, number>,
  )
  const filled = counts.live || 0
  const total = COMMS.length

  const send = async (c: CoreCommunication) => {
    if (!c.body) return
    const sample = { ...DEFAULT_SAMPLE, ...c.sampleParams }
    setSendState((s) => ({ ...s, [c.id]: 'sending' }))
    try {
      const r = await fetch('/api/dashboard/brain/test-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: fillPlain(c.body, sample), buttons: (c.buttons || []).slice(0, 3), label: c.title }),
      })
      const d = await r.json()
      setSendState((s) => ({ ...s, [c.id]: d?.success ? 'sent' : 'error' }))
    } catch {
      setSendState((s) => ({ ...s, [c.id]: 'error' }))
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', borderTop: '1px solid var(--border-primary)', padding: '16px 18px 28px' }}>
      {/* scorecard */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: 'var(--text-primary)' }}>
            {filled}<span style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 700 }}> of {total} filled</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            Core communications the agent handles on its own
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {(Object.keys(STATUS_META) as Array<CoreCommunication['status']>).map((st) => (
            (counts[st] || 0) > 0 && (
              <span key={st} style={{ fontSize: 10.5, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: `${STATUS_META[st].color}1a`, color: STATUS_META[st].color, border: `1px solid ${STATUS_META[st].color}55` }}>
                {counts[st]} {STATUS_META[st].label}
              </span>
            )
          ))}
        </div>
      </div>

      {/* sections per category */}
      {CATEGORIES.map((cat) => {
        const items = COMMS.filter((c) => c.category === cat.id)
        if (items.length === 0) return null
        return (
          <div key={cat.id} style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{cat.title}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{cat.sub}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((c) => {
                const st = STATUS_META[c.status]
                const isOpen = open === c.id
                const sample = { ...DEFAULT_SAMPLE, ...c.sampleParams }
                const state = sendState[c.id] || 'idle'
                return (
                  <div key={c.id} style={{ borderRadius: 10, border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', overflow: 'hidden' }}>
                    {/* row */}
                    <button
                      onClick={() => setOpen(isOpen ? null : c.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span style={{ fontSize: 9.5, fontWeight: 800, padding: '3px 8px', borderRadius: 999, flexShrink: 0, background: `${st.color}1a`, color: st.color, border: `1px solid ${st.color}55`, minWidth: 58, textAlign: 'center' }}>
                        {st.label}
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{c.title}</span>
                        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1 }}>{c.trigger}</span>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                        {c.channel === 'whatsapp' ? <MdWhatsapp size={12} style={{ color: '#22c55e' }} /> : <MdLanguage size={12} style={{ color: '#38bdf8' }} />}
                        {c.channel === 'whatsapp' ? 'WhatsApp' : 'Web chat'}
                      </span>
                      <MdExpandMore size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />
                    </button>

                    {/* expanded: bubble preview + template chip + note + test send */}
                    {isOpen && (
                      <div style={{ padding: '2px 12px 12px 80px' }}>
                        {c.body ? (
                          <>
                            <div style={{
                              maxWidth: 460, padding: '9px 12px', borderRadius: '2px 12px 12px 12px',
                              background: 'rgba(34,197,94,0.09)', border: '1px solid rgba(34,197,94,0.25)',
                              fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
                            }}>
                              {renderBody(c.body, sample)}
                            </div>
                            {c.buttons && c.buttons.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                                {c.buttons.map((b, i) => (
                                  <span key={i} style={{ fontSize: 10.5, padding: '4px 11px', borderRadius: 999, border: '1px solid rgba(34,197,94,.4)', color: '#22c55e', background: 'rgba(34,197,94,.07)', fontWeight: 700 }}>{b}</span>
                                ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>No message exists for this slot yet.</div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                          {c.template && (
                            <span style={{ fontSize: 9.5, fontFamily: 'ui-monospace, monospace', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '2px 7px' }}>
                              template: {c.template}
                            </span>
                          )}
                          {!c.template && c.body && (
                            <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>free-form · AI-written, inside the 24h window</span>
                          )}
                          {c.body && (
                            <button onClick={() => send(c)} disabled={state === 'sending'} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800,
                              padding: '4px 10px', borderRadius: 999, border: 'none', cursor: state === 'sending' ? 'default' : 'pointer',
                              background: state === 'sent' ? 'rgba(34,197,94,.15)' : state === 'error' ? 'rgba(239,68,68,.15)' : '#22c55e',
                              color: state === 'sent' ? '#22c55e' : state === 'error' ? '#ef4444' : '#fff',
                              opacity: state === 'sending' ? 0.6 : 1,
                            }}>
                              {state === 'sent' ? (<><MdCheckCircle size={12} /> On your WhatsApp</>)
                                : state === 'error' ? (<><MdErrorOutline size={12} /> Failed - retry</>)
                                : state === 'sending' ? 'Sending…'
                                : (<><MdWhatsapp size={12} /> Send to my WhatsApp</>)}
                            </button>
                          )}
                        </div>
                        {c.note && (
                          <div style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.5, color: c.status === 'live' && !c.note.startsWith('WARNING') ? 'var(--text-muted)' : st.color }}>
                            {c.note}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
