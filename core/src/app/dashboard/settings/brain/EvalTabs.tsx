'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EvalTabs — the Eval surface, split into benches:
//   Communications — the CORE COMMUNICATIONS checklist: every message the agent
//                    must handle autonomously, filled or missing (CommunicationsView)
//   Messaging — every WhatsApp message a lead can receive, by permutation (EvalView)
//   Team      — every Slack alert PROXe raises to the team, by trigger (TeamMessagesView)
//   Calls     — every voice call measured: latency, turns, wait, cost (CallsView)
// Communications shows only for brands with brain.communications; Messaging only
// when evalJourneys !== 'none' (the journeys benches carry BCON/POP content and
// must never render on other brands). A light segmented switcher sits above.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { MdWhatsapp, MdPhone, MdGroups, MdChecklist } from 'react-icons/md'
import { getBrainConfig } from '@/lib/brain/brainConfig'
import CommunicationsView from './CommunicationsView'
import EvalView from './EvalView'
import CallsView from './CallsView'
import TeamMessagesView from './TeamMessagesView'

type Sub = 'comms' | 'messaging' | 'team' | 'calls'
const BRAIN = getBrainConfig()
const HAS_COMMS = BRAIN.communications.length > 0
const HAS_JOURNEYS = BRAIN.evalJourneys !== 'none'
const SUBS: Array<{ id: Sub; label: string; icon: React.ReactNode }> = [
  ...(HAS_COMMS ? [{ id: 'comms' as Sub, label: 'Communications', icon: <MdChecklist size={14} /> }] : []),
  ...(HAS_JOURNEYS ? [{ id: 'messaging' as Sub, label: 'Messaging', icon: <MdWhatsapp size={14} /> }] : []),
  { id: 'team', label: 'Team', icon: <MdGroups size={14} /> },
  { id: 'calls', label: 'Calls', icon: <MdPhone size={14} /> },
]

export default function EvalTabs() {
  const [sub, setSub] = useState<Sub>(SUBS[0].id)
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
        {sub === 'comms' && <CommunicationsView />}
        {sub === 'messaging' && HAS_JOURNEYS && <EvalView />}
        {sub === 'team' && <TeamMessagesView />}
        {sub === 'calls' && <CallsView />}
      </div>
    </div>
  )
}
