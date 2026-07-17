'use client'

import { useState, useEffect, useCallback, useRef, isValidElement, cloneElement, type ReactNode } from 'react'
import ScoreRing from './ScoreRing'
import InitialsAvatar from './InitialsAvatar'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { playSound } from '@/lib/sound-prefs'
import Image from 'next/image'
import { MdDragIndicator, MdRestartAlt, MdTrendingUp, MdTrendingDown, MdRemove, MdCheckCircle, MdSchedule, MdMessage, MdWarning, MdArrowForward, MdLocalFireDepartment, MdSpeed, MdPeople, MdEvent, MdRefresh, MdCancel, MdTrendingUp as MdScoreUp, MdSwapHoriz, MdPhoneDisabled, MdArrowUpward, MdShowChart, MdFlashOn, MdChatBubble, MdCalendarToday, MdArrowDropDown, MdWhatsapp, MdLanguage, MdEventBusy, MdNotifications, MdFavorite, MdSettings, MdLogout, MdCall, MdAssignment, MdVerified, MdAccountBalanceWallet, MdSmartphone, MdQrCode2, MdPhoneMissed, MdDoorFront, MdAutoAwesome, MdInsights, MdMic, MdPlace, MdAccessTime, MdChevronRight, MdStarBorder, MdGroups, MdMyLocation, MdMood } from 'react-icons/md'
import { FaInstagram, FaFacebookF, FaGoogle, FaYoutube, FaLinkedinIn } from 'react-icons/fa'
import LeadDetailsModal from './LeadDetailsModal'
import NotificationCenter from './NotificationCenter'
import { useFeatureFlags } from '@/lib/useFeatureFlags'
import { getBrandConfig, brandLabel } from '@/configs'
import type { Lead } from '@/types'
import {
  Sparkline,
  ActivityArea,
  ConversationsTrendChart,
  ActivityHeatmap,
  activityPeaks,
  WeekHourHeatmap,
  peaksFromWeekHour,
  RadialProgress,
} from './MicroCharts'

type TimeFilter = 'All' | '7D' | '14D' | '30D'

interface FounderMetrics {
  hotLeads: { count: number; leads: Array<{ id: string; name: string; score: number }> }
  totalConversations: { total: number; count1D?: number; count7D: number; count14D: number; count30D: number; trend7D: number; trend14D: number; trend30D: number }
  totalLeads: { count: number; count1D?: number; count7D: number; count14D: number; count30D: number; change7D?: number; change14D?: number; change30D?: number; fromConversations: number; conversionRate: number }
  engagedLeads: { count: number; count1D?: number; count7D: number; count14D: number; count30D: number; total: number; engagementRate: number; leads: Array<{ id: string; name: string; score: number }> }
  warmLeads: { count: number; count1D?: number; count7D: number; count14D: number; count30D: number; leads: Array<{ id: string; name: string; score: number }> }
  leadsRecovered?: { count: number }
  // POP-only: cohort funnel for the Engine Overview toggle (ported from the pop fork).
  funnel?: Record<'Today' | '7D' | '14D' | 'All', { total: number; engaged: number; warm: number; followUpDue: number; booked: number }>
  responseHealth: { avgMs: number; status: 'good' | 'warning' | 'critical' }
  leadsNeedingAttention: Array<{
    id: string
    name: string
    score: number
    lastContact: string
    stage: string
    owner?: { name?: string | null; email?: string | null } | null
    channel?: string | null
  }>
  upcomingBookings: Array<{
    id: string
    name: string
    title?: string | null
    courseInterest?: string | null
    userType?: string | null
    painPoint?: string | null
    timeline?: string | null
    date: string
    time: string
    datetime: string
    owner?: { name?: string | null; email?: string | null } | null
  }>
  staleLeads: { count: number; leads: Array<{ id: string; name: string }> }
  leadFlow: { new: number; engaged: number; qualified: number; booked: number }
  // Windchasers-only: lead-type breakdown for the Engine Overview strip. Null on
  // other brands (aviation taxonomy). Webinar splits by Zoom-registration status.
  leadTypeBreakdown?: {
    pilot: number; flightSchool: number; cabinCrew: number; webinar: number
    webinarRegistered: number; webinarNotRegistered: number; total: number
  } | null
  // Gigs tab only - scout lifecycle stage breakdown (all zero otherwise). Same
  // stage derivation as the Gigs table's STATUS column, so they never disagree.
  gigStageCounts?: { loggedIn: number; kycStarted: number; kycDone: number; live: number; active: number }
  // Gigs tab only - scouts reaching KYC-started in the last 7 days (0 otherwise).
  kycStarted7D?: number
  // POP-only: inbound/outbound voice volume for the Calls KPI card (ported from the pop fork).
  calls?: {
    total: number
    inbound: number
    outbound: number
    today: number
    todayInbound: number
    todayOutbound: number
    count7D: number
    trend7D: number
    trend: { data: Array<{ value: number }>; change: number }
  }
  channelPerformance: {
    web: { total: number; booked: number }
    whatsapp: { total: number; booked: number }
    voice: { total: number; booked: number }
  }
  scoreDistribution: { hot: number; warm: number; cold: number }
  recentActivity: Array<{ id: string; channel: string; type: string; timestamp: string; content: string; metadata?: any }>
  quickStats: { bestChannel: string; busiestHour: string; topPainPoint: string }
  trends?: {
    leads: { data: Array<{ value: number }>; change: number }
    bookings: { data: Array<{ value: number }>; change: number }
    kycStarted?: { data: Array<{ value: number }>; change: number }
    conversations: { data: Array<{ value: number }>; change: number }
    hotLeads: { data: Array<{ value: number }>; change: number }
    responseTime: { data: Array<{ value: number }>; change: number }
  }
  upcomingBookingsTrend?: Array<{ value: number }>
  hourlyActivity?: Array<{ time: string; value: number }>
  radialMetrics?: {
    avgScore: number
    responseRate: number
    bookingRate: number
    avgResponseTime: number
  }
  radialTrends?: {
    avgScore: Array<{ value: number }>
    responseRate: Array<{ value: number }>
    bookingRate: Array<{ value: number }>
    avgResponseTime: Array<{ value: number }>
  }
  trendSeries?: { conversations: Record<TimeFilter, Array<{ value: number }>> }
  // POP-only: the three home cards reworked for the campaign (see route).
  campaignHome?: {
    events: Array<{
      id: string; title: string; topic?: string | null
      constituency?: string | null; district?: string | null; venue?: string | null
      event_date?: string | null; status: string
      going: number; interested: number; seatVolunteers: number; seatSupporters: number
    }>
    attentionSeats: Array<{
      constituency: string; district?: string | null; total: number
      grievances: number; unresolved: number; loopHealthPct: number
      topCategory?: string | null; mood: number; supporters: number; volunteers: number; attention: number
      series?: number[]; deltaPct?: number
    }>
    sources: {
      total7d: number; byMagnet: Array<{ magnet: string; count: number; share: number }>
      total30d?: number; mix?: Array<{ magnet: string; count: number; share: number; delta7: number }>
    }
    dailyActivity?: Array<{ date: string; count: number }>
    weekHour?: number[][]
    ladder?: { voters: number; supporters: number; volunteers: number; cadre: number; grievances: number }
  }
  // ALL brands: generic Activity Sources (touchpoints by conversation channel,
  // last 30 days) — the metrics route ships this for every brand.
  sources?: {
    total30d: number
    mix: Array<{ magnet: string; count: number; share: number; delta7: number }>
    delta7Total: number
    dailyAvg30: number
  }
}

// "Mon, 15 Jun · 4:00 PM" in IST from a stored booking datetime.
function formatBookingWhen(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const date = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    return `${date} · ${time}`
  } catch {
    return ''
  }
}

// Human-readable duration from milliseconds (agent reply latency).
function fmtMs(ms: number): string {
  if (!ms || ms <= 0) return '-'
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

// ── POP/BCON dashboard-home divergence (ported from those forks, brand-gated) ──
// One brand per build, so these resolve statically at module load.
const brandCfg = getBrandConfig()
const isPop = brandCfg.brand === 'pop'
const isBcon = brandCfg.brand === 'bcon'
const isWindchasers = brandCfg.brand === 'windchasers'
// BCON + POP share the newer dashboard-home look (bcon is the origin fork,
// pop is its clone): subtler tints, cohort funnel with a Today window,
// reply-rate-driven Follow-up Health, compact Upcoming Events rows.
const hasNewHomeLook = isPop || isBcon
// BCON/POP use subtler KPI-card tints (4% bg / 14% border); other brands keep core's 7%/22%.
const TINT_BG = hasNewHomeLook ? '4%' : '7%'
const TINT_BORDER = hasNewHomeLook ? '14%' : '22%'
// lokazen-only Leads/Gigs tab: same dashboard, same components, wired to
// scout/connector leads instead of business leads when the Gigs tab is active.
// Gated on the brand's scouts feature so no other brand ever sees the toggle.
const showGigsTab = brandCfg.features?.scouts === true

// Thousands separator for the full KPI numbers (8,832 / 1,284). Indian grouping.
const fmtComma = (n: number | string): string => (typeof n === 'number' ? n.toLocaleString('en-IN') : String(n))
// POP formats headline KPI numbers with separators; other brands render raw.
const fmt = (n: number | string): number | string => (isPop ? fmtComma(n) : n)
// Compact K abbreviation for the tight Engine Overview nodes (10.5K, 2.9K, 760).
const abbrevK = (n: number): string => (n < 1000 ? String(n) : `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`)

// POP entry-channel (magnet) labels + colors for the "where it came from" strip.
const MAGNET_META: Record<string, { label: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', color: '#22c55e' },
  voice: { label: 'Voice', color: '#3b82f6' },
  pulse_app: { label: 'My Voice', color: '#a78bfa' },
  qr: { label: 'QR', color: '#f06c18' },
  missed_call: { label: 'Missed call', color: '#f59e0b' },
  d2d: { label: 'Door to Door', color: '#fb7185' },
  event: { label: 'Event', color: '#2ec4b6' },
  landing: { label: 'Landing', color: '#6ea5d4' },
  landing_page: { label: 'Landing', color: '#6ea5d4' },
  web: { label: 'Web', color: '#38bdf8' },
  social: { label: 'Social', color: '#e879f9' },
  other: { label: 'Other', color: '#7a8aa0' },
  // Marketing sources (windchasers Activity Sources groups by lead attribution)
  instagram: { label: 'Instagram', color: '#E1306C' },
  facebook: { label: 'Facebook', color: '#1877F2' },
  meta_ads: { label: 'Meta Ads', color: '#0668E1' },
  google_ads: { label: 'Google Ads', color: '#4285F4' },
  google_organic: { label: 'Google Organic', color: '#34A853' },
  youtube: { label: 'YouTube', color: '#FF0000' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2' },
  referral: { label: 'Referral', color: '#f59e0b' },
  organic: { label: 'Organic', color: '#84cc16' },
  direct: { label: 'Direct', color: '#7a8aa0' },
}
const magnetMeta = (m: string) => MAGNET_META[m] || { label: m.replace('_', ' '), color: '#7a8aa0' }

// Channel glyphs for the Activity Sources panel (reference-design tiles).
const MAGNET_ICON: Record<string, ReactNode> = {
  whatsapp: <MdWhatsapp size={15} />,
  voice: <MdMic size={15} />,
  pulse_app: <MdSmartphone size={15} />,
  qr: <MdQrCode2 size={15} />,
  missed_call: <MdPhoneMissed size={15} />,
  d2d: <MdDoorFront size={15} />,
  event: <MdEvent size={15} />,
  landing: <MdLanguage size={15} />,
  landing_page: <MdLanguage size={15} />,
  web: <MdLanguage size={15} />,
  social: <MdSmartphone size={15} />,
  instagram: <FaInstagram size={15} />,
  facebook: <FaFacebookF size={13} />,
  meta_ads: <FaFacebookF size={13} />,
  google_ads: <FaGoogle size={13} />,
  google_organic: <FaGoogle size={13} />,
  youtube: <FaYoutube size={15} />,
  linkedin: <FaLinkedinIn size={13} />,
  referral: <MdPeople size={15} />,
  organic: <MdTrendingUp size={15} />,
  direct: <MdLanguage size={15} />,
}
const magnetIcon = (m: string) => MAGNET_ICON[m] || <MdFlashOn size={15} />

// Donut (Source mix) for the Activity Sources panel - SVG arcs with the share
// % labelled at each segment's mid-angle (segments >= 7% only).
function SourceDonut({ mix, total }: { mix: Array<{ magnet: string; share: number; count: number }>; total: number }) {
  const size = 210; const c = size / 2; const rOut = 96; const rIn = 60; const rLbl = 78
  let angle = -90
  const segs = mix.filter((s) => s.count > 0).map((s) => {
    const sweep = (s.count / Math.max(mix.reduce((a, b) => a + b.count, 0), 1)) * 360
    const seg = { ...s, from: angle, to: angle + sweep }
    angle += sweep
    return seg
  })
  const pt = (r: number, deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)]
  }
  const arcPath = (from: number, to: number) => {
    const large = to - from > 180 ? 1 : 0
    const [x1, y1] = pt(rOut, from); const [x2, y2] = pt(rOut, to)
    const [x3, y3] = pt(rIn, to); const [x4, y4] = pt(rIn, from)
    return `M ${x1} ${y1} A ${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4} Z`
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: 230, height: 'auto', display: 'block', margin: '0 auto' }}>
      {segs.map((s) => (
        <path key={s.magnet} d={arcPath(s.from, Math.max(s.to - 1.2, s.from + 0.4))} fill={magnetMeta(s.magnet).color} />
      ))}
      {segs.filter((s) => s.share >= 7).map((s) => {
        const [lx, ly] = pt(rLbl, (s.from + s.to) / 2)
        return <text key={s.magnet} x={lx} y={ly + 3} fontSize={11} fontWeight={700} fill="#fff" textAnchor="middle">{s.share}%</text>
      })}
      <text x={c} y={c - 2} fontSize={22} fontWeight={800} fill="var(--text-primary)" textAnchor="middle">{fmtComma(total)}</text>
      <text x={c} y={c + 16} fontSize={9.5} fill="var(--text-secondary)" textAnchor="middle">Total touchpoints</text>
    </svg>
  )
}

// Deterministic gentle daily climb from `start`→`end` with a small wave - for
// the mock trend/sparkline series (no Math.random so renders are stable).
function popDailySeries(n: number, end: number, start: number): Array<{ value: number }> {
  const out: Array<{ value: number }> = []
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 1
    const base = start + (end - start) * t
    const wave = Math.sin(i * 1.3) * Math.abs(end) * 0.04
    out.push({ value: Math.max(0, Math.round(base + wave)) })
  }
  return out
}

// POP pitch dashboard: overlay campaign-scale ENGINE/KPI aggregates onto the real
// metrics so the overview reads like a live statewide operation. Lists (lead
// queues, bookings) stay real - only the headline numbers are mocked. Pop only.
function popMockMetrics(real: FounderMetrics): FounderMetrics {
  const conv7D = popDailySeries(7, 8832, 6100)
  const conv14D = popDailySeries(14, 8832, 4200)
  const conv30D = popDailySeries(30, 8832, 2600)
  return {
    ...real,
    totalConversations: { total: 214500, count1D: 8832, count7D: 52400, count14D: 98600, count30D: 196400, trend7D: 18, trend14D: 12, trend30D: 9 },
    totalLeads: { ...real.totalLeads, count: 10500, count1D: 412, count7D: 2840, count14D: 5460, count30D: 9200, conversionRate: 14, change7D: 11, change14D: 9, change30D: 7 },
    hotLeads: { ...real.hotLeads, count: 1284 },
    engagedLeads: { ...real.engagedLeads, count: 2940, count7D: 820, count14D: 1560, count30D: 2410, engagementRate: 28 },
    warmLeads: { ...real.warmLeads, count: 1880, count7D: 520, count14D: 1010, count30D: 1640 },
    leadFlow: { new: 10500, engaged: 2940, qualified: 1880, booked: 430 },
    funnel: {
      Today: { total: 412, engaged: 120, warm: 78, followUpDue: 44, booked: 22 },
      '7D': { total: 2840, engaged: 820, warm: 520, followUpDue: 210, booked: 128 },
      '14D': { total: 5460, engaged: 1560, warm: 1010, followUpDue: 430, booked: 246 },
      All: { total: 10500, engaged: 2940, warm: 1880, followUpDue: 760, booked: 430 },
    },
    responseHealth: { avgMs: 38000, status: 'good' },
    calls: { total: 1920, inbound: 1108, outbound: 812, today: 214, todayInbound: 124, todayOutbound: 90, count7D: 690, trend7D: 16, trend: { data: popDailySeries(7, 320, 180), change: 16 } },
    radialMetrics: { avgScore: real.radialMetrics?.avgScore ?? 68, responseRate: 92, bookingRate: 12, avgResponseTime: 38 },
    trendSeries: { conversations: { All: conv30D, '7D': conv7D, '14D': conv14D, '30D': conv30D } },
    trends: {
      leads: { data: popDailySeries(7, 1800, 1200), change: 11 },
      bookings: { data: popDailySeries(7, 70, 38), change: 14 },
      conversations: { data: conv7D, change: 18 },
      hotLeads: { data: popDailySeries(7, 220, 150), change: 9 },
      responseTime: { data: popDailySeries(7, 36, 48), change: -12 },
    },
  }
}

export default function FounderDashboard() {
  const router = useRouter()
  // Runtime feature flags (Settings → Features) gate the Brain button.
  const features = useFeatureFlags()
  const [metrics, setMetrics] = useState<FounderMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showLeadModal, setShowLeadModal] = useState(false)
  // Leads/Gigs tab (lokazen only, see showGigsTab) - identical dashboard,
  // wired to a different slice of the same founder-metrics endpoint.
  const [view, setView] = useState<'leads' | 'gigs'>('leads')

  // Per-card date ranges (founder: "put the toggle inside the cards, as we used
  // to have"). Active Conversations defaults to Today (24h); the trend to 7D.
  const [acRange, setAcRange] = useState<'Today' | '7D' | '14D'>('Today')
  const [range, setRange] = useState<'7D' | '14D' | '30D'>('7D')
  // Engine Overview funnel - All-time snapshot by default, with 7d/14d windows.
  // POP adds a Today (24h) window (cohort funnel ported from the pop fork).
  const [engineRange, setEngineRange] = useState<'Today' | '7D' | '14D' | 'All'>('All')
  // Top-bar user profile menu.
  const [profileOpen, setProfileOpen] = useState(false)
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  // Pull the signed-in user once for the greeting + profile menu.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (cancelled) return
        // Prefer the name set in User Management (dashboard_users.full_name) -
        // that's the field the admin edits. Fall back to auth metadata, then to
        // the email prefix. Editing the name in User Management must reflect here.
        let name = ''
        if (user?.id) {
          const { data: du } = await supabase
            .from('dashboard_users')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle()
          if (du?.full_name) name = du.full_name as string
        }
        if (!name) {
          const meta = (user?.user_metadata || {}) as Record<string, unknown>
          name = (meta.full_name as string) || (meta.name as string) || ''
        }
        setUser({ name, email: user?.email || '' })
      } catch { /* soft-fail - greeting falls back to "Founder" */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Close the profile menu on outside click.
  useEffect(() => {
    if (!profileOpen) return
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [profileOpen])

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch { /* redirect anyway */ }
    window.location.href = '/auth/login'
  }

  // Hot Leads threshold with localStorage persistence
  const [hotLeadThreshold] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hot-lead-threshold')
      return saved ? parseInt(saved, 10) : 70
    }
    return 70
  })

  // ── Movable home cards ──────────────────────────────────────────────────
  // The four big cards (Engine / Events / Queue / Sources) live in SLOTS. Grab
  // the grip on a card and drop it on another to SWAP slots; the order persists
  // per browser. Reset (top bar, shows only when customized) restores default.
  // Slots keep their grid spans — a card adopts the size of wherever it lands.
  const DEFAULT_CARD_ORDER = ['engine', 'events', 'queue', 'sources']
  const CARD_ORDER_KEY = 'proxe-home-cards'
  const [cardOrder, setCardOrder] = useState<string[]>(DEFAULT_CARD_ORDER)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CARD_ORDER_KEY) || 'null')
      if (Array.isArray(saved) && saved.length === 4 && DEFAULT_CARD_ORDER.every((id) => saved.includes(id))) setCardOrder(saved)
    } catch { /* keep default */ }
  }, [])
  const isCustomLayout = cardOrder.join() !== DEFAULT_CARD_ORDER.join()
  // Drag is ARMED by the grip (so buttons/text inside cards never start a drag).
  const [dragArm, setDragArm] = useState<string | null>(null)
  const dragCardRef = useRef<string | null>(null)
  const swapCards = useCallback((a: string, b: string) => {
    if (!a || !b || a === b) return
    setCardOrder((cur) => {
      const next = [...cur]
      const ia = next.indexOf(a), ib = next.indexOf(b)
      if (ia === -1 || ib === -1) return cur
      ;[next[ia], next[ib]] = [next[ib], next[ia]]
      try { localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])
  const resetLayout = useCallback(() => {
    setCardOrder(DEFAULT_CARD_ORDER)
    try { localStorage.removeItem(CARD_ORDER_KEY) } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fire the soft "ready" chime once, when the home page's first load lands.
  const readyChimedRef = useRef(false)

  const loadMetrics = useCallback(async () => {
    try {
      const scopeParam = showGigsTab ? `&scope=${view}` : ''
      const response = await fetch(`/api/dashboard/founder-metrics?hotLeadThreshold=${hotLeadThreshold}${scopeParam}`)
      if (response.ok) {
        const data = await response.json()
        // POP pitch dashboard: the People table stays real (125), but the
        // ENGINE/KPI aggregates show campaign-scale mock numbers so the overview
        // reads like a live statewide operation. Dashboard-only, pop-only.
        setMetrics(isPop ? popMockMetrics(data) : data)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Error loading metrics:', response.status, errorData)
        setMetrics(null)
      }
    } catch (error) {
      console.error('Error loading metrics:', error)
      setMetrics(null)
    } finally {
      setLoading(false)
      if (!readyChimedRef.current) {
        readyChimedRef.current = true
        playSound('ready') // once per mount; gated by the Configure toggle + mute
      }
    }
  }, [hotLeadThreshold, view])

  useEffect(() => {
    loadMetrics()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadMetrics()
    }
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadMetrics()
    }, 60000)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [hotLeadThreshold, loadMetrics])

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const openLeadModal = async (leadId: string) => {
    try {
      const supabase = createClient()
      const { data: lead, error } = await supabase
        .from('all_leads')
        .select('id, customer_name, email, phone, created_at, last_interaction_at, lead_score, lead_stage, sub_stage, unified_context, first_touchpoint, last_touchpoint, metadata')
        .eq('id', leadId)
        .single()

      if (error) {
        console.error('Error fetching lead:', error)
        return
      }
      if (!lead) return

      const typedLead = lead as any
      const unifiedContext = typedLead.unified_context || {}
      const webBooking = unifiedContext?.web?.booking || {}
      const whatsappBooking = unifiedContext?.whatsapp?.booking || {}
      const bookingDate = webBooking?.date || webBooking?.booking_date || whatsappBooking?.date || whatsappBooking?.booking_date || null
      const bookingTime = webBooking?.time || webBooking?.booking_time || whatsappBooking?.time || whatsappBooking?.booking_time || null

      const modalLead: Lead = {
        id: typedLead.id || '',
        name: typedLead.customer_name || 'Unknown',
        email: typedLead.email || '',
        phone: typedLead.phone || '',
        source: typedLead.first_touchpoint || typedLead.last_touchpoint || 'web',
        first_touchpoint: typedLead.first_touchpoint || null,
        last_touchpoint: typedLead.last_touchpoint || null,
        timestamp: typedLead.created_at || new Date().toISOString(),
        status: typedLead.status || null,
        booking_date: bookingDate,
        booking_time: bookingTime,
        unified_context: typedLead.unified_context || null,
        metadata: typedLead.metadata || {},
      }
      setSelectedLead(modalLead)
      setShowLeadModal(true)
    } catch (err) {
      console.error('Error opening lead modal:', err)
    }
  }

  // Recency tint for the countdown chip only: closer = blue, mid = amber, far = muted.
  const countdownTint = (datetime: string): { bg: string; color: string } => {
    const h = (new Date(datetime).getTime() - Date.now()) / 3_600_000
    if (h <= 24) return { bg: 'rgba(59,130,246,0.18)', color: '#60a5fa' }
    if (h <= 72) return { bg: 'rgba(245,158,11,0.18)', color: '#fbbf24' }
    return { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' }
  }

  const formatCountdown = (datetime: string) => {
    const bookingDate = new Date(datetime)
    const now = new Date()
    const diffMs = bookingDate.getTime() - now.getTime()
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMs < 0) return 'Past'
    if (diffDays > 0) {
      const hours = Math.floor((diffMs % 86400000) / 3600000)
      return `In ${diffDays}d ${hours}h`
    }
    if (diffHours > 0) return `In ${diffHours}h`
    const mins = Math.floor(diffMs / 60000)
    return `In ${mins}m`
  }

  const getInitials = (name: string) =>
    name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'L'

  // Program category chip. Prefers the structured course interest the agent
  // already captured for the lead (unified_context[BRAND_ID].course_interest),
  // and falls back to keyword-matching the free-text booking title. Accepts
  // multiple signals so the strongest available wins. Null when nothing matches.
  const eventCategory = (...signals: Array<string | null | undefined>): { label: string; color: string; bg: string } | null => {
    const t = signals.filter(Boolean).join(' ').toLowerCase()
    if (!t) return null
    if (t.includes('cabin')) return { label: 'Cabin Crew', color: '#a855f7', bg: 'rgba(168,85,247,0.14)' }
    if (t.includes('helicopter')) return { label: 'Helicopter', color: '#f472b6', bg: 'rgba(244,114,182,0.14)' }
    if (t.includes('drone')) return { label: 'Drone', color: '#2dd4bf', bg: 'rgba(45,212,191,0.14)' }
    if (t.includes('flight training')) return { label: 'Flight Training', color: '#10b981', bg: 'rgba(16,185,129,0.14)' }
    if (t.includes('cpl')) return { label: 'CPL Path', color: '#fbbf24', bg: 'rgba(245,158,11,0.16)' }
    if (t.includes('ppl')) return { label: 'PPL Path', color: '#fbbf24', bg: 'rgba(245,158,11,0.16)' }
    if (t.includes('pilot')) return { label: 'Pilot Training', color: '#60a5fa', bg: 'rgba(59,130,246,0.16)' }
    return null
  }

  // Intent label from score (mockup: High Intent / Comparing / Ready to Book style).
  const intentFor = (score: number): { label: string; color: string; bg: string } => {
    if (score >= hotLeadThreshold) return { label: brandLabel('High Intent'), color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
    if (score >= 50) return { label: brandLabel('Comparing'), color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
    return { label: 'Needs follow-up', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' }
  }

  // Recommended next step derived from the lead's stage (Phase-1 heuristic;
  // a later phase wires the real agent_tasks "next action").
  const nextStepFor = (stage: string): string => {
    const s = (stage || '').toLowerCase()
    if (s.includes('booking')) return 'Confirm the slot'
    if (s.includes('high')) return brandLabel('Push to book a call')
    if (s.includes('qualified')) return brandLabel('Share pricing + offers')
    if (s.includes('engaged')) return brandLabel('Share program details')
    if (s.includes('converted')) return brandLabel('Onboard / next steps')
    if (s.includes('lost') || s.includes('cold')) return 'Re-engage'
    return 'First outreach'
  }

  // Status from last-contact recency + score.
  const statusFor = (lastContact: string, score: number): { label: string; color: string; bg: string } => {
    const hrs = (Date.now() - new Date(lastContact).getTime()) / 3_600_000
    if (score >= hotLeadThreshold && hrs > 24) return { label: 'Overdue', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
    if (hrs <= 24) return { label: 'Due today', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
    return { label: 'Scheduled', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ backgroundColor: brandCfg.colors?.primary || 'var(--accent-primary)', width: '100px', height: '100px', margin: '-10px' }} />
            <div className="relative animate-pulse">
              <Image src={isBcon ? '/bcon-icon.png' : isPop ? (brandCfg.chatStructure?.avatar?.source || '/favicon.ico') : (brandCfg.markPath || brandCfg.iconPath || '/logo.png')} alt={brandCfg.name} width={80} height={80} className="drop-shadow-lg" priority />
            </div>
          </div>
          <div className="animate-pulse text-sm" style={{ color: 'var(--text-secondary)' }}>Loading dashboard...</div>
        </div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <p className="text-red-700 dark:text-red-300 font-semibold mb-2">Failed to load metrics</p>
          <button onClick={loadMetrics} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm">Retry</button>
        </div>
      </div>
    )
  }

  // ── Derived values for the mockup layout ──────────────────────────────────
  const rm = metrics.radialMetrics
  const flow = metrics.leadFlow || { new: 0, engaged: 0, qualified: 0, booked: 0 }
  const total = metrics.totalLeads?.count || 0
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}% of total` : '')
  // Engine Overview - the lead-funnel nodes (Total/Engaged/Warm) follow its
  // All/7d/14d toggle; Follow-up Due + Booked stay current-state (no historical
  // range in the metrics yet).
  // BCON/POP: cohort funnel for the selected window - all five nodes scale together
  // (leads acquired in the window → how far each got). Falls back to the old
  // per-metric counts (identical to core's expressions) when `funnel` is absent.
  const fn = hasNewHomeLook ? metrics.funnel?.[engineRange] : undefined
  const engTotal = fn ? fn.total : engineRange === 'Today' ? (metrics.totalLeads?.count1D ?? 0) : engineRange === '7D' ? (metrics.totalLeads?.count7D ?? 0) : engineRange === '14D' ? (metrics.totalLeads?.count14D ?? 0) : (metrics.totalLeads?.count ?? 0)
  const engEngaged = fn ? fn.engaged : engineRange === '7D' ? (metrics.engagedLeads?.count7D ?? 0) : engineRange === '14D' ? (metrics.engagedLeads?.count14D ?? 0) : (metrics.engagedLeads?.count ?? flow.engaged)
  const engWarm = fn ? fn.warm : engineRange === '7D' ? (metrics.warmLeads?.count7D ?? 0) : engineRange === '14D' ? (metrics.warmLeads?.count14D ?? 0) : (metrics.warmLeads?.count ?? 0)
  const engDue = fn ? fn.followUpDue : (metrics.staleLeads?.count ?? 0)
  const engBooked = fn ? fn.booked : (flow.booked || 0)
  // Gigs tab: Engaged/Warm/Follow-up Due/Booked don't mean anything for
  // scouts - the funnel that matters is their onboarding lifecycle (same
  // stage derivation the Gigs table's STATUS column uses), so all 4 middle+
  // last nodes swap to it. Slot 1 (Total Leads) stays as-is either way.
  const isGigsView = showGigsTab && view === 'gigs'
  const gigStages = metrics.gigStageCounts || { loggedIn: 0, kycStarted: 0, kycDone: 0, live: 0, active: 0 }
  const engPct = (n: number) => (engTotal > 0 ? `${Math.round((n / engTotal) * 100)}% of total` : '0% of total')
  // POP shows campaign-scale numbers, so the Engine nodes abbreviate (10.5K).
  const engK = (n: number): number | string => (isPop ? abbrevK(n) : n)
  const engTopSub = engineRange === 'All' ? 'top of funnel' : engineRange === 'Today' ? 'new today' : engineRange === '7D' ? 'new in 7 days' : 'new in 14 days'
  // Active Conversations card - its OWN toggle (24h / 7d / 14d), distinct leads
  // with conversation activity in the window.
  const tc = metrics.totalConversations
  const acValue = acRange === '7D' ? tc.count7D : acRange === '14D' ? tc.count14D : (tc.count1D ?? 0)
  const acLabel = acRange === 'Today' ? 'in the last 24 hours' : acRange === '7D' ? 'in the last 7 days' : 'in the last 14 days'
  // Conversations Trend - its own toggle (7d / 14d / 30d). Real per-day series
  // (distinct leads messaged/day); old trends.conversations.data came back ~flat.
  const rangeDays = range === '14D' ? 14 : range === '30D' ? 30 : 7
  const rangeLabel = `last ${rangeDays} days`
  const convSeries = (metrics.trendSeries?.conversations?.[range]?.length
    ? metrics.trendSeries.conversations[range]
    : metrics.trends?.conversations?.data) || []
  const convTotal = convSeries.length ? convSeries.reduce((a, b) => a + (b.value || 0), 0) : metrics.totalConversations.total
  const dailyAvg = convSeries.length ? Math.round((convTotal / convSeries.length) * 10) / 10 : 0
  const convChange = range === '14D'
    ? metrics.totalConversations.trend14D
    : range === '30D'
      ? metrics.totalConversations.trend30D
      : metrics.totalConversations.trend7D
  // POP home → weekday×hour activity heatmap instead of the line trend. Totals
  // come from the 30-day daily series; the grid + peaks come from the weekHour
  // matrix (touchpoints by weekday & hour).
  const popHeat = isPop ? metrics.campaignHome?.dailyActivity : undefined
  const weekHour = isPop ? metrics.campaignHome?.weekHour : undefined
  // "Activity Sources" panel — EVERY brand. POP keeps its richer magnet mix
  // (d2d/qr/missed_call from pop_home_agg); other brands use the generic
  // conversations-by-channel mix the metrics route now ships for everyone.
  const popMix = isPop && metrics.campaignHome?.sources?.mix?.length
    ? metrics.campaignHome.sources.mix
    : (metrics.sources?.mix?.length ? metrics.sources.mix : undefined)
  // Card stats: POP derives from its 30d dailyActivity (below); generic brands
  // come straight off the sources aggregate.
  const srcChange = isPop && metrics.campaignHome?.sources?.mix?.length ? undefined : metrics.sources?.delta7Total
  const srcAvg = isPop && metrics.campaignHome?.sources?.mix?.length ? undefined : metrics.sources?.dailyAvg30
  const srcTotal = isPop && metrics.campaignHome?.sources?.mix?.length ? undefined : metrics.sources?.total30d
  // ── Movable-card slot geometry (xl only) ─────────────────────────────────
  // slots 0+1 = top row, 2+3 = bottom row; spans follow the brand variants
  // that used to size the rows. A card adopts the span of the slot it's in.
  // windchasers: even 50-50 rows — Engine Overview at span 8 left Upcoming
  // Events squeezed (user-requested true 50-50 split).
  const engineNarrow = (isPop && !!metrics.campaignHome?.ladder) || showGigsTab || brandCfg.brand === 'windchasers'
  const SLOT_SPANS = engineNarrow ? [6, 6, 6, 6] : [8, 4, 6, 6]
  const slotStyle = (id: string) => {
    const slot = Math.max(0, cardOrder.indexOf(id))
    return {
      ['--slot-col' as any]: `span ${SLOT_SPANS[slot]} / span ${SLOT_SPANS[slot]}`,
      ['--slot-row' as any]: slot < 2 ? '1' : '2',
    }
  }
  const cardDrag = (id: string) => ({
    draggable: dragArm === id,
    onDragStart: (e: React.DragEvent) => { dragCardRef.current = id; e.dataTransfer.effectAllowed = 'move' },
    onDragEnd: () => { setDragArm(null); dragCardRef.current = null },
    onDragOver: (e: React.DragEvent) => { if (dragCardRef.current && dragCardRef.current !== id) e.preventDefault() },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (dragCardRef.current) swapCards(dragCardRef.current, id); setDragArm(null); dragCardRef.current = null },
  })
  // Grip that ARMS the drag — buttons/text inside cards never start one.
  const cardGrip = (id: string) => (
    <button
      type="button"
      onMouseDown={() => setDragArm(id)}
      onMouseUp={() => setDragArm(null)}
      className="absolute top-2 right-2 z-10 p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing"
      style={{ color: 'var(--text-muted)' }}
      title="Drag to move this card"
      aria-label="Move card"
    >
      <MdDragIndicator size={15} />
    </button>
  )
  const heatTotal = popHeat ? popHeat.reduce((a, b) => a + (b.count || 0), 0) : 0
  const heatAvg = popHeat && popHeat.length ? Math.round((heatTotal / popHeat.length) * 10) / 10 : 0
  const heatLast7 = popHeat ? popHeat.slice(-7).reduce((a, b) => a + (b.count || 0), 0) : 0
  const heatPrev7 = popHeat ? popHeat.slice(-14, -7).reduce((a, b) => a + (b.count || 0), 0) : 0
  const heatChange = heatPrev7 ? Math.round(((heatLast7 - heatPrev7) / heatPrev7) * 100) : 0
  const heatPeaks = weekHour ? peaksFromWeekHour(weekHour) : null
  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : brandLabel('Founder'))
  const firstName = displayName.split(' ')[0] || brandLabel('Founder')
  const profileInitials = getInitials(displayName)
  // Time-of-day greeting in IST (shifts morning/afternoon/evening/night).
  const istHour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }))
  const greeting = istHour < 12 ? 'Good morning' : istHour < 17 ? 'Good afternoon' : istHour < 21 ? 'Good evening' : 'Good night'
  // Follow-up Health colour follows the status (good=green, fair=amber, needs work=red).
  // BCON/POP: health follows the REPLY RATE shown on the card (not the
  // response-time bucket) - so a 100% reply rate never reads as "Fair" (ported
  // from those forks). Other brands keep core's responseHealth.status verbatim.
  const replyRate = Math.round(rm?.responseRate ?? 0)
  const healthLevel: 'good' | 'warning' | 'critical' = hasNewHomeLook
    ? (replyRate >= 90 ? 'good' : replyRate >= 70 ? 'warning' : 'critical')
    : metrics.responseHealth.status
  const healthColor = healthLevel === 'good' ? '#22c55e' : healthLevel === 'warning' ? '#f59e0b' : '#ef4444'
  const healthLabel = healthLevel === 'good' ? 'Good' : healthLevel === 'warning' ? 'Fair' : 'Needs work'
  // Booked calls + what share of total leads that represents (founder conversion view).
  const bookedVal = Math.max(flow.booked || 0, metrics.upcomingBookings.length)
  const bookedPctOfLeads = total > 0 ? `${Math.round((bookedVal / total) * 100)}% of total leads` : 'no leads yet'

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 h-full overflow-y-auto xl:overflow-hidden">
      {/* Subtle bento entrance - cards fade + rise in, lightly staggered. Plays
          once on mount (DOM persists across the 60s metric refresh, so it doesn't
          replay). Respects reduced-motion. */}
      <style>{`
        @keyframes wcBentoIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: no-preference) {
          .wc-bento > * { animation: wcBentoIn 0.45s cubic-bezier(0.22,1,0.36,1) both; }
          .wc-bento > *:nth-child(2) { animation-delay: 0.05s; }
          .wc-bento > *:nth-child(3) { animation-delay: 0.10s; }
          .wc-bento > *:nth-child(4) { animation-delay: 0.15s; }
          .wc-bento > *:nth-child(5) { animation-delay: 0.20s; }
        }
        /* Movable home cards: on xl each card is PLACED by its slot vars (col
           span + row), so a drag-swap moves it without reordering the DOM.
           Below xl the grid is one column and slot placement is ignored. */
        @media (min-width: 1280px) {
          .wc-slot { grid-column: var(--slot-col); grid-row: var(--slot-row); }
        }
        .wc-slot[draggable="true"] { opacity: 0.85; outline: 2px dashed var(--accent-primary); outline-offset: 2px; }
      `}</style>
      {/* ── ROW 0 · Top bar - greeting + range toggle + controls + profile ── */}
      <header className="flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
            {greeting}, {firstName} <span aria-hidden>👋</span>
          </h1>
          {/* lokazen only: Leads (business leads) / Gigs (scouts + connectors) -
              same dashboard below, wired to a different slice of the same data. */}
          {showGigsTab && (
            <div
              className="inline-flex items-center gap-0.5 mt-1.5 p-0.5 rounded-lg border"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}
              role="tablist"
              aria-label="Leads or Gigs"
            >
              {(['leads', 'gigs'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => {
                    if (v === view) return
                    // Show the loader immediately on tab switch - otherwise the
                    // PREVIOUS tab's numbers stay on screen (now mislabeled
                    // under the new tab) for however long the new-scope fetch
                    // takes. loadMetrics's finally clears this once it resolves.
                    setLoading(true)
                    setView(v)
                  }}
                  className="px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors"
                  style={view === v
                    ? { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }
                    : { color: 'var(--text-secondary)' }}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Top bar keeps ONLY the bell (product updates + version). Snapshot and
              Ask PROXe were dropped — the Brain dock covers asking by voice. */}
          {isCustomLayout && (
            <button
              type="button"
              onClick={resetLayout}
              className="hidden xl:flex items-center justify-center rounded-full transition hover:opacity-90"
              style={{ width: 36, height: 36, backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
              title="Reset card layout to default"
              aria-label="Reset card layout"
            >
              <MdRestartAlt size={18} />
            </button>
          )}
          <NotificationCenter inline />
          {/* Profile menu */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="flex items-center gap-1 rounded-full pl-1 pr-1.5 py-1 border transition-colors hover:opacity-90"
              style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              title={user?.email || 'Account'}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                {profileInitials}
              </span>
              <MdArrowDropDown size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
            {profileOpen && (
              <div className="absolute right-0 mt-2 rounded-xl border shadow-lg py-1 z-[65]" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', minWidth: 220 }}>
                <div className="px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>Signed in as</div>
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }} title={user?.email}>{displayName}</div>
                  {user?.email && <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>{user.email}</div>}
                </div>
                <div style={{ height: 1, backgroundColor: 'var(--border-primary)', margin: '4px 0' }} />
                {isPop && (
                  <button
                    onClick={() => { setProfileOpen(false); router.push('/war-room') }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-bold transition-colors"
                    style={{ color: '#F06C18' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <span aria-hidden>⚡</span> War Room
                  </button>
                )}
                <button
                  onClick={() => { setProfileOpen(false); router.push('/dashboard/settings') }}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <MdSettings size={17} /> Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <MdLogout size={17} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── ROW 1 · KPI cards ─────────────────────────────────────────────── */}
      <div className={`wc-bento grid grid-cols-2 md:grid-cols-3 ${features.voice ? 'xl:grid-cols-6' : 'xl:grid-cols-5'} gap-3 sm:gap-4 shrink-0`}>
        {/* Card 1 - Active Conversations: own toggle (24h / 7d / 14d). */}
        <div className="rounded-xl p-4 border flex flex-col justify-between" style={{ backgroundColor: `color-mix(in srgb, #3B82F6 ${TINT_BG}, var(--bg-primary))`, borderColor: `color-mix(in srgb, #3B82F6 ${TINT_BORDER}, var(--border-primary))`, minHeight: 132, boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: '#3B82F61f', color: '#3B82F6' }}><MdChatBubble size={15} /></span>
              <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>Active Conversations</span>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {(['Today', '7D', '14D'] as const).map((p) => (
                <button
                  key={p} type="button" onClick={(e) => { e.stopPropagation(); setAcRange(p) }}
                  className="text-[10px] font-semibold rounded px-1.5 py-0.5 transition-colors"
                  style={{ color: acRange === p ? '#3B82F6' : 'var(--text-muted)', backgroundColor: acRange === p ? 'rgba(59,130,246,0.14)' : 'transparent' }}
                >
                  {p === 'Today' ? '24h' : p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-2 mt-2 cursor-pointer" onClick={() => router.push('/dashboard/inbox')}>
            <span className="text-2xl sm:text-3xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{fmt(acValue)}</span>
          </div>
          {(() => {
            // Sparkline tracks the selected window (Today shows the 7-day context).
            const acSeries = metrics.trendSeries?.conversations?.[acRange === 'Today' ? '7D' : acRange]
            return acSeries && acSeries.length > 1 ? (
              <div className="w-full mt-2" style={{ height: 30 }}>
                <Sparkline data={acSeries} color="#3B82F6" height={30} showGradient />
              </div>
            ) : (
              <div style={{ height: 30 }} />
            )
          })()}
          <span className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{acLabel}</span>
        </div>
        {/* Card 2 - Leads: hot/sales-ready leads PROXe scored. Gigs: engaged
            scouts (active conversation on WhatsApp or social, last 7 days) -
            lead_score doesn't apply to scouts, so "High Intent" always read 0. */}
        {isGigsView ? (
          <KpiCard
            icon={<MdMessage size={15} />} iconColor="#22c55e"
            label="Engaged Scouts"
            value={fmt(metrics.totalConversations?.count7D ?? 0)}
            delta={<KpiDelta change={metrics.totalConversations?.trend7D} />}
            sparkData={metrics.trends?.conversations?.data} sparkColor="#22c55e"
            sub="active on WhatsApp or social, last 7 days"
            onClick={() => router.push('/dashboard/leads')}
          />
        ) : (
          <KpiCard
            icon={<MdLocalFireDepartment size={15} />} iconColor={hasNewHomeLook ? '#22c55e' : '#ef4444'}
            label={brandLabel('High Intent Leads')}
            value={fmt(metrics.hotLeads?.count ?? 0)}
            sparkData={metrics.trends?.hotLeads?.data} sparkColor={hasNewHomeLook ? '#22c55e' : '#ef4444'}
            sub={brandLabel('flagged high-intent by PROXe')}
            onClick={() => router.push('/dashboard/leads?filter=hot')}
          />
        )}
        {/* Follow-up Health - status + ring; whole card follows the status colour. */}
        <div className="rounded-xl p-4 border flex flex-col justify-between" style={{ backgroundColor: `color-mix(in srgb, ${healthColor} ${TINT_BG}, var(--bg-primary))`, borderColor: `color-mix(in srgb, ${healthColor} ${TINT_BORDER}, var(--border-primary))`, minHeight: 132, boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${healthColor} 16%, transparent)`, color: healthColor }}>{healthLevel === 'good' ? <MdFavorite size={15} /> : <MdWarning size={15} />}</span>
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{brandLabel('Follow-up Health')}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div>
              <div className="text-2xl sm:text-3xl font-bold leading-none capitalize" style={{ color: healthColor }}>
                {healthLabel}
              </div>
            </div>
            <RadialProgress value={replyRate} size={48} color={healthColor} showPercentage={false} label="" />
          </div>
          <span className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{replyRate}% reply rate · {hasNewHomeLook ? (healthLevel === 'good' ? 'on track' : healthLevel === 'warning' ? 'room to improve' : 'needs attention') : 'on track'}</span>
        </div>
        {isGigsView ? (
          <KpiCard
            icon={<MdAssignment size={15} />} iconColor="#a855f7"
            label="KYC Started"
            value={fmt(metrics.kycStarted7D ?? 0)}
            delta={<KpiDelta change={metrics.trends?.kycStarted?.change} />}
            sparkData={metrics.trends?.kycStarted?.data} sparkColor="#a855f7"
            sub="vs last 7 days"
            onClick={() => router.push('/dashboard/leads')}
          />
        ) : (
          <KpiCard
            icon={<MdEvent size={15} />} iconColor="#a855f7"
            label={brandLabel('Booked Calls / Events')}
            value={fmt(bookedVal)}
            delta={<KpiDelta change={metrics.trends?.bookings?.change} />}
            sparkData={metrics.trends?.bookings?.data} sparkColor="#a855f7"
            sub="vs last 7 days"
            onClick={() => router.push('/dashboard/bookings')}
          />
        )}
        <KpiCard
          icon={<MdSpeed size={15} />} iconColor="#3B82F6"
          label="Avg Response Time"
          value={fmtMs(metrics.responseHealth.avgMs)}
          delta={<KpiDelta change={metrics.trends?.responseTime?.change} goodWhenUp={false} suffix="" />}
          sparkData={metrics.trends?.responseTime?.data} sparkColor="#3B82F6"
        />
        {/* Calls - inbound + outbound voice volume (links to the Calls view).
            Only shown when the Voice/Calls feature is enabled for this brand. */}
        {features.voice && (
          <KpiCard
            icon={<MdCall size={15} />} iconColor="#06b6d4"
            label="Calls"
            value={fmtComma(metrics.calls?.total ?? 0)}
            delta={<KpiDelta change={metrics.calls?.trend?.change} />}
            sparkData={metrics.calls?.trend?.data} sparkColor="#06b6d4"
            sub={`${fmtComma(metrics.calls?.inbound ?? 0)} in · ${fmtComma(metrics.calls?.outbound ?? 0)} out`}
            onClick={() => router.push('/dashboard/calls')}
          />
        )}
      </div>

      {/* ── ROWS 2+3 · the four MOVABLE cards (Engine / Events / Queue / Sources)
          — ONE grid, two xl rows; each card is placed by its slot (drag the grip
          to swap; Reset in the top bar restores default). ── */}
      <div className="wc-bento grid grid-cols-1 xl:grid-cols-12 xl:grid-rows-2 gap-4 sm:gap-5 xl:flex-[2] xl:min-h-0">
        {/* Engine Overview funnel. POP: the intensity LADDER (Voters → Supporters →
            Volunteers → Cadre → Grievances), narrower so Events breathes. */}
        <section {...cardDrag('engine')} className="wc-slot relative group rounded-xl p-4 border flex flex-col min-h-0 overflow-hidden" style={{ ...slotStyle('engine'), backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          {cardGrip('engine')}
          <div className="flex items-center justify-between gap-2 shrink-0">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{brandLabel('Engine Overview')}</h3>
            {!(isPop && metrics.campaignHome?.ladder) && (
            <div className="flex items-center gap-0.5 shrink-0">
              {(hasNewHomeLook ? (['Today', '7D', '14D', 'All'] as const) : (['All', '7D', '14D'] as const)).map((p) => (
                <button
                  key={p} type="button" onClick={() => setEngineRange(p)}
                  className="text-[10px] font-semibold rounded px-1.5 py-0.5 transition-colors"
                  style={{ color: engineRange === p ? 'var(--accent-primary)' : 'var(--text-muted)', backgroundColor: engineRange === p ? 'var(--accent-subtle)' : 'transparent' }}
                >
                  {p === 'Today' ? '24h' : p}
                </button>
              ))}
            </div>
            )}
          </div>
          {/* Funnel fills the card's height so there's no dead space at the bottom */}
          {isPop && metrics.campaignHome?.ladder ? (() => {
            const lad = metrics.campaignHome.ladder!
            const pctOf = (n: number) => (lad.voters ? `${Math.round((100 * n) / lad.voters)}% of voters` : '')
            return (
              <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-center sm:justify-between gap-0 sm:gap-1 py-2 sm:py-6">
                <EngineNode icon={<MdPeople size={26} />} color="#3B82F6" count={engK(lad.voters)} label="Voters" sub="reached" />
                <EngineNode icon={<MdFavorite size={26} />} color="#22c55e" count={engK(lad.supporters)} label="Supporters" sub={pctOf(lad.supporters)} />
                <EngineNode icon={<MdLocalFireDepartment size={26} />} color="#f59e0b" count={engK(lad.volunteers)} label="Volunteers" sub={pctOf(lad.volunteers)} />
                <EngineNode icon={<MdVerified size={26} />} color="#a855f7" count={engK(lad.cadre)} label="Cadre" sub="badge holders" />
                <EngineNode icon={<MdAssignment size={26} />} color="#10b981" count={engK(lad.grievances)} label="Grievances Logged" sub="all time" last />
              </div>
            )
          })() : (
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-center sm:justify-between gap-0 sm:gap-1 py-2 sm:py-6">
            <EngineNode icon={<MdPeople size={28} />} color="#3B82F6" count={engK(engTotal)} label={brandLabel('Total Leads')} sub={engTopSub} />
            {isGigsView ? (
              <EngineNode icon={<MdAssignment size={28} />} color="#22c55e" count={engK(gigStages.kycStarted)} label="KYC Started" sub={engPct(gigStages.kycStarted)} />
            ) : (
              <EngineNode icon={<MdPeople size={28} />} color="#22c55e" count={engK(engEngaged)} label={brandLabel('Engaged')} sub={engPct(engEngaged)} />
            )}
            {isGigsView ? (
              <EngineNode icon={<MdVerified size={28} />} color="#f59e0b" count={engK(gigStages.kycDone)} label="KYC Done" sub={engPct(gigStages.kycDone)} />
            ) : (
              <EngineNode icon={<MdLocalFireDepartment size={28} />} color="#f59e0b" count={engK(engWarm)} label={brandLabel('Warm')} sub={engPct(engWarm)} />
            )}
            {isGigsView ? (
              <EngineNode icon={<MdAccountBalanceWallet size={28} />} color="#a855f7" count={engK(gigStages.live)} label="Live" sub="UPI added" />
            ) : (
              <EngineNode icon={<MdSchedule size={28} />} color="#a855f7" count={engK(engDue)} label="Follow-up Due" sub={engDue > 0 ? 'Needs attention' : 'All clear'} />
            )}
            <EngineNode
              icon={isGigsView ? <MdCheckCircle size={28} /> : <MdCalendarToday size={28} />}
              color="#10b981"
              count={engK(isGigsView ? gigStages.active : engBooked)}
              label={isGigsView ? 'Active' : brandLabel('Booked')}
              sub={isGigsView ? 'Submitting properties' : (hasNewHomeLook ? (engineRange === 'All' ? 'all time' : engineRange === 'Today' ? 'today' : `last ${engineRange === '7D' ? 7 : 14} days`) : 'This week')}
              last
            />
          </div>
          )}
          {/* Lead-type breakdown (windchasers) - at-a-glance split of Total Leads
              by program, plus the webinar registered-vs-not difference. */}
          {isWindchasers && !isGigsView && metrics.leadTypeBreakdown && (() => {
            const lb = metrics.leadTypeBreakdown!
            const tot = lb.total || 1
            const pct = (n: number) => `${Math.round((100 * n) / tot)}%`
            const items = [
              { label: 'Pilot', count: lb.pilot, color: '#3B82F6' },
              { label: 'Flight School', count: lb.flightSchool, color: '#0ea5e9' },
              { label: 'Cabin Crew', count: lb.cabinCrew, color: '#f59e0b' },
              { label: 'Webinar', count: lb.webinar, color: '#a855f7' },
            ]
            return (
              <div className="pt-3 mt-1 border-t" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-wide shrink-0" style={{ color: 'var(--text-muted)' }}>By type</span>
                  {items.map((it) => (
                    <span key={it.label} className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: it.color }} />
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{it.label}</span>
                      <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{it.count.toLocaleString()}</span>
                      <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>{pct(it.count)}</span>
                    </span>
                  ))}
                </div>
                {lb.webinar > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-[11px] tabular-nums">
                    <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Webinar split</span>
                    <span style={{ color: '#22c55e' }}>{lb.webinarRegistered} registered</span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span style={{ color: '#f59e0b' }}>{lb.webinarNotRegistered} not registered</span>
                  </div>
                )}
              </div>
            )
          })()}
          <div className="pt-4 border-t text-xs flex items-center gap-2" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: hasNewHomeLook ? healthColor : '#22c55e' }} />
            {healthLevel === 'good' ? `${brandLabel('Your follow-up engine is performing well')}. Keep it going!` : `Some ${brandLabel('Lead') === 'Person' ? 'people' : 'leads'} need attention - check the Follow-up Due column.`}
          </div>
        </section>

        {/* Upcoming Events — movable card (slot: events) */}
        <section {...cardDrag('events')} className="wc-slot relative group rounded-xl p-4 border flex flex-col min-h-0 overflow-hidden" style={{ ...slotStyle('events'), backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          {cardGrip('events')}
          <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Upcoming Events</h3>
            <button onClick={() => router.push('/dashboard/bookings')} className="text-xs font-medium flex items-center gap-1 hover:underline whitespace-nowrap" style={{ color: 'var(--accent-primary)' }}>
              View all <MdArrowForward size={13} />
            </button>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto min-h-0 pr-1.5">
            {isPop && metrics.campaignHome ? (
              metrics.campaignHome.events.length > 0 ? (
                <div className="relative pl-5">
                  {/* timeline rail (reference design): orange line + a dot per event */}
                  <span className="absolute left-[5px] top-2 bottom-2 w-px" style={{ background: 'rgba(249,115,22,0.45)' }} />
                  <div className="space-y-2">
                  {metrics.campaignHome.events.map((ev) => {
                    const d = ev.event_date ? new Date(ev.event_date) : null
                    const dowIST = d ? d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }).toUpperCase() : ''
                    const dayIST = d ? d.toLocaleDateString('en-IN', { day: '2-digit', timeZone: 'Asia/Kolkata' }) : ''
                    const monIST = d ? d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }).toUpperCase() : ''
                    const timeIST = d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : ''
                    const kind = /sabha/i.test(ev.title) ? { label: 'Sabha', c: '#a78bfa' }
                      : /yatra|march/i.test(ev.title) ? { label: 'March', c: '#3b82f6' }
                      : /cultural|night|awaaz/i.test(ev.title) ? { label: 'Cultural', c: '#c084fc' }
                      : /rally/i.test(ev.title) ? { label: 'Rally', c: '#f97316' }
                      : { label: 'Event', c: '#2ec4b6' }
                    return (
                      <button
                        key={ev.id} type="button" onClick={() => router.push('/dashboard/bookings')}
                        className="relative w-full text-left rounded-xl transition-all border block p-2.5"
                        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#f97316' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
                      >
                        <span className="absolute -left-[19px] top-6 w-2.5 h-2.5 rounded-full border-2" style={{ background: '#f97316', borderColor: 'rgba(249,115,22,0.35)' }} />
                        <div className="flex items-start gap-3">
                          {/* date tile */}
                          {d && (
                            <span className="flex flex-col items-center rounded-lg overflow-hidden shrink-0 border" style={{ borderColor: 'rgba(249,115,22,0.4)', minWidth: 42 }}>
                              <span className="w-full text-center text-[9px] font-extrabold py-0.5" style={{ background: 'rgba(249,115,22,0.9)', color: '#0b0d12' }}>{dowIST}</span>
                              <span className="text-[17px] font-extrabold leading-tight pt-0.5" style={{ color: 'var(--text-primary)' }}>{dayIST}</span>
                              <span className="text-[9px] font-bold pb-1" style={{ color: '#f97316' }}>{monIST}</span>
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            {/* Line 1 — title + kind, with Going / Interested INLINE on the right */}
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-[13px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{ev.title}</p>
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${kind.c}1f`, color: kind.c, border: `1px solid ${kind.c}45` }}>{kind.label}</span>
                              <span className="flex-1" />
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }} title={`${ev.going} going`}>
                                <MdGroups size={12} /> {ev.going}
                              </span>
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }} title={`${ev.interested} interested`}>
                                <MdStarBorder size={12} /> {ev.interested}
                              </span>
                            </div>
                            {/* Line 2 — location · time on one line */}
                            <p className="text-[10.5px] truncate mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                              <MdPlace size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                              <span className="truncate">{[ev.constituency, ev.venue].filter(Boolean).join(' · ') || 'Punjab'}</span>
                              {timeIST && (<><span style={{ opacity: 0.4 }}>·</span><MdAccessTime size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /><span className="whitespace-nowrap">{timeIST}</span></>)}
                            </p>
                            {/* Line 3 — mobilizable base (compact, muted) */}
                            <div className="flex items-center gap-3 mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              <span className="inline-flex items-center gap-1"><MdPeople size={11} /> {ev.seatVolunteers} volunteers</span>
                              <span className="inline-flex items-center gap-1"><MdPeople size={11} /> {ev.seatSupporters} supporters</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end justify-between self-stretch shrink-0 gap-2">
                            {ev.event_date && (
                              <span className="inline-flex items-center gap-1 text-[9.5px] px-2 py-1 rounded-full font-bold whitespace-nowrap border" style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316', borderColor: 'rgba(249,115,22,0.45)' }}>
                                <MdSchedule size={11} /> {formatCountdown(ev.event_date)}
                              </span>
                            )}
                            <MdChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  </div>
                  <p className="text-[10px] text-center mt-2.5 flex items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    <MdCalendarToday size={11} /> All times shown in local time
                  </p>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No party events scheduled yet - create one from Events, and RSVPs will show here.</p>
              )
            ) : metrics.upcomingBookings.length > 0 ? (
              // Timeline design (ported from POP's Upcoming Events, generalized to
              // core): a brand-accent rail with a dot per item and a date tile, so
              // every brand's Upcoming Events card reads as an agenda, not a plain
              // list. Uses --accent-primary, so it's Lokazen-orange here, and each
              // brand's own accent elsewhere. Campaign-only bits (RSVP counts,
              // volunteers) are dropped; bookings show category + time + owner.
              <div className="relative pl-5">
                <span className="absolute left-[5px] top-2 bottom-2 w-px" style={{ background: 'color-mix(in srgb, var(--accent-primary) 45%, transparent)' }} />
                <div className="space-y-2">
                  {metrics.upcomingBookings.map((booking) => {
                    const d = booking.datetime ? new Date(booking.datetime) : null
                    const dow = d ? d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }).toUpperCase() : ''
                    const day = d ? d.toLocaleDateString('en-IN', { day: '2-digit', timeZone: 'Asia/Kolkata' }) : ''
                    const mon = d ? d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }).toUpperCase() : ''
                    const time = d ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : ''
                    const cat = eventCategory(booking.courseInterest, booking.title)
                    const t = countdownTint(booking.datetime)
                    const detail = booking.title
                      || [cat?.label || booking.courseInterest || null, booking.userType, booking.timeline].filter(Boolean).join(' · ')
                    return (
                      <button
                        key={booking.id} type="button" onClick={() => openLeadModal(booking.id)}
                        className="relative w-full text-left rounded-xl transition-all border block p-2.5"
                        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
                      >
                        <span className="absolute -left-[19px] top-6 w-2.5 h-2.5 rounded-full border-2" style={{ background: 'var(--accent-primary)', borderColor: 'color-mix(in srgb, var(--accent-primary) 35%, transparent)' }} />
                        <div className="flex items-start gap-3">
                          {d && (
                            <span className="flex flex-col items-center rounded-lg overflow-hidden shrink-0 border" style={{ borderColor: 'color-mix(in srgb, var(--accent-primary) 40%, transparent)', minWidth: 42 }}>
                              <span className="w-full text-center text-[9px] font-extrabold py-0.5" style={{ background: 'var(--accent-primary)', color: '#0b0d12' }}>{dow}</span>
                              <span className="text-[17px] font-extrabold leading-tight pt-0.5" style={{ color: 'var(--text-primary)' }}>{day}</span>
                              <span className="text-[9px] font-bold pb-1" style={{ color: 'var(--accent-primary)' }}>{mon}</span>
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-[13px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{booking.name}</p>
                              {cat && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>}
                            </div>
                            {detail && <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{detail}</p>}
                            <p className="text-[10.5px] truncate mt-1 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                              {time && (<><MdAccessTime size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /><span className="whitespace-nowrap">{time}</span><span style={{ opacity: 0.4 }}>·</span></>)}
                              <span className="truncate" style={{ color: booking.owner?.name ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{booking.owner?.name || 'Unassigned'}</span>
                            </p>
                          </div>
                          <div className="flex flex-col items-end justify-between self-stretch shrink-0 gap-2">
                            <span className="text-[9.5px] px-2 py-1 rounded-full font-bold whitespace-nowrap" style={{ background: t.bg, color: t.color }}>{formatCountdown(booking.datetime)}</span>
                            <MdChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-center mt-2.5 flex items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <MdCalendarToday size={11} /> All times shown in local time
                </p>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No upcoming events</p>
            )}
          </div>
        </section>

        {/* Priority Lead Queue — movable card (slot: queue) */}
        <section {...cardDrag('queue')} className="cq-card wc-slot relative group rounded-xl border overflow-hidden flex flex-col min-h-0" style={{ ...slotStyle('queue'), backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          {cardGrip('queue')}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
            <div className="flex items-center gap-3 min-w-0">
              {isPop && metrics.campaignHome && (
                <span className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 36, height: 36, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
                  <MdMyLocation size={18} />
                </span>
              )}
              <div className="min-w-0">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{isPop && metrics.campaignHome ? 'Priority Constituencies' : isGigsView ? 'Priority Gig Queue' : brandLabel('Priority Lead Queue')}</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{isPop && metrics.campaignHome ? 'Seats that need attention now' : isGigsView ? 'Scouts that need attention now' : brandLabel('Leads that need your attention now')}</p>
              </div>
            </div>
            <button onClick={() => router.push(isPop && metrics.campaignHome ? '/war-room' : isGigsView ? '/dashboard/scouts' : '/dashboard/leads')} className="text-xs font-medium flex items-center gap-1 hover:underline whitespace-nowrap" style={{ color: 'var(--accent-primary)' }}>
              {isPop && metrics.campaignHome ? 'War Room' : isGigsView ? 'View Scouts' : `View ${brandLabel('Lead') === 'Person' ? 'People' : 'Leads'}`} <MdArrowForward size={13} />
            </button>
          </div>
          {isPop && metrics.campaignHome ? (
            metrics.campaignHome.attentionSeats.length > 0 ? (
              <div className="overflow-auto flex-1 min-h-0 flex flex-col gap-2 p-3">
                {metrics.campaignHome.attentionSeats.map((s) => {
                  const health = s.loopHealthPct >= 70 ? '#22c55e' : s.loopHealthPct >= 40 ? '#f59e0b' : '#ef4444'
                  const moodColor = s.mood > 0.1 ? '#22c55e' : s.mood < -0.1 ? '#ef4444' : 'var(--text-muted)'
                  const moodLabel = s.mood > 0.1 ? 'positive' : s.mood < -0.1 ? 'negative' : 'neutral'
                  const catColors: Record<string, string> = { jobs: '#a78bfa', drugs: '#60a5fa', health: '#2ec4b6', water: '#38bdf8', power: '#f59e0b', roads: '#8b7bff', farm_debt: '#22c55e', education: '#c084fc', other: '#7a8aa0' }
                  const catC = catColors[s.topCategory || 'other'] || '#7a8aa0'
                  const up = (s.deltaPct ?? 0) >= 0
                  const sparkC = up ? '#22c55e' : '#ef4444'
                  const seatChip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 9, background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }
                  return (
                    <button key={s.constituency} type="button" onClick={() => router.push('/war-room')}
                      className="w-full text-left rounded-xl border flex items-center gap-3 px-3 py-2.5 transition-colors"
                      style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-tertiary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.45)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
                    >
                      {/* glowing OPEN tile - the headline attention number */}
                      <div className="shrink-0 flex flex-col items-center justify-center rounded-xl" style={{ width: 52, height: 52, background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.55)', boxShadow: '0 0 12px rgba(239,68,68,0.25)' }}>
                        <span className="text-[19px] font-extrabold leading-none" style={{ color: '#ef4444' }}>{s.unresolved}</span>
                        <span className="text-[8px] uppercase tracking-widest mt-0.5" style={{ color: '#ef4444', opacity: 0.85 }}>open</span>
                      </div>
                      <div className="min-w-0" style={{ width: 148 }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-[14.5px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{s.constituency}</p>
                          {s.topCategory && (
                            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap shrink-0 capitalize" style={{ background: `${catC}1f`, color: catC, border: `1px solid ${catC}45` }}>
                              {s.topCategory.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] truncate mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                          <MdPlace size={11} style={{ color: 'var(--text-muted)' }} />{s.district || 'Punjab'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                        <span style={seatChip}><MdRefresh size={12} /> loop <b style={{ color: health }}>{s.loopHealthPct}%</b></span>
                        <span style={seatChip}><MdMood size={12} style={{ color: moodColor }} /> mood <b style={{ color: moodColor }}>{moodLabel}</b></span>
                        <span style={seatChip}><MdPeople size={12} /> <b style={{ color: 'var(--text-primary)' }}>{s.supporters}</b> supporters</span>
                      </div>
                      {s.series && s.series.some((v) => v > 0) && (
                        <span className="hidden lg:flex items-center gap-1.5 shrink-0">
                          <span style={{ width: 92 }}><Sparkline data={s.series.map((v) => ({ value: v }))} color={sparkC} height={26} showGradient /></span>
                          <span className="text-[10.5px] font-bold" style={{ color: sparkC }}>{up ? '+' : ''}{s.deltaPct}% {up ? '↗' : '↘'}</span>
                        </span>
                      )}
                      <span className="hidden sm:flex items-center gap-1 shrink-0 text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        View details <MdArrowForward size={13} />
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="px-4 py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>No seats need attention - grievance loops are healthy.</div>
            )
          ) : metrics.leadsNeedingAttention.length > 0 ? (
            <div className="overflow-auto flex-1 min-h-0">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    <th className="px-4 py-2 font-medium">{brandLabel('Lead')}</th>
                    <th className="px-3 py-2 font-medium">Intent</th>
                    <th className="pq-col-next px-3 py-2 font-medium">Recommended Next Step</th>
                    <th className="pq-col-due px-3 py-2 font-medium">Due</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.leadsNeedingAttention.slice(0, 6).map((lead) => {
                    const intent = intentFor(lead.score)
                    const status = statusFor(lead.lastContact, lead.score)
                    return (
                      <tr key={lead.id} onClick={() => openLeadModal(lead.id)} className="group cursor-pointer border-t transition-colors" style={{ borderColor: 'var(--border-primary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 min-w-[150px]">
                            <ScoreRing score={lead.score} size={32} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{lead.name}</p>
                              <p className="text-[11px] truncate capitalize" style={{ color: 'var(--text-secondary)' }}>{lead.channel || 'unknown'} · score {lead.score}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded px-2 py-1 text-[11px] font-semibold whitespace-nowrap" style={{ backgroundColor: intent.bg, color: intent.color }}>{intent.label}</span>
                        </td>
                        <td className="pq-col-next px-3 py-3">
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{nextStepFor(lead.stage)}</span>
                        </td>
                        <td className="pq-col-due px-3 py-3">
                          <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{formatTimeAgo(lead.lastContact)}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded px-2 py-1 text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: status.bg, color: status.color }}>{status.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>No priority leads right now.</div>
          )}
        </section>

        {/* Conversations Trend — fallback ONLY when a brand has no 30d source
            data yet; every brand with data gets Activity Sources instead. */}
        {!popMix && (
        <section {...cardDrag('sources')} className="wc-slot relative group rounded-xl p-4 border flex flex-col min-h-0 overflow-hidden" style={{ ...slotStyle('sources'), backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
          {cardGrip('sources')}
          <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{popHeat ? 'Activity Heatmap' : 'Conversations Trend'}</h3>
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{popHeat ? 'Voter touchpoints by day & hour · last 30 days' : 'Conversations initiated per day'}</p>
            </div>
            {popHeat && (heatPeaks?.peakDay || heatPeaks?.peakHour) && (
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                {heatPeaks.peakDay && (
                  <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
                    <MdTrendingUp size={13} style={{ color: '#22c55e' }} /> Peak day <b style={{ color: 'var(--text-primary)' }}>{heatPeaks.peakDay}</b>
                  </span>
                )}
                {heatPeaks.peakHour && (
                  <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
                    <MdSchedule size={13} style={{ color: '#a78bfa' }} /> Peak hour <b style={{ color: 'var(--text-primary)' }}>{heatPeaks.peakHour}</b>
                  </span>
                )}
              </div>
            )}
            {!popHeat && (
              <div className="flex items-center gap-0.5 shrink-0">
                {(['7D', '14D', '30D'] as const).map((p) => (
                  <button
                    key={p} type="button" onClick={() => setRange(p)}
                    className="text-[10px] font-semibold rounded px-1.5 py-0.5 transition-colors"
                    style={{ color: range === p ? 'var(--accent-primary)' : 'var(--text-muted)', backgroundColor: range === p ? 'var(--accent-subtle)' : 'transparent' }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 flex flex-col justify-center">
            {popHeat && popHeat.length ? (
              <>
                {weekHour ? <WeekHourHeatmap weekHour={weekHour} /> : <ActivityHeatmap data={popHeat} color="var(--accent-primary)" />}
                <div className="flex items-center justify-end gap-1.5 mt-2 text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  <span>Less</span>
                  {['#312e81', '#a21caf', '#f43f5e', '#fbbf24'].map((c) => (
                    <span key={c} style={{ width: 10, height: 10, borderRadius: 2, background: c, border: '1px solid var(--border-primary)' }} />
                  ))}
                  <span>More</span>
                </div>
              </>
            ) : convSeries.length > 1 ? (
              <ConversationsTrendChart data={convSeries} days={rangeDays} color={hasNewHomeLook ? 'var(--accent-primary)' : '#afd510'} />
            ) : (
              <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>Not enough data yet</div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 p-3 rounded-lg border shrink-0" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}>
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{popHeat ? fmtComma(heatTotal) : convTotal}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{popHeat ? 'Touchpoints · 30d' : 'Total'}</div>
            </div>
            <div>
              <KpiDelta change={popHeat ? heatChange : convChange} />
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>vs prior {popHeat ? 7 : rangeDays}d</div>
            </div>
            <div>
              <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{popHeat ? heatAvg : dailyAvg}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Daily avg</div>
            </div>
          </div>
          {/* POP - WHERE IT CAME FROM: entry-channel mix, last 7 days. Turns the
              trend from "how many" into "how many + from where" at a glance. */}
          {isPop && metrics.campaignHome && metrics.campaignHome.sources.byMagnet.length > 0 && (
            <div className="mt-2.5 shrink-0">
              <div className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>Where it came from · 7d</div>
              <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                {metrics.campaignHome.sources.byMagnet.map((s) => (
                  <div key={s.magnet} title={`${magnetMeta(s.magnet).label} ${s.share}%`} style={{ width: `${s.share}%`, background: magnetMeta(s.magnet).color }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {metrics.campaignHome.sources.byMagnet.slice(0, 5).map((s) => (
                  <span key={s.magnet} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: magnetMeta(s.magnet).color, display: 'inline-block' }} />
                    {magnetMeta(s.magnet).label} <b style={{ color: 'var(--text-primary)' }}>{s.share}%</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
        )}

        {/* Activity Sources (ALL brands) - compact card, lives in the trend slot */}
        {popMix && (() => {
          const mixTotal = metrics.campaignHome?.sources?.total30d || srcTotal || popMix.reduce((a, b) => a + b.count, 0)
          const mixChange = srcChange ?? heatChange
          const mixAvg = srcAvg ?? heatAvg
          const top = popMix[0]
          const topShare = Math.max(1, top?.share || 1)
          const iconTile = (m: string, size = 24) => (
            <span className="inline-flex items-center justify-center rounded-lg shrink-0" style={{ width: size, height: size, background: `${magnetMeta(m).color}22`, color: magnetMeta(m).color }}>{magnetIcon(m)}</span>
          )
          return (
            <section {...cardDrag('sources')} className="cq-card wc-slot relative group rounded-xl p-4 border flex flex-col min-h-0 overflow-hidden gap-3" style={{ ...slotStyle('sources'), backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)', boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
              {cardGrip('sources')}
              {/* reference layout: title → stat strip → ranked bars + the ring */}
              <div className="shrink-0">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Activity Sources</h3>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Where touchpoints came from · last 30 days</p>
              </div>

              {/* stat strip */}
              <div className="shrink-0 grid grid-cols-3 rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}>
                {[
                  { label: 'Total touchpoints', value: fmtComma(mixTotal), color: 'var(--text-primary)' },
                  { label: 'vs prior 7d', value: `${mixChange >= 0 ? '+' : ''}${mixChange}%`, color: mixChange >= 0 ? '#22c55e' : '#ef4444' },
                  { label: 'Daily avg', value: String(mixAvg), color: 'var(--text-primary)' },
                ].map((t, i) => (
                  <div key={t.label} className="px-3 py-2" style={i > 0 ? { borderLeft: '1px solid var(--border-primary)' } : undefined}>
                    <div className="text-base font-extrabold leading-tight" style={{ color: t.color }}>{t.value}</div>
                    <div className="text-[9.5px]" style={{ color: 'var(--text-muted)' }}>{t.label}</div>
                  </div>
                ))}
              </div>

              {/* the ring (LEFT) + ranked source rows. Every column shrinkable so
                  the card can NEVER clip its right edge at narrow xl widths. */}
              <div className="as-split flex-1 min-h-0 gap-3 overflow-hidden">
                {/* the ring — source-mix donut with the total in the middle.
                    Shown/hidden by CARD width (@container), not viewport. */}
                <div className="as-donut items-center justify-center min-h-0 min-w-0">
                  <div className="w-full" style={{ maxWidth: 148 }}><SourceDonut mix={popMix} total={mixTotal} /></div>
                </div>
                {/* overflow-y-auto + my-auto (not justify-center + hidden): with
                    many sources justify-center clipped BOTH ends of the list —
                    my-auto centers when it fits, scrolls from the top when not. */}
                <div className="flex flex-col min-h-0 min-w-0 overflow-y-auto">
                  <div className="my-auto flex flex-col gap-1">
                  {popMix.slice(0, 10).map((s, i) => (
                    <div key={s.magnet} className="grid items-center gap-1.5 rounded-lg border px-2 py-1.5" style={{ gridTemplateColumns: '12px 20px minmax(0,0.9fr) minmax(20px,1.4fr) 34px minmax(28px,auto) 16px', borderColor: 'var(--border-primary)', background: 'var(--bg-tertiary)' }}>
                      <span className="text-[10.5px] font-bold" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                      {iconTile(s.magnet, 20)}
                      <span className="text-[11.5px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{magnetMeta(s.magnet).label}</span>
                      <span className="h-1.5 rounded-full overflow-hidden min-w-0" style={{ background: 'var(--bg-primary)' }}>
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.round((s.share / topShare) * 100))}%`, background: magnetMeta(s.magnet).color }} />
                      </span>
                      <span className="text-right text-[11px] font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>{s.share}%</span>
                      <span className="text-right text-[11px] font-semibold whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{fmtComma(s.count)}</span>
                      <span className="text-right text-[10.5px] font-bold flex items-center justify-end" style={{ color: s.delta7 > 0 ? '#22c55e' : s.delta7 < 0 ? '#ef4444' : 'var(--text-muted)' }}>
                        {s.delta7 > 0 ? <MdArrowUpward size={11} /> : s.delta7 < 0 ? <MdTrendingDown size={11} /> : <MdRemove size={11} />}
                      </span>
                    </div>
                  ))}
                  </div>
                </div>
              </div>
            </section>
          )
        })()}
      </div>

      {/* Lead Details Modal */}
      {showLeadModal && selectedLead && (
        <LeadDetailsModal
          lead={selectedLead}
          isOpen={showLeadModal}
          onClose={() => { setShowLeadModal(false); setSelectedLead(null) }}
          onStatusUpdate={async () => { await loadMetrics() }}
        />
      )}
    </div>
  )
}

// ── Home-page building blocks (mockup layout) ──────────────────────────────

function KpiDelta({ change, goodWhenUp = true, suffix = '%' }: { change?: number; goodWhenUp?: boolean; suffix?: string }) {
  if (change == null || !isFinite(change) || change === 0) return null
  const up = change > 0
  const good = up === goodWhenUp
  const color = good ? '#22c55e' : '#ef4444'
  const Icon = up ? MdTrendingUp : MdTrendingDown
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color }}>
      <Icon size={13} />{Math.abs(Math.round(change))}{suffix}
    </span>
  )
}

function KpiCard({ icon, iconColor, label, value, sub, delta, sparkData, sparkColor, onClick }: {
  icon: React.ReactNode
  iconColor: string
  label: string
  value: React.ReactNode
  sub?: string
  delta?: React.ReactNode
  sparkData?: Array<{ value: number }>
  sparkColor?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl p-4 border flex flex-col justify-between ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
      style={{ backgroundColor: `color-mix(in srgb, ${iconColor} ${TINT_BG}, var(--bg-primary))`, borderColor: `color-mix(in srgb, ${iconColor} ${TINT_BORDER}, var(--border-primary))`, minHeight: 132, boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${iconColor}1f`, color: iconColor }}>{icon}</span>
        <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div className="flex items-end gap-2 mt-2">
        <span className="text-2xl sm:text-3xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{value}</span>
        {delta}
      </div>
      {sparkData && sparkData.length > 1 ? (
        <div className="w-full mt-2" style={{ height: 30 }}>
          <Sparkline data={sparkData} color={sparkColor || iconColor} height={30} showGradient />
        </div>
      ) : (
        <div style={{ height: 30 }} />
      )}
      <span className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{sub || 'vs last 7 days'}</span>
    </div>
  )
}

function EngineNode({ icon, color, count, label, sub, last }: {
  icon: React.ReactNode
  color: string
  count: number | string
  label: string
  sub?: string
  last?: boolean
}) {
  return (
    <>
      {/* Desktop: the funnel circle. Phone: a compact stat ROW instead — five
          64px circles + big numbers never fit 375px, and larger counts (100/
          1000) made it worse. Rows grow with the number, funnel reads
          top→bottom. */}
      <div className="hidden sm:flex flex-col items-center text-center flex-1 min-w-[64px]">
        <span className="flex h-16 w-16 items-center justify-center rounded-full mb-3" style={{ backgroundColor: `${color}1f`, color }}>{icon}</span>
        <span className="text-3xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{count}</span>
        <span className="text-xs mt-1.5 leading-tight" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {sub && <span className="text-[11px] mt-0.5 font-medium" style={{ color }}>{sub}</span>}
      </div>
      <div
        className="flex sm:hidden items-center gap-3 py-2.5"
        style={{ borderBottom: last ? 'none' : '1px solid var(--border-primary)' }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}1f`, color }}>
          {isValidElement(icon) ? cloneElement(icon as React.ReactElement<{ size?: number }>, { size: 18 }) : icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-medium leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{label}</span>
          {sub && <span className="block text-[10.5px] leading-tight truncate" style={{ color }}>{sub}</span>}
        </span>
        <span className="text-xl font-bold shrink-0" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </div>
      {!last && <MdArrowForward className="shrink-0 mx-0.5 hidden sm:block" size={18} style={{ color: 'var(--text-muted)' }} />}
    </>
  )
}
