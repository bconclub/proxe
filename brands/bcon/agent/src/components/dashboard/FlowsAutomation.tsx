'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  MdBolt, MdRepeat, MdWavingHand, MdEventAvailable, MdNotificationsActive, MdPhoneMissed,
  MdCallReceived, MdArrowForward, MdCheckCircle, MdSchedule, MdError, MdHelpOutline, MdRefresh,
} from 'react-icons/md'

// ── The real BCON automation, organised as the user asked: Triggers + Sequences.
// Each step names the Meta template it fires; the live template list (GET
// /api/whatsapp/templates) annotates each with its approval status, so a missing
// or unapproved template is obvious — nothing is hidden.

type Trigger = { id: string; icon: any; event: string; when: string; template: string | null; desc: string }
type Step = { label: string; delay: string; template: string }
type Sequence = { id: string; segment: string; who: string; stop: string; gated?: boolean; steps: Step[] }

const TRIGGERS: Trigger[] = [
  { id: 'welcome', icon: MdWavingHand, event: 'New lead arrives', when: 'Immediately', template: 'bcon_proxe_first_outreach', desc: 'The welcome / first outreach a fresh lead receives.' },
  { id: 'r24', icon: MdNotificationsActive, event: 'Booking — 1 day before', when: '24h before the call', template: 'bcon_proxe_booking_reminder_24h', desc: '“Your call is tomorrow at …”' },
  { id: 'r1', icon: MdNotificationsActive, event: 'Booking — 1 hour before', when: '1h before', template: 'bcon_proxe_booking_reminder_1h', desc: '“Your call starts in 1 hour.”' },
  { id: 'r30', icon: MdNotificationsActive, event: 'Booking — 30 min before', when: '30m before', template: 'bcon_proxe_booking_reminder_30m', desc: '“Your call starts in 30 minutes.”' },
  { id: 'missed', icon: MdPhoneMissed, event: 'Voice call — no answer', when: '30 min after', template: null, desc: 'Kicks off the “No response” sequence below (missed_call_followup).' },
  { id: 'callback', icon: MdCallReceived, event: 'Callback requested', when: 'On request', template: null, desc: 'Acknowledge and schedule the callback.' },
]

const SEQUENCES: Sequence[] = [
  {
    id: 'rnr', segment: 'No response / cold', gated: true,
    who: 'Lead came in (or the call rang with no response) and isn’t replying.',
    stop: 'Stops the moment they reply on WhatsApp · capped at 2 re-engagement sends · gated until a Meta-approved RNR template is set',
    steps: [
      { label: 'Missed-call follow-up', delay: '30 min after', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 1', delay: '+1 day', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 3', delay: '+3 days', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 5', delay: '+5 days', template: 'bcon_proxe_reengagement_noengage' },
      { label: 'Re-engage', delay: 'final', template: 'bcon_proxe_rnr' },
    ],
  },
  {
    id: 'engaged', segment: 'Engaged, not booked',
    who: 'Interacting well but hasn’t booked the call yet.',
    stop: 'Stops as soon as they book',
    steps: [
      { label: 'Nudge while waiting', delay: 'after the chat', template: 'bcon_proxe_followup_engaged' },
      { label: 'Push to book', delay: 'next day', template: 'bcon_proxe_followup_engaged' },
    ],
  },
  {
    id: 'longtail', segment: 'Long-tail nurture',
    who: 'No booking after the first touches — a slow drip so they don’t go cold.',
    stop: 'Stops on any reply or booking',
    steps: [
      { label: 'Day 3', delay: '+3 days', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 7', delay: '+7 days', template: 'bcon_proxe_followup_noengage' },
      { label: 'Day 30', delay: '+30 days', template: 'bcon_proxe_reengagement_noengage' },
      { label: 'Day 90', delay: '+90 days', template: 'bcon_proxe_reengagement_noengage' },
    ],
  },
]

type Status = { label: string; bg: string; color: string; icon: any }
function templateStatus(name: string | null, map: Map<string, string>): Status | null {
  if (!name) return null
  if (!map.has(name)) return { label: 'Not created', bg: 'rgba(239,68,68,.13)', color: '#ef4444', icon: MdError }
  const s = (map.get(name) || '').toUpperCase()
  if (s === 'APPROVED') return { label: 'Approved', bg: 'rgba(34,197,94,.13)', color: '#22c55e', icon: MdCheckCircle }
  if (s === 'REJECTED' || s === 'PAUSED' || s === 'DISABLED') return { label: s.charAt(0) + s.slice(1).toLowerCase(), bg: 'rgba(239,68,68,.13)', color: '#ef4444', icon: MdError }
  return { label: s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Pending', bg: 'rgba(245,158,11,.13)', color: '#f59e0b', icon: MdSchedule }
}

function TemplateChip({ name, map }: { name: string | null; map: Map<string, string> }) {
  if (!name) return <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>no template — routes internally</span>
  const st = templateStatus(name, map)!
  const Icon = st.icon
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{name}</code>
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}><Icon size={11} /> {st.label}</span>
    </span>
  )
}

export default function FlowsAutomation({ section }: { section?: 'triggers' | 'sequences' }) {
  const [map, setMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/whatsapp/templates')
      const data = await res.json()
      const m = new Map<string, string>()
      for (const t of (data.templates || [])) m.set(t.name, t.status)
      setMap(m)
    } catch { /* keep empty → everything shows "Not created" */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const cardBorder = '1px solid var(--border-primary)'

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          The full BCON automation — every event-based <b style={{ color: 'var(--text-primary)' }}>trigger</b> and every multi-step <b style={{ color: 'var(--text-primary)' }}>sequence</b>, with the WhatsApp template each one fires and its Meta status.
        </p>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border shrink-0" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
          <MdRefresh size={14} /> {loading ? 'Checking…' : 'Refresh status'}
        </button>
      </div>

      {/* ── TRIGGERS ─────────────────────────────────────────────────────── */}
      {section !== 'sequences' && (
      <section>
        <h2 className="flex items-center gap-2 text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          <MdBolt size={18} style={{ color: 'var(--accent-primary)' }} /> Triggers <span className="font-normal" style={{ color: 'var(--text-muted)' }}>· fire once, on an event</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TRIGGERS.map((t) => {
            const Icon = t.icon
            return (
              <div key={t.id} className="rounded-xl p-4" style={{ border: cardBorder, background: 'var(--bg-secondary)', boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}><Icon size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.event}</p>
                      <span className="text-[11px] whitespace-nowrap px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>{t.when}</span>
                    </div>
                    <p className="text-xs mt-1 mb-2" style={{ color: 'var(--text-secondary)' }}>{t.desc}</p>
                    <TemplateChip name={t.template} map={map} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
      )}

      {/* ── SEQUENCES ────────────────────────────────────────────────────── */}
      {section !== 'triggers' && (
      <section>
        <h2 className="flex items-center gap-2 text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
          <MdRepeat size={18} style={{ color: 'var(--accent-primary)' }} /> Sequences <span className="font-normal" style={{ color: 'var(--text-muted)' }}>· multi-step chains by lead state, auto-stop on reply</span>
        </h2>
        <div className="space-y-3">
          {SEQUENCES.map((s) => (
            <div key={s.id} className="rounded-xl p-4" style={{ border: cardBorder, background: 'var(--bg-secondary)', boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{s.segment}</p>
                {s.gated && <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,.15)', color: '#f59e0b' }}>Gated off</span>}
              </div>
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{s.who}</p>
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>{s.stop}</p>
              <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
                {s.steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 shrink-0">
                    <div className="rounded-lg p-2.5 min-w-[170px]" style={{ border: cardBorder, background: 'var(--bg-tertiary)' }}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{step.label}</span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{step.delay}</span>
                      </div>
                      <TemplateChip name={step.template} map={map} />
                    </div>
                    {i < s.steps.length - 1 && <MdArrowForward size={16} style={{ color: 'var(--text-muted)' }} className="shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
        <MdHelpOutline size={13} /> Templates marked “Not created” or “Pending” won’t send — create/approve them in Settings → Message templates.
      </p>
    </div>
  )
}
