'use client'

import { useState, useEffect, useRef } from 'react'
import { formatDateTime, formatDate } from '@/lib/utils'
import { createClient } from '../../lib/supabase/client'
import { LokazenPropertyGallery } from '@/components/dashboard/LokazenPropertyGallery'
import { format } from 'date-fns'
import { MdLanguage, MdChat, MdPhone, MdShare, MdAutoAwesome, MdOpenInNew, MdHistory, MdCall, MdEvent, MdMessage, MdNote, MdEdit, MdTrendingUp, MdTrendingDown, MdRemove, MdCheckCircle, MdSchedule, MdPsychology, MdFlashOn, MdBarChart, MdEmail, MdChevronRight, MdSmartToy, MdPerson, MdRefresh, MdHelpOutline, MdInfo, MdCheck, MdPayments, MdReportProblem, MdSchool, MdHistoryEdu, MdFlightTakeoff, MdAccountBalanceWallet, MdPersonOutline, MdOutlineInsights, MdMic, MdAdd, MdMoreHoriz, MdDynamicForm, MdClose, MdContentCopy, MdExpandMore } from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { useRouter } from 'next/navigation'
import LeadStageSelector from './LeadStageSelector'
import ActivityLoggerModal from './ActivityLoggerModal'
import { LeadStage } from '@/types'
import type { Lead as ScoreLead } from '@/types'
import { calculateLeadScore as calculateLeadScoreUtil, type CalculatedScore } from '@/lib/leadScoreCalculator'
// Direct path to the source file — NOT the @/lib/services barrel — so this
// client component doesn't drag bookingManager (googleapis → fs/net/child_process)
// into the client bundle. Webpack tree-shaking became less generous after the
// resend import was added to the barrel.
import { cleanDisplayName } from '@/lib/services/utils'

// Lokazen CRE details — collapsed by default, click the header to expand.
// Keeps the contact card clean instead of cramming every field inline.
function LokazenCreCard({ ctx }: { ctx: any }) {
  const [open, setOpen] = useState(false)
  const lkz = ctx || {}
  const isBrand = lkz.user_type === 'brand'
  const isOwner = lkz.user_type === 'owner' || lkz.user_type === 'property_owner'
  if (!isBrand && !isOwner) return null
  const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', kn: 'Kannada' }
  const title = isBrand ? 'Brand Requirement' : 'Property Listing'
  const brandFields: [string, any][] = [
    ['Brand', lkz.brand_name], ['Category', lkz.brand_category], ['Current outlets', lkz.current_outlets],
    ['Expansion', lkz.expansion_intent], ['Target zones', lkz.target_zones], ['Size (sqft)', lkz.required_size_sqft],
    ['Budget/mo', lkz.budget_monthly_rent], ['Format', lkz.preferred_format], ['Timeline', lkz.timeline],
    ['Language', LANG[lkz.preferred_language] || lkz.preferred_language],
  ]
  const ownerFields: [string, any][] = [
    ['Zone', lkz.property_zone], ['Type', lkz.property_type], ['Address', lkz.property_address], ['Maps URL', lkz.google_maps_url],
    ['Size (sqft)', lkz.property_size_sqft], ['Asking rent/mo', lkz.asking_rent_monthly], ['Floor', lkz.floor],
    ['Frontage (ft)', lkz.frontage_ft], ['Available', lkz.availability_date], ['Amenities', lkz.amenities],
    ['Photos received', lkz.photos_received],
    ['Language', LANG[lkz.preferred_language] || lkz.preferred_language],
  ]
  const fields = (isBrand ? brandFields : ownerFields).filter(([, v]) => v != null && String(v).trim() !== '')
  if (!fields.length) return null
  return (
    <>
      {/* Trigger row — just the title; opens a clean popup. Fixed height, no
          location text crammed in, never widens the contact card. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-colors hover:brightness-110"
        style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <span className="text-xs font-bold uppercase tracking-wide truncate" style={{ color: 'var(--accent-primary)' }}>
          {title}
        </span>
        <MdOpenInNew size={14} className="flex-shrink-0" style={{ color: 'var(--text-secondary)' }} />
      </button>

      {/* Popup overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border shadow-2xl"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border-primary)' }}>
              <span className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--accent-primary)' }}>{title}</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 hover:opacity-70" style={{ color: 'var(--text-secondary)' }} aria-label="Close">
                <MdClose size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3.5 px-5 py-4">
              {fields.map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span className="text-sm capitalize" style={{ color: 'var(--text-primary)' }}>{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Manual lead-type override — auto-detection nails brand/owner but scout is
// still being tuned, so operators need a one-click way to move a mis-tagged
// lead to Scout (or correct any type). Posts to /set-type, which writes only
// unified_context (no missing-table dependency), then refreshes the lead.
function LokazenTypeSelector({ leadId, current, onDone }: { leadId: string; current: string; onDone: () => void }) {
  const [saving, setSaving] = useState<string | null>(null)
  const cur = current === 'property_owner' ? 'owner' : current
  const OPTIONS: [string, string][] = [['brand', 'Brand'], ['owner', 'Property Owner'], ['scout', 'Scout']]

  const setType = async (type: string) => {
    if (type === cur || saving) return
    setSaving(type)
    try {
      const res = await fetch(`/api/dashboard/leads/${leadId}/set-type`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(`Could not change type: ${j.error || res.statusText}`)
        return
      }
      onDone()
    } catch (e) {
      alert(`Could not change type: ${e instanceof Error ? e.message : 'network error'}`)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide flex-shrink-0" style={{ color: 'var(--text-muted)' }}>Type</span>
      <div className="flex gap-1">
        {OPTIONS.map(([val, label]) => {
          const active = val === cur
          return (
            <button
              key={val}
              type="button"
              disabled={active || !!saving}
              onClick={() => setType(val)}
              className="px-2 py-1 rounded-md text-[11px] font-medium border transition-colors disabled:opacity-100 hover:brightness-110"
              style={{
                borderColor: active ? 'var(--accent-primary)' : 'var(--border-primary)',
                backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                color: active ? 'var(--accent-contrast, #fff)' : 'var(--text-secondary)',
                cursor: active ? 'default' : 'pointer',
              }}
            >
              {saving === val ? '…' : label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Helper functions for IST date/time formatting
function formatDateIST(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const day = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  }).replace(/\//g, '-');
  return day;
}

function formatTimeIST(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
}

function formatDateTimeIST(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  return `${formatDateIST(dateString)}, ${formatTimeIST(dateString)}`;
}

function formatBookingTime(timeString: string | null | undefined): string {
  if (!timeString) return '';
  const s = timeString.toString().trim();
  if (!s) return '';
  // Bookings are stored in two formats: 24h "HH:MM" (web) and 12h "H:MM AM/PM"
  // (WhatsApp). If a period is already present, keep it — otherwise the hour
  // would be misread as 24h and a PM time would flip to AM.
  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if (ampm) {
    const h = parseInt(ampm[1], 10);
    return `${h % 12 || 12}:${ampm[2] || '00'} ${ampm[3].toUpperCase()}M`;
  }
  const timeParts = s.split(':');
  if (timeParts.length < 2) return s;
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return s;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function formatBookingDateShort(dateString: string | null | undefined): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

// Shared classifier for call-log outcomes in the Notes tab — true when the
// call did NOT connect (no answer / busy / voicemail / RNR / unreachable).
function isNoAnswerOutcome(outcome: string): boolean {
  return /no answer|busy|voicemail|rnr|not reachable|unreachable|switched off|missed|no response|declin|disconnect/.test(outcome.toLowerCase())
}

// Color for the small outcome badge next to "Call log".
function getNoteOutcomeClass(outcome: string): string {
  if (isNoAnswerOutcome(outcome)) return 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
  if (/connect|interest|answered|spoke|reachable|booked/.test(outcome.toLowerCase())) {
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
  }
  return 'bg-slate-500/10 text-slate-600 dark:text-slate-300'
}

// Tint for the whole call-log card so the outcome is scannable at a glance:
// no-answer-type calls read amber, connected (and outcome-less) calls stay green.
function getCallCardClass(outcome: string | null): string {
  if (outcome && isNoAnswerOutcome(outcome)) {
    return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40'
  }
  return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40'
}

function formatCountdown(scheduledAt: string): string {
  const now = Date.now()
  const target = new Date(scheduledAt).getTime()
  const diff = target - now

  if (diff <= 0) return 'Now'

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const date = new Date(scheduledAt)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const dayAfter = new Date(tomorrow)
    dayAfter.setDate(dayAfter.getDate() + 1)

    if (target < dayAfter.getTime()) {
      return `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}`
    }
    return `In ${days}d ${hours % 24}h`
  }

  if (hours > 0) return `In ${hours}h ${minutes % 60}m`
  return `In ${minutes}m`
}

function getTaskTypeConfig(taskType: string): { color: string; bg: string; label: string } {
  const t = (taskType || '').toLowerCase()
  if (t.includes('nudge')) return { color: '#F97316', bg: 'rgba(249,115,22,0.12)', label: 'Nudge' }
  if (t.includes('reminder')) return { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', label: 'Reminder' }
  if (t.includes('re_engage') || t.includes('reengage')) return { color: '#EF4444', bg: 'rgba(239,68,68,0.12)', label: 'Re-engage' }
  if (t.includes('follow')) return { color: '#22C55E', bg: 'rgba(34,197,94,0.12)', label: 'Follow-up' }
  return { color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', label: taskType?.replace(/_/g, ' ') || 'Task' }
}

function getTaskActionLabel(task: any): string {
  const channel = task.metadata?.channel || 'WhatsApp'
  const t = (task.task_type || '').toLowerCase()
  if (t.includes('nudge')) return `${channel} nudge`
  if (t.includes('reminder') && t.includes('booking')) return 'Booking reminder'
  if (t.includes('reminder')) return `${channel} reminder`
  if (t.includes('follow')) return `${channel} follow-up`
  if (t.includes('re_engage') || t.includes('reengage')) return `${channel} re-engagement`
  return task.task_description || task.task_type?.replace(/_/g, ' ') || 'Scheduled action'
}

function renderMarkdown(text: string) {
  if (!text) return null;

  // Simple regex to handle **bold** text
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-[var(--text-primary)]">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

/**
 * Render WhatsApp-style markdown — what Meta's templates use natively:
 *   *text*  → bold
 *   _text_  → italic
 *   ~text~  → strikethrough
 * Newlines preserved as <br/>. Used for the Activity tab bubbles when the
 * activity came from the WhatsApp channel — otherwise free-form AI replies
 * showed literal asterisks (e.g. "Date: *Fri, 22 May* Time: *1:00 PM*").
 */
function renderWhatsAppMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  const re = /(\*[^*\n]+?\*|_[^_\n]+?_|~[^~\n]+?~|\n)/g;
  const segments = text.split(re).filter((s) => s !== undefined && s !== '');
  return segments.map((seg, i) => {
    if (seg === '\n') return <br key={i} />;
    if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2) {
      return <strong key={i} className="font-bold">{seg.slice(1, -1)}</strong>;
    }
    if (seg.startsWith('_') && seg.endsWith('_') && seg.length > 2) {
      return <em key={i} className="italic">{seg.slice(1, -1)}</em>;
    }
    if (seg.startsWith('~') && seg.endsWith('~') && seg.length > 2) {
      return <s key={i}>{seg.slice(1, -1)}</s>;
    }
    return <span key={i}>{seg}</span>;
  });
}

function splitButtonMarkers(text: string): { body: string; buttons: string[] } {
  const buttons: string[] = [];
  const body = (text || '').replace(/\[BTN:\s*([^\]]+)\]/g, (_, label) => {
    const cleaned = String(label || '').trim();
    if (cleaned) buttons.push(cleaned);
    return '';
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { body, buttons };
}

function renderMessageWithButtons(
  text: string,
  formatter: (value: string) => React.ReactNode,
): React.ReactNode {
  const { body, buttons } = splitButtonMarkers(text);
  return (
    <>
      {body && <div className="whitespace-pre-wrap">{formatter(body)}</div>}
      {buttons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {buttons.map((button, index) => (
            <span
              key={`${button}-${index}`}
              className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none"
              style={{
                borderColor: 'rgba(255,82,0,0.65)',
                backgroundColor: 'rgba(255,82,0,0.12)',
                color: 'var(--accent-primary)',
              }}
            >
              {button}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** Render summary as plain text - just sentences, no formatting */
function renderSummary(text: string) {
  if (!text) return null;
  return (
    <p className="text-[13px] leading-relaxed font-normal" style={{ color: 'var(--text-primary)' }}>
      {text.trim()}
    </p>
  );
}

const ALL_CHANNELS = ['web', 'whatsapp', 'voice', 'social', 'meta_forms'];

const ChannelIcon = ({ channel, size = 16, active = false }: { channel: string; size?: number; active?: boolean }) => {
  const style = {
    opacity: active ? 1 : 0.3,
    filter: 'invert(1) brightness(2)',
  };

  switch (channel) {
    case 'web':
      return <img src="/browser-stroke-rounded.svg" alt="Web" width={size} height={size} style={style} title="Website" />;
    case 'whatsapp':
      return <img src="/whatsapp-business-stroke-rounded.svg" alt="WhatsApp" width={size} height={size} style={style} title="WhatsApp" />;
    case 'voice':
      return <img src="/ai-voice-stroke-rounded.svg" alt="Voice" width={size} height={size} style={style} title="Voice" />;
    case 'social':
      return <img src="/video-ai-stroke-rounded.svg" alt="Social" width={size} height={size} style={style} title="Social" />;
    default:
      return null;
  }
};

interface Lead {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  first_touchpoint?: string | null
  last_touchpoint?: string | null
  timestamp: string
  status: string | null
  booking_date: string | null
  booking_time: string | null
  metadata?: any
  unified_context?: any
  lead_score?: number | null
  lead_stage?: string | null
  sub_stage?: string | null
  stage_override?: boolean | null
  last_scored_at?: string | null
  last_interaction_at?: string | null
  created_at?: string | null
}

interface LeadDetailsModalProps {
  lead: Lead | null
  isOpen: boolean
  onClose: () => void
  onStatusUpdate: (leadId: string, newStatus: string) => Promise<void>
}

const CHANNEL_CONFIG = {
  web: {
    name: 'Web',
    icon: MdLanguage,
    color: '#3B82F6',
    emoji: '🌐'
  },
  whatsapp: {
    name: 'WhatsApp',
    icon: FaWhatsapp,
    color: '#22C55E',
    emoji: '💬'
  },
  voice: {
    name: 'Voice',
    icon: MdPhone,
    // Fixed sky-blue, NOT var(--accent-primary): the accent is white in dark
    // mode, so the white phone icon was invisible on a white circle.
    color: '#0EA5E9',
    emoji: '📞'
  },
  social: {
    name: 'Social',
    icon: MdShare,
    color: '#EC4899',
    emoji: '📱'
  },
  meta_forms: {
    name: 'Meta Forms',
    icon: MdDynamicForm,
    color: '#1877F2',
    emoji: '📋'
  }
}

const STAGE_PROGRESSION = [
  { stage: 'New', order: 0 },
  { stage: 'Engaged', order: 1 },
  { stage: 'Qualified', order: 2 },
  { stage: 'High Intent', order: 3 },
  { stage: 'Booking Made', order: 4 },
  { stage: 'Converted', order: 5 },
]

function CopyIconButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!value) return
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="lead-copy-btn opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex-shrink-0 focus:outline-none focus:opacity-100"
      title={copied ? 'Copied!' : `Copy ${label}`}
      aria-label={`Copy ${label}`}
    >
      {copied ? <MdCheck size={12} className="text-green-500" /> : <MdContentCopy size={12} />}
    </button>
  )
}

export default function LeadDetailsModal({ lead, isOpen, onClose, onStatusUpdate }: LeadDetailsModalProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'activity' | 'notes' | 'summary' | 'breakdown' | 'interaction' | 'attribution'>('summary')
  // Lead-modal tab visibility — configured per brand at Configure → Lead Modal.
  // Defaults every tab ON; only an explicit `false` hides one.
  const [leadTabCfg, setLeadTabCfg] = useState<Record<string, boolean>>({})
  const tabOn = (k: string) => leadTabCfg[k] !== false
  useEffect(() => {
    fetch('/api/dashboard/settings/lead-modal')
      .then((r) => r.json())
      .then((d) => {
        const tabs = d?.tabs || {}
        setLeadTabCfg(tabs)
        // If the default/active tab is hidden, fall to the first visible one.
        const order = ['summary', 'activity', 'notes', 'breakdown', 'interaction', 'attribution'] as const
        setActiveTab((cur) => (tabs[cur] !== false ? cur : (order.find((t) => tabs[t] !== false) || cur)))
      })
      .catch(() => {})
  }, [])
  const [showStageDropdown, setShowStageDropdown] = useState(false)
  const [showActivityModal, setShowActivityModal] = useState(false)
  const [showAttribution, setShowAttribution] = useState(false)
  const [showPATResult, setShowPATResult] = useState(false)
  const stageButtonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState<'below' | 'above'>('below')
  const [pendingStageChange, setPendingStageChange] = useState<{
    oldStage: string | null
    newStage: LeadStage
  } | null>(null)
  const [unifiedSummary, setUnifiedSummary] = useState<string>('')
  const [summaryAttribution, setSummaryAttribution] = useState<string>('')
  const [summaryData, setSummaryData] = useState<any>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [activities, setActivities] = useState<any[]>([])
  const [conversationActivities, setConversationActivities] = useState<any[]>([])
  // Manual refresh for the Notes tab — re-pulls the lead row (fresh admin_notes)
  // and the activity timeline so a just-logged note/call shows without reopening.
  const [isRefreshingNotes, setIsRefreshingNotes] = useState(false)
  const refreshNotes = async () => {
    if (isRefreshingNotes) return
    setIsRefreshingNotes(true)
    try {
      await Promise.all([loadFreshLeadData(), loadActivities()])
    } catch (err) {
      console.error('Error refreshing notes:', err)
    } finally {
      setIsRefreshingNotes(false)
    }
  }
  const [loadingActivities, setLoadingActivities] = useState(false)

  // 30-Day Interaction data (from first touchpoint)
  const [interaction30Days, setInteraction30Days] = useState<{
    totalInteractions: number
    dailyData: Array<{ date: string; count: number }>
    lastTouchDay: string | null
    leadInDay: string | null
  } | null>(null)
  const [loading30Days, setLoading30Days] = useState(false)

  // New state for enhanced metrics
  const [channelData, setChannelData] = useState<{
    web: { count: number; firstDate: string | null; lastDate: string | null }
    whatsapp: { count: number; firstDate: string | null; lastDate: string | null }
    voice: { count: number; firstDate: string | null; lastDate: string | null }
    meta_forms: { count: number; firstDate: string | null; lastDate: string | null }
    social: { count: number; firstDate: string | null; lastDate: string | null }
  }>({
    web: { count: 0, firstDate: null, lastDate: null },
    whatsapp: { count: 0, firstDate: null, lastDate: null },
    voice: { count: 0, firstDate: null, lastDate: null },
    social: { count: 0, firstDate: null, lastDate: null },
    meta_forms: { count: 0, firstDate: null, lastDate: null },
  })
  const [quickStats, setQuickStats] = useState<{
    totalMessages: number
    responseRate: number
    avgResponseTime: number
    hasBooking: boolean
  }>({
    totalMessages: 0,
    responseRate: 0,
    avgResponseTime: 0,
    hasBooking: false,
  })
  const [previousScore, setPreviousScore] = useState<number | null>(null)
  const [freshLeadData, setFreshLeadData] = useState<Lead | null>(null)
  const [calculatedScore, setCalculatedScore] = useState<CalculatedScore | null>(null)

  // Admin notes state
  const [showAdminNoteInput, setShowAdminNoteInput] = useState(false)
  const [adminNoteText, setAdminNoteText] = useState('')
  const [savingAdminNote, setSavingAdminNote] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [showAdminNotes, setShowAdminNotes] = useState(false)
  const recognitionRef = useRef<any>(null)
  // AI classification progress state
  const [noteProgress, setNoteProgress] = useState<{
    steps: { text: string; done: boolean }[]
    visible: boolean
    title?: string  // e.g. "Note added" / "Call logged: No Answer"
    note?: string   // The actual note text the user typed
  }>({ steps: [], visible: false })

  // Inline name edit
  const [editingName, setEditingName] = useState(false)
  const [editingNameValue, setEditingNameValue] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Log a Call state
  const [showLogCallForm, setShowLogCallForm] = useState(false)
  const [logCallOutcome, setLogCallOutcome] = useState<string>('Connected')
  const [logCallNotes, setLogCallNotes] = useState('')
  const [savingLogCall, setSavingLogCall] = useState(false)

  // Send Message state
  const [showSendMessageForm, setShowSendMessageForm] = useState(false)
  const [sendMessageText, setSendMessageText] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)

  // "+" action dropdown
  const [showActionDropdown, setShowActionDropdown] = useState(false)

  // Merge-leads state
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeCandidates, setMergeCandidates] = useState<Array<{
    id: string; customer_name: string | null; phone: string | null; email: string | null; lead_score: number | null
  }>>([])
  const [mergeSearchLoading, setMergeSearchLoading] = useState(false)
  const [mergeSelected, setMergeSelected] = useState<{
    id: string; customer_name: string | null; phone: string | null; email: string | null; lead_score: number | null
  } | null>(null)
  const [merging, setMerging] = useState(false)

  // Next Actions — hidden until redesigned. Founder: "Next Actions is completely
  // messed up. Rather than showing random things, just stop showing anything,
  // figure out what needs to be done, then set up Next Actions." Flip to true
  // once the auto-task logic is reworked.
  const SHOW_NEXT_ACTIONS = false

  // Next Actions state
  const [leadTasks, setLeadTasks] = useState<any[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [, setTick] = useState(0)

  // Calculate and set unified score (using shared utility) and persist to DB
  const calculateAndSetScore = async () => {
    if (!lead) return
    const leadData = freshLeadData || lead
    const result = await calculateLeadScoreUtil(leadData as ScoreLead)
    setCalculatedScore(result)

    // Persist the SAME client-computed score we just displayed, so the list,
    // modal, and dashboard Avg Lead Score all read one consistent value.
    if (result && typeof result.score === 'number') {
      try {
        await fetch(`/api/dashboard/leads/${lead.id}/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score: Math.round(result.score) }),
        })
      } catch (err) {
        console.error('Failed to persist recalculated score:', err)
      }
    }
  }

  // Fetch fresh lead data from database when modal opens
  const loadFreshLeadData = async () => {
    if (!lead) return
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('all_leads')
        .select('id, customer_name, email, phone, created_at, last_interaction_at, booking_date, booking_time, lead_score, lead_stage, sub_stage, stage_override, unified_context, first_touchpoint, last_touchpoint, status')
        .eq('id', lead.id)
        .single()

      if (error) {
        console.error('Error fetching fresh lead data:', error)
        return
      }

      if (data) {
        const typedData = data as {
          booking_date?: string | null
          booking_time?: string | null
          unified_context?: any
          lead_stage?: string | null
          sub_stage?: string | null
          stage_override?: boolean | null
          lead_score?: number | null
          first_touchpoint?: string | null
          last_touchpoint?: string | null
          status?: string | null
          created_at?: string | null
          last_interaction_at?: string | null
          customer_name?: string | null
          email?: string | null
          phone?: string | null
        }
        // Get booking from multiple sources (same logic as loadQuickStats)
        const unifiedContext = typedData.unified_context || lead.unified_context
        const bookingDate =
          typedData.booking_date ||
          lead.booking_date ||
          unifiedContext?.web?.booking_date ||
          unifiedContext?.web?.booking?.date ||
          unifiedContext?.whatsapp?.booking_date ||
          unifiedContext?.whatsapp?.booking?.date ||
          unifiedContext?.voice?.booking_date ||
          unifiedContext?.voice?.booking?.date ||
          unifiedContext?.social?.booking_date ||
          unifiedContext?.social?.booking?.date ||
          null

        const bookingTime =
          typedData.booking_time ||
          lead.booking_time ||
          unifiedContext?.web?.booking_time ||
          unifiedContext?.web?.booking?.time ||
          unifiedContext?.whatsapp?.booking_time ||
          unifiedContext?.whatsapp?.booking?.time ||
          unifiedContext?.voice?.booking_time ||
          unifiedContext?.voice?.booking?.time ||
          unifiedContext?.social?.booking_time ||
          unifiedContext?.social?.booking?.time ||
          null

        // ── Session-table fallback ─────────────────────────────────────────
        // If neither all_leads nor unified_context carries a booking but the
        // lead actually booked, the booking is sitting in web_sessions or
        // whatsapp_sessions (storeBooking writes there first, then syncs to
        // all_leads — when that sync fails the channel session is the only
        // surviving source). Pull it from there so Key Event renders.
        let resolvedBookingDate: string | null = bookingDate
        let resolvedBookingTime: string | null = bookingTime
        if (!resolvedBookingDate || !resolvedBookingTime) {
          try {
            const sessionTables = ['web_sessions', 'whatsapp_sessions']
            const phone = typedData.phone || lead.phone
            const email = typedData.email || lead.email
            for (const tbl of sessionTables) {
              if (resolvedBookingDate && resolvedBookingTime) break
              let row: any = null
              if (phone) {
                const { data } = await supabase
                  .from(tbl)
                  .select('booking_date, booking_time, booking_created_at')
                  .eq('customer_phone', phone)
                  .not('booking_date', 'is', null)
                  .not('booking_time', 'is', null)
                  .order('booking_created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle()
                row = data
              }
              if (!row && email) {
                const { data } = await supabase
                  .from(tbl)
                  .select('booking_date, booking_time, booking_created_at')
                  .eq('customer_email', email)
                  .not('booking_date', 'is', null)
                  .not('booking_time', 'is', null)
                  .order('booking_created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle()
                row = data
              }
              if (row?.booking_date) {
                resolvedBookingDate = resolvedBookingDate || row.booking_date
                resolvedBookingTime = resolvedBookingTime || row.booking_time
              }
            }
          } catch (sessionFetchErr) {
            console.warn('[LeadDetailsModal] session-table booking fallback failed', sessionFetchErr)
          }
        }

        // Merge fresh data with existing lead prop
        const mergedLead: Lead = {
          ...lead,
          name: typedData.customer_name || lead.name,
          email: typedData.email || lead.email,
          phone: typedData.phone || lead.phone,
          timestamp: typedData.created_at || lead.timestamp,
          last_interaction_at: typedData.last_interaction_at || lead.last_interaction_at || null,
          booking_date: resolvedBookingDate,
          booking_time: resolvedBookingTime,
          lead_score: typedData.lead_score ?? lead.lead_score ?? null,
          lead_stage: typedData.lead_stage || lead.lead_stage || null,
          sub_stage: typedData.sub_stage || lead.sub_stage || null,
          stage_override: typedData.stage_override ?? lead.stage_override ?? null,
          unified_context: typedData.unified_context || lead.unified_context || null,
          first_touchpoint: typedData.first_touchpoint || lead.first_touchpoint || null,
          last_touchpoint: typedData.last_touchpoint || lead.last_touchpoint || null,
          status: typedData.status || lead.status || null,
        }
        setFreshLeadData(mergedLead)
      }
    } catch (error) {
      console.error('Error loading fresh lead data:', error)
    }
  }

  // Helper to get local YYYY-MM-DD
  const getLocalDateKey = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Load 30-day interaction data (from first touchpoint)
  const load30DayInteractions = async () => {
    if (!lead) return
    setLoading30Days(true)
    try {
      const supabase = createClient()

      // Get first touchpoint date (created_at)
      const firstTouchpoint = new Date(lead.created_at || lead.timestamp || new Date())
      firstTouchpoint.setHours(0, 0, 0, 0)

      const leadInDay = firstTouchpoint.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

      const thirtyDaysLater = new Date(firstTouchpoint)
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 31) // Allow for 30 full days

      // Fetch messages from first 30 days (customer messages only)
      const { data: messages30Days, error: error30 } = await supabase
        .from('conversations')
        .select('created_at, sender')
        .eq('lead_id', lead.id)
        .eq('sender', 'customer')
        .gte('created_at', firstTouchpoint.toISOString())
        .lt('created_at', thirtyDaysLater.toISOString())
        .order('created_at', { ascending: true })

      if (error30) {
        console.error('Error loading 30-day interactions:', error30)
        setLoading30Days(false)
        return
      }

      const typedMessages30Days = (messages30Days ?? []) as Array<{ created_at?: string | null }>
      // Group messages by date for first 30 days
      const dailyCounts: Record<string, number> = {}

      // Initialize all 30 days with 0 using LOCAL date keys
      for (let i = 0; i < 30; i++) {
        const d = new Date(firstTouchpoint)
        d.setDate(d.getDate() + i)
        const dateStr = getLocalDateKey(d)
        dailyCounts[dateStr] = 0
      }

      // Count messages per day using LOCAL dates
      typedMessages30Days.forEach((msg) => {
        if (!msg.created_at) return
        const dateStr = getLocalDateKey(new Date(msg.created_at))
        if (dailyCounts[dateStr] !== undefined) {
          dailyCounts[dateStr] = (dailyCounts[dateStr] || 0) + 1
        }
      })

      // Convert to array and sort by date
      const dailyData = Object.entries(dailyCounts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // Calculate total interactions
      const totalInteractions = typedMessages30Days.length

      // Calculate last touch day (most recent day with interactions)
      let lastTouchDay: string | null = null
      if (typedMessages30Days.length > 0) {
        const lastMessage = typedMessages30Days[typedMessages30Days.length - 1]
        const lastDate = lastMessage.created_at ? new Date(lastMessage.created_at) : new Date()
        lastTouchDay = lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }

      setInteraction30Days({
        totalInteractions,
        dailyData,
        lastTouchDay,
        leadInDay,
      })
    } catch (error) {
      console.error('Error loading 30-day interactions:', error)
    } finally {
      setLoading30Days(false)
    }
  }

  // Load all data when lead changes
  useEffect(() => {
    if (lead && isOpen) {
      loadFreshLeadData()
      loadUnifiedSummary(true) // Always regenerate fresh summary on open
      loadActivities()
      loadChannelData()
      loadQuickStats()
      loadScoreHistory()
      loadLeadTasks()
      // Calculate score immediately with lead prop (will recalculate when freshLeadData loads)
      calculateAndSetScore()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead, isOpen])

  // Recalculate score after fresh lead data is loaded (more accurate)
  useEffect(() => {
    if (freshLeadData && isOpen) {
      calculateAndSetScore()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshLeadData, isOpen])


  // Load 30-day interaction data when interaction tab is active
  useEffect(() => {
    if (activeTab === 'interaction' && lead && isOpen) {
      load30DayInteractions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, lead, isOpen])

  // Live countdown timer - re-render every 60s for task countdowns
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  const loadUnifiedSummary = async (refresh = false) => {
    if (!lead) return
    setUnifiedSummary('')
    setSummaryAttribution('')
    setSummaryData(null)
    setLoadingSummary(true)
    try {
      console.log('Loading unified summary for lead:', lead.id, { refresh })
      const url = `/api/dashboard/leads/${lead.id}/summary${refresh ? '?refresh=true' : ''}`
      const response = await fetch(url)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to load summary' }))
        console.error('Error loading unified summary:', response.status, errorData)
        setUnifiedSummary('')
        setSummaryAttribution('')
        setSummaryData(null)
        return
      }

      const data = await response.json()
      console.log('Summary API response:', { hasSummary: !!data.summary, summaryLength: data.summary?.length })

      if (data.summary) {
        setUnifiedSummary(data.summary)
        setSummaryAttribution(data.attribution || '')
        setSummaryData(data.data || null)
      } else {
        // If no summary in response, clear the state
        console.warn('No summary in API response')
        setUnifiedSummary('')
        setSummaryAttribution('')
        setSummaryData(null)
      }
    } catch (error) {
      console.error('Error loading unified summary:', error)
      setUnifiedSummary('')
      setSummaryAttribution('')
      setSummaryData(null)
    } finally {
      setLoadingSummary(false)
    }
  }

  const loadActivities = async () => {
    if (!lead) return
    setLoadingActivities(true)
    setActivities([])
    setConversationActivities([])
    try {
      const supabase = createClient()
      const [response, conversationResult] = await Promise.all([
        fetch(`/api/dashboard/leads/${lead.id}/activities`),
        supabase
          .from('conversations')
          .select('id, content, created_at, channel, sender, metadata')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.activities) {
          setActivities(data.activities)
        }
      }

      if (!conversationResult.error && Array.isArray(conversationResult.data)) {
        setConversationActivities(conversationResult.data.map((msg: any) => {
          const isCustomer = msg.sender === 'customer'
          const isAgent = msg.sender === 'agent'
          return {
            id: `conversation-${msg.id}`,
            type: isCustomer ? 'customer' : isAgent ? 'proxe' : 'system',
            actor: isCustomer ? 'Customer' : isAgent ? 'PROXe' : 'System',
            action: isCustomer ? 'Replied' : isAgent ? 'Message sent' : 'System update',
            content: msg.content,
            channel: msg.channel,
            timestamp: msg.created_at,
            icon: isCustomer ? 'reply' : 'message',
            color: isCustomer ? '#22C55E' : isAgent ? '#8B5CF6' : '#6B7280',
            _conversationFallback: true,
          }
        }))
      } else if (conversationResult.error) {
        console.error('Error loading conversation fallback activities:', conversationResult.error)
      }
    } catch (error) {
      console.error('Error loading activities:', error)
    } finally {
      setLoadingActivities(false)
    }
  }

  const loadChannelData = async () => {
    if (!lead) return
    try {
      const supabase = createClient()
      const { data: messages } = await supabase
        .from('conversations')
        .select('channel, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true })

      if (messages && Array.isArray(messages)) {
        const channelStats: typeof channelData = {
          web: { count: 0, firstDate: null, lastDate: null },
          whatsapp: { count: 0, firstDate: null, lastDate: null },
          voice: { count: 0, firstDate: null, lastDate: null },
          social: { count: 0, firstDate: null, lastDate: null },
          meta_forms: { count: 0, firstDate: null, lastDate: null },
        }

        messages.forEach((msg: any) => {
          const channel = msg.channel as keyof typeof channelStats
          if (channelStats[channel]) {
            channelStats[channel].count++
            if (!channelStats[channel].firstDate) {
              channelStats[channel].firstDate = msg.created_at
            }
            channelStats[channel].lastDate = msg.created_at
          }
        })

        setChannelData(channelStats)
      }
    } catch (error) {
      console.error('Error loading channel data:', error)
    }
  }

  const loadQuickStats = async () => {
    if (!lead) return
    try {
      const supabase = createClient()
      // Select metadata to get response_time_ms
      const { data: messages } = await supabase
        .from('conversations')
        .select('sender, created_at, metadata')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true })

      // Fetch fresh lead data to check booking
      const { data: leadData } = await supabase
        .from('all_leads')
        .select('booking_date, booking_time, unified_context')
        .eq('id', lead.id)
        .single()

      const typedLeadData = leadData as {
        booking_date?: string | null
        booking_time?: string | null
        unified_context?: any
      } | null

      if (messages && Array.isArray(messages) && messages.length > 0) {
        // Calculate response rate: what % of customer messages got a reply (capped at 100%)
        const customerMessages = messages.filter((m: any) => m.sender === 'customer')
        const agentMessages = messages.filter((m: any) => m.sender === 'agent')
        const responseRate = customerMessages.length > 0
          ? Math.min(100, Math.round((agentMessages.length / customerMessages.length) * 100))
          : 0

        // Calculate average response time from metadata.response_time_ms
        // Use only last 5 agent messages to reflect current performance
        let totalResponseTime = 0
        let responseCount = 0

        // First, try to use metadata.response_time_ms (last 5 only)
        const agentMsgsWithTime = messages.filter((msg: any) =>
          msg.sender === 'agent' && msg.metadata?.response_time_ms
        ).slice(-5)

        agentMsgsWithTime.forEach((msg: any) => {
          const responseTimeMs = typeof msg.metadata.response_time_ms === 'number'
            ? msg.metadata.response_time_ms
            : parseInt(msg.metadata.response_time_ms, 10)
          if (!isNaN(responseTimeMs) && responseTimeMs > 0) {
            totalResponseTime += responseTimeMs
            responseCount++
          }
        })

        // Fallback to timestamp calculation if no metadata.response_time_ms
        // Use last 10 messages to find up to 5 customer→agent pairs
        if (responseCount === 0) {
          const recentMessages = messages.slice(-10)
          for (let i = 0; i < recentMessages.length - 1; i++) {
            const msg1 = recentMessages[i] as any
            const msg2 = recentMessages[i + 1] as any
            if (msg1.sender === 'customer' && msg2.sender === 'agent') {
              const timeDiff = new Date(msg2.created_at).getTime() - new Date(msg1.created_at).getTime()
              if (timeDiff > 0) {
                totalResponseTime += timeDiff
                responseCount++
                if (responseCount >= 5) break
              }
            }
          }
        }

        // Convert to minutes (metadata is in ms, timestamp diff is also in ms)
        const avgResponseTime = responseCount > 0
          ? Math.round(totalResponseTime / responseCount / 60000)
          : 0

        // Check booking from multiple sources - prioritize fresh data
        const unifiedContext = typedLeadData?.unified_context || lead.unified_context
        const bookingDate =
          typedLeadData?.booking_date ||
          lead.booking_date ||
          unifiedContext?.web?.booking_date ||
          unifiedContext?.web?.booking?.date ||
          unifiedContext?.whatsapp?.booking_date ||
          unifiedContext?.whatsapp?.booking?.date ||
          unifiedContext?.voice?.booking_date ||
          unifiedContext?.voice?.booking?.date ||
          unifiedContext?.social?.booking_date ||
          unifiedContext?.social?.booking?.date ||
          null

        const bookingTime =
          typedLeadData?.booking_time ||
          lead.booking_time ||
          unifiedContext?.web?.booking_time ||
          unifiedContext?.web?.booking?.time ||
          unifiedContext?.whatsapp?.booking_time ||
          unifiedContext?.whatsapp?.booking?.time ||
          unifiedContext?.voice?.booking_time ||
          unifiedContext?.voice?.booking?.time ||
          unifiedContext?.social?.booking_time ||
          unifiedContext?.social?.booking?.time ||
          null

        const hasBooking = !!(bookingDate || bookingTime)

        setQuickStats({
          totalMessages: messages.length,
          responseRate,
          avgResponseTime,
          hasBooking,
        })
      } else {
        // Even with no messages, check for booking
        const unifiedContext = typedLeadData?.unified_context || lead.unified_context
        const bookingDate =
          typedLeadData?.booking_date ||
          lead.booking_date ||
          unifiedContext?.web?.booking_date ||
          unifiedContext?.web?.booking?.date ||
          unifiedContext?.whatsapp?.booking_date ||
          unifiedContext?.whatsapp?.booking?.date ||
          unifiedContext?.voice?.booking_date ||
          unifiedContext?.voice?.booking?.date ||
          unifiedContext?.social?.booking_date ||
          unifiedContext?.social?.booking?.date ||
          null

        const bookingTime =
          typedLeadData?.booking_time ||
          lead.booking_time ||
          unifiedContext?.web?.booking_time ||
          unifiedContext?.web?.booking?.time ||
          unifiedContext?.whatsapp?.booking_time ||
          unifiedContext?.whatsapp?.booking?.time ||
          unifiedContext?.voice?.booking_time ||
          unifiedContext?.voice?.booking?.time ||
          unifiedContext?.social?.booking_time ||
          unifiedContext?.social?.booking?.time ||
          null

        const hasBooking = !!(bookingDate || bookingTime)

        setQuickStats({
          totalMessages: 0,
          responseRate: 0,
          avgResponseTime: 0,
          hasBooking,
        })
      }
    } catch (error) {
      console.error('Error loading quick stats:', error)
    }
  }

  const loadScoreHistory = async () => {
    if (!lead) return
    try {
      const supabase = createClient()
      const { data: history } = await supabase
        .from('lead_stage_changes')
        .select('new_score, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(2)

      if (history && Array.isArray(history) && history.length > 1) {
        const prev = history[1] as any
        setPreviousScore(prev.new_score)
      }
    } catch (error) {
      console.error('Error loading score history:', error)
    }
  }

  const loadLeadTasks = async () => {
    if (!lead) return
    setLoadingTasks(true)
    try {
      const response = await fetch(`/api/dashboard/tasks?lead_id=${lead.id}`)
      if (response.ok) {
        const data = await response.json()
        setLeadTasks(data.tasks || [])
      }
    } catch (error) {
      console.error('Error loading lead tasks:', error)
    } finally {
      setLoadingTasks(false)
    }
  }

  const handleCancelTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/dashboard/tasks/${taskId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (response.ok) {
        loadLeadTasks()
      }
    } catch (error) {
      console.error('Error cancelling task:', error)
    }
  }


  if (!isOpen || !lead) return null

  // Use fresh lead data if available, otherwise fall back to prop
  const currentLead = freshLeadData || lead

  // Calculate days in pipeline
  const daysInPipeline = Math.floor((new Date().getTime() - new Date(currentLead.timestamp).getTime()) / (1000 * 60 * 60 * 24))

  // Calculate days inactive - prioritize all_leads.last_interaction_at, then check unified_context channels
  const lastInteraction: string | null =
    currentLead.last_interaction_at ||
    currentLead.unified_context?.whatsapp?.last_interaction ||
    currentLead.unified_context?.web?.last_interaction ||
    currentLead.unified_context?.voice?.last_interaction ||
    currentLead.unified_context?.social?.last_interaction ||
    currentLead.timestamp ||
    null
  const daysInactive = lastInteraction ? Math.floor((new Date().getTime() - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24)) : 0

  // Get health score — use DB lead_score when admin has explicitly overridden, otherwise use calculated
  const score = (currentLead.stage_override && currentLead.lead_score != null && currentLead.lead_score > 0)
    ? Math.max(currentLead.lead_score, calculatedScore?.score ?? 0)
    : (calculatedScore?.score ?? 0)
  const getHealthColor = (score: number) => {
    if (score >= 90) return { bg: '#22C55E', text: '#15803D', label: 'Hot 🔥' } // Green for Hot (90-100)
    if (score >= 70) return { bg: '#F97316', text: '#C2410C', label: 'Warm ⚡' } // Orange for Warm (70-89)
    return { bg: '#3B82F6', text: '#1E40AF', label: 'Cold ❄️' } // Blue for Cold (0-69)
  }
  const healthColor = getHealthColor(score)

  // Calculate health trend
  const getHealthTrend = () => {
    if (previousScore === null) return null
    const diff = score - previousScore
    if (diff > 5) return { icon: MdTrendingUp, color: '#22C55E', label: 'Warming' }
    if (diff < -5) return { icon: MdTrendingDown, color: '#EF4444', label: 'Cooling' }
    return { icon: MdRemove, color: '#6B7280', label: 'Stable' }
  }
  const healthTrend = getHealthTrend()

  // Auto-detect stage from conversation
  const autoDetectStage = (): string => {
    // If admin explicitly set the stage, use it
    if (currentLead.lead_stage && currentLead.stage_override) {
      return currentLead.lead_stage
    }

    // If stage exists from DB (not overridden), still use it
    if (currentLead.lead_stage) {
      return currentLead.lead_stage
    }

    // Simple auto-detection based on score and activity
    if (score >= 86 || currentLead.booking_date) return 'Booking Made'
    if (score >= 61) return 'High Intent'
    if (score >= 31) return 'Qualified'
    if (quickStats.totalMessages > 3) return 'Engaged'
    return 'New'
  }
  const detectedStage = autoDetectStage()
  const currentStage = detectedStage

  // Calculate stage duration
  const getStageDuration = () => {
    try {
      const supabase = createClient()
      // This would need to fetch from lead_stage_changes, simplified for now
      return daysInPipeline
    } catch {
      return daysInPipeline
    }
  }
  const stageDuration = getStageDuration()

  // Get stage progress
  const getStageProgress = () => {
    const stageOrder = STAGE_PROGRESSION.find(s => s.stage === currentStage)?.order ?? 0
    return Math.round((stageOrder / (STAGE_PROGRESSION.length - 1)) * 100)
  }

  // Get stage badge color
  const getStageBadgeClass = (stage: string | null) => {
    if (!stage) return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    const stageColors: Record<string, string> = {
      'New': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'Engaged': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
      'Qualified': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'High Intent': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'Booking Made': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'Converted': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
      'Closed Lost': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      'Not Qualified': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
      'In Sequence': '', // Will use inline styles with CSS variables
      'Cold': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      'R&R': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    }
    return stageColors[stage] || stageColors['New']
  }

  // Admin note handlers
  const handleSaveAdminNote = async () => {
    if (!adminNoteText.trim() || !lead) return
    const savedNoteText = adminNoteText.trim()
    setSavingAdminNote(true)
    // Show initial analyzing step (with the note text + title visible up top)
    setNoteProgress({
      steps: [{ text: 'Analyzing note...', done: false }],
      visible: true,
      title: 'Note added',
      note: savedNoteText,
    })
    try {
      const response = await fetch(`/api/dashboard/leads/${lead.id}/admin-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: adminNoteText.trim() }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save note')
      }
      const result = await response.json()

      loadActivities()
      loadLeadTasks()
      loadFreshLeadData()

      // Build step-by-step progress from response
      const allSteps: { text: string; done: boolean }[] = [
        { text: 'Analyzing note...', done: true },
      ]

      // Show classification
      const categoryLabels: Record<string, string> = {
        BOOKING_MADE: 'Booking Made', POST_CALL: 'Post Call', NOT_POTENTIAL: 'Not Potential',
        HOT_LEAD: 'Hot Lead', WARM_LATER: 'Warm — Later', RNR: 'Rang No Response',
        NOT_INTERESTED: 'Not Interested', CONVERTED: 'Converted', MEETING_REQUEST: 'Meeting Request',
        SEND_MESSAGE: 'Send Message', NAME_UPDATE: 'Name Update', INFO_ONLY: 'Info Only',
      }
      const categoryLabel = categoryLabels[result.classification?.category] || result.classification?.category || 'Unknown'
      allSteps.push({ text: `Classified as: ${categoryLabel}`, done: true })

      // Add each action taken
      if (result.actions_taken) {
        for (const action of result.actions_taken) {
          allSteps.push({ text: action, done: true })
        }
      }

      allSteps.push({ text: 'Done', done: true })

      // Animate steps one by one
      for (let i = 0; i < allSteps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, i === 0 ? 100 : 400))
        setNoteProgress(prev => ({ ...prev, steps: allSteps.slice(0, i + 1), visible: true }))
      }

      setAdminNoteText('')
      setShowAdminNoteInput(false)
      setActiveTab('notes')

      // Overlay STAYS until the operator clicks Done — so they can read every
      // step (and fix anything the AI did) instead of it auto-vanishing.
      loadActivities()
      loadLeadTasks()
      loadFreshLeadData()
    } catch (err) {
      console.error('Error saving admin note:', err)
      setNoteProgress({ steps: [{ text: 'Analyzing note...', done: true }, { text: 'Error saving note', done: true }], visible: true })
    } finally {
      setSavingAdminNote(false)
    }
  }

  const handleDeleteAdminNote = async (note: any) => {
    if (!lead || !confirm('Delete this note?')) return
    try {
      const response = await fetch(`/api/dashboard/leads/${lead.id}/admin-notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: note.id, note_text: note.text, note_created_at: note.created_at }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete note')
      }
      loadFreshLeadData()
    } catch (err) {
      console.error('Error deleting admin note:', err)
    }
  }

  const handleLogCall = async () => {
    if (!lead) return
    const callNote = logCallNotes.trim()
    setSavingLogCall(true)
    setNoteProgress({
      steps: [{ text: `Logging call: ${logCallOutcome}...`, done: false }],
      visible: true,
      title: `Call logged · ${logCallOutcome}`,
      note: callNote || undefined,
    })
    try {
      const response = await fetch(`/api/dashboard/leads/${lead.id}/log-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: logCallOutcome, notes: logCallNotes.trim() || undefined }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to log call')
      }
      const result = await response.json()

      loadActivities()
      loadLeadTasks()
      loadFreshLeadData()

      const allSteps: { text: string; done: boolean }[] = [
        { text: `Logged call: ${logCallOutcome}`, done: true },
      ]
      const categoryLabels: Record<string, string> = {
        BOOKING_MADE: 'Booking Made', POST_CALL: 'Post Call', NOT_POTENTIAL: 'Not Potential',
        HOT_LEAD: 'Hot Lead', WARM_LATER: 'Warm — Later', RNR: 'Rang No Response',
        NOT_INTERESTED: 'Not Interested', CONVERTED: 'Converted', MEETING_REQUEST: 'Meeting Request',
        SEND_MESSAGE: 'Send Message', NAME_UPDATE: 'Name Update', DEMO_TAKEN: 'Demo Taken',
        PROPOSAL_SENT: 'Proposal Sent', INFO_ONLY: 'Info Only',
      }
      const categoryLabel = categoryLabels[result.classification?.category] || result.classification?.category || 'Unknown'
      allSteps.push({ text: `Classified as: ${categoryLabel}`, done: true })
      if (result.actions_taken) {
        for (const action of result.actions_taken) {
          allSteps.push({ text: action, done: true })
        }
      }
      allSteps.push({ text: 'Done', done: true })

      for (let i = 0; i < allSteps.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, i === 0 ? 100 : 400))
        setNoteProgress((prev) => ({ ...prev, steps: allSteps.slice(0, i + 1), visible: true }))
      }

      setShowLogCallForm(false)
      setLogCallOutcome('Connected')
      setLogCallNotes('')
      setActiveTab('notes')

      // Overlay STAYS until the operator clicks Done (see the Done button in the
      // orchestrator overlay) — no auto-vanish, so they can read what happened.
      loadActivities()
      loadLeadTasks()
      loadFreshLeadData()
    } catch (err) {
      console.error('Error logging call:', err)
      setNoteProgress({
        steps: [{ text: `Logging call: ${logCallOutcome}...`, done: true }, { text: 'Error logging call', done: true }],
        visible: true,
      })
    } finally {
      setSavingLogCall(false)
    }
  }

  const handleSendMessage = async () => {
    if (!sendMessageText.trim() || !lead) return
    setSendingMessage(true)
    try {
      const response = await fetch('/api/dashboard/inbox/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          channel: 'whatsapp',
          action: 'send',
          message: sendMessageText.trim(),
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to send message')
      }
      setSendMessageText('')
      setShowSendMessageForm(false)
      loadActivities()
      loadFreshLeadData()
    } catch (err) {
      console.error('Error sending message:', err)
    } finally {
      setSendingMessage(false)
    }
  }

  const closeAllActionForms = () => {
    setShowLogCallForm(false)
    setShowAdminNoteInput(false)
    setShowSendMessageForm(false)
  }

  const toggleVoiceDictation = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice dictation is not supported in this browser.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-IN'

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setAdminNoteText((prev) => (prev ? prev + ' ' + transcript : transcript))
      setIsListening(false)
    }

    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  // Handle stage change
  const handleStageChange = (newStage: LeadStage) => {
    const oldStage: string | null = currentLead.lead_stage || null
    setPendingStageChange({ oldStage, newStage })
    setShowStageDropdown(false)
    setShowActivityModal(true)
  }

  const handleActivitySave = async (activity: {
    activity_type: 'call' | 'meeting' | 'message' | 'note'
    note: string
    duration?: number
    next_followup?: string
    disqualification_reason?: string
  }) => {
    if (!pendingStageChange) return

    try {
      const response = await fetch(`/api/dashboard/leads/${lead.id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_stage: pendingStageChange.newStage,
          activity_type: activity.activity_type,
          note: activity.note,
          duration_minutes: activity.duration,
          next_followup_date: activity.next_followup,
          disqualification_reason: activity.disqualification_reason,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update stage')
      }

      const supabase = createClient()
      const { data } = await supabase
        .from('all_leads')
        .select('lead_stage, sub_stage, lead_score, stage_override, last_interaction_at, booking_date, booking_time, unified_context')
        .eq('id', lead.id)
        .single()

      if (data) {
        const leadData = data as any
        // Update fresh lead data state
        setFreshLeadData((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            lead_stage: leadData.lead_stage,
            sub_stage: leadData.sub_stage,
            lead_score: leadData.lead_score,
            stage_override: leadData.stage_override,
            last_interaction_at: leadData.last_interaction_at || prev.last_interaction_at,
            booking_date: leadData.booking_date || leadData.unified_context?.web?.booking_date || leadData.unified_context?.whatsapp?.booking_date || prev.booking_date,
            booking_time: leadData.booking_time || leadData.unified_context?.web?.booking_time || leadData.unified_context?.whatsapp?.booking_time || prev.booking_time,
            unified_context: leadData.unified_context || prev.unified_context,
          }
        })
      }

      setShowActivityModal(false)
      setPendingStageChange(null)
      await loadFreshLeadData() // Reload fresh data
      await calculateAndSetScore() // Recalculate score after stage update
      loadUnifiedSummary()
      loadActivities()
    } catch (err) {
      console.error('Error updating stage:', err)
      alert(err instanceof Error ? err.message : 'Failed to update stage')
    }
  }

  // Get active channels in order
  const getActiveChannels = () => {
    const channels: Array<{
      name: string
      icon: any
      color: string
      emoji: string
      key: string
      count: number
      firstDate: string | null
      lastDate: string | null
    }> = []
    // Add meta_forms as first step if first_touchpoint is meta_forms (even with 0 conversation messages)
    const ft = currentLead.first_touchpoint
    const leadSources: string[] = currentLead.unified_context?.lead_sources || []
    if (ft === 'meta_forms' || leadSources.includes('meta_forms')) {
      const config = CHANNEL_CONFIG.meta_forms
      channels.push({
        ...config,
        key: 'meta_forms',
        count: channelData.meta_forms.count || 1,
        firstDate: channelData.meta_forms.firstDate || currentLead.created_at || currentLead.timestamp,
        lastDate: channelData.meta_forms.lastDate || currentLead.created_at || currentLead.timestamp,
      })
    }
    const lt = currentLead.last_touchpoint
    const uc = currentLead.unified_context || {}
    const hasChannel = (ch: string) =>
      channelData[ch as keyof typeof channelData]?.count > 0 ||
      ft === ch || lt === ch ||
      leadSources.includes(ch) ||
      !!(uc[ch])
    const alreadyAdded = channels.map(c => c.key)
    if (hasChannel('web') && !alreadyAdded.includes('web')) channels.push({ ...CHANNEL_CONFIG.web, key: 'web', ...channelData.web })
    if (hasChannel('whatsapp') && !alreadyAdded.includes('whatsapp')) channels.push({ ...CHANNEL_CONFIG.whatsapp, key: 'whatsapp', ...channelData.whatsapp })
    if (hasChannel('voice') && !alreadyAdded.includes('voice')) channels.push({ ...CHANNEL_CONFIG.voice, key: 'voice', ...channelData.voice })
    if (hasChannel('social') && !alreadyAdded.includes('social')) channels.push({ ...CHANNEL_CONFIG.social, key: 'social', ...channelData.social })

    // If lead_sources array exists, sort by that order; otherwise sort by firstDate
    if (leadSources.length > 0) {
      return channels.sort((a, b) => {
        const aIdx = leadSources.indexOf(a.key)
        const bIdx = leadSources.indexOf(b.key)
        // Items in lead_sources come first in order; others sort by firstDate
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
        if (aIdx !== -1) return -1
        if (bIdx !== -1) return 1
        const aDate = a.firstDate ? new Date(a.firstDate).getTime() : 0
        const bDate = b.firstDate ? new Date(b.firstDate).getTime() : 0
        return aDate - bDate
      })
    }
    return channels.sort((a, b) => {
      const aDate = a.firstDate ? new Date(a.firstDate).getTime() : 0
      const bDate = b.firstDate ? new Date(b.firstDate).getTime() : 0
      return aDate - bDate
    })
  }
  const activeChannels = getActiveChannels()

  return (
    <>
      <div
        className="lead-modal-backdrop fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-hidden="true"
      ></div>

      <div
        className="lead-modal-overlay fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4"
        onClick={onClose}
        aria-hidden="true"
      >
        <dialog
          open={isOpen}
          className="lead-modal-dialog lead-details-modal relative bg-[var(--bg-primary)] rounded-lg z-50 flex flex-col"
          style={{
            width: '54vw',
            maxWidth: '720px',
            height: '88vh',
            maxHeight: '88vh',
            // Visible outline so the modal lifts off the dark backdrop.
            border: '1px solid rgba(255, 255, 255, 0.22)',
            boxShadow:
              '0 0 0 1px rgba(255, 255, 255, 0.08), 0 0 32px rgba(255, 255, 255, 0.04), 0 24px 48px -12px rgba(0, 0, 0, 0.7), 0 8px 24px -8px rgba(0, 0, 0, 0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
          aria-labelledby="lead-modal-title"
          aria-modal="true"
        >
          {/* Centered PROXe AI orchestrator overlay — appears while an admin
              note or call log is being processed, so the operator sees every
              step the AI takes plus the note they wrote, in real time. */}
          {noteProgress.steps.length > 0 && (
            <div
              className="lead-orchestrator-overlay absolute inset-0 z-[60] flex items-center justify-center pointer-events-none"
              style={{
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                opacity: noteProgress.visible ? 1 : 0,
                transition: 'opacity 0.3s ease',
                borderRadius: 'inherit',
              }}
              aria-live="polite"
              role="status"
            >
              <div
                className="pointer-events-auto rounded-xl border shadow-2xl"
                style={{
                  background: 'var(--bg-secondary)',
                  borderColor: 'rgba(99,102,241,0.45)',
                  padding: '20px 22px',
                  width: 'min(440px, 88%)',
                  maxHeight: '78%',
                  overflowY: 'auto',
                  boxShadow:
                    '0 0 0 1px rgba(99,102,241,0.25), 0 24px 48px -12px rgba(0,0,0,0.6)',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <MdAutoAwesome size={16} className="text-indigo-400 animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-400">
                    PROXe AI
                  </span>
                  {noteProgress.title && (
                    <span className="ml-auto text-[11px] font-semibold text-[var(--text-primary)]">
                      {noteProgress.title}
                    </span>
                  )}
                </div>

                {noteProgress.note && (
                  <div
                    className="mb-3 p-2.5 rounded-lg border text-[12px] leading-snug text-[var(--text-primary)] italic"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      borderColor: 'var(--border-primary)',
                    }}
                  >
                    “{noteProgress.note}”
                  </div>
                )}

                <div className="space-y-1.5">
                  {noteProgress.steps.map((step, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2"
                      style={{
                        animation: 'orchFadeIn 0.3s ease forwards',
                        animationDelay: `${i * 0.05}s`,
                      }}
                    >
                      {step.done ? (
                        step.text === 'Done' ? (
                          <MdCheckCircle size={14} className="text-green-400 flex-shrink-0" />
                        ) : step.text.startsWith('Error') ? (
                          <MdClose size={14} className="text-red-400 flex-shrink-0" />
                        ) : (
                          <MdCheck size={14} className="text-emerald-400 flex-shrink-0" />
                        )
                      ) : (
                        <div className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                        </div>
                      )}
                      <span
                        className={`text-[12px] ${
                          step.text === 'Done'
                            ? 'font-bold text-green-400'
                            : step.text.startsWith('Classified as')
                              ? 'font-semibold text-[var(--text-primary)]'
                              : step.text.startsWith('Error')
                                ? 'font-medium text-red-400'
                                : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {step.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Done button — appears once the run completes so the operator
                    can READ every step (and fix anything) instead of the overlay
                    auto-vanishing. Simple single-step toasts (e.g. "copied") have
                    no Done/Error terminal step, so they still auto-dismiss. */}
                {(() => {
                  const last = noteProgress.steps[noteProgress.steps.length - 1]
                  const complete = !!last && (last.text === 'Done' || last.text.startsWith('Error'))
                  if (!complete) return null
                  return (
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setNoteProgress({ steps: [], visible: false })}
                        className="px-4 py-1.5 rounded-lg text-[12px] font-bold transition-opacity hover:opacity-90"
                        style={{ background: 'rgb(99,102,241)', color: '#fff' }}
                      >
                        Done
                      </button>
                    </div>
                  )
                })()}

                <style>{`
                  @keyframes orchFadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to   { opacity: 1; transform: translateY(0); }
                  }
                `}</style>
              </div>
            </div>
          )}

          {/* Single Row Header: Contact Card (Left) + Journey & Stats (Right) */}
          <header className="lead-modal-header lead-details-modal-header flex flex-row items-stretch gap-6 p-4 border-b border-[var(--border-primary)] flex-shrink-0 relative min-h-[140px]">
            {/* LEFT HALF: Contact Card - Business Card Style */}
            <section className="lead-contact-card flex-1 flex flex-col justify-between h-full p-3 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-primary)]">
              {/* Top Section: Name, Score, Status */}
              <div className="lead-contact-card-header">
                {/* Name + Score badge (top row) */}
                <div className="lead-contact-name-row flex items-start justify-between mb-1 gap-2">
                  <div className="group flex items-center gap-1.5 flex-1 min-w-0">
                    {editingName ? (() => {
                      // Shared save handler — wired to both ✓ button and Enter key.
                      // (Enter was relied on alone before; the user didn't realize
                      // it would save and there was no visible commit affordance.)
                      const commitName = async () => {
                        const newName = editingNameValue.trim()
                        if (!newName) { setEditingName(false); return }
                        setSavingName(true)
                        try {
                          const r = await fetch(`/api/dashboard/leads/${currentLead.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ customer_name: newName }),
                          })
                          if (!r.ok) {
                            const d = await r.json().catch(() => ({}))
                            console.error('Name save failed:', d.error || r.statusText)
                          }
                          setEditingName(false)
                          loadFreshLeadData()
                        } finally {
                          setSavingName(false)
                        }
                      }
                      return (
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <input
                            autoFocus
                            type="text"
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void commitName()
                              } else if (e.key === 'Escape') {
                                setEditingName(false)
                              }
                            }}
                            disabled={savingName}
                            placeholder="Enter name…"
                            className="text-xl font-bold flex-1 min-w-0 bg-transparent border-b border-[var(--accent-primary)] outline-none text-[var(--text-primary)]"
                          />
                          {/* ✓ Save (green) */}
                          <button
                            onClick={() => void commitName()}
                            className="p-1 rounded text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition"
                            title="Save (Enter)"
                            disabled={savingName || !editingNameValue.trim()}
                            aria-label="Save name"
                          >
                            <MdCheck size={16} />
                          </button>
                          {/* ✕ Cancel */}
                          <button
                            onClick={() => setEditingName(false)}
                            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition"
                            title="Cancel (Esc)"
                            disabled={savingName}
                            aria-label="Cancel"
                          >
                            <MdClose size={16} />
                          </button>
                        </div>
                      )
                    })() : (
                      <>
                        <h2
                          id="lead-modal-title"
                          className="lead-contact-name text-xl font-bold text-[var(--text-primary)] leading-tight min-w-0 truncate"
                        >
                          {currentLead.name || 'Unknown Lead'}
                        </h2>
                        <button
                          onClick={() => {
                            setEditingNameValue(currentLead.name || '')
                            setEditingName(true)
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          title={currentLead.name ? 'Edit name' : 'Add a name'}
                        >
                          <MdEdit size={14} />
                        </button>
                        {currentLead.name && (() => {
                          // Show the "Clean" button only when the cleanup
                          // ACTUALLY changes the name (avoids noise on already-
                          // clean names like "John Doe").
                          const cleaned = cleanDisplayName(currentLead.name)
                          if (cleaned && cleaned !== currentLead.name) {
                            return (
                              <button
                                onClick={() => {
                                  setEditingNameValue(cleaned)
                                  setEditingName(true)
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent-primary)]"
                                title={`Clean up: "${currentLead.name}" → "${cleaned}"`}
                              >
                                <MdAutoAwesome size={14} />
                              </button>
                            )
                          }
                          return null
                        })()}
                        {currentLead.name && (
                          <CopyIconButton value={currentLead.name} label="name" />
                        )}
                      </>
                    )}
                  </div>

                  {/* Lead Health Score - Right aligned */}
                  <div
                    className="lead-score-card w-14 h-14 rounded-lg flex flex-col items-center justify-center shadow-sm flex-shrink-0 relative border"
                    role="status"
                    aria-label={`Lead score: ${score} out of 100, ${healthColor.label}`}
                    style={{
                      backgroundColor: score >= 90
                        ? 'rgba(34, 197, 94, 0.05)'
                        : score >= 70
                          ? 'rgba(249, 115, 22, 0.05)'
                          : 'rgba(59, 130, 246, 0.05)',
                      borderColor: score >= 90
                        ? 'rgba(34, 197, 94, 0.2)'
                        : score >= 70
                          ? 'rgba(249, 115, 22, 0.2)'
                          : 'rgba(59, 130, 246, 0.2)'
                    }}
                  >
                    {/* Colored badge at top */}
                    <div
                      className="lead-score-indicator absolute top-0 left-0 right-0 h-1 rounded-t-lg"
                      style={{
                        backgroundColor: score >= 90
                          ? '#22C55E'
                          : score >= 70
                            ? '#F97316'
                            : '#3B82F6'
                      }}
                    ></div>
                    <span className="lead-score-value text-lg font-bold leading-none" style={{ color: healthColor.text }}>{score}</span>
                    <span className="lead-score-label text-[8px] font-medium opacity-90 mt-0.5" style={{ color: healthColor.text }}>{healthColor.label}</span>
                  </div>
                </div>

                {/* Status badge below name */}
                <div className="lead-stage-container flex items-center gap-1 relative">
                  <span
                    className={`lead-stage-badge px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${getStageBadgeClass(currentStage)}`}
                    style={currentStage === 'In Sequence' ? {
                      backgroundColor: 'var(--accent-subtle)',
                      color: 'var(--accent-primary)'
                    } : undefined}
                    aria-label={`Current stage: ${currentStage}`}
                  >
                    {currentStage}
                  </span>
                  <button
                    ref={stageButtonRef}
                    onClick={() => setShowStageDropdown(!showStageDropdown)}
                    className="lead-stage-edit-button p-0.5 rounded hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0 focus:outline-none"
                    title="Edit stage"
                    aria-label="Edit lead stage"
                    aria-expanded={showStageDropdown}
                    aria-haspopup="true"
                  >
                    <MdEdit size={12} className="text-[var(--text-muted)]" />
                  </button>
                </div>

                {/* Service Interest & Pain Point pills - only for engaged leads (score 50+) */}
                {score >= 50 && (() => {
                  const ctx = currentLead.unified_context || {}
                  const si = summaryData?.keyInfo?.serviceInterest
                    || ctx.service_interest
                    || ctx.form_data?.business_type
                    || ctx.form_data?.service
                    || null
                  const pp = summaryData?.keyInfo?.painPoints
                    || ctx.pain_point
                    || null
                  if (!si && !pp) return null
                  return (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {si && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: 'rgba(99,102,241,0.12)', color: 'rgba(139,142,255,0.95)' }}>
                          <MdOutlineInsights size={10} />
                          {si}
                        </span>
                      )}
                      {pp && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] max-w-[200px] truncate" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                          {pp}
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Contact Info Section - Bottom */}
              <address className="lead-contact-info space-y-1 mt-auto not-italic">
                {/* Email with icon */}
                {currentLead.email && (
                  <div className="lead-contact-email group flex items-center gap-1.5">
                    <div className="lead-contact-icon w-6 h-6 rounded bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      <MdEmail className="text-[var(--text-secondary)]" size={14} />
                    </div>
                    <a
                      href={`mailto:${currentLead.email}`}
                      className="lead-contact-email-link text-sm font-medium text-[var(--text-secondary)] leading-tight truncate"
                    >
                      {currentLead.email}
                    </a>
                    <CopyIconButton value={currentLead.email} label="email" />
                  </div>
                )}

                {/* Phone with icon */}
                {currentLead.phone && (
                  <div className="lead-contact-phone group flex items-center gap-1.5">
                    <div className="lead-contact-icon w-6 h-6 rounded bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      <MdPhone className="text-[var(--text-secondary)]" size={14} />
                    </div>
                    <a
                      href={`tel:${currentLead.phone}`}
                      className="lead-contact-phone-link text-sm font-medium text-[var(--text-secondary)] leading-tight"
                    >
                      {currentLead.phone}
                    </a>
                    <CopyIconButton value={currentLead.phone} label="phone" />
                  </div>
                )}

                {/* TYPE / COURSE / EDUCATION / TIMELINE — extracted profile fields */}
                {(() => {
                  const brandProfileData = currentLead.unified_context?.bcon || currentLead.unified_context?.windchasers || {};
                  const hasType = !!brandProfileData.user_type;
                  const hasCourse = !!brandProfileData.course_interest;
                  const hasEducation = !!brandProfileData.education;
                  const hasTimeline = !!(brandProfileData.timeline || brandProfileData.plan_to_fly);
                  if (!hasType && !hasCourse && !hasEducation && !hasTimeline) return null;
                  const timeline = brandProfileData.timeline || brandProfileData.plan_to_fly;
                  return (
                    <div className="lead-contact-profile flex flex-col gap-y-1.5">
                      {/* Row 1: Type + Course */}
                      {(hasType || hasCourse) && (
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5">
                          {hasType && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0" aria-hidden="true">
                                <MdPerson className="text-[var(--text-secondary)]" size={14} />
                              </div>
                              <span className="text-sm font-medium text-[var(--text-secondary)] leading-tight capitalize">
                                <span className="text-[var(--text-muted)] mr-1.5">Type:</span>
                                {brandProfileData.user_type}
                              </span>
                            </div>
                          )}
                          {hasCourse && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0" aria-hidden="true">
                                <MdFlightTakeoff className="text-[var(--text-secondary)]" size={14} />
                              </div>
                              <span className="text-sm font-medium text-[var(--text-secondary)] leading-tight capitalize">
                                <span className="text-[var(--text-muted)] mr-1.5">Path:</span>
                                {brandProfileData.course_interest}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Row 2: Education + Timeline */}
                      {(hasEducation || hasTimeline) && (
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5">
                          {hasEducation && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0" aria-hidden="true">
                                <MdSchool className="text-[var(--text-secondary)]" size={14} />
                              </div>
                              <span className="text-sm font-medium text-[var(--text-secondary)] leading-tight">
                                <span className="text-[var(--text-muted)] mr-1.5">Edu:</span>
                                {String(brandProfileData.education).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                              </span>
                            </div>
                          )}
                          {hasTimeline && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0" aria-hidden="true">
                                <MdSchedule className="text-[var(--text-secondary)]" size={14} />
                              </div>
                              <span className="text-sm font-medium text-[var(--text-secondary)] leading-tight capitalize">
                                <span className="text-[var(--text-muted)] mr-1.5">When:</span>
                                {timeline}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* LOKAZEN CRE DETAILS — collapsible; click to expand the full brief variables */}
                <LokazenCreCard ctx={currentLead.unified_context?.lokazen} />

                {/* LOKAZEN TYPE OVERRIDE — reclassify Brand / Property Owner / Scout.
                    Shown for any lokazen lead so mis-tagged scouts can be moved out
                    of the Leads view with one click. */}
                {currentLead.unified_context?.lokazen && (
                  <LokazenTypeSelector
                    leadId={String(currentLead.id)}
                    current={String(currentLead.unified_context.lokazen.user_type || '')}
                    onDone={loadFreshLeadData}
                  />
                )}

                {/* LOKAZEN PROPERTY PHOTOS — owner leads carry a property_id; the
                    photos live on lokazen.in and are lazy-loaded here on open. */}
                {currentLead.unified_context?.lokazen?.property_id && (
                  <LokazenPropertyGallery propertyId={String(currentLead.unified_context.lokazen.property_id)} />
                )}

                {/* ATTRIBUTION moved to the Interaction tab (with expanded
                    UTM / ad set / ad name / fbclid details). Used to live here
                    as a collapsible block on the contact card — too noisy on
                    a card meant for at-a-glance info. */}

                {/* PAT (Pilot Aptitude Test) breakdown — Windchasers only */}
                {(() => {
                  const wc = currentLead.unified_context?.windchasers || currentLead.unified_context?.bcon || {};
                  const rff = currentLead.unified_context?.raw_form_fields || {};
                  const rawScore = wc.pat_score ?? rff.total_score ?? null;
                  if (rawScore == null) return null;
                  const raw = Number(rawScore);
                  if (isNaN(raw)) return null;
                  const score100 = wc.pat_score_100 ?? Math.round((raw * 100) / 150);
                  const qual = wc.pat_qualification_score ?? rff.qualification_score ?? null;
                  const apt = wc.pat_aptitude_score ?? rff.aptitude_score ?? null;
                  const rdy = wc.pat_readiness_score ?? rff.readiness_score ?? null;
                  const elig = wc.pat_eligible_class_12_pass ?? rff.eligible_class_12_pass ?? null;
                  const storedTier = String(wc.pat_tier || rff.tier || '').toLowerCase().trim();
                  const derivedTier = raw >= 140 ? 'premium' : raw >= 120 ? 'strong' : raw >= 90 ? 'moderate' : 'not-ready';
                  const tier = storedTier || derivedTier;
                  const tierColors: Record<string, string> = {
                    premium: '#EAB308',
                    strong: '#22C55E',
                    moderate: '#F59E0B',
                    'not-ready': '#EF4444',
                  };
                  const tierLabels: Record<string, string> = {
                    premium: 'Premium',
                    strong: 'Strong',
                    moderate: 'Moderate',
                    'not-ready': 'Early Stage',
                  };
                  const color = tierColors[tier] || '#6B7280';
                  return (
                    <div
                      className="lead-pat-card mt-2 rounded-lg border"
                      style={{
                        borderColor: `${color}55`,
                        background: `${color}10`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setShowPATResult((v) => !v)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors focus:outline-none rounded-lg"
                        aria-expanded={showPATResult}
                        aria-controls="lead-pat-content"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                            PAT Result
                          </span>
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                            style={{ color, background: `${color}25` }}
                          >
                            {tierLabels[tier] || tier}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-base font-black tabular-nums"
                            style={{ color }}
                            title={`Raw: ${raw}/150`}
                          >
                            {score100}
                            <span className="text-[10px] font-bold opacity-70 ml-0.5">/100</span>
                          </span>
                          <MdExpandMore
                            size={14}
                            className="text-[var(--text-muted)] transition-transform"
                            style={{ transform: showPATResult ? 'rotate(180deg)' : 'rotate(0deg)' }}
                          />
                        </div>
                      </button>
                      {showPATResult && (
                        <div id="lead-pat-content" className="px-3 pb-3">
                          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                            {qual != null && (
                              <div className="rounded bg-[var(--bg-secondary)] px-2 py-1">
                                <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Qual</div>
                                <div className="font-bold tabular-nums text-[var(--text-primary)]">
                                  {Number(qual).toFixed(qual % 1 ? 2 : 0)}<span className="opacity-50">/50</span>
                                </div>
                              </div>
                            )}
                            {apt != null && (
                              <div className="rounded bg-[var(--bg-secondary)] px-2 py-1">
                                <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Apt</div>
                                <div className="font-bold tabular-nums text-[var(--text-primary)]">
                                  {Number(apt).toFixed(apt % 1 ? 2 : 0)}<span className="opacity-50">/50</span>
                                </div>
                              </div>
                            )}
                            {rdy != null && (
                              <div className="rounded bg-[var(--bg-secondary)] px-2 py-1">
                                <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Rdy</div>
                                <div className="font-bold tabular-nums text-[var(--text-primary)]">
                                  {Number(rdy).toFixed(rdy % 1 ? 2 : 0)}<span className="opacity-50">/50</span>
                                </div>
                              </div>
                            )}
                          </div>
                          {elig !== null && (
                            <div className="mt-2 text-[10px] text-[var(--text-muted)]">
                              12th eligibility:{' '}
                              <span className={elig ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold'}>
                                {elig ? 'Yes' : 'No'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {!currentLead.email && !currentLead.phone && (
                  <p className="lead-contact-empty text-sm text-[var(--text-muted)]">No contact info</p>
                )}
              </address>
            </section>

            {/* RIGHT HALF: Customer Journey + Quick Stats */}
            <section className="lead-journey-stats-section flex-1 flex flex-col h-full gap-4">
              {/* Customer Journey - TOP */}
              <section className="lead-journey-section">
                <h3 className="lead-journey-title text-xs font-semibold text-[var(--text-secondary)] mb-2">Customer Journey</h3>
                <div className="lead-journey-row flex items-center gap-1.5">
                  {activeChannels.length > 0 ? (
                    <nav className="lead-journey-channels flex items-center gap-1.5 flex-wrap" aria-label="Customer journey channels">
                      {activeChannels.map((channel, index) => (
                        <div key={channel.key} className="lead-journey-channel-item flex items-center gap-1.5">
                          <div
                            className="lead-journey-channel-icon w-6 h-6 rounded-full flex items-center justify-center text-white shadow-sm flex-shrink-0 cursor-pointer"
                            style={{ backgroundColor: channel.color }}
                            title={`Open ${channel.name} conversation — ${channel.firstDate ? formatDateIST(channel.firstDate) : 'N/A'}, ${channel.count} msgs`}
                            aria-label={`Open ${channel.name} conversation`}
                            onClick={() => {
                              // Jump straight to this contact's inbox thread, pre-selecting the
                              // clicked channel. Inbox deep-links via ?lead=<id>&channel=<key>.
                              if (currentLead?.id) {
                                router.push(`/dashboard/inbox?lead=${currentLead.id}&channel=${channel.key}`)
                                onClose()
                              }
                            }}
                          >
                            <channel.icon size={14} />
                          </div>
                          {index < activeChannels.length - 1 && (
                            <MdChevronRight className="lead-journey-separator text-[var(--text-muted)] flex-shrink-0" size={16} aria-hidden="true" />
                          )}
                        </div>
                      ))}
                    </nav>
                  ) : (
                    <p className="lead-journey-empty text-xs text-[var(--text-muted)]">No channels yet</p>
                  )}
                </div>

                {/* Inline admin note input */}
                {showAdminNoteInput && (
                  <div className="lead-admin-note-input flex items-center gap-2 mt-2 p-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                    <input
                      type="text"
                      value={adminNoteText}
                      onChange={(e) => setAdminNoteText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && adminNoteText.trim()) handleSaveAdminNote()
                      }}
                      placeholder="Add context about this lead..."
                      className="flex-1 text-xs bg-transparent border-none outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                      autoFocus
                      disabled={savingAdminNote}
                    />
                    <button
                      onClick={toggleVoiceDictation}
                      className={`lead-admin-note-mic w-6 h-6 flex items-center justify-center rounded-full transition-colors focus:outline-none ${
                        isListening
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                      }`}
                      title={isListening ? 'Stop dictation' : 'Voice dictation'}
                      aria-label={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
                    >
                      <MdMic size={14} />
                    </button>
                    <button
                      onClick={handleSaveAdminNote}
                      disabled={!adminNoteText.trim() || savingAdminNote}
                      className="lead-admin-note-save w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white disabled:opacity-40 transition-colors focus:outline-none"
                      title="Save note"
                    >
                      <MdCheck size={12} />
                    </button>
                  </div>
                )}

                {/* Log a Call form */}
                {showLogCallForm && (
                  <div className="lead-log-call-form flex items-center gap-2 mt-2 p-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                    <select
                      value={logCallOutcome}
                      onChange={(e) => setLogCallOutcome(e.target.value)}
                      className="text-xs border border-[var(--border-primary)] rounded px-1.5 py-1 outline-none"
                      style={{
                        // colorScheme tells the browser to render the native dropdown
                        // popup with theme-aware (dark-aware) UI, fixing the white
                        // dropdown-on-dark-mode bug.
                        colorScheme: 'light dark',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                      }}
                      disabled={savingLogCall}
                    >
                      {['Connected', 'No Answer', 'Busy', 'Voicemail'].map((opt) => (
                        <option
                          key={opt}
                          value={opt}
                          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        >
                          {opt}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={logCallNotes}
                      onChange={(e) => setLogCallNotes(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleLogCall()
                      }}
                      placeholder="Notes (optional)..."
                      className="flex-1 text-xs bg-transparent border-none outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                      disabled={savingLogCall}
                    />
                    <button
                      onClick={handleLogCall}
                      disabled={savingLogCall}
                      className="lead-log-call-save w-6 h-6 flex items-center justify-center rounded-full bg-green-500 text-white disabled:opacity-40 transition-colors focus:outline-none"
                      title="Save call log"
                    >
                      <MdCheck size={12} />
                    </button>
                  </div>
                )}

                {/* Send Message form */}
                {showSendMessageForm && (
                  <div className="lead-send-message-form flex items-center gap-2 mt-2 p-2 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)]">
                    <FaWhatsapp className="text-green-500 flex-shrink-0" size={14} />
                    <input
                      type="text"
                      value={sendMessageText}
                      onChange={(e) => setSendMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && sendMessageText.trim()) handleSendMessage()
                      }}
                      placeholder="Type a WhatsApp message..."
                      className="flex-1 text-xs bg-transparent border-none outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                      autoFocus
                      disabled={sendingMessage}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!sendMessageText.trim() || sendingMessage}
                      className="lead-send-message-save w-6 h-6 flex items-center justify-center rounded-full bg-green-500 text-white disabled:opacity-40 transition-colors focus:outline-none"
                      title="Send message"
                    >
                      <MdCheck size={12} />
                    </button>
                  </div>
                )}

                {/* Admin notes - 3-dot menu */}
                {currentLead.unified_context?.admin_notes?.length > 0 && (
                  <div className="relative inline-block mt-1">
                    <button
                      onClick={() => setShowAdminNotes(!showAdminNotes)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus:outline-none rounded"
                      title={`${(currentLead.unified_context.admin_notes as any[]).length} admin notes`}
                    >
                      <MdMoreHoriz size={18} />
                    </button>
                    {showAdminNotes && (
                      <div className="absolute left-0 top-6 z-50 w-64 max-h-48 overflow-y-auto bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] shadow-lg p-2 space-y-1.5">
                        {(currentLead.unified_context.admin_notes as any[])
                          .filter((note: any, idx: number, arr: any[]) =>
                            arr.findIndex((n: any) => n.text === note.text && n.created_at === note.created_at) === idx
                          )
                          .slice().reverse().map((note: any, i: number) => (
                          <div key={note.id || `${note.created_at}-${i}`} className="group text-[11px] text-[var(--text-muted)] flex items-start gap-1.5">
                            <MdNote size={11} className="mt-0.5 flex-shrink-0 text-orange-400" />
                            <span className="flex-1">{note.text} <span className="text-[var(--text-muted)]">({new Date(note.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})</span></span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteAdminNote(note) }}
                              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-500/20 text-[var(--text-muted)] hover:text-red-400"
                              title="Delete note"
                            >
                              <MdClose size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Quick Stats - BELOW Journey (3 in a row) */}
              <section className="lead-quick-stats-section">
                <h3 className="lead-quick-stats-title text-xs font-semibold text-[var(--text-secondary)] mb-2">Quick Stats</h3>
                <div className="lead-quick-stats-grid grid grid-cols-3 gap-2">
                  <article className="lead-stat-card lead-stat-messages flex flex-col justify-between h-full p-3 min-h-[80px] bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)]">
                    <p className="lead-stat-label text-sm text-[var(--text-muted)]">Messages</p>
                    <p className="lead-stat-value text-2xl font-bold text-[var(--text-primary)] mt-auto" aria-label={`${quickStats.totalMessages} total messages`}>{quickStats.totalMessages}</p>
                  </article>
                  <article className="lead-stat-card lead-stat-response-rate flex flex-col justify-between h-full p-3 min-h-[80px] bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-primary)]">
                    <p className="lead-stat-label text-sm text-[var(--text-muted)]">Response Rate</p>
                    <p className="lead-stat-value text-2xl font-bold text-[var(--text-primary)] mt-auto" aria-label={`${quickStats.responseRate}% response rate`}>{quickStats.responseRate}%</p>
                  </article>
                  <article className={`lead-stat-card lead-stat-key-event flex flex-col justify-between h-full p-3 min-h-[80px] rounded-lg border ${(() => {
                    const bd = currentLead.booking_date || currentLead.unified_context?.web?.booking_date || currentLead.unified_context?.web?.booking?.date || currentLead.unified_context?.whatsapp?.booking_date || currentLead.unified_context?.whatsapp?.booking?.date || currentLead.unified_context?.voice?.booking_date || currentLead.unified_context?.voice?.booking?.date || currentLead.unified_context?.social?.booking_date || currentLead.unified_context?.social?.booking?.date;
                    const bt = currentLead.booking_time || currentLead.unified_context?.web?.booking_time || currentLead.unified_context?.web?.booking?.time || currentLead.unified_context?.whatsapp?.booking_time || currentLead.unified_context?.whatsapp?.booking?.time || currentLead.unified_context?.voice?.booking_time || currentLead.unified_context?.voice?.booking?.time || currentLead.unified_context?.social?.booking_time || currentLead.unified_context?.social?.booking?.time;
                    return bd && bt ? 'bg-[var(--bg-secondary)] border-[var(--border-primary)]' : 'bg-[var(--bg-primary)] border-[var(--border-primary)]';
                  })()}`}>
                    <p className="lead-stat-label text-sm text-[var(--text-muted)]">Key Event</p>
                    <div className="lead-stat-content mt-auto">
                      {(() => {
                        const bookingDate = currentLead.booking_date ||
                          currentLead.unified_context?.web?.booking_date ||
                          currentLead.unified_context?.web?.booking?.date ||
                          currentLead.unified_context?.whatsapp?.booking_date ||
                          currentLead.unified_context?.whatsapp?.booking?.date ||
                          currentLead.unified_context?.voice?.booking_date ||
                          currentLead.unified_context?.voice?.booking?.date ||
                          currentLead.unified_context?.social?.booking_date ||
                          currentLead.unified_context?.social?.booking?.date;
                        const bookingTime = currentLead.booking_time ||
                          currentLead.unified_context?.web?.booking_time ||
                          currentLead.unified_context?.web?.booking?.time ||
                          currentLead.unified_context?.whatsapp?.booking_time ||
                          currentLead.unified_context?.whatsapp?.booking?.time ||
                          currentLead.unified_context?.voice?.booking_time ||
                          currentLead.unified_context?.voice?.booking?.time ||
                          currentLead.unified_context?.social?.booking_time ||
                          currentLead.unified_context?.social?.booking?.time;

                        if (bookingDate && bookingTime) {
                          const formattedDate = formatBookingDateShort(bookingDate);
                          const formattedTime = formatBookingTime(bookingTime);
                          return (
                            <a
                              href="/dashboard/bookings"
                              className="lead-booking-link flex flex-col cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              aria-label={`View booking on ${formattedDate} at ${formattedTime}`}
                            >
                              <div className="lead-booking-date flex items-center gap-1">
                                <MdEvent className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={14} aria-hidden="true" />
                                <time className="text-sm font-bold text-blue-700 dark:text-blue-300" dateTime={bookingDate}>
                                  {formattedDate}
                                </time>
                              </div>
                              <time className="lead-booking-time text-xs font-medium text-blue-600 dark:text-blue-400 mt-0.5" dateTime={bookingTime}>
                                {formattedTime}
                              </time>
                            </a>
                          );
                        }
                        return (
                          <p className="lead-stat-empty text-2xl font-bold text-[var(--text-muted)]" aria-label="No key event">-</p>
                        );
                      })()}
                    </div>
                  </article>
                </div>
              </section>
            </section>

            {/* Action "+" Button - Absolute positioned top right */}
            <div className="absolute top-4 right-4">
              <button
                onClick={() => setShowActionDropdown(!showActionDropdown)}
                className="lead-action-button w-9 h-9 flex items-center justify-center rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-md transition-colors focus:outline-none"
                aria-label="Quick actions"
                aria-expanded={showActionDropdown}
                aria-haspopup="true"
              >
                <MdAdd size={22} />
              </button>
              {showActionDropdown && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setShowActionDropdown(false)} aria-hidden="true" />
                  <div className="absolute right-0 top-11 z-[70] bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg shadow-xl py-1 w-44">
                    <button
                      onClick={() => { setShowActionDropdown(false); closeAllActionForms(); setShowLogCallForm(true) }}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors focus:outline-none"
                    >
                      <MdCall size={16} className="text-green-500" /> Log a Call
                    </button>
                    <button
                      onClick={() => { setShowActionDropdown(false); closeAllActionForms(); setShowAdminNoteInput(true) }}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors focus:outline-none"
                    >
                      <MdNote size={16} className="text-blue-500" /> Add a Note
                    </button>
                    <button
                      onClick={async () => {
                        setShowActionDropdown(false)
                        const wc = currentLead.unified_context?.windchasers || currentLead.unified_context?.bcon || {}
                        const rff = currentLead.unified_context?.raw_form_fields || {}
                        const attr = currentLead.unified_context?.attribution || {}
                        const city = wc.city
                          || currentLead.unified_context?.whatsapp?.profile?.city
                          || currentLead.unified_context?.web?.profile?.city
                          || rff.city
                          || currentLead.unified_context?.city
                          || ''
                        const eduMap: Record<string, string> = {
                          '12th_pcm': '12th PCM',
                          '12th_non_pcm': '12th (non-PCM)',
                          'pursuing_12_pcm': 'Pursuing 12 PCM',
                          'below_12th': 'Below 12th',
                          'unknown': 'Unknown',
                        }
                        const appStatusMap: Record<string, string> = {
                          'demo_booked': 'Demo Booked',
                          'demo_done_online': 'Demo Done (Online)',
                          'demo_done_offline': 'Demo Done (Offline)',
                          'registration_pending': 'Registration Pending',
                          'registration_done': 'Registration Done',
                          'joined': 'Joined',
                        }
                        const patRaw = wc.pat_score ?? rff.total_score
                        const patScore100 = patRaw != null ? Math.round((Number(patRaw) * 100) / 150) : null
                        const lines = [
                          `*Lead Details*`,
                          `Name: ${currentLead.name || 'Unknown'}`,
                          `Phone: ${currentLead.phone || '—'}`,
                          currentLead.email ? `Email: ${currentLead.email}` : null,
                          city ? `City: ${city}` : null,
                          wc.user_type ? `Type: ${String(wc.user_type).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}` : null,
                          wc.course_interest ? `Course: ${wc.course_interest}` : null,
                          wc.class_12_pcm ? `Education: ${eduMap[wc.class_12_pcm] || wc.class_12_pcm}` : (wc.education ? `Education: ${wc.education}` : null),
                          wc.timeline ? `Timeline: ${wc.timeline}` : null,
                          patScore100 != null ? `PAT Score: ${patScore100}/100${wc.pat_tier ? ` (${wc.pat_tier})` : ''}` : null,
                          `Lead Score: ${(currentLead as any).lead_score ?? '—'}/100`,
                          `Stage: ${currentLead.lead_stage || 'New'}`,
                          wc.application_status ? `Application Status: ${appStatusMap[wc.application_status] || wc.application_status}` : null,
                          attr.source_label ? `Source: ${attr.source_label}${attr.first_touch_label ? ' · ' + attr.first_touch_label : ''}` : null,
                          (currentLead as any).created_at ? `First seen: ${new Date((currentLead as any).created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : null,
                        ].filter(Boolean).join('\n')

                        try {
                          await navigator.clipboard.writeText(lines)
                          setNoteProgress({ steps: [{ text: 'Lead details copied to clipboard', done: true }], visible: true })
                          setTimeout(() => setNoteProgress({ steps: [], visible: false }), 2000)
                        } catch {
                          window.prompt('Copy lead details:', lines)
                        }
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors focus:outline-none"
                    >
                      <MdContentCopy size={16} className="text-amber-500" /> Copy Lead Details
                    </button>
                    <button
                      onClick={() => {
                        setShowActionDropdown(false)
                        setShowMergeDialog(true)
                        setMergeQuery('')
                        setMergeCandidates([])
                        setMergeSelected(null)
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors focus:outline-none"
                    >
                      <MdShare size={16} className="text-purple-500 rotate-90" /> Merge with another lead
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Stage Dropdown */}
            {showStageDropdown && stageButtonRef.current && (
              <>
                <div
                  className="lead-stage-dropdown-backdrop fixed inset-0 z-[60]"
                  onClick={() => setShowStageDropdown(false)}
                  aria-hidden="true"
                />
                <menu
                  className="lead-stage-dropdown fixed z-[70] bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg shadow-xl p-2 w-[220px]"
                  style={{
                    top: `${stageButtonRef.current.getBoundingClientRect().bottom + 8}px`,
                    left: `${Math.max(8, stageButtonRef.current.getBoundingClientRect().right - 220)}px`,
                  }}
                  role="menu"
                  aria-label="Select lead stage"
                >
                  {['New', 'Engaged', 'Qualified', 'High Intent', 'Booking Made', 'Converted', 'Closed Lost', 'Not Qualified', 'Cold', 'R&R'].map((stage) => (
                    <li key={stage} role="none">
                      <button
                        onClick={() => handleStageChange(stage as LeadStage)}
                        className={`lead-stage-option w-full text-left px-3 py-2 rounded-md text-sm transition-colors focus:outline-none ${currentStage === stage
                          ? getStageBadgeClass(stage) + ' font-semibold'
                          : 'hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                          }`}
                        style={currentStage === stage && stage === 'In Sequence' ? {
                          backgroundColor: 'var(--accent-subtle)',
                          color: 'var(--accent-primary)'
                        } : undefined}
                        role="menuitem"
                        aria-label={`Change stage to ${stage}`}
                      >
                        {stage}
                      </button>
                    </li>
                  ))}
                </menu>
              </>
            )}
          </header>

          {/* TABS */}
          <nav className="lead-modal-tabs lead-details-modal-tabs flex border-b border-[var(--border-primary)] flex-shrink-0" role="tablist" aria-label="Lead details sections">
            <button
              onClick={() => setActiveTab('summary')}
              style={{ display: tabOn('summary') ? undefined : 'none' }}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-summary px-4 py-1.5 text-sm font-medium transition-colors border-b-2 focus:outline-none ${activeTab === 'summary'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              role="tab"
              aria-selected={activeTab === 'summary'}
              aria-controls="lead-tabpanel-summary"
              id="lead-tab-summary"
            >
              Summary
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              style={{ display: tabOn('activity') ? undefined : 'none' }}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-activity px-4 py-1.5 text-sm font-medium transition-colors border-b-2 focus:outline-none ${activeTab === 'activity'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              role="tab"
              aria-selected={activeTab === 'activity'}
              aria-controls="lead-tabpanel-activity"
              id="lead-tab-activity"
            >
              Activity
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              style={{ display: tabOn('notes') ? undefined : 'none' }}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-notes px-4 py-1.5 text-sm font-medium transition-colors border-b-2 focus:outline-none ${activeTab === 'notes'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              role="tab"
              aria-selected={activeTab === 'notes'}
              aria-controls="lead-tabpanel-notes"
              id="lead-tab-notes"
            >
              Notes
            </button>
            <button
              onClick={() => setActiveTab('breakdown')}
              style={{ display: tabOn('breakdown') ? undefined : 'none' }}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-breakdown px-4 py-1.5 text-sm font-medium transition-colors border-b-2 focus:outline-none ${activeTab === 'breakdown'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              role="tab"
              aria-selected={activeTab === 'breakdown'}
              aria-controls="lead-tabpanel-breakdown"
              id="lead-tab-breakdown"
            >
              Score Breakdown
            </button>
            <button
              onClick={() => setActiveTab('interaction')}
              style={{ display: tabOn('interaction') ? undefined : 'none' }}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-interaction px-4 py-1.5 text-sm font-medium transition-colors border-b-2 focus:outline-none ${activeTab === 'interaction'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              role="tab"
              aria-selected={activeTab === 'interaction'}
              aria-controls="lead-tabpanel-interaction"
              id="lead-tab-interaction"
            >
              Interaction
            </button>
            <button
              onClick={() => setActiveTab('attribution')}
              style={{ display: tabOn('attribution') ? undefined : 'none' }}
              className={`lead-modal-tab lead-details-modal-tab lead-details-modal-tab-attribution px-4 py-1.5 text-sm font-medium transition-colors border-b-2 focus:outline-none ${activeTab === 'attribution'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              role="tab"
              aria-selected={activeTab === 'attribution'}
              aria-controls="lead-tabpanel-attribution"
              id="lead-tab-attribution"
            >
              Attribution
            </button>
          </nav>

          {/* TAB CONTENT - Scrollable */}
          <main className="lead-modal-content lead-details-modal-tab-content overflow-y-auto flex-1 min-h-0">
            {/* Activity Tab - 70% width with improved message display */}
            {activeTab === 'activity' && (
              <section
                id="lead-tabpanel-activity"
                role="tabpanel"
                aria-labelledby="lead-tab-activity"
                className="lead-tabpanel-activity px-4 pt-4 pb-2"
                style={{ width: '70%', maxWidth: '840px' }}
              >
                {loadingActivities ? (
                  <div className="lead-activity-loading text-sm text-center py-8 text-[var(--text-muted)]" aria-live="polite">
                    <div className="animate-pulse">Loading activities...</div>
                  </div>
                ) : activities.length === 0 && conversationActivities.length === 0 && leadTasks.length === 0 ? (
                  <div className="lead-activity-empty text-sm text-center py-8 text-[var(--text-muted)]">
                    No activities yet
                  </div>
                ) : (
                  <ol className="lead-activity-list space-y-4" aria-label="Lead activity timeline">
                    {(() => {
                      // Merge activities with task events for unified timeline
                      const taskActivities: any[] = []
                      leadTasks.forEach((task: any) => {
                        // Task creation event
                        taskActivities.push({
                          id: `task-created-${task.id}`,
                          type: 'proxe',
                          actor: 'PROXe',
                          action: `Created ${task.task_type?.replace(/_/g, ' ')} task`,
                          content: task.task_description || null,
                          timestamp: task.created_at,
                          color: '#8B5CF6',
                          _taskIcon: 'created',
                        })
                        // Task completion event
                        if (task.status === 'completed' && task.completed_at) {
                          taskActivities.push({
                            id: `task-done-${task.id}`,
                            type: 'proxe',
                            actor: 'PROXe',
                            action: task.metadata?.completed_action || `Sent ${task.task_type?.replace(/_/g, ' ')}`,
                            channel: task.metadata?.channel || 'whatsapp',
                            timestamp: task.completed_at,
                            color: '#22C55E',
                            _taskIcon: 'completed',
                          })
                        }
                        // Task failure event
                        if ((task.status === 'failed' || task.status === 'failed_24h_window') && task.completed_at) {
                          taskActivities.push({
                            id: `task-fail-${task.id}`,
                            type: 'proxe',
                            actor: 'PROXe',
                            action: task.error_message || `${task.task_type?.replace(/_/g, ' ')} failed`,
                            timestamp: task.completed_at,
                            color: '#EF4444',
                            _taskIcon: 'failed',
                          })
                        }
                      })
                      const hasMessageActivities = activities.some(activity =>
                        (activity.type === 'customer' || activity.type === 'proxe') && activity.content
                      )
                      const messageFallbackActivities = hasMessageActivities ? [] : conversationActivities
                      const merged = [...activities, ...messageFallbackActivities, ...taskActivities]
                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      return merged.map((activity, index) => {
                      const getActivityIcon = () => {
                        if (activity._taskIcon === 'completed') return <MdCheckCircle size={18} />
                        if (activity._taskIcon === 'failed') return <MdReportProblem size={18} />
                        if (activity.type === 'proxe') {
                          return <MdSmartToy size={18} />
                        } else if (activity.type === 'customer') {
                          return <MdPerson size={18} />
                        } else if (activity.type === 'team') {
                          switch (activity.icon) {
                            case 'call': return <MdCall size={18} />
                            case 'meeting': return <MdEvent size={18} />
                            case 'message': return <MdMessage size={18} />
                            case 'note': return <MdNote size={18} />
                            default: return <MdHistory size={18} />
                          }
                        } else {
                          return activity.icon === 'booking' ? <MdEvent size={18} /> : <MdMessage size={18} />
                        }
                      }
                      const color = activity.color || '#6B7280'
                      const Icon = getActivityIcon()
                      const isCustomer = activity.type === 'customer'
                      const isProxe = activity.type === 'proxe'
                      const isTeam = activity.type === 'team'

                      // Pretty-print team call logs:
                      //   raw activity.action = "Manual_call"  →  "Call · Connected"
                      //   raw activity.content = "[Connected] Spoke to him…"  →  "Spoke to him…"
                      //   raw activity.actor (email from created_by) → "user-name" before @
                      let displayAction = activity.action
                      let displayContent = activity.content
                      let outcomeBadge: string | null = null
                      let displayActor = activity.actor
                      if (isTeam) {
                        // Extract [Outcome] prefix from the note body
                        if (typeof activity.content === 'string') {
                          const m = activity.content.match(/^\[([^\]]+)\]\s*(.*)$/s)
                          if (m) {
                            outcomeBadge = m[1]
                            displayContent = m[2] || null
                          }
                        }
                        // Friendly action label
                        if (activity.icon === 'manual_call' || activity.icon === 'call') {
                          displayAction = outcomeBadge ? `Call · ${outcomeBadge}` : 'Call logged'
                        } else if (typeof activity.action === 'string') {
                          // "Manual_call" → "Manual call"
                          displayAction = activity.action.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                        }
                        // Actor: if it's an email string, take the local part
                        if (typeof displayActor === 'string' && displayActor.includes('@')) {
                          displayActor = displayActor.split('@')[0]
                        }
                      }

                      return (
                        <li key={activity.id} className={`lead-activity-item flex gap-3 ${isCustomer ? 'flex-row-reverse' : ''}`}>
                          <div className="lead-activity-timeline flex flex-col items-center flex-shrink-0">
                            <div
                              className="lead-activity-icon w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm transition-transform hover:scale-105"
                              style={{ backgroundColor: color }}
                              aria-hidden="true"
                            >
                              {Icon}
                            </div>
                            {index < merged.length - 1 && (
                              <div
                                className="lead-activity-connector w-0.5 flex-1 mt-2"
                                style={{ backgroundColor: color, opacity: 0.3 }}
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <article className={`lead-activity-content flex-1 pb-2 min-w-0 ${isCustomer ? 'text-right' : 'text-left'}`}>
                            {/* Bubbles by activity type:
                               - customer  → emerald (incoming)
                               - proxe     → blue (agent)
                               - team      → amber (call logs, manual notes)
                                             previously a tiny grey paragraph
                                             buried under the icon — easy to
                                             miss. Now styled like every other
                                             bubble so the actual call note
                                             pops on the timeline. */}
                            {(isCustomer || isProxe) && activity.content ? (
                              <div
                                className={`lead-activity-message rounded-2xl px-4 py-3 mb-2 shadow-sm ${isCustomer
                                  ? 'bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-700/40'
                                  : 'bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700/40'
                                  }`}
                                style={{
                                  maxWidth: '440px',
                                  marginLeft: isCustomer ? 'auto' : '0',
                                  marginRight: isCustomer ? '0' : 'auto'
                                }}
                              >
                                <div className={`text-sm leading-relaxed ${isCustomer ? 'text-emerald-950 dark:text-emerald-50' : 'text-blue-950 dark:text-blue-50'}`}>
                                  {renderMessageWithButtons(
                                    activity.content,
                                    (value) => activity.channel === 'whatsapp'
                                      ? renderWhatsAppMarkdown(value)
                                      : renderMarkdown(value),
                                  )}
                                </div>
                              </div>
                            ) : isTeam && (displayContent || outcomeBadge) ? (
                              <div
                                className="lead-activity-team-card rounded-2xl px-4 py-3 mb-2 shadow-sm bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/40"
                                style={{ maxWidth: '440px' }}
                              >
                                {outcomeBadge && (
                                  <span
                                    className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mb-1.5"
                                    style={{ background: 'rgba(180, 83, 9, 0.15)', color: '#92400e' }}
                                  >
                                    {outcomeBadge}
                                  </span>
                                )}
                                {displayContent && (
                                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-amber-950 dark:text-amber-50">
                                    {displayContent}
                                  </p>
                                )}
                                {!displayContent && outcomeBadge && (
                                  <p className="text-[12px] italic text-amber-900/70 dark:text-amber-100/60">
                                    No note added.
                                  </p>
                                )}
                              </div>
                            ) : activity.content ? (
                              <div className="lead-activity-text text-sm mt-1 text-[var(--text-secondary)] leading-relaxed">
                                {renderMessageWithButtons(
                                  activity.content,
                                  (value) => activity.channel === 'whatsapp'
                                    ? renderWhatsAppMarkdown(value)
                                    : renderMarkdown(value),
                                )}
                              </div>
                            ) : null}

                            <div className={`lead-activity-header flex items-start justify-between gap-2 mb-1 ${isCustomer ? 'flex-row-reverse' : ''}`}>
                              <div className={`lead-activity-meta flex items-center gap-2 flex-1 min-w-0 ${isCustomer ? 'flex-row-reverse' : ''}`}>
                                <h4 className="lead-activity-action text-sm font-semibold text-[var(--text-primary)]">
                                  {displayAction || activity.action || 'Activity'}
                                </h4>
                                {activity.channel && (
                                  <span
                                    className="lead-activity-channel text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0"
                                    style={{
                                      backgroundColor: `${color}15`,
                                      color: color
                                    }}
                                    aria-label={`Channel: ${activity.channel}`}
                                  >
                                    {activity.channel}
                                  </span>
                                )}
                              </div>
                              <time className="lead-activity-time text-[10px] uppercase font-medium whitespace-nowrap text-[var(--text-muted)] flex-shrink-0" dateTime={activity.timestamp}>
                                {formatDateTimeIST(activity.timestamp)}
                              </time>
                            </div>
                            <p className="lead-activity-actor text-xs mt-0.5 font-medium" style={{ color }}>
                              {displayActor || activity.actor || 'Unknown'}
                            </p>
                          </article>
                        </li>
                      )
                    })})()}
                  </ol>
                )}
              </section>
            )}

            {/* Other Tabs - Full Width */}
            {activeTab !== 'activity' && (
              <div className="lead-tabpanel-container px-4 pt-4 pb-2">
                {/* Notes Tab - human notes, call logs, edits, and automation decisions */}
                {activeTab === 'notes' && (
                  <section
                    id="lead-tabpanel-notes"
                    role="tabpanel"
                    aria-labelledby="lead-tab-notes"
                    className="lead-tabpanel-notes space-y-4"
                  >
                    <div className="lead-notes-toolbar flex items-center justify-end -mb-1">
                      <button
                        type="button"
                        onClick={refreshNotes}
                        disabled={isRefreshingNotes}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50 focus:outline-none"
                        style={{ color: 'var(--accent-primary)' }}
                        title="Refresh notes"
                      >
                        <MdRefresh size={12} className={isRefreshingNotes ? 'animate-spin' : ''} />
                        Refresh
                      </button>
                    </div>
                    {(() => {
                      const adminNotes = ((currentLead.unified_context?.admin_notes || []) as Array<{
                        id?: string
                        text?: string
                        created_by?: string
                        created_at?: string
                        source?: string
                        outcome?: string
                      }>).filter(note => note.text?.trim())

                      const adminNoteKeys = new Set(adminNotes.map(note => `${note.text}|${note.created_at || ''}`))
                      // A logged call is persisted TWICE: as an admin_note
                      // ("Call logged - <outcome>: <text>") and as a call activity
                      // ("[<outcome>] <text>"). The exact key above misses this dupe
                      // because the prefixes AND insert timestamps differ. Match on the
                      // prefix-stripped body so the activity copy is suppressed and only
                      // the richer admin_note (creator + outcome badge) renders.
                      const stripCallPrefix = (s?: string) =>
                        (s || '').replace(/^\s*(?:\[[^\]]*\]|call logged\s*-\s*[^:]*:?)\s*/i, '').trim().toLowerCase()
                      const adminCallBodies = new Set(
                        adminNotes.filter(n => n.source === 'log_call').map(n => stripCallPrefix(n.text))
                      )
                      const timelineItems = [
                        ...adminNotes.map(note => ({
                          id: note.id || `admin-note-${note.created_at || note.text}`,
                          label: note.source === 'log_call' ? 'Call log' : 'Note',
                          actor: note.created_by || 'team',
                          content: note.text || '',
                          timestamp: note.created_at || new Date().toISOString(),
                          tone: note.source === 'log_call' ? 'call' : 'note',
                          outcome: note.outcome || null,
                        })),
                        ...activities
                          .filter(activity => {
                            // Notes tab is HUMAN-ONLY. Automation / agent (proxe)
                            // entries belong in the Activity tab, never here — the
                            // founder only wants what a person actually wrote, with
                            // their name + note type.
                            if (activity.type !== 'team') return false
                            if (activity.icon === 'automation' || activity.actor === 'PROXe') return false
                            if (!activity.content) return false
                            const key = `${activity.content}|${activity.timestamp || ''}`
                            if (adminNoteKeys.has(key)) return false
                            // Suppress the call-activity twin of a logged call (different
                            // prefix + timestamp than its admin_note, so the exact key misses it).
                            if ((activity.icon === 'call' || activity.icon === 'manual_call') &&
                                adminCallBodies.has(stripCallPrefix(activity.content))) return false
                            return true
                          })
                          .map(activity => ({
                            id: `activity-${activity.id}`,
                            label: activity.type === 'proxe' || activity.icon === 'automation' ? 'Automation' : (activity.action || 'Update'),
                            actor: activity.actor || (activity.type === 'proxe' ? 'PROXe' : 'team'),
                            content: activity.content,
                            timestamp: activity.timestamp,
                            tone: activity.type === 'proxe' || activity.icon === 'automation' ? 'automation' : activity.icon === 'call' ? 'call' : 'update',
                            outcome: null,
                          })),
                      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

                      const pendingTasks = leadTasks.filter(t =>
                        ['pending', 'queued', 'in_queue', 'awaiting_approval'].includes(t.status) &&
                        !t.completed_at
                      )
                      const cancelledTasks = leadTasks.filter(t => t.status === 'cancelled' || t.completed_at)

                      return (
                        <>
                          <div className="grid grid-cols-3 gap-3">
                            <article className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3">
                              <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">Logged notes</p>
                              <p className="mt-1 text-2xl font-black text-[var(--text-primary)]">{adminNotes.length}</p>
                            </article>
                            <article className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3">
                              <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">Open actions</p>
                              <p className="mt-1 text-2xl font-black text-[var(--text-primary)]">{pendingTasks.length}</p>
                            </article>
                            <article className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3">
                              <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)]">Closed actions</p>
                              <p className="mt-1 text-2xl font-black text-[var(--text-primary)]">{cancelledTasks.length}</p>
                            </article>
                          </div>

                          {timelineItems.length === 0 ? (
                            <div className="text-sm text-center py-10 text-[var(--text-muted)] border border-dashed border-[var(--border-primary)] rounded-lg">
                              No notes or updates logged yet.
                            </div>
                          ) : (
                            <ol className="space-y-3" aria-label="Lead notes and updates">
                              {timelineItems.map(item => {
                                const actor = typeof item.actor === 'string' && item.actor.includes('@')
                                  ? item.actor.split('@')[0]
                                  : item.actor
                                const toneClass = item.tone === 'automation'
                                  ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/40'
                                  : item.tone === 'call'
                                    ? getCallCardClass(item.outcome)
                                    : 'bg-[var(--bg-secondary)] border-[var(--border-primary)]'
                                return (
                                  <li key={item.id} className={`rounded-lg border p-3 ${toneClass}`}>
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-[var(--text-primary)]">{item.label}</span>
                                          {item.outcome && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${getNoteOutcomeClass(item.outcome)}`}>
                                              {item.outcome}
                                            </span>
                                          )}
                                        </div>
                                        <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-primary)]">{item.content}</p>
                                      </div>
                                      <time className="text-[10px] whitespace-nowrap text-[var(--text-muted)]" dateTime={item.timestamp}>
                                        {formatDateTimeIST(item.timestamp)}
                                      </time>
                                    </div>
                                    <p className="mt-2 text-[11px] text-[var(--text-muted)]">{actor || 'team'}</p>
                                  </li>
                                )
                              })}
                            </ol>
                          )}
                        </>
                      )
                    })()}
                  </section>
                )}

                {/* Summary Tab */}
                {activeTab === 'summary' && (
                  <section
                    id="lead-tabpanel-summary"
                    role="tabpanel"
                    aria-labelledby="lead-tab-summary"
                    className="lead-tabpanel-summary space-y-4"
                  >
                    <article className="lead-summary-card p-3 rounded-lg border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
                      <h3 className="lead-summary-title text-xs font-semibold mb-2 flex items-center justify-between text-[var(--text-primary)]">
                        <div className="flex items-center gap-1.5">
                          <MdAutoAwesome size={14} className="text-blue-500" aria-hidden="true" />
                          Summary
                        </div>
                        <button
                          onClick={() => loadUnifiedSummary(true)}
                          disabled={loadingSummary}
                          className="p-0.5 px-1.5 hover:bg-[var(--bg-hover)] rounded-full transition-colors flex items-center gap-1 text-[9px] font-bold disabled:opacity-50 disabled:cursor-not-allowed" style={{ color: 'var(--accent-primary)' }}
                          title="Regenerate summary"
                        >
                          <MdRefresh size={12} className={loadingSummary ? 'animate-spin' : ''} />
                          <span>{loadingSummary ? 'REGENERATING...' : 'REFRESH'}</span>
                        </button>
                      </h3>
                      {loadingSummary && !unifiedSummary ? (
                        <div className="lead-summary-loading-state text-xs text-[var(--text-muted)] py-1" aria-live="polite">
                          <div className="animate-pulse flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                            Loading summary...
                          </div>
                        </div>
                      ) : (
                        <div className={`lead-summary-content transition-opacity ${loadingSummary ? 'opacity-60' : 'opacity-100'}`}>
                          <div className="lead-summary-text mb-2">
                            {unifiedSummary ? renderSummary(unifiedSummary) : <p className="text-xs text-[var(--text-muted)]">No summary available. Click Refresh to generate one.</p>}
                          </div>
                          {summaryAttribution && (
                            <footer className="lead-summary-attribution text-[10px] pt-2 border-t border-[var(--border-primary)] text-[var(--text-muted)]">
                              {summaryAttribution}
                            </footer>
                          )}
                        </div>
                      )}
                    </article>

                    {/* Latest note — shows the most recent admin_note inline so
                        operators can see what they (or a teammate) just added
                        without clicking the 3-dot menu in the contact card.
                        Hidden when there are no notes. */}
                    {(() => {
                      const notes = (currentLead.unified_context?.admin_notes || []) as Array<{
                        id?: string; text?: string; created_by?: string; created_at?: string
                      }>
                      if (!notes.length) return null
                      const latest = notes[notes.length - 1]
                      if (!latest?.text) return null
                      const when = latest.created_at ? new Date(latest.created_at) : null
                      const ago = (() => {
                        if (!when) return ''
                        const min = Math.floor((Date.now() - when.getTime()) / 60_000)
                        if (min < 1) return 'just now'
                        if (min < 60) return `${min}m ago`
                        const hr = Math.floor(min / 60)
                        if (hr < 24) return `${hr}h ago`
                        return `${Math.floor(hr / 24)}d ago`
                      })()
                      const author = (latest.created_by || '').split('@')[0] || 'team'
                      return (
                        <article
                          className="lead-latest-note p-3 rounded-lg border"
                          style={{
                            borderColor: 'var(--border-primary)',
                            backgroundColor: 'var(--bg-secondary)',
                          }}
                        >
                          <h3 className="text-xs font-semibold mb-2 flex items-center justify-between text-[var(--text-primary)]">
                            <div className="flex items-center gap-1.5">
                              <MdNote size={14} className="text-orange-400" aria-hidden="true" />
                              Latest note
                            </div>
                            {notes.length > 1 && (
                              <button
                                onClick={() => setShowAdminNotes(!showAdminNotes)}
                                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                title={`Show all ${notes.length} notes`}
                              >
                                {notes.length > 1 ? `+${notes.length - 1} more` : ''}
                              </button>
                            )}
                          </h3>
                          <p className="text-xs leading-relaxed text-[var(--text-primary)] mb-2 whitespace-pre-wrap">
                            {latest.text}
                          </p>
                          <footer className="text-[10px] pt-2 border-t border-[var(--border-primary)] text-[var(--text-muted)] flex items-center gap-2">
                            <span>{author}</span>
                            {ago && <span>· {ago}</span>}
                            {when && (
                              <span title={when.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}>
                                ·{' '}
                                {when.toLocaleString('en-IN', {
                                  timeZone: 'Asia/Kolkata',
                                  day: 'numeric', month: 'short',
                                  hour: 'numeric', minute: '2-digit', hour12: true,
                                })}
                              </span>
                            )}
                          </footer>
                        </article>
                      )
                    })()}

                    {/* Next Actions — hidden until redesigned (see SHOW_NEXT_ACTIONS) */}
                    {SHOW_NEXT_ACTIONS && (
                    <section className="lead-next-actions mt-4">
                      <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-[var(--text-primary)]">
                        <MdSchedule size={14} className="text-orange-500" />
                        Next Actions
                      </h3>
                      {loadingTasks ? (
                        <div className="text-xs text-[var(--text-muted)] animate-pulse py-2">Loading tasks...</div>
                      ) : (() => {
                        // Treat any task with a completion timestamp as not-pending,
                        // regardless of what the API reported in `status`.
                        const pendingTasks = leadTasks.filter(t =>
                          ['pending', 'queued', 'in_queue', 'awaiting_approval'].includes(t.status) &&
                          !t.completed_at
                        )
                        if (pendingTasks.length === 0) {
                          return (
                            <p className="text-xs text-[var(--text-muted)] py-2 italic">
                              No actions scheduled. Add a note to trigger next steps.
                            </p>
                          )
                        }
                        return (
                          <div className="space-y-2">
                            {pendingTasks.map((task: any) => {
                              const typeConfig = getTaskTypeConfig(task.task_type)
                              const actionLabel = getTaskActionLabel(task)
                              const reason = task.metadata?.timing_reason || task.metadata?.next_action_reason || ''
                              return (
                                <div key={task.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] group">
                                  <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0 mt-0.5"
                                    style={{ color: typeConfig.color, backgroundColor: typeConfig.bg }}
                                  >
                                    {typeConfig.label}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-[var(--text-primary)] capitalize">{actionLabel}</p>
                                    {task.scheduled_at && (
                                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                                        <MdSchedule size={11} className="inline mr-0.5 -mt-0.5" />
                                        {formatCountdown(task.scheduled_at)}
                                      </p>
                                    )}
                                    {reason && (
                                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{reason}</p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleCancelTask(task.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--text-muted)] hover:text-red-500 transition-all flex-shrink-0"
                                    title="Cancel task"
                                  >
                                    <MdClose size={14} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </section>
                    )}

                    {/* Compact Intelligence Insights - Only render when data exists */}
                    {(() => {
                      // Lokazen is commercial real estate, not a generic sales funnel.
                      // The "Buying Signals" block (Budget / Interest / Pain point) mis-
                      // frames CRE data — it was showing Interest="brand" (the user type)
                      // and Pain point=the target location. The real requirement (budget,
                      // size, zones) already lives in the dedicated CRE card, so hide this
                      // generic block for all Lokazen leads.
                      const isLokazenLead = !!currentLead.unified_context?.lokazen
                      if (isLokazenLead) return null
                      const hasKeyInfo = summaryData?.keyInfo && (summaryData.keyInfo.budget || summaryData.keyInfo.serviceInterest || summaryData.keyInfo.painPoints)
                      const brandProfileCheck = currentLead.unified_context?.bcon || currentLead.unified_context?.windchasers || {}
                      const hasProfile = Object.keys(brandProfileCheck).length > 0
                      if (!hasKeyInfo && !hasProfile) return null
                      return (
                    <article className="lead-intelligence-insights p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-sm">
                      <div className="flex flex-col gap-6">
                        {/* Buying Signals Group */}
                        {summaryData && summaryData.keyInfo && (summaryData.keyInfo.budget || summaryData.keyInfo.serviceInterest || summaryData.keyInfo.painPoints) && (
                          <div className="space-y-3">
                            <h4 className="flex items-center gap-2 text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.2em]">
                              <MdTrendingUp size={12} />
                              Buying Signals
                            </h4>
                            <div className="flex flex-wrap gap-x-8 gap-y-3">
                              {summaryData.keyInfo.budget && (
                                <div className="flex items-center gap-2 group">
                                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                    <MdAccountBalanceWallet size={14} />
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-tight">Budget</p>
                                    <p className="text-xs font-black text-[var(--text-primary)]">{summaryData.keyInfo.budget}</p>
                                  </div>
                                </div>
                              )}
                              {summaryData.keyInfo.serviceInterest && (
                                <div className="flex items-center gap-2 group">
                                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                    <MdOutlineInsights size={14} />
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-tight">Interest</p>
                                    <p className="text-xs font-black text-[var(--text-primary)]">{summaryData.keyInfo.serviceInterest}</p>
                                  </div>
                                </div>
                              )}
                              {summaryData.keyInfo.painPoints && (
                                <div className="flex items-center gap-2 group">
                                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-400 group-hover:bg-red-500 group-hover:text-white transition-all">
                                    <MdReportProblem size={14} />
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-tight">Pain Point</p>
                                    <p className="text-xs font-black text-[var(--text-primary)] max-w-[200px] truncate">{summaryData.keyInfo.painPoints}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      </div>
                    </article>
                      )
                    })()}

                    {/* Next step one-liner */}
                    {(() => {
                      if (!SHOW_NEXT_ACTIONS) return null
                      const firstPending = leadTasks.find(t => ['pending', 'queued', 'in_queue', 'awaiting_approval'].includes(t.status) && !t.completed_at)
                      if (!firstPending) return null
                      const actionLabel = getTaskActionLabel(firstPending)
                      const countdown = firstPending.scheduled_at ? formatCountdown(firstPending.scheduled_at) : ''
                      return (
                        <p className="text-xs text-[var(--text-secondary)] mt-3 pt-3 border-t border-[var(--border-primary)] flex items-center gap-1.5">
                          <MdFlashOn size={13} className="text-orange-500 flex-shrink-0" />
                          <span><strong className="text-[var(--text-primary)]">Next:</strong> {actionLabel} {countdown ? countdown.toLowerCase() : ''}{firstPending.metadata?.next_action_reason ? ` — ${firstPending.metadata.next_action_reason}` : ''}</span>
                        </p>
                      )
                    })()}
                  </section>
                )}

                {/* Score Breakdown Tab */}
                {activeTab === 'breakdown' && (
                  <section
                    id="lead-tabpanel-breakdown"
                    role="tabpanel"
                    aria-labelledby="lead-tab-breakdown"
                    className="lead-tabpanel-breakdown space-y-5"
                  >
                    {calculatedScore ? (
                      <div className="space-y-4">
                        {/* Score headline — single tier label from the calculated score.
                            The legacy unified_context.lead_temperature pill was removed because it
                            was painted from a stale/independent classifier and contradicted the
                            score-derived label (e.g. "53/100 Cold + WARM"). One source of truth. */}
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-extrabold text-[var(--text-primary)]">{calculatedScore.score}/100</span>
                            <span className="text-sm font-bold" style={{ color: healthColor.text }}>{healthColor.label}</span>
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mt-1">Based on conversation activity and intent signals</p>
                        </div>

                        {/* Radar Chart */}
                        <div style={{ width: '100%', height: 260 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart data={[
                              { axis: 'Intent', value: calculatedScore.breakdown.details.intentScore },
                              { axis: 'Buying Signals', value: calculatedScore.breakdown.details.buyingScore },
                              { axis: 'Sentiment', value: calculatedScore.breakdown.details.sentimentScore },
                              { axis: 'Response Rate', value: calculatedScore.breakdown.details.responseRate },
                              { axis: 'Recency', value: Math.max(0, 100 - calculatedScore.breakdown.details.daysInactive * 10) },
                            ]}>
                              <PolarGrid stroke="var(--border-primary)" />
                              <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                              <Radar dataKey="value" stroke="var(--accent-primary)" fill="var(--accent-primary)" fillOpacity={0.2} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Temperature History Timeline */}
                        {currentLead.unified_context?.temperature_history?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Temperature History</p>
                            <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
                              {(currentLead.unified_context.temperature_history as Array<{temperature: string; timestamp: string; reason: string}>).slice(-15).map((entry: {temperature: string; timestamp: string; reason: string}, i: number) => {
                                const dotColor = entry.temperature === 'hot' ? '#DC2626' : entry.temperature === 'warm' ? '#F97316' : entry.temperature === 'cool' ? '#3B82F6' : '#6B7280'
                                const time = new Date(entry.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                return (
                                  <div key={i} className="flex flex-col items-center group relative" title={`${entry.temperature}: ${entry.reason}\n${time}`}>
                                    <div
                                      className="w-3 h-3 rounded-full flex-shrink-0 cursor-pointer transition-transform group-hover:scale-150"
                                      style={{ backgroundColor: dotColor }}
                                    />
                                    {i < (currentLead.unified_context.temperature_history as Array<any>).slice(-15).length - 1 && (
                                      <div className="w-3 h-px bg-[var(--border-secondary)]" />
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}


                      </div>
                    ) : (
                      <div className="text-center py-20 animate-pulse text-[var(--text-muted)]">
                        Analyzing...
                      </div>
                    )}
                  </section>
                )}

                {/* Attribution Tab — marketing source + first/last touch +
                    full UTM/ad-id breakdown + landing page. Split out of the
                    Interaction tab on 2026-05-21 so the 30-day calendar
                    has its own dedicated view. */}
                {activeTab === 'attribution' && (
                  <section
                    id="lead-tabpanel-attribution"
                    role="tabpanel"
                    aria-labelledby="lead-tab-attribution"
                    className="lead-tabpanel-attribution px-4 pt-4 pb-2 space-y-4"
                  >
                    {(() => {
                      const attribution: any = currentLead.unified_context?.attribution || {};
                      const utm = attribution.utm || {};

                      // Page-URL is a great fallback source for utm + fb fields
                      // because the website appends every parameter. Try to
                      // surface ad_id (utm_id) and fbclid even when utm{} is sparse.
                      let urlParams: Record<string, string> = {};
                      try {
                        if (attribution.page_url) {
                          const fullUrl = attribution.page_url.startsWith('http')
                            ? attribution.page_url
                            : `https://example.com${attribution.page_url}`;
                          const u = new URL(fullUrl);
                          u.searchParams.forEach((v, k) => { urlParams[k] = v; });
                        }
                      } catch { /* malformed URL — skip */ }

                      const sourceLabel = attribution.source_label
                        || (attribution.source ? String(attribution.source).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null);
                      const firstTouchLabel = attribution.first_touch_label
                        || (attribution.first_touch ? String(attribution.first_touch).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null);
                      const legacyFirst = (currentLead as any).first_touchpoint;
                      const legacyLast = (currentLead as any).last_touchpoint;
                      const finalSource = sourceLabel || 'Direct';
                      const finalFirstTouch = firstTouchLabel
                        || (legacyFirst ? String(legacyFirst).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null);
                      const finalLastTouch = legacyLast
                        ? String(legacyLast).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                        : null;

                      // Rich UTM / ad fields — pull from utm{}, fall back to URL params
                      const utmSource   = utm.source   || urlParams.utm_source   || null;
                      const utmMedium   = utm.medium   || urlParams.utm_medium   || null;
                      const utmCampaign = utm.campaign || urlParams.utm_campaign || null;
                      const utmContent  = utm.content  || urlParams.utm_content  || null;
                      const utmTerm     = utm.term     || urlParams.utm_term     || null;
                      const utmId       = utm.id       || utm.utm_id || urlParams.utm_id || null;
                      const fbclid      = urlParams.fbclid || null;
                      const brid        = urlParams.brid || null;
                      const referrer    = attribution.referrer || (currentLead.unified_context as any)?.raw_form_fields?.referrer || null;
                      const capturedAt  = attribution.captured_at || null;

                      // Show a row only if we have a value worth displaying
                      const rows: Array<{ label: string; value: string; mono?: boolean }> = [];
                      if (finalSource)      rows.push({ label: 'Source',      value: finalSource });
                      if (finalFirstTouch)  rows.push({ label: 'First touch', value: finalFirstTouch });
                      if (finalLastTouch)   rows.push({ label: 'Last touch',  value: finalLastTouch });
                      if (utmCampaign)      rows.push({ label: 'Campaign',    value: String(utmCampaign) });
                      if (utmContent)       rows.push({ label: 'Ad / Content',value: String(utmContent) });
                      if (utmMedium)        rows.push({ label: 'Medium',      value: String(utmMedium) });
                      if (utmSource)        rows.push({ label: 'UTM Source',  value: String(utmSource) });
                      if (utmId)            rows.push({ label: 'Ad set ID',   value: String(utmId), mono: true });
                      if (utmTerm)          rows.push({ label: 'Term / Ad ID',value: String(utmTerm), mono: true });
                      if (fbclid)           rows.push({ label: 'Facebook click ID', value: String(fbclid).slice(0, 40) + (String(fbclid).length > 40 ? '…' : ''), mono: true });
                      if (brid)             rows.push({ label: 'Reel/Branded ID',   value: String(brid).slice(0, 40) + (String(brid).length > 40 ? '…' : ''), mono: true });
                      if (referrer)         rows.push({ label: 'Referrer',    value: String(referrer) });
                      if (capturedAt) {
                        try {
                          rows.push({ label: 'Captured at', value: new Date(capturedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) });
                        } catch { /* skip */ }
                      }

                      if (rows.length === 0) {
                        return (
                          <div className="lead-attribution-empty text-sm text-center py-8 text-[var(--text-muted)]">
                            No attribution data captured for this lead.
                          </div>
                        );
                      }
                      return (
                        <article className="lead-attribution-panel p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)]">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                            Attribution
                          </h3>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                            {rows.map((r) => (
                              <div key={r.label} className="flex flex-col">
                                <dt className="text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{r.label}</dt>
                                <dd
                                  className={`text-[12px] font-medium text-[var(--text-primary)] truncate ${r.mono ? 'font-mono text-[11px]' : ''}`}
                                  title={r.value}
                                >
                                  {r.value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                          {attribution.page_url && (
                            <div className="mt-3 pt-3 border-t border-[var(--border-primary)]">
                              <dt className="text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">Landing page</dt>
                              <dd className="text-[11px] font-mono break-all text-[var(--text-secondary)]" title={attribution.page_url}>
                                {attribution.page_url}
                              </dd>
                            </div>
                          )}
                        </article>
                      );
                    })()}
                  </section>
                )}

                {/* 30-Day Interaction Tab (from first touchpoint) */}
                {activeTab === 'interaction' && (
                  <section
                    id="lead-tabpanel-interaction"
                    role="tabpanel"
                    aria-labelledby="lead-tab-interaction"
                    className="lead-tabpanel-interaction space-y-4"
                  >
                    {loading30Days ? (
                      <div className="lead-interaction-loading text-sm text-center py-8 text-[var(--text-muted)]" aria-live="polite">
                        <div className="animate-pulse">Loading interaction data...</div>
                      </div>
                    ) : interaction30Days ? (
                      <div className="lead-interaction-grid grid grid-cols-2 gap-6">
                        {/* Left Column - Stats */}
                        <section className="lead-interaction-stats space-y-4">
                          {/* Total Interactions */}
                          <article className="lead-interaction-total p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800/20">
                            <div className="flex items-baseline gap-2">
                              <p className="lead-interaction-total-value text-5xl font-extrabold text-blue-600 dark:text-blue-400" aria-label={`${interaction30Days.totalInteractions} total interactions in first 30 days`}>
                                {interaction30Days.totalInteractions}
                              </p>
                              <span className="text-xs font-semibold text-blue-600/60 dark:text-blue-400/60 uppercase">Interactions</span>
                            </div>
                            <p className="lead-interaction-total-label text-[10px] text-[var(--text-muted)] mt-1 uppercase tracking-wider font-medium">First 30 days activity</p>
                          </article>

                          <div className="grid grid-cols-1 gap-3">
                            {/* Lead In Day */}
                            <article className="lead-interaction-lead-in p-3 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] shadow-sm">
                              <p className="lead-interaction-label text-[10px] text-[var(--text-muted)] mb-1 uppercase tracking-wider font-bold">Contact Created</p>
                              <p className="lead-interaction-value text-sm font-semibold text-[var(--text-primary)]">
                                {interaction30Days.leadInDay || 'Unknown'}
                              </p>
                            </article>

                            {/* Last Touch Day */}
                            <article className="lead-interaction-last-touch p-3 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-primary)] shadow-sm">
                              <p className="lead-interaction-label text-[10px] text-[var(--text-muted)] mb-1 uppercase tracking-wider font-bold">Latest Touchpoint</p>
                              <p className="lead-interaction-value text-sm font-semibold text-[var(--text-primary)]">
                                {interaction30Days.lastTouchDay || 'No interactions yet'}
                              </p>
                            </article>
                          </div>

                          <div className="interaction-legend pt-4">
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-2">Legend</p>
                            <div className="flex items-center gap-2">
                              {[0.08, 0.5, 0.85, 1.0].map((op, i) => (
                                <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--accent-primary)', opacity: op }}></div>
                              ))}
                              <span className="text-[10px] text-[var(--text-muted)] ml-1">Low → High Activity</span>
                            </div>
                          </div>
                        </section>

                        {/* Right Column - Calendar */}
                        <section className="lead-interaction-calendar w-full" aria-label="30-day interaction calendar">
                          {(() => {
                            // Helper function to get a local date string in YYYY-MM-DD format
                            const getLocalDateKey = (date: Date): string => {
                              const year = date.getFullYear();
                              const month = (date.getMonth() + 1).toString().padStart(2, '0');
                              const day = date.getDate().toString().padStart(2, '0');
                              return `${year}-${month}-${day}`;
                            };

                            // Get first touchpoint date
                            const firstTouchpoint = new Date(lead?.created_at || lead?.timestamp || new Date())
                            firstTouchpoint.setHours(0, 0, 0, 0)

                            const startMonth = firstTouchpoint.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

                            // Build a map of date -> count for quick lookup
                            const dateCountMap = new Map<string, number>()
                            interaction30Days.dailyData.forEach(d => {
                              dateCountMap.set(d.date, d.count)
                            })

                            // Generate all 30 days starting from first touchpoint using helper
                            const allDays: Array<{ date: Date; dateStr: string; count: number; dayOfWeek: number }> = []
                            for (let i = 0; i < 30; i++) {
                              const date = new Date(firstTouchpoint)
                              date.setDate(date.getDate() + i)
                              const dateStr = getLocalDateKey(date)
                              const count = dateCountMap.get(dateStr) || 0
                              allDays.push({ date, dateStr, count, dayOfWeek: date.getDay() })
                            }

                            // Day names (Sunday = 0, Monday = 1, etc.)
                            const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

                            // Get the day of week for the first touchpoint (0 = Sunday, 1 = Monday, etc.)
                            const firstDayOfWeek = firstTouchpoint.getDay()

                            // Calculate number of weeks needed (30 days + empty cells at start)
                            const totalCells = firstDayOfWeek + 30
                            const numWeeks = Math.ceil(totalCells / 7)

                            // Group days into weeks (each week has 7 days, starting from Sunday)
                            const weeks: Array<Array<{ date: Date; dateStr: string; count: number; dayOfWeek: number } | null>> = []
                            for (let weekIndex = 0; weekIndex < numWeeks; weekIndex++) {
                              const weekDays: Array<{ date: Date; dateStr: string; count: number; dayOfWeek: number } | null> = []

                              // For each day of week (Sunday to Saturday = 0 to 6)
                              for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                                // Calculate the absolute day index
                                const absoluteDayIndex = weekIndex * 7 + dayOfWeek - firstDayOfWeek

                                if (absoluteDayIndex >= 0 && absoluteDayIndex < 30) {
                                  weekDays.push(allDays[absoluteDayIndex])
                                } else {
                                  weekDays.push(null)
                                }
                              }
                              weeks.push(weekDays)
                            }

                            return (
                              <div className="lead-calendar-container flex flex-col gap-1">
                                {/* Calendar Title */}
                                <div className="lead-calendar-title mb-4 bg-[var(--bg-secondary)] p-2 rounded-lg flex items-center justify-between">
                                  <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">{startMonth}</p>
                                  <div className="flex gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                                    <span className="text-[8px] font-bold text-blue-500 uppercase">Live Journey</span>
                                  </div>
                                </div>

                                {/* Day labels row at top */}
                                <div className="lead-calendar-header grid grid-cols-7 gap-3 mb-3 border-b border-[var(--border-primary)] pb-2" role="row">
                                  {dayNames.map((dayName, index) => (
                                    <div key={index} className="lead-calendar-day-label text-center text-[10px] text-[var(--text-muted)] font-bold" role="columnheader">
                                      {dayName}
                                    </div>
                                  ))}
                                </div>

                                {/* Week rows */}
                                <div className="lead-calendar-weeks flex flex-col gap-2">
                                  {weeks.map((week, weekIndex) => (
                                    <div key={weekIndex} className="lead-calendar-week grid grid-cols-7 gap-3" role="row">
                                      {week.map((day, dayIndex) => {
                                        if (!day) {
                                          // Empty cell (beyond 30 days)
                                          return (
                                            <div
                                              key={`${weekIndex}-${dayIndex}`}
                                              className="lead-calendar-empty-cell w-4 h-4 flex-shrink-0"
                                              aria-hidden="true"
                                            />
                                          )
                                        }

                                        // Color intensity mapping
                                        let opacity = 0.1
                                        let size = 16

                                        if (day.count === 0) {
                                          opacity = 0.08 // Barely visible
                                        } else if (day.count >= 1 && day.count <= 2) {
                                          opacity = 0.5 // Medium opacity
                                        } else if (day.count >= 3 && day.count <= 5) {
                                          opacity = 0.85 // Bright accent
                                        } else if (day.count > 5) {
                                          opacity = 1.0 // Full accent
                                        }

                                        // Format date for tooltip
                                        const dateStr = day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

                                        return (
                                          <div
                                            key={day.dateStr}
                                            className="lead-calendar-day rounded-[3px] cursor-pointer transition-all hover:ring-2 hover:ring-blue-400 hover:scale-110 flex-shrink-0"
                                            style={{
                                              width: `24px`,
                                              height: `24px`,
                                              backgroundColor: 'var(--accent-primary)',
                                              opacity: opacity,
                                              minWidth: '24px',
                                              minHeight: '24px',
                                            }}
                                            title={`${dateStr}: ${day.count} message${day.count !== 1 ? 's' : ''}`}
                                            aria-label={`${dateStr}: ${day.count} message${day.count !== 1 ? 's' : ''}`}
                                            role="gridcell"
                                          />
                                        )
                                      })}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })()}
                        </section>
                      </div>
                    ) : (
                      <div className="lead-interaction-empty text-sm text-center py-4 text-[var(--text-muted)]">
                        No interaction data available
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </main>

          {/* Footer with Delete Lead button */}
          <footer className="lead-modal-footer flex items-center justify-between px-4 py-3 border-t border-[var(--border-primary)] flex-shrink-0">
            <button
              onClick={async () => {
                if (!lead?.id) return;
                if (!confirm('Are you sure you want to delete this lead? This action cannot be undone.')) return;
                
                try {
                  // Use the per-lead path-param route — it cascades through
                  // conversations, activities, agent_tasks, and
                  // lead_stage_changes before deleting the lead itself.
                  // The collection-route DELETE doesn't cascade and trips
                  // FK constraints with a generic 500.
                  const response = await fetch(`/api/dashboard/leads/${lead.id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  
                  if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to delete lead');
                  }
                  
                  onClose();
                  // Refresh the page to update lead list
                  window.location.reload();
                } catch (err: any) {
                  alert(err.message || 'Failed to delete lead');
                }
              }}
              className="px-3 py-1.5 text-xs font-medium rounded border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
            >
              Delete Lead
            </button>
            <div className="text-[10px] text-[var(--text-muted)]">
              ID: {lead?.id?.slice(0, 8)}...
            </div>
          </footer>
        </dialog>
      </div>

      {/* Activity Logger Modal */}
      {showActivityModal && pendingStageChange && (
        <ActivityLoggerModal
          isOpen={showActivityModal}
          onClose={() => {
            setShowActivityModal(false)
            setPendingStageChange(null)
          }}
          onSave={handleActivitySave}
          leadName={currentLead.name || 'Lead'}
          stageChange={{
            oldStage: pendingStageChange.oldStage,
            newStage: pendingStageChange.newStage
          }}
        />
      )}

      {/* ── MERGE DIALOG ──────────────────────────────────────────────── */}
      {showMergeDialog && currentLead && (() => {
        const currentScore = currentLead.lead_score ?? 0
        // Compute who'd win/lose based on the selected target
        let willKeep: typeof mergeSelected | null = null
        let willDelete: typeof mergeSelected | null = null
        if (mergeSelected) {
          const otherScore = mergeSelected.lead_score ?? 0
          const currentAsCand = {
            id: String(currentLead.id),
            customer_name: currentLead.name || null,
            phone: currentLead.phone || null,
            email: currentLead.email || null,
            lead_score: currentScore,
          }
          if (currentScore >= otherScore) {
            willKeep = currentAsCand
            willDelete = mergeSelected
          } else {
            willKeep = mergeSelected
            willDelete = currentAsCand
          }
        }

        async function runSearch(q: string) {
          setMergeQuery(q)
          if (!q || q.trim().length < 2) {
            setMergeCandidates([])
            return
          }
          setMergeSearchLoading(true)
          try {
            const r = await fetch(`/api/dashboard/leads?search=${encodeURIComponent(q.trim())}&limit=20`, {
              credentials: 'include',
            })
            const data = await r.json().catch(() => ({}))
            const list = (data?.leads || data?.data || data || []) as Array<any>
            // Exclude the current lead from results
            setMergeCandidates(
              list
                .filter((l) => String(l.id) !== String(currentLead.id))
                .map((l) => ({
                  id: l.id,
                  customer_name: l.customer_name || null,
                  phone: l.phone || null,
                  email: l.email || null,
                  lead_score: l.lead_score ?? null,
                }))
                .slice(0, 10),
            )
          } catch (err) {
            console.error('Merge search failed:', err)
            setMergeCandidates([])
          } finally {
            setMergeSearchLoading(false)
          }
        }

        async function doMerge() {
          if (!mergeSelected) return
          setMerging(true)
          try {
            const r = await fetch(`/api/dashboard/leads/${currentLead.id}/merge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ other_lead_id: mergeSelected.id }),
            })
            const data = await r.json().catch(() => ({}))
            if (!r.ok || !data?.success) {
              console.error('Merge failed:', data)
              alert(`Merge failed: ${data?.error || r.statusText}`)
              return
            }
            // After merge: close the modal and reload — the loser is gone,
            // so the dashboard needs to refetch the leads list.
            setShowMergeDialog(false)
            onClose()
            window.location.reload()
          } catch (err: any) {
            console.error('Merge exception:', err)
            alert(`Merge exception: ${err?.message || err}`)
          } finally {
            setMerging(false)
          }
        }

        return (
          <>
            <div
              className="fixed inset-0 z-[100]"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
              onClick={() => !merging && setShowMergeDialog(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-label="Merge leads"
              className="fixed z-[101] rounded-xl border shadow-2xl flex flex-col"
              style={{
                top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: 'min(520px, 94vw)', maxHeight: '80vh',
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                <div>
                  <div className="text-sm font-semibold">Merge with another lead</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Higher-score lead wins. Other lead will be permanently deleted.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !merging && setShowMergeDialog(false)}
                  className="p-1 rounded hover:opacity-80"
                  disabled={merging}
                  aria-label="Cancel"
                >
                  <MdClose size={16} />
                </button>
              </div>

              <div className="p-4 space-y-3 overflow-y-auto">
                {/* Search input */}
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>
                    Find the other lead (name, phone, or email)
                  </label>
                  <input
                    type="text"
                    value={mergeQuery}
                    onChange={(e) => runSearch(e.target.value)}
                    placeholder="Type at least 2 characters…"
                    className="w-full text-sm px-3 py-2 rounded border outline-none focus:ring-1"
                    style={{
                      background: 'var(--bg-primary)',
                      borderColor: 'var(--border-primary)',
                      color: 'var(--text-primary)',
                    }}
                    autoFocus
                    disabled={merging}
                  />
                </div>

                {/* Results */}
                {mergeSearchLoading && (
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Searching…</div>
                )}
                {!mergeSearchLoading && mergeQuery.trim().length >= 2 && mergeCandidates.length === 0 && (
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No matches.</div>
                )}
                {mergeCandidates.length > 0 && !mergeSelected && (
                  <ul className="space-y-1">
                    {mergeCandidates.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setMergeSelected(c)}
                          className="w-full text-left p-2 rounded-md border hover:opacity-90 transition flex items-center gap-2"
                          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-semibold truncate">
                              {c.customer_name || c.phone || c.email || c.id.slice(0, 8)}
                            </div>
                            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              {c.phone || '—'}{c.email ? ` · ${c.email}` : ''} · score {c.lead_score ?? '—'}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Confirm panel */}
                {mergeSelected && willKeep && willDelete && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Confirm merge
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <article className="p-3 rounded-lg border" style={{ background: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.45)' }}>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mb-1">Keep</div>
                        <div className="text-[12px] font-semibold truncate">{willKeep.customer_name || willKeep.phone || '—'}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {willKeep.phone || '—'} · score {willKeep.lead_score ?? '—'}
                        </div>
                      </article>
                      <article className="p-3 rounded-lg border" style={{ background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.45)' }}>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-red-400 mb-1">Delete</div>
                        <div className="text-[12px] font-semibold truncate">{willDelete.customer_name || willDelete.phone || '—'}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {willDelete.phone || '—'} · score {willDelete.lead_score ?? '—'}
                        </div>
                      </article>
                    </div>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      All conversations, tasks, and activities from the deleted lead will move to the kept one.
                      The deleted lead row is removed permanently.
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setMergeSelected(null)}
                        className="px-3 py-1.5 text-[12px] rounded border hover:opacity-80"
                        style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
                        disabled={merging}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={doMerge}
                        className="px-3 py-1.5 text-[12px] rounded font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        style={{ background: '#dc2626' }}
                        disabled={merging}
                      >
                        {merging ? 'Merging…' : 'Confirm merge'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )
      })()}
    </>
  )
}
