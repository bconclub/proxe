'use client'

// ─────────────────────────────────────────────────────────────────────────────
// TeamMessagesView — the Eval bench for messages that go to the TEAM (Slack),
// not the lead. Every Slack alert PROXe can raise, by type, with the trigger
// that fires it and a preview of the card the team sees in #<brand>-proxe.
// Mirrors core/src/lib/services/slackNotifier.ts (notifySlackLead / Booking).
// ─────────────────────────────────────────────────────────────────────────────

import { getBrandConfig } from '@/configs'

const BRAND = (() => { try { return getBrandConfig() } catch { return { name: 'PROXe', colors: { primary: '#E4002B' } } as any } })()
const ACCENT: string = (() => {
  try { const c = (BRAND as any).colors; return c.primaryVibrant || c.primary || '#E4002B' } catch { return '#E4002B' }
})()

type Field = [label: string, value: string]
type TeamMsg = {
  id: string
  title: string
  when: string
  who: string
  type: string | null
  detail: string
  fields: Field[]
  footer: string | null
  action: string | null
}

// Brand-neutral sample cards (the audience-type labels + CRE details were
// Lokazen-only and bled onto every brand's Eval → Team preview). The scout
// card is a Lokazen-only alert type and is filtered out below for non-scout brands.
const SCOUTS_ON: boolean = (() => { try { return !!(BRAND as any).features?.scouts } catch { return false } })()
const ALL_MESSAGES: TeamMsg[] = [
  {
    id: 'needs_human',
    title: 'Needs human follow-up',
    when: 'A lead asks to reach the team / a human ("talk to the team", "connect with the team"), or the AI has nothing to say (empty response) — the lead is flagged and a task is created.',
    who: 'Priya Nair', type: null,
    detail: 'Asked to speak with the team to move things forward.',
    fields: [['Phone', '+91 98xxxxxx12'], ['Channel', 'whatsapp']],
    footer: 'needs human', action: 'View lead in dashboard',
  },
  {
    id: 'scout_support',
    title: 'Scout support request',
    when: 'A scout reports a problem — payout not received, KYC stuck, can’t upload, login issue. Scouts never book calls, so this is the only escalation path.',
    who: 'Mr. Kannadiga', type: 'Scout',
    detail: 'Payout not received — asked 3+ times ("not received yet", "I need my payment").',
    fields: [['Phone', '+91 90xxxxxx60'], ['Channel', 'whatsapp']],
    footer: 'scout support · reach out on the number above', action: 'View lead in dashboard',
  },
  {
    id: 'payment',
    title: 'Payment / transaction issue',
    when: 'A lead reports a money problem — "amount debited but failed", "refund not received", "not credited". Never becomes a booking.',
    who: 'Arjun Rao', type: null,
    detail: 'Paid but the amount was debited and it did not go through.',
    fields: [['Phone', '+91 99xxxxxx07'], ['Channel', 'web']],
    footer: 'needs human', action: 'View lead in dashboard',
  },
  {
    id: 'new_booking',
    title: 'New booking',
    when: 'A call or visit is successfully booked (the booking tool persisted a date + time).',
    who: 'Karan Shah', type: null,
    detail: 'Booked a consultation call.',
    fields: [['When', 'Thu, 9 Jul · 3:00 PM IST'], ['Channel', 'whatsapp']],
    footer: null, action: null,
  },
]
// Scout support is a Lokazen-only alert type — drop it for non-scout brands.
const MESSAGES: TeamMsg[] = ALL_MESSAGES.filter((m) => m.id !== 'scout_support' || SCOUTS_ON)

function SlackCard({ m }: { m: TeamMsg }) {
  const preview = `${m.title} · ${BRAND.name}: ${m.who}`
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', display: 'flex' }}>
      {/* brand colour stripe, exactly like the Slack attachment */}
      <div style={{ width: 4, background: ACCENT, flexShrink: 0 }} />
      <div style={{ padding: 14, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 6 }}>{preview}</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>{m.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>PROXe · {BRAND.name}</div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
          <b>{m.who}</b>{m.type ? <span style={{ color: 'var(--text-secondary)' }}>{'  ·  '}<i>{m.type}</i></span> : null}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontStyle: 'italic', margin: '4px 0 8px' }}>{m.detail}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', marginBottom: m.action ? 10 : 0 }}>
          {m.fields.map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{value}</div>
            </div>
          ))}
        </div>
        {m.action && (
          <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 6, background: ACCENT, color: '#fff' }}>
            {m.action}
          </span>
        )}
        {m.footer && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 8 }}>{m.footer}</div>}
      </div>
    </div>
  )
}

export default function TeamMessagesView() {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 18px 24px' }}>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 620, marginBottom: 16 }}>
        Every alert PROXe raises to the <b style={{ color: 'var(--text-primary)' }}>team</b> (posted to your Slack channel) — the
        trigger that fires it and the card the team sees. These fire inline on the
        message; a matching <b style={{ color: 'var(--text-primary)' }}>task</b> is created for each so nothing is missed.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {MESSAGES.map((m) => (
          <div key={m.id}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 4 }}>Fires when</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 8 }}>{m.when}</p>
            <SlackCard m={m} />
          </div>
        ))}
      </div>
    </div>
  )
}
