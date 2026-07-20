'use client'

// ─────────────────────────────────────────────────────────────────────────────
// The Brain - four tabs, each a full surface:
//   Brain    - the voice orb: tap it and it SPEAKS today's briefing (VoiceOrb)
//   Map      - how PROXe actually thinks: sources → spine → ladders, live counts
//   Eval     - every message a lead can receive, by permutation + test bench
//   Learning - the recursive loop: sources ingested, tokens burned, reflection
// Views live beside this file: VoiceOrb / MapView / EvalTabs / LearningView.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MdPsychology, MdArrowBack } from 'react-icons/md'
import { getBrandConfig } from '@/configs'
import { getBrainConfig } from '@/lib/brain/brainConfig'
import VoiceOrb from './VoiceOrb'
import MapView from './MapView'
import EvalTabs from './EvalTabs'
import LearningView from './LearningView'

type Tab = 'brain' | 'map' | 'eval' | 'learning'
// Per-brand tabs: Map draws the campaign engine topology (warRoom brands only);
// Eval shows when the brand has journeys (brain.evalJourneys) OR a CORE
// COMMUNICATIONS checklist (brain.communications) - either gives it content.
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'brain', label: 'Brain' },
  ...(getBrandConfig().features?.warRoom ? ([{ id: 'map', label: 'Map' }] as Array<{ id: Tab; label: string }>) : []),
  ...(getBrainConfig().evalJourneys !== 'none' || getBrainConfig().communications.length > 0
    ? ([{ id: 'eval', label: 'Eval' }] as Array<{ id: Tab; label: string }>) : []),
  { id: 'learning', label: 'Learning' },
]

export default function BrainPage() {
  // Deep-link support: /dashboard/settings/brain?tab=eval opens the Eval bench
  // directly (used by the quick "Brain" button on the Calls page).
  const params = useSearchParams()
  const initialTab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'brain') as Tab
  const [tab, setTab] = useState<Tab>(initialTab)
  const router = useRouter()
  const brandConfig = getBrandConfig()

  // Feature-gated per brand (features.brain in the brand pack config).
  const brainEnabled = !!brandConfig.features?.brain
  useEffect(() => {
    if (!brainEnabled) router.replace('/dashboard/settings')
  }, [brainEnabled, router])
  if (!brainEnabled) return null

  return (
    <>
      {/* Phone: 100dvh (not vh - mobile URL bar) minus the 56px hamburger bar;
          desktop keeps the original 100vh - 3rem. */}
      <style>{`@media (max-width: 767px) { .brain-page-shell { height: calc(100dvh - var(--mobile-topbar-h, 56px) - 3rem) !important; } }`}</style>
      <div className="brain-page-shell" style={{ height: 'calc(100vh - 3rem)', display: 'flex', flexDirection: 'column', color: 'var(--text-primary)' }}>
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
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>The Brain</h1>
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
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {tab === 'brain' && <VoiceOrb />}
          {tab === 'map' && <MapView />}
          {tab === 'eval' && <EvalTabs />}
          {tab === 'learning' && <LearningView />}
        </div>
      </div>
    </>
  )
}
