'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  MdBolt, MdRepeat, MdWavingHand, MdNotificationsActive, MdPhoneMissed,
  MdCallReceived, MdCheckCircle, MdSchedule, MdError, MdRefresh, MdChevronRight,
} from 'react-icons/md'

// ── The real BCON automation, organised as the user asked: Triggers + Sequences.
// Each view is a master-detail (left list → right detail), mirroring the Stages
// page so all three Flows tabs read as one designed surface. Each step names the
// Meta template it fires; the live template list (GET /api/whatsapp/templates)
// annotates each with its approval status, so a missing/unapproved template is
// obvious — nothing is hidden.

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

// Status dot colour for a list row (worst step wins, so a row flags problems).
function dotColor(name: string | null, map: Map<string, string>): string {
  const st = templateStatus(name, map)
  if (!st) return 'var(--text-muted)'
  return st.color
}
function worstStepColor(steps: Step[], map: Map<string, string>): string {
  const colors = steps.map(s => dotColor(s.template, map))
  if (colors.includes('#ef4444')) return '#ef4444'
  if (colors.includes('#f59e0b')) return '#f59e0b'
  return '#22c55e'
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

const CARD = '1px solid var(--border-primary)'
const SHADOW = '0 6px 18px rgba(0,0,0,0.22)'

// ── Left-list selectable row (mirrors the Stages stage-list card) ─────────────
function ListRow({ icon, title, sub, dot, selected, onClick }: {
  icon: any; title: string; sub: string; dot: string; selected: boolean; onClick: () => void
}) {
  const Icon = icon
  return (
    <button type="button" onClick={onClick} style={{
      textAlign: 'left', cursor: 'pointer', width: '100%',
      border: selected ? '1px solid var(--accent-primary)' : CARD,
      background: selected ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
      borderRadius: 10, padding: 11, display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
      </span>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <MdChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </button>
  )
}

// ── Detail-panel section card (mirrors the Stages FlowDetailPanel sections) ────
function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ border: CARD, borderRadius: 10, padding: 14, background: 'var(--bg-tertiary)', marginTop: 12 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
      {children}
    </section>
  )
}

function TriggerDetail({ t, map }: { t: Trigger; map: Map<string, string> }) {
  const Icon = t.icon
  return (
    <aside style={{ border: CARD, borderRadius: 12, background: 'var(--bg-secondary)', boxShadow: SHADOW, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={24} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{t.event}</h2>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>{t.when}</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{t.desc}</p>
        </div>
      </div>

      <DetailCard title="Template fired">
        {t.template
          ? <TemplateChip name={t.template} map={map} />
          : <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>No WhatsApp template — this trigger routes internally (kicks off a sequence or schedules a task).</p>}
      </DetailCard>

      <DetailCard title="When it fires">
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Fires once, <strong style={{ color: 'var(--text-primary)' }}>{t.when.toLowerCase()}</strong>, on this event.
        </p>
      </DetailCard>
    </aside>
  )
}

function SequenceDetail({ s, map }: { s: Sequence; map: Map<string, string> }) {
  const approved = s.steps.filter(st => (map.get(st.template) || '').toUpperCase() === 'APPROVED').length
  return (
    <aside style={{ border: CARD, borderRadius: 12, background: 'var(--bg-secondary)', boxShadow: SHADOW, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{s.segment}</h2>
        {s.gated && <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,.15)', color: '#f59e0b' }}>Gated off</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{approved}/{s.steps.length} templates ready</span>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{s.who}</p>
      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{s.stop}</p>

      <DetailCard title={`Steps (${s.steps.length})`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {s.steps.map((step, i) => (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--bg-secondary)', border: CARD, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{step.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{step.delay}</span>
                  </div>
                  <TemplateChip name={step.template} map={map} />
                </div>
              </div>
              {i < s.steps.length - 1 && <div style={{ marginLeft: 12, height: 12, borderLeft: '2px dotted var(--border-primary)' }} />}
            </div>
          ))}
        </div>
      </DetailCard>
    </aside>
  )
}

export default function FlowsAutomation({ section }: { section?: 'triggers' | 'sequences' }) {
  const [map, setMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [selTrigger, setSelTrigger] = useState<string>(TRIGGERS[0].id)
  const [selSequence, setSelSequence] = useState<string>(SEQUENCES[0].id)

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

  const mode: 'triggers' | 'sequences' = section === 'triggers' ? 'triggers' : 'sequences'

  const trigger = TRIGGERS.find(t => t.id === selTrigger) || TRIGGERS[0]
  const sequence = SEQUENCES.find(s => s.id === selSequence) || SEQUENCES[0]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 12, alignItems: 'start', minHeight: 'calc(100vh - 170px)', color: 'var(--text-primary)' }}>
      {/* ── LEFT LIST ──────────────────────────────────────────────────────── */}
      <div style={{ border: CARD, borderRadius: 12, background: 'var(--bg-secondary)', boxShadow: SHADOW, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 14px', borderBottom: CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, letterSpacing: '0.4px', color: 'var(--text-secondary)' }}>
            {mode === 'triggers' ? <><MdBolt size={15} /> TRIGGERS · ON AN EVENT</> : <><MdRepeat size={15} /> SEQUENCES · BY LEAD STATE</>}
          </span>
          <button type="button" onClick={load} aria-label="Refresh template status" title="Refresh template status" style={{ border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}>
            <MdRefresh size={16} />
          </button>
        </div>
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mode === 'triggers'
            ? TRIGGERS.map(t => (
                <ListRow key={t.id} icon={t.icon} title={t.event} sub={t.when}
                  dot={dotColor(t.template, map)} selected={t.id === selTrigger} onClick={() => setSelTrigger(t.id)} />
              ))
            : SEQUENCES.map(s => (
                <ListRow key={s.id} icon={MdRepeat} title={s.segment} sub={`${s.steps.length} step${s.steps.length === 1 ? '' : 's'}${s.gated ? ' · gated' : ''}`}
                  dot={worstStepColor(s.steps, map)} selected={s.id === selSequence} onClick={() => setSelSequence(s.id)} />
              ))}
        </div>
      </div>

      {/* ── RIGHT DETAIL ───────────────────────────────────────────────────── */}
      <div style={{ minWidth: 0 }}>
        {mode === 'triggers' ? <TriggerDetail t={trigger} map={map} /> : <SequenceDetail s={sequence} map={map} />}
        <p style={{ margin: '12px 2px 0', fontSize: 11, color: 'var(--text-muted)' }}>
          {loading ? 'Checking template status…' : 'Templates marked “Not created” or “Pending” won’t send — create/approve them in Settings → Message templates.'}
        </p>
      </div>
    </div>
  )
}
