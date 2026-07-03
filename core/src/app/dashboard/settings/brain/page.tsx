'use client'

// ─────────────────────────────────────────────────────────────────────────────
// The Brain — four tabs, each a full surface:
//   Brain    — the living anatomical brain, lobes firing on real activity
//   Map      — how PROXe actually thinks: sources → spine → ladders, live counts
//   Eval     — every message a lead can receive, by permutation + test bench
//   Learning — the recursive loop: sources ingested, tokens burned, reflection
// Views live beside this file: BrainHero / MapView / EvalView / LearningView.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { MdPsychology, MdArrowBack } from 'react-icons/md'
import { brandConfig } from '@/configs'
import BrainHero from './BrainHero'
import MapView from './MapView'
import EvalView from './EvalView'
import LearningView from './LearningView'

type Tab = 'brain' | 'map' | 'eval' | 'learning'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'brain', label: 'Brain' },
  { id: 'map', label: 'Map' },
  { id: 'eval', label: 'Eval' },
  { id: 'learning', label: 'Learning' },
]

export default function BrainPage() {
  const [tab, setTab] = useState<Tab>('brain')
  const router = useRouter()

  // Feature-gated per brand (features.brain in the brand pack config).
  const brainEnabled = !!brandConfig.features?.brain
  useEffect(() => {
    if (!brainEnabled) router.replace('/dashboard/settings')
  }, [brainEnabled, router])
  if (!brainEnabled) return null

  return (
    <DashboardLayout>
      <div style={{ height: 'calc(100vh - 3rem)', display: 'flex', flexDirection: 'column', color: 'var(--text-primary)' }}>
        {/* Header + tab rail */}
        <div style={{ padding: '14px 20px 10px', flexShrink: 0 }}>
          <a href="/dashboard/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 8 }}>
            <MdArrowBack size={15} /> Configure
          </a>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--accent-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MdPsychology size={22} />
              </span>
              <div>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>The Brain</h1>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  {tab === 'brain' && 'Alive view — lobes fire on real activity. Thinks every 5 minutes, approval-gated.'}
                  {tab === 'map' && 'How it thinks on every lead — sources, spine, ladders, gates. Live counts on the badges.'}
                  {tab === 'eval' && 'Every message a lead can ever receive, by permutation. Test any stage on your own WhatsApp.'}
                  {tab === 'learning' && 'The recursive loop — what it reads, what it learned, what the thinking costs.'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{
                    fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: tab === t.id ? 'var(--bg-primary)' : 'transparent',
                    color: tab === t.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.18)' : 'none',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Active tab */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {tab === 'brain' && <BrainHero />}
          {tab === 'map' && <MapView />}
          {tab === 'eval' && <EvalView />}
          {tab === 'learning' && <LearningView />}
        </div>
      </div>
    </DashboardLayout>
  )
}
