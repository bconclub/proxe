'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  MdPersonOutline, MdChatBubbleOutline, MdVerifiedUser, MdStar,
  MdCheckCircle, MdDescription, MdEmojiEvents,
  MdEventBusy, MdPause, MdClose,
  MdTrendingUp, MdGroups, MdRefresh,
} from 'react-icons/md'

// Stage groups → the DB lead_stage values they roll up. No Show / Parked aren't
// tracked yet (no such stage exists) so they read 0 until we add them.
const GROUPS = {
  new: ['New', '', 'In Sequence'],
  engaged: ['Engaged'],
  qualified: ['Qualified', 'High Intent'],
  demoBooked: ['Booking Made'],
  demoDone: ['Call Done', 'Demo Done'],
  offerMade: ['Proposal Sent', 'Offer Made'],
  won: ['Converted', 'Won'],
  noShow: ['No Show'],
  parked: ['Parked'],
  closedLost: ['Closed Lost', 'Lost', 'Cold', 'Not Qualified'],
} as const

type GroupKey = keyof typeof GROUPS
type Counts = Record<GroupKey, number> & { total: number }

// A pipeline stat card — tinted by its accent, clickable through to the leads
// list filtered by these stages.
function StageCard({ icon, label, value, color, onClick, big }: {
  icon: React.ReactNode; label: string; value: number; color: string; onClick?: () => void; big?: boolean
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={`text-left rounded-xl border p-4 flex items-center gap-3 transition-all ${onClick ? 'hover:opacity-90 cursor-pointer' : 'cursor-default'}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 9%, var(--bg-primary))`,
        borderColor: `color-mix(in srgb, ${color} 28%, var(--border-primary))`,
      }}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`, color }}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</div>
        <div className={`${big ? 'text-3xl' : 'text-2xl'} font-bold leading-tight`} style={{ color: 'var(--text-primary)' }}>{value}</div>
      </div>
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wider mb-2 mt-4" style={{ color: 'var(--text-muted)' }}>{children}</div>
}

export default function PipelineFunnel() {
  const router = useRouter()
  const [c, setC] = useState<Counts | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const countFor = async (stages: readonly string[]) => {
          const { count } = await supabase.from('all_leads').select('id', { count: 'exact', head: true }).in('lead_stage', stages as string[])
          return count || 0
        }
        const totalQ = await supabase.from('all_leads').select('id', { count: 'exact', head: true })
        const keys = Object.keys(GROUPS) as GroupKey[]
        const vals = await Promise.all(keys.map((k) => countFor(GROUPS[k])))
        if (cancelled) return
        const obj = { total: totalQ.count || 0 } as Counts
        keys.forEach((k, i) => { obj[k] = vals[i] })
        setC(obj)
      } catch { if (!cancelled) setC(null) }
    })()
    return () => { cancelled = true }
  }, [reloadKey])

  const goStage = (stages: readonly string[]) => router.push(`/dashboard/leads?stage=${encodeURIComponent(stages[0])}`)

  if (!c) {
    return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading pipeline…</div>
  }

  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—')
  const keyEventRate = pct(c.demoBooked, c.total)
  const showUpRate = pct(c.demoDone, c.demoBooked)
  const trueWinRate = pct(c.won, c.demoBooked)
  const revivable = c.noShow + c.parked

  const BLUE = '#3B82F6', PURPLE = '#7f77dd', GREEN = '#22c55e', AMBER = '#f59e0b', GRAY = '#8a8a8a', RED = '#ef4444'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-end -mb-2">
        <button onClick={() => { setC(null); setReloadKey((k) => k + 1) }} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md" style={{ color: 'var(--accent-primary)' }}>
          <MdRefresh size={14} /> Refresh
        </button>
      </div>

      <SectionLabel>Pre key event</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StageCard icon={<MdPersonOutline size={20} />} label="New" value={c.new} color={BLUE} onClick={() => goStage(GROUPS.new)} />
        <StageCard icon={<MdChatBubbleOutline size={20} />} label="Engaged" value={c.engaged} color={BLUE} onClick={() => goStage(GROUPS.engaged)} />
        <StageCard icon={<MdVerifiedUser size={20} />} label="Qualified" value={c.qualified} color={BLUE} onClick={() => goStage(GROUPS.qualified)} />
      </div>

      <SectionLabel>Key event</SectionLabel>
      <button
        type="button" onClick={() => goStage(GROUPS.demoBooked)}
        className="w-full rounded-xl border p-5 flex items-center justify-between gap-4 transition-all hover:opacity-90 text-left"
        style={{ backgroundColor: `color-mix(in srgb, ${PURPLE} 16%, var(--bg-primary))`, borderColor: `color-mix(in srgb, ${PURPLE} 45%, var(--border-primary))` }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${PURPLE} 26%, transparent)`, color: '#b0ace0' }}><MdStar size={24} /></span>
          <div className="min-w-0">
            <div className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Demo Booked</div>
            <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${PURPLE} 24%, transparent)`, color: '#cfccf2' }}>Configurable key event</span>
          </div>
        </div>
        <div className="text-5xl sm:text-6xl font-black shrink-0" style={{ color: 'var(--text-primary)' }}>{c.demoBooked}</div>
      </button>

      <SectionLabel>Post key event</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StageCard icon={<MdCheckCircle size={20} />} label="Demo Done" value={c.demoDone} color={GREEN} onClick={() => goStage(GROUPS.demoDone)} />
        <StageCard icon={<MdDescription size={20} />} label="Offer Made" value={c.offerMade} color={GREEN} onClick={() => goStage(GROUPS.offerMade)} />
        <StageCard icon={<MdEmojiEvents size={20} />} label="Won" value={c.won} color={GREEN} onClick={() => goStage(GROUPS.won)} />
      </div>

      <SectionLabel>Exit states</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StageCard icon={<MdEventBusy size={20} />} label="No Show" value={c.noShow} color={AMBER} onClick={() => goStage(GROUPS.noShow)} />
        <StageCard icon={<MdPause size={20} />} label="Parked" value={c.parked} color={GRAY} onClick={() => goStage(GROUPS.parked)} />
        <StageCard icon={<MdClose size={20} />} label="Closed-Lost" value={c.closedLost} color={RED} onClick={() => goStage(GROUPS.closedLost)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <MetricCard icon={<MdTrendingUp size={18} />} color={BLUE} label="Key Event Rate" value={keyEventRate} />
        <MetricCard icon={<MdGroups size={18} />} color={PURPLE} label="Show-up Rate" value={showUpRate} />
        <MetricCard icon={<MdEmojiEvents size={18} />} color={GREEN} label="True Win Rate" value={trueWinRate} />
        <MetricCard icon={<MdRefresh size={18} />} color={GRAY} label="Revivable" value={String(revivable)} />
      </div>
    </div>
  )
}

function MetricCard({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>{icon}</span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
