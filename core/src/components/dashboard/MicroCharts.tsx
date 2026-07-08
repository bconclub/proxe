'use client'

import React from 'react'
import { LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar, RadialBarChart, RadialBar, ResponsiveContainer, Tooltip, YAxis, XAxis, CartesianGrid, LabelList } from 'recharts'

// Activity heatmap — GitHub-contribution-style square grid, weekday-aligned
// (rows = Sun→Sat, columns = weeks). Reads {date, count}[] (oldest→newest) and
// buckets counts into 5 shades. Clean, at-a-glance "what's happening across N
// days" — used for the POP campaign home.
export function ActivityHeatmap({ data, color = 'var(--accent-primary)' }: { data: Array<{ date: string; count: number }>; color?: string }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map((d) => d.count), 1)
  // 0 → empty; then 4 buckets by fraction of max.
  const shadeOf = (c: number): { bg: string; op: number } => {
    if (c <= 0) return { bg: 'var(--bg-tertiary)', op: 1 }
    const f = c / max
    const op = f > 0.75 ? 1 : f > 0.5 ? 0.78 : f > 0.25 ? 0.52 : 0.3
    return { bg: color, op }
  }
  // Pad the front so the first cell lands on its real weekday.
  const first = new Date(data[0].date)
  const startPad = isNaN(first.getTime()) ? 0 : first.getDay() // 0 = Sun
  const cells: Array<{ date: string; count: number } | null> = [
    ...Array(startPad).fill(null),
    ...data,
  ]
  // Chunk into week-columns of 7 (Sun→Sat top→bottom).
  const cols: Array<Array<{ date: string; count: number } | null>> = []
  for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7))
  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) } catch { return iso }
  }
  const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
      {/* weekday labels */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
        {WEEKDAYS.map((w, i) => (
          <span key={i} style={{ height: 15, fontSize: 8, lineHeight: '15px', color: 'var(--text-muted)', opacity: i % 2 ? 0.9 : 0 }}>{w}</span>
        ))}
      </div>
      {/* week columns */}
      <div style={{ display: 'flex', gap: 4, flex: 1 }}>
        {cols.map((col, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            {Array.from({ length: 7 }, (_, ri) => {
              const cell = col[ri]
              if (!cell) return <div key={ri} style={{ aspectRatio: '1', borderRadius: 3, background: 'transparent' }} />
              const s = shadeOf(cell.count)
              return (
                <div
                  key={ri}
                  title={`${fmtDate(cell.date)} · ${cell.count} voices`}
                  style={{ aspectRatio: '1', borderRadius: 3, background: s.bg, opacity: s.op, border: '1px solid var(--border-primary)' }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// Helper to get theme accent color
const getAccentColor = () => {
  if (typeof window === 'undefined') return 'var(--accent-primary)'
  return getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || 'var(--accent-primary)'
}

// Sparkline - Minimal line chart for trends
export function Sparkline({ data, color, height = 40, showGradient = false, amplify = 0.85 }: {
  data: Array<{ value: number }>,
  color?: string,
  height?: number,
  showGradient?: boolean,
  /**
   * How much of the chart height the series' own min→max range should fill
   * (0–1). At 1 the line spans edge-to-edge; lower values leave headroom.
   * We default below 1 so peaks read as tall *spikes* with a little breathing
   * room rather than slamming the top edge. Lower this once real volume makes
   * the series naturally full.
   */
  amplify?: number
}) {
  const defaultColor = color || getAccentColor()
  const chartData = data.map((d, i) => ({ name: i, value: d.value }))
  const gradientId = `gradient-${defaultColor.replace(/[^a-zA-Z0-9]/g, '')}`

  // Pin the Y domain to the series' own range so EVERY day's movement uses the
  // full height instead of squishing into a thin band under one dominant spike
  // (which read as "flat and low"). `amplify` pads the domain so the range
  // fills `amplify` fraction of the height — taller spikes, slight headroom.
  const vals = data.map((d) => d.value)
  let lo = vals.length ? Math.min(...vals) : 0
  let hi = vals.length ? Math.max(...vals) : 1
  if (lo === hi) { lo -= 1; hi += 1 } // flat series → give it a visible band
  const span = hi - lo
  const headroom = span * (1 / Math.max(amplify, 0.2) - 1) / 2
  const domain: [number, number] = [lo - headroom, hi + headroom]

  if (showGradient) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={defaultColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={defaultColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={domain} />
          <Area
            type="monotone"
            dataKey="value"
            fill={`url(#${gradientId})`}
            stroke={defaultColor}
            strokeWidth={2}
            dot={false}
            isAnimationActive={true}
          />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <YAxis hide domain={domain} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={defaultColor}
          strokeWidth={2}
          dot={false}
          isAnimationActive={true}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Trend Sparkline with % change
export function TrendSparkline({ 
  data, 
  change, 
  color,
  height = 50 
}: { 
  data: Array<{ value: number }>, 
  change: number,
  color?: string,
  height?: number 
}) {
  const defaultColor = color || getAccentColor()
  const chartData = data.map((d, i) => ({ name: i, value: d.value }))
  const isPositive = change >= 0
  const displayColor = isPositive ? '#22C55E' : '#EF4444'
  
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? '↑' : '↓'}{Math.abs(change)}%
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={displayColor}
            strokeWidth={2}
            dot={false}
            isAnimationActive={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Mini Funnel
export function MiniFunnel({ data }: { data: Array<{ label: string; value: number }> }) {
  const maxValue = Math.max(...data.map(d => d.value))
  
  return (
    <div className="space-y-1">
      {data.map((item, index) => {
        const width = maxValue > 0 ? (item.value / maxValue) * 100 : 0
        const colors = ['#3B82F6', '#06B6D4', '#F59E0B', '#22C55E']
        return (
          <div key={item.label} className="flex items-center gap-2">
            <div className="w-12 text-xs text-gray-600 dark:text-gray-400 text-right">{item.value}</div>
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded h-2">
              <div
                className="h-2 rounded transition-all"
                style={{ width: `${width}%`, backgroundColor: colors[index % colors.length] }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Progress Bar with Gradient
export function ScoreProgressBar({ score, height = 8 }: { score: number, height?: number }) {
  // Use accent color with gradient for progress bar
  const accentColor = getAccentColor()
  
  // Cap the width at 100% even if score > 100
  const cappedScore = Math.min(score, 100)
  const widthPercentage = cappedScore
  
  return (
    <div 
      className="w-full rounded-full overflow-hidden" 
      style={{ 
        height, 
        maxWidth: '100%',
        backgroundColor: 'var(--bg-tertiary)'
      }}
    >
      <div
        className="rounded-full transition-all"
        style={{
          width: `${widthPercentage}%`,
          maxWidth: '100%',
          height,
          background: `linear-gradient(90deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
        }}
      />
    </div>
  )
}

// Channel Activity Bars
export function ChannelActivityBars({ data }: { data: Array<{ channel: string; count: number }> }) {
  const colors: Record<string, string> = {
    web: '#3B82F6',
    whatsapp: '#22C55E',
    voice: getAccentColor(),
    social: '#EC4899',
  }
  
  const maxCount = Math.max(...data.map(d => d.count), 1)
  
  return (
    <div className="flex items-end gap-1" style={{ height: '20px' }}>
      {data.map((item) => {
        const height = (item.count / maxCount) * 100
        return (
          <div
            key={item.channel}
            className="flex-1 rounded-t transition-all hover:opacity-80"
            style={{
              height: `${height}%`,
              backgroundColor: colors[item.channel] || '#6B7280',
              minHeight: item.count > 0 ? '4px' : '0',
            }}
            title={`${item.channel}: ${item.count}`}
          />
        )
      })}
    </div>
  )
}

// Stage Pipeline Indicator
export function StagePipelineIndicator({ stage }: { stage: string }) {
  const stages = ['New', 'Engaged', 'Qualified', 'High Intent', 'Booking Made', 'Converted']
  const currentIndex = stages.indexOf(stage)
  const progress = currentIndex >= 0 ? ((currentIndex + 1) / stages.length) * 100 : 0
  
  return (
    <div className="w-full">
      <div className="flex items-center gap-1 mb-1">
        {stages.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-1 rounded ${
              i <= currentIndex ? '' : 'bg-gray-200 dark:bg-gray-700'
            }`}
            style={i <= currentIndex ? { backgroundColor: 'var(--accent-primary)' } : undefined}
          />
        ))}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{stage}</div>
    </div>
  )
}

// Donut Chart
export function DonutChart({ data, colors }: { data: Array<{ name: string; value: number }>, colors?: string[] }) {
  // Default colors - first color uses theme accent, others are semantic
  const getDefaultColors = () => {
    return [getAccentColor(), '#22C55E', '#3B82F6', '#F59E0B']
  }
  const defaultColors = getDefaultColors()
  const chartColors = colors || defaultColors
  
  return (
    <ResponsiveContainer width="100%" height={120}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={30}
          outerRadius={50}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}

// Heatmap (simplified bar chart)
export function Heatmap({ data }: { data: Array<{ hour: number; value: number }> }) {
  const maxValue = Math.max(...data.map(d => d.value), 1)
  
  return (
    <div className="grid grid-cols-12 gap-1">
      {data.map((item) => {
        const intensity = (item.value / maxValue) * 100
        // Use theme accent color with varying opacity for intensity
        const accentColor = getAccentColor()
        // Create lighter shades by adjusting opacity
        const bgColor = intensity > 70 ? accentColor : intensity > 40 ? accentColor + 'CC' : accentColor + '99'
        
        return (
          <div
            key={item.hour}
            className="rounded transition-all hover:opacity-80"
            style={{
              height: '20px',
              backgroundColor: bgColor,
              opacity: intensity / 100,
            }}
            title={`${item.hour}:00 - ${item.value}`}
          />
        )
      })}
    </div>
  )
}

// Stacked Bar
export function StackedBar({ data }: { data: Array<{ name: string; hot: number; warm: number; cold: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <Bar dataKey="hot" stackId="a" fill="#EF4444" />
        <Bar dataKey="warm" stackId="a" fill="#F97316" />
        <Bar dataKey="cold" stackId="a" fill="#3B82F6" />
        <Tooltip />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Mini Bar Chart - Simple bar chart for sparklines
export function MiniBarChart({ data, color = 'var(--accent-primary)', height = 40 }: { 
  data: Array<{ value: number }>, 
  color?: string,
  height?: number 
}) {
  const chartData = data.map((d, i) => ({ name: i, value: d.value }))
  const maxValue = Math.max(...data.map(d => d.value), 1)
  
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Bar 
          dataKey="value" 
          fill={color}
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

// Conversations Trend — line chart with Y-axis gridlines, dots + per-day value
// labels (matches the dashboard's "axis + labelled points" trend style). Day
// labels are derived as the last N days ending today (series has no date field).
export function ConversationsTrendChart({ data, color, days, animate = true }: {
  data: Array<{ value: number }>,
  color?: string,
  days?: number,
  animate?: boolean,
}) {
  const stroke = color || getAccentColor()
  const n = data.length
  const today = new Date()
  const chartData = data.map((d, i) => {
    const dt = new Date(today)
    dt.setDate(dt.getDate() - (n - 1 - i))
    return { label: `${dt.getDate()} ${dt.toLocaleString('en-US', { month: 'short' })}`, value: d.value }
  })
  const max = Math.max(...data.map((d) => d.value), 1)
  const niceMax = Math.max(5, Math.ceil(max / 20) * 20)
  const yTicks = [0, niceMax / 4, niceMax / 2, (niceMax * 3) / 4, niceMax]
  // Per-point value labels only read cleanly when the points are sparse (≈ a
  // week); for 14/30-day ranges they'd collide, so drop them and thin the axis.
  const showLabels = n <= 10
  const xInterval = n <= 8 ? 0 : Math.max(1, Math.floor(n / 7))
  const gradientId = `convgrad-${stroke.replace(/[^a-zA-Z0-9]/g, '')}`
  // Abbreviate large values (10500 → 10.5K) so the y-axis ticks don't clip and
  // the per-point labels don't collide. No-op under 1000 (other brands unaffected).
  const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K` : `${Math.round(v)}`)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 22, right: 14, bottom: 2, left: -6 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border-primary)" strokeOpacity={0.6} />
        <XAxis
          dataKey="label"
          interval={xInterval}
          tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
          dy={4}
        />
        <YAxis
          scale="sqrt"
          domain={[0, niceMax]}
          ticks={yTicks}
          tickFormatter={compact}
          tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
          width={38}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={{ r: 2.5, fill: stroke, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
          isAnimationActive={animate}
          style={{ filter: `drop-shadow(0 0 3px ${stroke}66)` }}
        >
          {showLabels && (
            <LabelList dataKey="value" position="top" offset={8} formatter={compact} fill="var(--text-primary)" style={{ fontSize: 9, fontWeight: 600 }} />
          )}
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Area Chart for Activity
export function ActivityArea({ data, color }: { data: Array<{ time: string; value: number }>, color?: string }) {
  const defaultColor = color || getAccentColor()
  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Area
          type="monotone"
          dataKey="value"
          stroke={defaultColor}
          fill={defaultColor}
          fillOpacity={0.3}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Radial Progress Chart - Value inside circle, label below
export function RadialProgress({ 
  value, 
  max = 100, 
  label, 
  color,
  size = 96,
  valueFormatter = (v: number) => `${v}%`,
  showPercentage = true
}: { 
  value: number, 
  max?: number, 
  label: string,
  color?: string,
  size?: number,
  valueFormatter?: (value: number) => string,
  showPercentage?: boolean
}) {
  const defaultColor = color || getAccentColor()
  const percentage = Math.min((value / max) * 100, 100)
  const strokeW = size >= 100 ? 4 : 2
  const radius = size / 2 - strokeW / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - percentage / 100)
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg 
          className="transform -rotate-90" 
          style={{ width: size, height: size }}
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background circle (track) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={defaultColor}
            strokeWidth={strokeW}
            fill="none"
            style={{ opacity: 0.2 }}
          />
          {/* Progress circle (stroke only) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={defaultColor}
            strokeWidth={strokeW}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-300"
            strokeLinecap="round"
          />
        </svg>
        {/* Value inside circle */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold"
            style={{ color: defaultColor, fontSize: size <= 60 ? '11px' : size >= 100 ? '22px' : '18px', lineHeight: 1 }}
          >
            {valueFormatter(value)}
          </span>
        </div>
      </div>
      {/* Label below circle - hidden when empty */}
      {label && <p className="text-xs font-medium mt-2" style={{ color: 'var(--text-secondary)' }}>{label}</p>}
    </div>
  )
}
