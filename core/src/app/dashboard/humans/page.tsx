'use client'

// Humans = the managing team. Under features.leadAccess this is the
// team-ACTIVITY view: what humans we have and what each is doing - allowed
// lead types, leads owned, pipeline stage breakdown, last active - with an
// admin click-through to any member's pipeline. User MANAGEMENT (invite,
// roles, deactivate) lives in Settings → Users.
//
// Flag off: falls back to the original behavior (the UserManagement screen
// surfaced as a top-level nav item) so other brands are untouched.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MdRefresh, MdManageAccounts, MdOutlineInbox } from 'react-icons/md'
import { getBrandConfig } from '@/configs'
import UserManagementPage from '../settings/users/page'

const LEAD_ACCESS_ON = !!getBrandConfig().features?.leadAccess

interface Human {
  id: string
  name: string
  email: string | null
  role: string
  allowedTypes: string[] | null
  ownedCount: number
  stageBreakdown: Record<string, number>
  lastActive: string | null
}

// Mirrors the pipeline page's STAGES grouping (label + color per lead_stage
// value) so the per-human bars read the same as the pipeline chevrons.
const STAGE_GROUPS: Array<{ label: string; dbValues: string[]; color: string }> = [
  { label: 'New',           dbValues: ['New', '', 'In Sequence'],                        color: '#3266ad' },
  { label: 'Engaged',       dbValues: ['Engaged'],                                       color: '#3d5fa0' },
  { label: 'Qualified',     dbValues: ['Qualified', 'High Intent'],                      color: '#485693' },
  { label: 'Key Events',    dbValues: ['Booking Made'],                                  color: '#534AB7' },
  { label: 'Call Done',     dbValues: ['Call Done'],                                     color: '#1D9E75' },
  { label: 'Proposal Sent', dbValues: ['Proposal Sent'],                                 color: '#BA7517' },
  { label: 'Won',           dbValues: ['Closed Won', 'Converted', 'Won'],                              color: '#639922' },
  { label: 'Lost',          dbValues: ['Cold', 'Closed Lost', 'Lost', 'Not Qualified'],  color: '#993C1D' },
]

function groupBreakdown(stages: Record<string, number>): Array<{ label: string; count: number; color: string }> {
  return STAGE_GROUPS
    .map((g) => ({
      label: g.label,
      color: g.color,
      count: Object.entries(stages).reduce(
        (sum, [stage, n]) => sum + (g.dbValues.includes(stage) ? n : 0), 0),
    }))
    .filter((g) => g.count > 0)
}

function formatLastActive(iso: string | null): { label: string; live: boolean } {
  if (!iso) return { label: 'Never logged in', live: false }
  const then = new Date(iso).getTime()
  if (isNaN(then)) return { label: '-', live: false }
  const diffSec = Math.floor((Date.now() - then) / 1000)
  if (diffSec < 120) return { label: 'Live now', live: true }
  if (diffSec < 3600) return { label: `${Math.floor(diffSec / 60)} min ago`, live: false }
  if (diffSec < 86400) return { label: `${Math.floor(diffSec / 3600)}h ago`, live: false }
  const days = Math.floor(diffSec / 86400)
  if (days < 7) return { label: `${days}d ago`, live: false }
  return { label: new Date(iso).toLocaleDateString(), live: false }
}

function HumansOverview() {
  const router = useRouter()
  const [humans, setHumans] = useState<Human[]>([])
  const [openPool, setOpenPool] = useState(0)
  const [totalLeads, setTotalLeads] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/humans/overview')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load team overview')
      setHumans(data.humans || [])
      setOpenPool(data.openPool || 0)
      setTotalLeads(data.totalLeads || 0)
      setIsAdmin(data.isAdmin === true)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      load()
    }, 30_000)
    return () => clearInterval(id)
  }, [load])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Humans</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Who's on the team and what they're working. First touch claims a lead; unclaimed leads sit in the open pool.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 rounded-lg border border-[var(--border-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
            title="Refresh"
          >
            <MdRefresh size={18} />
          </button>
          {isAdmin && (
            <button
              onClick={() => router.push('/dashboard/settings/users')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              title="Invite users, change roles, set lead access"
            >
              <MdManageAccounts size={16} />
              Manage Users
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-400">{error}</div>
      )}

      {/* Open pool */}
      <button
        onClick={() => router.push('/dashboard/pipeline')}
        className="w-full text-left mb-6 p-4 rounded-lg border border-[var(--border-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-4"
        style={{ background: 'var(--bg-secondary)' }}
        title="Open the pipeline"
      >
        <MdOutlineInbox size={26} className="text-[var(--text-secondary)] flex-shrink-0" />
        <div>
          <div className="text-lg font-bold text-[var(--text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {loading ? '…' : `${openPool} in the open pool`}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {loading ? '' : `of ${totalLeads} total leads - unclaimed, first touch takes responsibility`}
          </div>
        </div>
      </button>

      {/* Team grid */}
      {loading ? (
        <div className="text-sm text-[var(--text-muted)] py-8 text-center">Loading team…</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {humans.map((h) => {
            const groups = groupBreakdown(h.stageBreakdown)
            const active = formatLastActive(h.lastActive)
            return (
              <div
                key={h.id}
                onClick={isAdmin ? () => router.push(`/dashboard/pipeline?user=${h.id}`) : undefined}
                className="rounded-lg border border-[var(--border-primary)] p-4 flex flex-col gap-3"
                style={{ background: 'var(--bg-secondary)', cursor: isAdmin ? 'pointer' : 'default' }}
                title={isAdmin ? `Open ${h.name}'s pipeline` : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[var(--text-primary)] truncate">{h.name}</div>
                    {h.email && <div className="text-[11px] text-[var(--text-muted)] truncate">{h.email}</div>}
                  </div>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0"
                    style={h.role === 'admin'
                      ? { background: 'rgba(168,85,247,0.15)', color: '#a855f7' }
                      : { background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                    {h.role}
                  </span>
                </div>

                {/* Lead access chips */}
                <div className="flex flex-wrap gap-1">
                  {h.allowedTypes ? (
                    h.allowedTypes.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: 'rgba(59,130,246,0.14)', color: '#60a5fa' }}>
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                      All lead types
                    </span>
                  )}
                </div>

                {/* Owned + stage bar */}
                <div>
                  <div className="text-xl font-bold text-[var(--text-primary)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {h.ownedCount}
                    <span className="text-[11px] font-medium text-[var(--text-muted)] ml-1.5">
                      lead{h.ownedCount !== 1 ? 's' : ''} touched
                    </span>
                  </div>
                  {groups.length > 0 && (
                    <>
                      <div className="flex h-1.5 rounded-full overflow-hidden mt-2" style={{ background: 'var(--bg-hover)' }}>
                        {groups.map((g) => (
                          <div key={g.label} style={{ width: `${(g.count / h.ownedCount) * 100}%`, background: g.color }} />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                        {groups.map((g) => (
                          <span key={g.label} className="inline-flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: g.color }} />
                            {g.count} {g.label}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Last active (admin only - API redacts for viewers) */}
                {isAdmin && (
                  <div className="text-[11px] mt-auto">
                    {active.live ? (
                      <span className="inline-flex items-center gap-1.5 text-green-400 font-semibold">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: '0 0 6px rgba(74,222,128,0.8)' }} />
                        Live now
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">{active.label}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function HumansPage() {
  if (!LEAD_ACCESS_ON) return <UserManagementPage />
  return <HumansOverview />
}
