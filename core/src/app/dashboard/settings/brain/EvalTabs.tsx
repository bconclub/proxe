'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EvalTabs — the Eval surface, split into benches:
//   Messaging — every WhatsApp message a lead can receive, by permutation (EvalView)
//   Team      — every Slack alert PROXe raises to the team, by trigger (TeamMessagesView)
//   Calls     — every voice call measured: latency, turns, wait, cost (CallsView)
// A light segmented switcher sits above; each bench fills the rest of the surface.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { MdWhatsapp, MdPhone, MdGroups } from 'react-icons/md'
import EvalView from './EvalView'
import CallsView from './CallsView'
import TeamMessagesView from './TeamMessagesView'

type Sub = 'messaging' | 'team' | 'calls'
const SUBS: Array<{ id: Sub; label: string; icon: React.ReactNode }> = [
  { id: 'messaging', label: 'Messaging', icon: <MdWhatsapp size={14} /> },
  { id: 'team', label: 'Team', icon: <MdGroups size={14} /> },
  { id: 'calls', label: 'Calls', icon: <MdPhone size={14} /> },
]

export default function EvalTabs() {
  const [sub, setSub] = useState<Sub>('messaging')
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 18px 0', flexShrink: 0 }}>
        <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
          {SUBS.map((s) => (
            <button key={s.id} onClick={() => setSub(s.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, fontWeight: 700, padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: sub === s.id ? 'var(--bg-primary)' : 'transparent',
              color: sub === s.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
              boxShadow: sub === s.id ? '0 1px 3px rgba(0,0,0,0.18)' : 'none',
            }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {sub === 'messaging' && <EvalView />}
        {sub === 'team' && <TeamMessagesView />}
        {sub === 'calls' && <CallsView />}
      </div>
    </div>
  )
}
