'use client'

import { useState, useEffect, useCallback } from 'react'
import { MdCall, MdPsychology, MdViewKanban, MdAutorenew, MdArrowBack, MdCampaign, MdTouchApp, MdPeople, MdHandshake, MdMap } from 'react-icons/md'
import Link from 'next/link'

type FlagKey = 'voice' | 'brain' | 'brainActions' | 'pipelineFunnel' | 'followUpSequence' | 'campaigns'
type LockedKey = 'leadAccess' | 'scouts' | 'warRoom'
type Flags = Partial<Record<FlagKey | LockedKey, boolean>>

const FEATURES: Array<{ key: FlagKey; name: string; desc: string; icon: React.ComponentType<{ size?: number }>; live: boolean }> = [
  { key: 'campaigns', name: 'Campaigns', desc: 'The AI campaign workspace — chat an audience together, match templates, schedule.', icon: MdCampaign, live: true },
  { key: 'voice', name: 'Voice / Calls', desc: 'Vapi inbound + outbound calls and the Calls dashboard tab.', icon: MdCall, live: true },
  { key: 'brain', name: 'Dashboard Brain', desc: 'The "Ask PROXe" panel — Q&A over your live dashboard data.', icon: MdPsychology, live: true },
  { key: 'brainActions', name: 'Brain Actions', desc: 'The Brain can drive the dashboard — open a lead, open a page, suggest a dial.', icon: MdTouchApp, live: true },
  { key: 'pipelineFunnel', name: 'Pipeline Funnel', desc: 'The funnel-stage breakdown on the Pipeline page.', icon: MdViewKanban, live: true },
  { key: 'followUpSequence', name: 'Follow-up Sequence', desc: 'Automated re-engagement cron (needs an approved template).', icon: MdAutorenew, live: false },
]

// Config-locked features — they need per-brand DB setup (migrations, views,
// data model), so they're visible here but switch per brand at deploy time.
const LOCKED: Array<{ key: LockedKey; name: string; desc: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: 'leadAccess', name: 'Lead Access', desc: 'Per-user lead ownership + pipelines (needs the owner columns migration).', icon: MdPeople },
  { key: 'scouts', name: 'Scouts / Gigs', desc: 'Gig-worker segment and scout widget mode (lokazen data model).', icon: MdHandshake },
  { key: 'warRoom', name: 'War Room', desc: 'The constituency map (needs the brand\'s war-room DB views).', icon: MdMap },
]

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
      style={{ backgroundColor: on ? 'var(--accent-primary)' : 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full transition-transform"
        style={{ backgroundColor: '#fff', transform: on ? 'translateX(22px)' : 'translateX(3px)' }}
      />
    </button>
  )
}

export default function FeaturesSettingsPage() {
  const [flags, setFlags] = useState<Flags>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<FlagKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/dashboard/settings/features')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { if (alive) setFlags(d.features || {}) })
      .catch(() => { if (alive) setError('Could not load feature settings.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const toggle = useCallback(async (key: FlagKey) => {
    const next = !flags[key]
    setFlags((f) => ({ ...f, [key]: next })) // optimistic
    setSaving(key)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/settings/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      if (d.features) setFlags(d.features)
    } catch {
      setFlags((f) => ({ ...f, [key]: !next })) // revert on failure
      setError('Could not save. Try again.')
    } finally {
      setSaving(null)
    }
  }, [flags])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        <MdArrowBack size={16} /> Settings
      </Link>

      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Features</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Switch dashboard features on or off. Changes apply to everyone on this brand and take effect on the next page load — no redeploy needed.
      </p>

      {error && <p className="text-sm mb-4" style={{ color: '#ef4444' }}>{error}</p>}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
        {FEATURES.map((f, i) => {
          const Icon = f.icon
          const on = !!flags[f.key]
          return (
            <div
              key={f.key}
              className="flex items-center gap-4 px-4 py-4"
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-primary)' }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{f.name}</p>
                  {!f.live && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                      Soon
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
              </div>
              <Toggle on={on} disabled={loading || saving === f.key} onChange={() => toggle(f.key)} />
            </div>
          )
        })}
      </div>

      <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
        “Soon” features carry their toggle now; switching them on takes effect once that feature ships to this brand.
      </p>

      {/* Config-locked features — read-only state so the whole picture is visible. */}
      <h2 className="text-sm font-bold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>Per-brand setup</h2>
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}>
        {LOCKED.map((f, i) => {
          const Icon = f.icon
          const on = !!flags[f.key]
          return (
            <div
              key={f.key}
              className="flex items-center gap-4 px-4 py-4"
              style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-primary)' }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{f.name}</p>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    {on ? 'On for this brand' : 'Not set up here'}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
              </div>
              <Toggle on={on} disabled onChange={() => {}} />
            </div>
          )
        })}
      </div>
      <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
        These need database setup per brand, so they can't be flipped from here — ask for the setup and they light up.
      </p>
    </div>
  )
}
