'use client'

import { useEffect, useMemo, useState } from 'react'
import { MdCall, MdLocalFireDepartment, MdVerifiedUser, MdCheckCircle, MdEmojiEvents } from 'react-icons/md'

/**
 * The left column: how the calling is going.
 *
 * The human pipeline is measured in calls made, not leads parked in a stage,
 * so the biggest number on this panel is calls today and the graph behind it
 * is calls per day. The stage tiles are the outcomes of that calling - hot,
 * qualified, demos taken, registrations - and they are passed in by the page,
 * which already counts them exactly.
 */

/**
 * Hot = High Intent + Qualified, which IS the qualified stage group - so a
 * separate "Qualified" tile would print the same number twice. The second
 * tile is the booking instead, the step that actually follows being hot.
 */
export interface PipelineStatTiles {
  hot: number
  booked: number
  demoDone: number
  won: number
}

interface StatsData {
  callsToday: number
  callsInWindow: number
  callsByDay: Array<{ day: string; count: number }>
  callsByUser: Array<{ name: string; count: number }>
}

const RANGES = [7, 14] as const

/** Bars, not a line: a day is a discrete thing you either called on or didn't. */
function CallBars({ points, color }: { points: Array<{ day: string; count: number }>; color: string }) {
  const max = Math.max(1, ...points.map((p) => p.count))
  return (
    <div className="flex items-end gap-[3px] h-[52px]" aria-hidden>
      {points.map((p) => {
        const h = p.count === 0 ? 2 : Math.max(4, Math.round((p.count / max) * 48))
        let label = p.day
        try {
          label = new Date(`${p.day}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
        } catch { /* keep the raw day */ }
        return (
          <div
            key={p.day}
            className="flex-1 rounded-t-[3px] transition-all"
            style={{
              height: h,
              minWidth: 6,
              background: p.count === 0 ? 'var(--border-primary)' : color,
              opacity: p.count === 0 ? 0.6 : 0.85,
            }}
            title={`${label}: ${p.count} ${p.count === 1 ? 'call' : 'calls'}`}
          />
        )
      })}
    </div>
  )
}

function Tile({ icon, label, value, color, onClick }: {
  icon: React.ReactNode; label: string; value: number; color: string; onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border px-3 py-2.5 flex items-center gap-2.5 ${onClick ? 'hover:opacity-90 cursor-pointer' : 'cursor-default'}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 7%, var(--bg-secondary))`,
        borderColor: `color-mix(in srgb, ${color} 26%, var(--border-primary))`,
      }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold truncate" style={{ color }}>{label}</div>
        <div className="text-[19px] font-bold leading-tight" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    </button>
  )
}

export default function PipelineStats({
  owner,
  tiles,
  bookedLabel = 'Demo booked',
  reloadKey = 0,
  onOpenStage,
}: {
  owner: string
  tiles: PipelineStatTiles
  /** The brand's own name for the booking milestone. */
  bookedLabel?: string
  reloadKey?: number
  /** Tiles open the matching leads list - that is a list view, not a lead. */
  onOpenStage?: (key: keyof PipelineStatTiles) => void
}) {
  const [days, setDays] = useState<number>(7)
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  const ownerParam = owner === 'unassigned' ? 'all' : owner

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/dashboard/pipeline/stats?owner=${encodeURIComponent(ownerParam)}&days=${days}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && !d?.error) setData(d) })
      .catch(() => { /* the tiles below still render */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ownerParam, days, reloadKey])

  const bars = useMemo(() => data?.callsByDay || [], [data])
  const BLUE = '#3B82F6'

  return (
    <div className="flex flex-col gap-2.5">
      {/* Calls - the headline of the human pipeline */}
      <div className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${BLUE} 16%, transparent)`, color: BLUE }}>
            <MdCall size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.09em]" style={{ color: BLUE }}>Calls today</div>
            <div className="text-[26px] font-black leading-none" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {loading && !data ? '–' : (data?.callsToday ?? 0)}
            </div>
          </div>
          <div className="ml-auto flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold border"
                style={{
                  borderColor: days === r ? `color-mix(in srgb, ${BLUE} 50%, transparent)` : 'var(--border-primary)',
                  color: days === r ? BLUE : 'var(--text-muted)',
                  background: days === r ? `color-mix(in srgb, ${BLUE} 12%, transparent)` : 'transparent',
                }}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2.5">
          {bars.length > 0 ? <CallBars points={bars} color={BLUE} /> : <div style={{ height: 52 }} />}
          <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            <span>{days} days</span>
            <span>{data?.callsInWindow ?? 0} calls logged</span>
          </div>
        </div>

        {/* Who is calling - only meaningful when looking at more than one person */}
        {data?.callsByUser && data.callsByUser.length > 0 && (
          <div className="mt-2 pt-2 space-y-1" style={{ borderTop: '1px solid var(--border-primary)' }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>Today by person</div>
            {data.callsByUser.slice(0, 6).map((u) => (
              <div key={u.name} className="flex items-center justify-between text-[11.5px]">
                <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{u.name}</span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{u.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* What the calling produced */}
      <div className="grid grid-cols-2 gap-2.5">
        <Tile icon={<MdLocalFireDepartment size={17} />} label="Hot" value={tiles.hot} color="#ef4444" onClick={onOpenStage ? () => onOpenStage('hot') : undefined} />
        <Tile icon={<MdVerifiedUser size={17} />} label={bookedLabel} value={tiles.booked} color="#22c55e" onClick={onOpenStage ? () => onOpenStage('booked') : undefined} />
        <Tile icon={<MdCheckCircle size={17} />} label="Demos taken" value={tiles.demoDone} color="#6366f1" onClick={onOpenStage ? () => onOpenStage('demoDone') : undefined} />
        <Tile icon={<MdEmojiEvents size={17} />} label="Registrations" value={tiles.won} color="#f59e0b" onClick={onOpenStage ? () => onOpenStage('won') : undefined} />
      </div>
    </div>
  )
}
