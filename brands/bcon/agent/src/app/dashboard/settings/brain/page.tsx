'use client'

// ─────────────────────────────────────────────────────────────────────────────
// The Brain — a transparent view of how the task worker thinks.
// Documents the REAL logic running in brands/bcon/voice/task-worker.js +
// engine.ts: lead scoring, temperature, the AI interest brain, objection angles,
// the follow-up cadence, and the read/delivery-aware nudge. Pure explainer (no
// live data yet) so the founder can see exactly what the brain does and why.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import {
  MdPsychology, MdAutoGraph, MdLocalFireDepartment, MdCampaign, MdShield,
  MdRepeat, MdVisibility, MdHub, MdBolt, MdSchedule, MdArrowBack, MdArrowForward,
} from 'react-icons/md'

const CARD = '1px solid var(--border-primary)'

function Section({ icon: Icon, title, subtitle, children }: { icon: any; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section style={{ border: CARD, borderRadius: 14, background: 'var(--bg-secondary)', padding: 20, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={22} />
        </span>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'hot' | 'warm' | 'cool' | 'cold' }) {
  const tones: Record<string, { bg: string; color: string }> = {
    muted: { bg: 'var(--bg-tertiary)', color: 'var(--text-secondary)' },
    accent: { bg: 'var(--accent-subtle)', color: 'var(--accent-primary)' },
    hot: { bg: 'rgba(239,68,68,.14)', color: '#ef4444' },
    warm: { bg: 'rgba(245,158,11,.14)', color: '#f59e0b' },
    cool: { bg: 'rgba(59,130,246,.14)', color: '#3b82f6' },
    cold: { bg: 'rgba(148,163,184,.16)', color: '#94a3b8' },
  }
  const t = tones[tone]
  return <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: t.bg, color: t.color }}>{children}</span>
}

/** A weighted scoring component bar. */
function ScoreBlock({ label, weight, color, items }: { label: string; weight: string; color: string; items: string[] }) {
  return (
    <div style={{ border: CARD, borderRadius: 11, padding: 14, background: 'var(--bg-tertiary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{weight}</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--bg-secondary)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ height: '100%', width: weight, background: color, borderRadius: 4 }} />
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{it}</li>)}
      </ul>
    </div>
  )
}

/** One stage in the top "how it thinks" pipeline strip. */
function Stage({ n, title, desc, last }: { n: number; title: string; desc: string; last?: boolean }) {
  return (
    <>
      <div style={{ flex: 1, minWidth: 120, border: CARD, borderRadius: 11, padding: '12px 13px', background: 'var(--bg-secondary)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-primary)', marginBottom: 4 }}>STEP {n}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.35 }}>{desc}</div>
      </div>
      {!last && <MdArrowForward size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, alignSelf: 'center' }} />}
    </>
  )
}

export default function BrainPage() {
  return (
    <DashboardLayout>
      <div style={{ padding: 24, maxWidth: 1000, color: 'var(--text-primary)' }}>
        {/* Back */}
        <a href="/dashboard/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 14 }}>
          <MdArrowBack size={15} /> Configure
        </a>

        {/* Hero */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 10 }}>
          <span style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--accent-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MdPsychology size={30} />
          </span>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>The Brain</h1>
            <p style={{ margin: '5px 0 0', fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: 640 }}>
              The task worker is the brain behind every outbound message. It reads each lead, decides what to say, who to say it to, and when, then learns from how they respond. Here is exactly how it thinks, so nothing fires blind.
            </p>
            <div style={{ marginTop: 9, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <Tag tone="accent">Runs every 5 minutes</Tag>
              <Tag>Approval-gated by default</Tag>
              <Tag>Quiet hours 9pm to 9am IST</Tag>
            </div>
          </div>
        </div>

        {/* Pipeline */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap', margin: '20px 0 24px' }}>
          <Stage n={1} title="Understand" desc="Name, business, the campaign/ad they came from, their own words" />
          <Stage n={2} title="Score" desc="Lead score 0 to 100 + temperature (hot/warm/cool/cold)" />
          <Stage n={3} title="Decide" desc="Which channel, which angle, whether to wait or push" />
          <Stage n={4} title="Personalize" desc="Claude writes the message; real name + real interest" />
          <Stage n={5} title="Time" desc="Their active hours, read receipts, quiet hours" />
          <Stage n={6} title="Learn" desc="Read/reply patterns feed the next decision" last />
        </div>

        {/* Lead Scoring */}
        <Section icon={MdAutoGraph} title="Lead scoring" subtitle="Every lead gets a 0–100 score, recomputed as they interact. Three weighted blocks plus business boosts.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 12 }}>
            <ScoreBlock label="AI signals" weight="60%" color="var(--accent-primary)" items={[
              'Intent: pricing, booking, urgency words',
              'Sentiment: positive vs negative wording',
              'Buying signals: "how much", "I want", "ready", "sign up"',
            ]} />
            <ScoreBlock label="Activity" weight="25%" color="#3b82f6" items={[
              'Message volume + response rate',
              'Recency (goes cold after ~30 days quiet)',
              '+10% if active on 2+ channels',
            ]} />
            <ScoreBlock label="Readiness" weight="15%" color="#22c55e" items={[
              'Has a website (+5), no AI system yet (+3)',
              'Urgency: asap +4, soon +2',
              'Monthly leads >50 (+3), >20 (+1)',
            ]} />
          </div>
          <div style={{ border: CARD, borderRadius: 11, padding: 13, background: 'var(--bg-tertiary)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Business boosts</strong> stack on top: has a booking +10, gave email/phone +5, multi-channel +5.
            <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-secondary)', padding: '8px 10px', borderRadius: 7 }}>
              score = (AI × 0.60) + (Activity × 0.25) + Readiness + boosts &nbsp;→&nbsp; capped at 100
            </div>
          </div>
        </Section>

        {/* Temperature */}
        <Section icon={MdLocalFireDepartment} title="Temperature" subtitle="What they say sets the temperature, and the temperature sets how fast we follow up.">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '6px 10px', fontWeight: 600 }}>Temp</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600 }}>Signals in their messages</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600 }}>Follow-up cadence</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { t: 'hot' as const, sig: '"how much", "pricing", "asap", "let\'s do it", "sign me up", comparing options', days: 'Day 1 / 2 / 3 (fast, timers halved)' },
                  { t: 'warm' as const, sig: '"how does it work", "tell me more", team/revenue/clients questions', days: 'Day 1 / 3 / 5 (standard)' },
                  { t: 'cool' as const, sig: '"ok", "maybe later", "I\'ll think about it", slow short replies', days: 'Day 2 / 5 / 8 (stretched, nurture)' },
                  { t: 'cold' as const, sig: '"not interested", "stop", "unsubscribe", "remove me"', days: 'Sequence stops — monthly re-engage only' },
                ].map((r) => (
                  <tr key={r.t} style={{ borderTop: CARD }}>
                    <td style={{ padding: '9px 10px' }}><Tag tone={r.t}>{r.t.toUpperCase()}</Tag></td>
                    <td style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>{r.sig}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{r.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: '12px 2px 0', fontSize: 12, color: 'var(--text-muted)' }}>
            The last 20 temperature changes are kept per lead (with the reason), so a lead warming up or going cold is visible over time.
          </p>
        </Section>

        {/* Interest brain */}
        <Section icon={MdCampaign} title="Intent &amp; interest" subtitle="Claude reads the whole context and writes one consistent “AI …” line for what they came for. Never blank, never their industry.">
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <li><strong style={{ color: 'var(--text-primary)' }}>Their own words first</strong> — what they actually told us on chat or the form.</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>The campaign / ad</strong> — if they came from the “AI Lead Machine” campaign, that is their intent → “AI Lead Machine for your brand”.</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Their niche</strong> — an insurance agent → “AI marketing for insurance”.</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Clean fallback</strong> — if we truly know nothing, “AI marketing for your brand”.</li>
          </ol>
          <div style={{ marginTop: 13, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 9 }}>
            {[
              ['Came from “AI Lead Machine” ad', 'AI Lead Machine for your brand'],
              ['Insurance agent, no campaign', 'AI marketing for insurance'],
              ['Said “need more customers”', 'AI customer acquisition'],
              ['Nothing captured', 'AI marketing for your brand'],
            ].map(([ctx, out], i) => (
              <div key={i} style={{ border: CARD, borderRadius: 10, padding: 11, background: 'var(--bg-tertiary)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{ctx}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-primary)' }}>→ {out}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '12px 2px 0', fontSize: 12, color: 'var(--text-muted)' }}>Vocabulary is locked: always “AI …”. Em dashes are stripped from every message before it ever sends.</p>
        </Section>

        {/* Objections */}
        <Section icon={MdShield} title="Buyer intent &amp; objections" subtitle="When a lead pushes back, the brain detects the objection type and answers with the matching angle (rotating so it never repeats).">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 9 }}>
            {[
              ['Price', 'Value angle — “3x return in the first month, it’s an investment”'],
              ['Timing', 'Cost-of-delay — “every week you’re leaving leads on the table”'],
              ['Trust', 'Proof angle — “a similar business got 2x more leads in 30 days”'],
              ['Authority', 'Bring the team — “let’s hop on a quick call with your team”'],
              ['Need', 'Free audit — “let me show how many leads you’re missing”'],
            ].map(([k, v], i) => (
              <div key={i} style={{ border: CARD, borderRadius: 10, padding: 12, background: 'var(--bg-tertiary)' }}>
                <Tag tone="accent">{k}</Tag>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 7, lineHeight: 1.4 }}>{v}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Sequences */}
        <Section icon={MdRepeat} title="Follow-up sequences" subtitle="What the brain queues, and what triggers each. Everything is approval-gated until you turn a type to auto.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {[
              ['First outreach', 'Inbound lead from a form / Meta — the business-initiated welcome. Schedules a nudge 2h later.'],
              ['Nudge (waiting)', 'Bot asked something and they went quiet — a short contextual re-ping (read-aware, see below).'],
              ['Follow-up Day 1 / 3 / 5', 'The drip after first contact. Spacing flexes with temperature (hot 1/2/3, warm 1/3/5, cool 2/5/8).'],
              ['Push to book', 'After ~5 messages with no booking — nudge toward the call.'],
              ['Re-engage', 'Cold leads only — a single monthly tap, never the full drip.'],
              ['Booking reminders', '24h and 30m before a booked call.'],
            ].map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', border: CARD, borderRadius: 10, background: 'var(--bg-tertiary)' }}>
                <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--accent-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{k}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{v}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Smart nudge */}
        <Section icon={MdVisibility} title="Read &amp; delivery-aware nudge" subtitle="The brain checks read receipts (captured within ~2 seconds) before it nudges, so it never pokes a message they haven’t seen.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 10 }}>
            {[
              [MdVisibility, 'Read, no reply', 'Nudge 30 minutes after they read it.'],
              [MdSchedule, 'Delivered, not read', 'Wait — reschedule to their next active hour.'],
              [MdBolt, 'Replied already', 'Skip the nudge entirely, the human/agent takes over.'],
            ].map(([Icon, k, v]: any, i) => (
              <div key={i} style={{ border: CARD, borderRadius: 11, padding: 13, background: 'var(--bg-tertiary)' }}>
                <span style={{ color: 'var(--accent-primary)' }}><Icon size={20} /></span>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 6 }}>{k}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Channel + timing */}
        <Section icon={MdHub} title="Channel &amp; timing" subtitle="The brain learns when each lead is reachable and which channel they respond to.">
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <li><strong style={{ color: 'var(--text-primary)' }}>Active hours</strong> — from the last ~100 messages, the brain learns when a lead usually replies and times sends for that window.</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Channel performance</strong> — read rate and response speed are tracked per channel; a faster channel wins for hot leads.</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Quiet hours</strong> — nothing fires 9pm–9am IST; tasks reschedule to the morning.</li>
            <li><strong style={{ color: 'var(--text-primary)' }}>Anti-flood guard</strong> — long-overdue tasks expire instead of blasting all at once on a restart.</li>
          </ul>
        </Section>

        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', margin: '6px 0 4px' }}>
          This reflects the live logic in the task worker. Live per-lead numbers will surface here next.
        </p>
      </div>
    </DashboardLayout>
  )
}
