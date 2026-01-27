'use client'

import { LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar, RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts'

// Helper to get theme accent color
const getAccentColor = () => {
  if (typeof window === 'undefined') return 'var(--accent-primary)'
  return getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || 'var(--accent-primary)'
}

// Sparkline - Minimal line chart for trends
export function Sparkline({ data, color, height = 40, showGradient = false }: { 
  data: Array<{ value: number }>, 
  color?: string, 
  height?: number,
  showGradient?: boolean 
}) {
  const defaultColor = color || getAccentColor()
  const chartData = data.map((d, i) => ({ name: i, value: d.value }))
  const gradientId = `gradient-${defaultColor.replace(/[^a-zA-Z0-9]/g, '')}`
  
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
          <Area
            type="basis"
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
        <Line
          type="basis"
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
  const radius = size / 2 - 2
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
            strokeWidth="2"
            fill="none"
            style={{ opacity: 0.2 }}
          />
          {/* Progress circle (stroke only) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={defaultColor}
            strokeWidth="2"
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
            className="text-lg font-bold"
            style={{ color: defaultColor }}
          >
            {valueFormatter(value)}
          </span>
        </div>
      </div>
      {/* Label below circle */}
      <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mt-2">{label}</p>
    </div>
  )
}
