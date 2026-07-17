'use client'

import { useEffect, useState, useMemo, type CSSProperties } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { formatDateTime } from '@/lib/utils'
import { useRealtimeLeads } from '@/hooks/useRealtimeLeads'
import LeadDetailsModal from './LeadDetailsModal'
import AddLeadModal from './AddLeadModal'
import type { Lead } from '@/types'
import { calculateLeadScore } from '@/lib/leadScoreCalculator'
import { getCurrentBrandId, brandConfig, brandLabel } from '@/configs'
import { COURSE_OPTIONS, normalizeCourse } from '@/configs/courses'
import { CONSTITUENCIES, normName as normSeat } from '@/lib/war-room/constituencies'
import {
  MdLanguage,
  MdChat,
  MdCall,
  MdPerson,
  MdChevronRight,
  MdHistory,
  MdAccessTime,
  MdOutlineInsights,
  MdTrendingUp,
  MdTrendingDown,
  MdRemove,
  MdSearch,
  MdAdd,
} from 'react-icons/md'
import { createClient } from '@/lib/supabase/client'
import { FaWhatsapp } from 'react-icons/fa'
import { LEAD_STAGES, getStageColor as getStageColorShared, pipelineGroupForStage } from '@/configs/lead-stages'

// The legacy `status` taxonomy (New Lead / Follow Up / Wrong Enquiry…) is DEAD
// — the column is null on every lead. The filter below now filters the STAGE
// column, using the one canonical list from @/configs/lead-stages.

const getStageColor = (stage: string | null) => {
  return getStageColorShared(stage)
}

// Scouts have their OWN lifecycle - they don't run brand/owner follow-up
// sequences, so the STAGE column shows the scout's actual progress derived from
// the latest scout_event PROXe received (logged in -> KYC -> submitting -> active),
// not a generic lead stage.
const SCOUT_STAGE_BY_EVENT: Record<string, string> = {
  signup: 'Logged in',
  kyc_submitted: 'KYC started',
  kyc_verified: 'KYC done',
  upi_added: 'UPI added',
  // A scout who is submitting shops IS an active scout - no separate "submitting"
  // stage. Each photo submission still fires its own message (scout_submission_
  // received); it just doesn't create a new stage. Payout keeps them Active too.
  submission: 'Active',
  payout: 'Active',
}
const scoutStageLabel = (lkz: any): string => {
  const ev = String(lkz?.scout_event || '').toLowerCase()
  if (SCOUT_STAGE_BY_EVENT[ev]) return SCOUT_STAGE_BY_EVENT[ev]
  if (String(lkz?.kyc_status || '').toLowerCase() === 'verified') return 'KYC done'
  return 'Logged in'
}
// Colour by progression so the funnel is glanceable: grey (just in) -> amber
// (KYC in progress) -> green (KYC done) -> teal (payout-ready) -> blue
// (submitting) -> emerald (fully active).
const SCOUT_STAGE_STYLE: Record<string, CSSProperties> = {
  'Logged in': { backgroundColor: 'rgba(107,114,128,0.18)', color: '#9ca3af' },
  'KYC started': { backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  'KYC done': { backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' },
  'UPI added': { backgroundColor: 'rgba(20,184,166,0.15)', color: '#14b8a6' },
  'Active': { backgroundColor: 'rgba(16,185,129,0.2)', color: '#10b981' },
}
const scoutStageStyleFor = (stage: string): CSSProperties =>
  SCOUT_STAGE_STYLE[stage] || SCOUT_STAGE_STYLE['Logged in']

const getScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return 'var(--text-secondary)'
  if (score >= 70) return '#22C55E'
  if (score >= 40) return '#F59E0B'
  return '#EF4444'
}

// ── POP (Pulse of Punjab) constituent display config ────────────────────────
// Pop reskins the leads table into an electoral/grievance view. These maps drive
// the pop-only columns (lean / grievance / intent / channel / loop). Brand-gated
// at the render site, so no other brand is affected.
const POP_LEAN: Record<string, { label: string; color: string }> = {
  supporter: { label: 'Supporter', color: '#22C55E' },
  leaning:   { label: 'Leaning',   color: '#84CC16' },
  undecided: { label: 'Undecided', color: '#F59E0B' },
  opposed:   { label: 'Opposed',   color: '#EF4444' },
}
// Clean minimal category pills - a colored dot + label, no emoji glyphs.
const POP_GRIEVANCE: Record<string, { label: string; color: string }> = {
  jobs:      { label: 'Jobs',      color: '#3B82F6' },
  water:     { label: 'Water',     color: '#06B6D4' },
  power:     { label: 'Power',     color: '#F59E0B' },
  roads:     { label: 'Roads',     color: '#A78BFA' },
  drugs:     { label: 'Drugs',     color: '#EC4899' },
  farm_debt: { label: 'Farm Debt', color: '#F97316' },
  health:    { label: 'Health',    color: '#EF4444' },
  education: { label: 'Education', color: '#8B5CF6' },
  other:     { label: 'Other',     color: '#6B7280' },
}
const POP_INTENT: Record<string, { label: string; color: string }> = {
  vote:      { label: 'Vote',      color: '#22C55E' },
  volunteer: { label: 'Volunteer', color: '#3B82F6' },
  rally:     { label: 'Rally',     color: '#F97316' },
  share:     { label: 'Share',     color: '#A78BFA' },
  none:      { label: '-',         color: '#6B7280' },
}
const POP_LOOP: Record<string, { label: string; color: string }> = {
  raised:   { label: 'Raised',   color: '#F59E0B' },
  routed:   { label: 'Routed',   color: '#3B82F6' },
  resolved: { label: 'Resolved', color: '#22C55E' },
}
// WHY the person engaged (migration 023). Grievance is the column default so
// it only gets a badge when a real grievance exists - the others always show.
const POP_ENGAGEMENT: Record<string, { label: string; color: string }> = {
  grievance: { label: 'Grievance', color: '#F59E0B' },
  support:   { label: 'Support',   color: '#22C55E' },
  volunteer: { label: 'Volunteer', color: '#3B82F6' },
  event:     { label: 'Event',     color: '#A855F7' },
  info:      { label: 'Info',      color: '#06B6D4' },
  outreach:  { label: 'Outreach',  color: '#F97316' },
}
// HOW they came in - the real acquisition channel (magnet, migration 022/023),
// far more meaningful for a campaign than generic marketing "source" (Direct).
const POP_MAGNET: Record<string, { label: string; color: string }> = {
  whatsapp:    { label: 'WhatsApp',   color: '#22C55E' },
  voice:       { label: 'Voice',      color: '#8B5CF6' },
  pulse_app:   { label: 'My Voice',   color: '#A78BFA' },
  qr:          { label: 'QR Scan',    color: '#F06C18' },
  missed_call: { label: 'Missed Call',color: '#F59E0B' },
  d2d:         { label: 'Door to Door', color: '#FB7185' },
  event:       { label: 'Event',      color: '#2EC4B6' },
  landing:     { label: 'Landing',    color: '#6EA5D4' },
}
// WHO they are on the intensity ladder - the "type" a director scans for.
const POP_TIER: Record<number, { label: string; color: string }> = {
  0: { label: 'Contact',   color: '#7A8AA0' },
  1: { label: 'Voter',     color: '#3B82F6' },
  2: { label: 'Supporter', color: '#22C55E' },
  3: { label: 'Volunteer', color: '#F59E0B' },
  4: { label: 'Cadre',     color: '#F06C18' },
}
// AC number lookup (numbered constituency chip) + a stable per-district color so
// every row from the same district reads the same hue. Built from the war-room
// reference (117 ECI seats). Hash→hue gives a deterministic mid-tone that works
// on both light and dark.
const POP_AC_BY_NAME = new Map(CONSTITUENCIES.map((c) => [normSeat(c.name), c]))
function popDistrictColor(d: string): string {
  let h = 0
  for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) % 360
  return `hsl(${h}, 60%, 52%)`
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths}mo ago`
}

/**
 * Format a stored booking time to a 12-hour display string. Bookings are stored
 * in TWO formats - 24h "HH:MM" (web flow, e.g. "17:00") and 12h "H:MM AM/PM"
 * (WhatsApp flow, e.g. "3:00 PM"). The old inline parser split on ":" and read
 * the hour as 24h, so "3:00 PM" → hour 3 → "3:00 AM" (PM silently dropped).
 * This handles both: keep an explicit AM/PM, otherwise convert from 24h.
 */
function formatBookingTime(raw: unknown): string {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  // Already 12-hour with an explicit period - normalise and keep it.
  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i)
  if (ampm) {
    const h = parseInt(ampm[1], 10)
    const mins = ampm[2] || '00'
    return `${h % 12 || 12}:${mins} ${ampm[3].toUpperCase()}M`
  }
  // 24-hour "HH:MM".
  const tp = s.split(':')
  if (tp.length < 2) return s
  const h = parseInt(tp[0], 10)
  const m = parseInt(tp[1], 10)
  if (isNaN(h) || isNaN(m)) return s
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

// Using Lead type from @/types to match LeadDetailsModal expectations
type ExtendedLead = Lead & {
  first_touchpoint?: string | null
  last_touchpoint?: string | null
  brand?: string | null
  last_interaction_at?: string | null
  unified_context?: any
  lead_score?: number | null
  lead_stage?: string | null
  sub_stage?: string | null
  stage_override?: boolean | null
  booking_date?: string | null
  booking_time?: string | null
}

interface LeadsTableProps {
  limit?: number
  sourceFilter?: string
  hideFilters?: boolean
  showLimitSelector?: boolean
  showViewAll?: boolean
  /** Scouts feature only: lock the user-type filter (e.g. 'scout') and hide the dropdown that would otherwise let it be changed. */
  initialUserTypeFilter?: string
  hideUserTypeFilter?: boolean
  /** Overrides the header label (defaults to "Leads" / "Engaged Leads" / "Warm Leads"). */
  title?: string
}

// Synthetic account ids / placeholder emails the owner & scout apps stamp before
// a real name/email exists - e.g. "owner_9341333999_1783481293327@noemail.lokazen.in".
// These are internal ids, never a person's contact, so they must never render as
// the lead's name OR email. Mirrors cleanName() in api/agent/leads/inbound.
function isSyntheticContact(v?: string | null): boolean {
  const t = (v || '').trim()
  if (!t) return false
  return /@noemail\.|noreply|no-reply|placeholder/i.test(t) ||
    /^(owner|brand|scout|connector|lead|user|customer)_\d/i.test(t)
}
const NAME_PLACEHOLDER_TOKENS = new Set([
  'property', 'owner', 'brand', 'scout', 'connector', 'lead', 'customer',
  'test', 'n/a', 'na', 'none', 'unknown', 'undefined', 'null',
])
function realName(v?: string | null): string {
  const t = (v || '').trim()
  if (!t || isSyntheticContact(t)) return ''
  return t.toLowerCase().split(/\s+/).every((w) => NAME_PLACEHOLDER_TOKENS.has(w)) ? '' : t
}
function realEmail(v?: string | null): string {
  const t = (v || '').trim()
  return !t || isSyntheticContact(t) ? '' : t
}

export default function LeadsTable({
  limit: initialLimit,
  sourceFilter: initialSourceFilter,
  hideFilters = false,
  showLimitSelector = false,
  showViewAll = false,
  initialUserTypeFilter,
  hideUserTypeFilter = false,
  title,
}: LeadsTableProps) {
  const { leads, loading, error } = useRealtimeLeads()
  const brandId = getCurrentBrandId()
  const showAviationColumns = brandId === 'windchasers'
  // Webinar segment (windchasers): registrants are tagged
  // unified_context.windchasers.lead_type='webinar' at intake. They get their
  // own tab so webinar volume never floods the main Leads list.
  const showWebinarTab = brandId === 'windchasers'
  // Gigs = lokazen's non-lead worker segment. Scout + Connector are its types;
  // both are kept out of the sales Leads view and counts. The Gigs page filters
  // to the 'gig' umbrella (scout OR connector).
  const GIG_TYPES = ['scout', 'connector']
  // Scout segment - gated by the brand's features.scouts toggle (lokazen) so
  // scout UI never leaks into brands that don't run scouts.
  const showScouts = Boolean(brandConfig.features?.scouts)
  // Leads | Gigs toggle (lokazen): gigs (scout/connector) sit INSIDE the Leads
  // page as a segment switch, mirroring windchasers' Leads | Webinar tab. Only
  // on the main leads page — the locked /dashboard/scouts page (which passes
  // initialUserTypeFilter) already forces gigs, so it hides the toggle.
  const showGigsTab = showScouts && !initialUserTypeFilter
  const searchParams = useSearchParams()
  const [filteredLeads, setFilteredLeads] = useState<ExtendedLead[]>([])
  const [calculatedScores, setCalculatedScores] = useState<Record<string, number>>({})
  const [calculatingScores, setCalculatingScores] = useState(false)
  const [scoreTrends, setScoreTrends] = useState<Record<string, { prev: number; diff: number }>>({})

  // Preset filter from URL: ?filter=engaged | warm
  const presetFilter = searchParams.get('filter') || 'all'

  // Pipeline deep link: ?stage=<db value> filters to that stage's WHOLE
  // pipeline group (Qualified + High Intent, all lost values…) so the list
  // matches the funnel count. ?stageLabel= names the removable chip (the
  // pipeline passes its display name, incl. a renamed key event).
  const stageParam = searchParams.get('stage')
  const stageLabelParam = searchParams.get('stageLabel')
  const [urlStageActive, setUrlStageActive] = useState(true)

  const [dateFilter, setDateFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>(initialSourceFilter || 'all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [userTypeFilter, setUserTypeFilter] = useState<string>(initialUserTypeFilter || 'all')
  const [courseInterestFilter, setCourseInterestFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [scoreFilter, setScoreFilter] = useState<string>('all')
  const [webinarView, setWebinarView] = useState(false)
  const [gigsView, setGigsView] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [limit, setLimit] = useState<number>(initialLimit || 100)

  // Scout VIEW = the scouts feature is on AND the table is filtered to scouts
  // (either via the dropdown or the locked initialUserTypeFilter on /dashboard/scouts).
  // Swaps the brand/owner columns for scout-specific ones.
  const scoutView = showScouts && (userTypeFilter === 'scout' || userTypeFilter === 'gig' || (showGigsTab && gigsView))

  useEffect(() => {
    if (initialLimit) {
      setLimit(initialLimit)
    }
  }, [initialLimit])

  useEffect(() => {
    let filtered = [...leads]

    // Apply preset filter from URL (?filter=engaged or ?filter=warm)
    if (presetFilter === 'engaged') {
      const engagedStages = ['Engaged', 'Qualified', 'High Intent', 'Booking Made', 'Closed Won']
      filtered = filtered.filter((lead) => {
        if (engagedStages.includes(lead.lead_stage || '')) return true
        const bookingDate = lead.booking_date ||
          lead.unified_context?.web?.booking_date ||
          lead.unified_context?.whatsapp?.booking_date
        if (bookingDate) return true
        return false
      })
    } else if (presetFilter === 'warm') {
      filtered = filtered.filter((lead) => {
        const score = calculatedScores[lead.id] !== undefined ? calculatedScores[lead.id] : (lead.lead_score ?? 0)
        return score >= 40 && score < 70
      })
    }

    if (dateFilter !== 'all') {
      const now = new Date()
      const filterDate = new Date()
      if (dateFilter === 'today') {
        filterDate.setHours(0, 0, 0, 0)
        filtered = filtered.filter((lead) => {
          const dateToCheck = lead.last_interaction_at || lead.timestamp
          return new Date(dateToCheck) >= filterDate
        })
      } else if (dateFilter === 'week') {
        filterDate.setDate(now.getDate() - 7)
        filtered = filtered.filter((lead) => {
          const dateToCheck = lead.last_interaction_at || lead.timestamp
          return new Date(dateToCheck) >= filterDate
        })
      } else if (dateFilter === 'month') {
        filterDate.setMonth(now.getMonth() - 1)
        filtered = filtered.filter((lead) => {
          const dateToCheck = lead.last_interaction_at || lead.timestamp
          return new Date(dateToCheck) >= filterDate
        })
      }
    }

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(
        (lead) =>
          lead.first_touchpoint === sourceFilter ||
          lead.last_touchpoint === sourceFilter
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((lead) => (lead.lead_stage || 'New') === statusFilter)
    } else if (stageParam && urlStageActive) {
      const group = pipelineGroupForStage(stageParam)
      const vals = group ? group.values : [stageParam]
      filtered = filtered.filter((lead) => vals.includes(lead.lead_stage || ''))
    }

    if (userTypeFilter !== 'all') {
      filtered = filtered.filter((lead) => {
        const brandData = lead.unified_context?.[brandId] || {}
        if (showScouts) {
          const normalizedUserType = brandData.user_type === 'property_owner'
            ? 'owner'
            : (brandData.user_type || brandData.business_type)
          // 'gig' = the Gigs umbrella (scout OR connector).
          if (userTypeFilter === 'gig') return GIG_TYPES.includes(normalizedUserType)
          return normalizedUserType === userTypeFilter
        }
        return (brandData.user_type || brandData.business_type) === userTypeFilter
      })
    } else if (showScouts) {
      // Gigs segment: the Gigs tab shows ONLY gig workers (scout/connector); the
      // Leads view excludes them. The toggle drives it on the main leads page;
      // where the toggle isn't shown (the locked scouts page), default to
      // excluding gigs — that page filters to gigs via userTypeFilter above.
      filtered = filtered.filter((lead) => {
        const brandData = lead.unified_context?.[brandId] || {}
        const isGig = GIG_TYPES.includes(brandData.user_type)
        return (showGigsTab && gigsView) ? isGig : !isGig
      })
    }

    // Webinar segment (windchasers): the Webinar tab shows ONLY registrants;
    // the default Leads view excludes them. Orthogonal to the student/parent
    // user-type filter, which still applies within either view.
    if (showWebinarTab) {
      filtered = filtered.filter((lead) => {
        const isWebinar = lead.unified_context?.[brandId]?.lead_type === 'webinar'
        return webinarView ? isWebinar : !isWebinar
      })
    }

    if (courseInterestFilter !== 'all') {
      filtered = filtered.filter((lead) => {
        const brandData = lead.unified_context?.[brandId] || {}
        return normalizeCourse(brandData.course_interest) === courseInterestFilter
      })
    }

    // Score filter (use calculated scores when available, fallback to DB score)
    if (scoreFilter !== 'all') {
      const minScore = scoreFilter === '50' ? 50 : scoreFilter === '70' ? 70 : scoreFilter === 'hot' ? 80 : 0
      filtered = filtered.filter((lead) => {
        const score = calculatedScores[lead.id] !== undefined ? calculatedScores[lead.id] : (lead.lead_score ?? 0)
        return score >= minScore
      })
    }

    // Search filter (client-side, across name, brand, email, phone)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((lead) => {
        const uc = lead.unified_context || {}
        const name = (
          uc?.whatsapp?.profile?.full_name ||
          uc?.web?.profile?.full_name ||
          lead.name || ''
        ).toLowerCase()
        const brand = (
          uc?.web?.what_is_your_brand_name ||
          uc?.whatsapp?.what_is_your_brand_name ||
          uc?.whatsapp?.profile?.company ||
          uc?.web?.profile?.company || ''
        ).toLowerCase()
        const email = (lead.email || '').toLowerCase()
        const phone = (lead.phone || '').toLowerCase()
        return name.includes(q) || brand.includes(q) || email.includes(q) || phone.includes(q)
      })
    }

    if (limit) {
      filtered = filtered.slice(0, limit)
    }

    setFilteredLeads(filtered as ExtendedLead[])
  }, [leads, dateFilter, sourceFilter, statusFilter, userTypeFilter, courseInterestFilter, scoreFilter, searchQuery, limit, presetFilter, stageParam, urlStageActive, calculatedScores, webinarView, gigsView, showGigsTab])

  useEffect(() => {
    if (filteredLeads.length === 0) return

    const fetchTrends = async () => {
      try {
        const supabase = createClient()
        const leadIds = filteredLeads.slice(0, 250).map(l => l.id)

        const { data: changes } = await supabase
          .from('lead_stage_changes')
          .select('lead_id, old_score, new_score, created_at')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false })

        if (changes && changes.length > 0) {
          const trends: Record<string, { prev: number; diff: number }> = {}
          for (const change of changes) {
            if (!trends[change.lead_id] && change.old_score !== null && change.new_score !== null) {
              trends[change.lead_id] = {
                prev: change.old_score,
                diff: change.new_score - change.old_score,
              }
            }
          }
          setScoreTrends(trends)
        }
      } catch (err) {
        console.error('Error fetching score trends:', err)
      }
    }

    fetchTrends()
  }, [filteredLeads])

  useEffect(() => {
    if (leads.length === 0) return

    setCalculatingScores(true)
    const calculateScores = async () => {
      const scores: Record<string, number> = {}

      await Promise.all(
        leads.map(async (lead) => {
          try {
            const result = await calculateLeadScore(lead as Lead)
            scores[lead.id] = result.score
          } catch (err) {
            console.error(`Error calculating score for lead ${lead.id}:`, err)
            scores[lead.id] = lead.lead_score ?? 0
          }
        })
      )

      setCalculatedScores(scores)
      setCalculatingScores(false)
    }

    calculateScores()
  }, [leads])

  const handleRowClick = (lead: ExtendedLead) => {
    const modalLead: Lead = {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      source: lead.source || lead.first_touchpoint || null,
      first_touchpoint: lead.first_touchpoint || null,
      last_touchpoint: lead.last_touchpoint || null,
      timestamp: lead.timestamp,
      status: lead.status || null,
      booking_date: lead.booking_date || null,
      booking_time: lead.booking_time || null,
      metadata: lead.metadata,
      unified_context: lead.unified_context,
    }
    setSelectedLead(modalLead)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedLead(null)
  }

  const updateLeadStatus = async (leadId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/dashboard/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update status')
      }

      setFilteredLeads((prev) =>
        prev.map((lead) =>
          lead.id === leadId ? { ...lead, status: newStatus } : lead
        )
      )

      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead({ ...selectedLead, status: newStatus || null })
      }
    } catch (err) {
      console.error('Error updating status:', err)
      throw err
    }
  }

  const exportToCSV = () => {
    const headers = showAviationColumns
      ? ['Name', 'Email', 'Phone', 'First Touch', 'User Type', 'Course Interest', 'Timeline', 'Score', 'Stage', 'Key Event']
      : ['Name', 'Email', 'Phone', 'First Touch', 'Interest', 'Timeline', 'Score', 'Stage', 'Key Event']
    const rows = filteredLeads.map((lead) => {
      const bookingDate = lead.booking_date ||
        lead.unified_context?.web?.booking_date ||
        lead.unified_context?.web?.booking?.date ||
        lead.unified_context?.whatsapp?.booking_date ||
        lead.unified_context?.whatsapp?.booking?.date ||
        lead.unified_context?.voice?.booking_date ||
        lead.unified_context?.voice?.booking?.date ||
        lead.unified_context?.social?.booking_date ||
        lead.unified_context?.social?.booking?.date;
      const bookingTime = lead.booking_time ||
        lead.unified_context?.web?.booking_time ||
        lead.unified_context?.web?.booking?.time ||
        lead.unified_context?.whatsapp?.booking_time ||
        lead.unified_context?.whatsapp?.booking?.time ||
        lead.unified_context?.voice?.booking_time ||
        lead.unified_context?.voice?.booking?.time ||
        lead.unified_context?.social?.booking_time ||
        lead.unified_context?.social?.booking?.time;
      const keyEvent = bookingDate && bookingTime
        ? `${formatDateTime(bookingDate).split(',')[0]}, ${formatBookingTime(bookingTime)}`
        : bookingDate
          ? formatDateTime(bookingDate).split(',')[0]
          : bookingTime || '';
      const score = lead.lead_score ?? (lead as any).leadScore ?? (lead as any).score ?? null
      const stage = lead.lead_stage ?? (lead as any).leadStage ?? (lead as any).stage ?? null
      const brandData = lead.unified_context?.[brandId] || {}
      const userType = brandData.user_type || brandData.business_type || ''
      const courseInterest = brandData.course_interest || ''
      const timeline = brandData.plan_to_fly || brandData.timeline || ''
      const interest = brandData.pain_point || brandData.course_interest || ''
      if (showAviationColumns) {
        return [
          lead.name || '',
          lead.email || '',
          lead.phone || '',
          lead.first_touchpoint || lead.source || '',
          userType,
          courseInterest,
          timeline,
          score !== null && score !== undefined ? score.toString() : '',
          stage || '',
          keyEvent || '',
        ]
      }
      return [
        lead.name || '',
        lead.email || '',
        lead.phone || '',
        lead.first_touchpoint || lead.source || '',
        interest,
        timeline,
        score !== null && score !== undefined ? score.toString() : '',
        stage || '',
        keyEvent || '',
      ]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${new Date().toISOString()}.csv`
    a.click()
  }

  // Filter select style - compact Vercel-like
  const filterClass = "px-2.5 py-1 text-xs border rounded-md appearance-none cursor-pointer"
  const filterStyle: CSSProperties = {
    borderColor: 'var(--border-primary)',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Loading leads...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12 text-sm text-red-500">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="leads-table flex flex-col flex-1 overflow-hidden">
      {/* Header row: LEFT = title + count + score filters, RIGHT = search + dropdowns + actions */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border-primary)' }}>
        {/* LEFT: Title + count + score filters */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {gigsView ? 'Gigs' : webinarView ? 'Webinar' : (showWebinarTab && courseInterestFilter === 'Cabin Crew') ? 'Cabin Crew' : title || (() => { const noun = brandId === 'pop' ? 'People' : 'Leads'; return presetFilter === 'engaged' ? `Engaged ${noun}` : presetFilter === 'warm' ? `Warm ${noun}` : noun })()}
          </h2>
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {filteredLeads.length}{leads.length !== filteredLeads.length ? ` / ${leads.length}` : ''}
          </span>

          {/* Leads | Cabin Crew | Webinar segment (windchasers). Cabin Crew reuses
             the courseInterestFilter so it stays in sync with the course dropdown;
             the live Google-Ads /cabin-crew campaign floods the list, so a
             one-click segment keeps those leads findable. */}
          {showWebinarTab && (
            <div role="tablist" aria-label="Leads, Cabin Crew or Webinar" className="flex items-center rounded-md border overflow-hidden ml-1" style={{ borderColor: 'var(--border-primary)' }}>
              {([
                { label: 'Leads', selected: !webinarView && courseInterestFilter !== 'Cabin Crew', onSelect: () => { setWebinarView(false); setCourseInterestFilter('all') } },
                { label: 'Cabin Crew', selected: !webinarView && courseInterestFilter === 'Cabin Crew', onSelect: () => { setWebinarView(false); setCourseInterestFilter('Cabin Crew') } },
                { label: 'Webinar', selected: webinarView, onSelect: () => { setWebinarView(true); setCourseInterestFilter('all') } },
              ] as const).map((t) => (
                <button
                  key={t.label}
                  role="tab"
                  aria-selected={t.selected}
                  onClick={t.onSelect}
                  className="px-2 py-0.5 text-xs font-medium transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: t.selected ? 'var(--button-bg)' : 'var(--bg-primary)',
                    color: t.selected ? 'var(--text-button)' : 'var(--text-secondary)',
                    borderRight: '1px solid var(--border-primary)',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Leads | Gigs tab (lokazen scouts) — same pattern as Webinar */}
          {showGigsTab && (
            <div role="tablist" aria-label="Leads or Gigs" className="flex items-center rounded-md border overflow-hidden ml-1" style={{ borderColor: 'var(--border-primary)' }}>
              {([{ key: false, label: 'Leads' }, { key: true, label: 'Gigs' }] as const).map((t) => (
                <button
                  key={t.label}
                  role="tab"
                  aria-selected={gigsView === t.key}
                  onClick={() => setGigsView(t.key)}
                  className="px-2 py-0.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: gigsView === t.key ? 'var(--button-bg)' : 'var(--bg-primary)',
                    color: gigsView === t.key ? 'var(--text-button)' : 'var(--text-secondary)',
                    borderRight: '1px solid var(--border-primary)',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {presetFilter !== 'all' && (
            <Link
              href="/dashboard/leads"
              className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-[var(--bg-hover)]"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            >
              Clear filter
            </Link>
          )}

          {/* Score quick filters */}
          <div className="flex items-center rounded-md border overflow-hidden ml-1" style={{ borderColor: 'var(--border-primary)' }}>
            {[
              { value: 'all', label: 'All' },
              { value: '50', label: '50+' },
              { value: '70', label: '70+' },
              { value: 'hot', label: 'Hot' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setScoreFilter(opt.value)}
                className="px-2 py-0.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: scoreFilter === opt.value ? 'var(--button-bg)' : 'var(--bg-primary)',
                  color: scoreFilter === opt.value ? 'var(--text-button)' : 'var(--text-secondary)',
                  borderRight: '1px solid var(--border-primary)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: Search + filters + actions */}
        <div className="flex items-center gap-2">
          {/* Search bar */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md border focus-within:ring-2 focus-within:ring-[var(--accent-primary)] transition-shadow"
            style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-primary)' }}
          >
            <MdSearch size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none focus:outline-none text-xs w-[120px]"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          {!hideFilters && (
            <>
              {/* Scouts feature: Brand vs Property Owner vs Scout is the primary filter - show it first. */}
              {showScouts && !hideUserTypeFilter && (
                <select value={userTypeFilter} onChange={(e) => setUserTypeFilter(e.target.value)} className={filterClass} style={filterStyle}>
                  <option value="all">All leads</option>
                  <option value="brand">Brands</option>
                  <option value="owner">Property owners</option>
                  <option value="scout">Scouts</option>
                  <option value="connector">Connectors</option>
                </select>
              )}

              <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={filterClass} style={filterStyle}>
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="week">7 days</option>
                <option value="month">30 days</option>
              </select>

              {!initialSourceFilter && (
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={filterClass} style={filterStyle}>
                  <option value="all">All sources</option>
                  <option value="web">Web</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="voice">Voice</option>
                  <option value="social">Social</option>
                  {brandId === 'pop' && (
                    <>
                      <option value="d2d">D2D (door-to-door)</option>
                      <option value="event">Event</option>
                      <option value="landing">Landing page</option>
                    </>
                  )}
                </select>
              )}
              {/* D2D coverage count - how many People arrived via the field campaign */}
              {brandId === 'pop' && (() => {
                const d2dCount = leads.filter((l) => (l.first_touchpoint || l.source) === 'd2d').length
                return d2dCount > 0 ? (
                  <button
                    onClick={() => setSourceFilter(sourceFilter === 'd2d' ? 'all' : 'd2d')}
                    className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                    style={{
                      border: `1px solid ${sourceFilter === 'd2d' ? '#F97316' : 'var(--border-primary)'}`,
                      color: '#F97316', backgroundColor: sourceFilter === 'd2d' ? '#F9731622' : 'transparent',
                    }}
                    title="People logged through the door-to-door campaign"
                  >
                    D2D · {d2dCount}
                  </button>
                ) : null
              })()}

              {/* Pipeline deep-link chip — active ?stage= group filter, one tap to clear. */}
              {stageParam && urlStageActive && statusFilter === 'all' && (
                <button
                  onClick={() => setUrlStageActive(false)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 18%, transparent)', color: 'var(--accent-primary)', border: 'none', cursor: 'pointer' }}
                  title="Clear the pipeline stage filter"
                >
                  {stageLabelParam || pipelineGroupForStage(stageParam)?.label || stageParam}
                  <span style={{ opacity: 0.6 }}>✕</span>
                </button>
              )}
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={filterClass} style={filterStyle}>
                <option value="all">All stages</option>
                {LEAD_STAGES.map((st) => (
                  <option key={st.value} value={st.value}>{st.label}</option>
                ))}
              </select>

              {showAviationColumns && (
                <select value={userTypeFilter} onChange={(e) => setUserTypeFilter(e.target.value)} className={filterClass} style={filterStyle}>
                  <option value="all">All types</option>
                  <option value="student">Student</option>
                  <option value="parent">Parent</option>
                  <option value="professional">Professional</option>
                </select>
              )}

              {showAviationColumns && (
                <select value={courseInterestFilter} onChange={(e) => setCourseInterestFilter(e.target.value)} className={filterClass} style={filterStyle}>
                  <option value="all">All courses</option>
                  {COURSE_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
            </>
          )}

          {showLimitSelector && (
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={filterClass} style={filterStyle}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={0}>All</option>
            </select>
          )}

          <button
            onClick={exportToCSV}
            className="px-2.5 py-1 text-xs font-medium border rounded-md transition-colors"
            style={{
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--bg-primary)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-primary)' }}
          >
            Export
          </button>

          {showViewAll && (
            <Link
              href="/dashboard/leads"
              className="px-2.5 py-1 text-xs font-medium rounded-md text-[var(--text-button)]"
              style={{ backgroundColor: 'var(--button-bg)' }}
            >
              View All
            </Link>
          )}

          {/* Add Lead - prominent + button, sits at the far right of the header */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 pl-2 pr-3 py-1.5 text-xs font-semibold rounded-md text-[var(--text-button)] shadow-sm transition-transform hover:scale-[1.04]"
            style={{ backgroundColor: 'var(--button-bg)' }}
            title={brandId === 'pop' ? 'Add a person' : 'Add a new lead'}
          >
            <MdAdd size={18} />
            {brandId === 'pop' ? 'Add Person' : 'Add Lead'}
          </button>
        </div>
      </div>

      {/* Table - min-h-0 lets this flex child shrink so it scrolls INTERNALLY
          (instead of the page scrolling), which is what makes the sticky <thead>
          actually stay put. Without min-h-0 the child grows to content height,
          the page scrolls, and the "sticky" header rides away with it. */}
      <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0 pb-6 safe-b">
        {/* Mobile: card list (below md) — same rows, tap opens the same
            LeadDetailsModal. The full table stays desktop-only. */}
        <div className="md:hidden">
          {filteredLeads.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              {loading ? 'Loading...' : 'No leads found'}
            </div>
          ) : (
            filteredLeads.map((lead) => {
              const calculatedScore = calculatedScores[lead.id]
              const score = calculatedScore !== undefined ? calculatedScore : (lead.lead_score ?? null)
              const stage = lead.lead_stage ?? (lead as any).leadStage ?? (lead as any).stage ?? null
              const displayStage = brandLabel(stage || 'New')
              const stageColor = getStageColor(stage || 'New')
              const uc = lead.unified_context || {}
              const resolvedName =
                realName(uc?.whatsapp?.profile?.full_name) ||
                realName(uc?.web?.profile?.full_name) ||
                realName(lead.name)
              const cleanEmail = realEmail(lead.email)
              const displayName = resolvedName || cleanEmail || lead.phone || '-'
              const lastActivity = lead.last_interaction_at || lead.timestamp
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => handleRowClick(lead)}
                  className="w-full text-left px-3 py-3 border-b flex flex-col gap-1.5"
                  style={{ borderColor: 'var(--border-primary)', background: 'transparent' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {displayName}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={stageColor.style}>
                      {displayStage}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {lead.phone && <span className="truncate">{lead.phone}</span>}
                    {score != null && <span className="flex-shrink-0">Score {score}</span>}
                    {lastActivity && (
                      <span className="ml-auto flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {formatDateTime(lastActivity)}
                      </span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
        {/* min-width so the many columns keep readable widths and the wrapper
            scrolls horizontally on small screens, instead of squishing (and
            clipping) every column to fit a phone. */}
        <table className="w-full hidden md:table" style={{ tableLayout: 'fixed', minWidth: 900 }}>
          {/* Same-line trailing comments inside <colgroup> leave whitespace
              text nodes React rejects as colgroup children (hydration warning)
              — keep comments on their own lines. */}
          {brandId === 'pop' ? (
            <colgroup>
              {/* POP constituent view - widths sum to 100%:
                  Constituent (name + captured) · Type (intensity tier) ·
                  Contact (phone) · Came in via (magnet) · Last Touch
                  (channel + actor) · Constituency (+ district·booth) ·
                  Grievance (category + salience + text) · Lean · Intent · Loop */}
              <col style={{ width: '13%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
          ) : (
          <colgroup>
            {/* Tightened column widths: Lead/Contact were oversized,
                Booking was a wide text column (now a compact chip),
                Type/Course are narrow chip columns.
                Order: Lead · Contact · Source (origin, immutable) ·
                Last Touch · Score · Stage · Active · Booking (chip) ·
                [aviation ×3] · [scout: Area Covered · Knows Properties] · Owner */}
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '11%' }} />
            {showAviationColumns && <col style={{ width: '7%' }} />}
            {showAviationColumns && <col style={{ width: '8%' }} />}
            {showAviationColumns && <col style={{ width: '8%' }} />}
            {webinarView && <col style={{ width: '11%' }} />}
            {scoutView && <col style={{ width: '9%' }} />}
            {scoutView && <col style={{ width: '8%' }} />}
            <col style={{ width: '9%' }} />
          </colgroup>
          )}
          <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
              {(brandId === 'pop'
                ? [
                    { label: 'Constituent',  align: 'left'   as const },
                    { label: 'Type',         align: 'center' as const },
                    { label: 'Contact',      align: 'left'   as const },
                    { label: 'Came in via',  align: 'center' as const },
                    { label: 'Last Touch',   align: 'center' as const },
                    { label: 'Constituency', align: 'left'   as const },
                    { label: 'Grievance',    align: 'left'   as const },
                    { label: 'Lean',         align: 'center' as const },
                    { label: 'Intent',       align: 'center' as const },
                    { label: 'Loop',         align: 'center' as const },
                  ]
                : [
                { label: 'Lead',       align: 'left'   as const },
                { label: 'Contact',    align: 'left'   as const },
                { label: 'Source',     align: 'center' as const },
                { label: 'Last Touch', align: 'center' as const },
                { label: 'Score',      align: 'center' as const },
                { label: 'Stage',      align: 'center' as const },
                { label: 'Active',     align: 'left'   as const },
                { label: scoutView ? 'Properties' : webinarView ? 'Zoom' : 'Booking', align: 'center' as const },
                ...(showAviationColumns ? [
                  { label: 'Type',   align: 'center' as const },
                  { label: 'Course', align: 'center' as const },
                  { label: 'PAT',    align: 'center' as const },
                ] : []),
                ...(webinarView ? [
                  { label: 'Webinar', align: 'center' as const },
                ] : []),
                ...(scoutView ? [
                  { label: 'Area Covered',     align: 'center' as const },
                  { label: 'Knows Properties', align: 'center' as const },
                ] : []),
                { label: 'Owner',  align: 'left' as const },
              ]).map(({ label, align }) => (
                <th
                  key={label}
                  className={`px-3 py-2.5 text-${align} text-[10px] font-semibold uppercase tracking-wider`}
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 ? (
              <tr>
                <td
                  colSpan={(showAviationColumns ? 12 : scoutView ? 11 : 9) + (webinarView ? 1 : 0)}
                  className="px-3 py-8 text-center text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {gigsView ? 'No gigs yet' : webinarView ? 'No webinar registrations yet' : brandId === 'pop' ? 'No constituents captured yet' : 'No leads found'}
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => {
                const calculatedScore = calculatedScores[lead.id]
                const score = calculatedScore !== undefined ? calculatedScore : (lead.lead_score ?? null)
                const stage = lead.lead_stage ?? (lead as any).leadStage ?? (lead as any).stage ?? null
                // brandLabel: voter brands (pop) rename sales stages for display
                // only - filtering/storage still use the raw lead_stage value.
                const displayStage = brandLabel(stage || 'New')
                const stageColor = getStageColor(stage || 'New')
                // SOURCE = the lead's ORIGIN (immutable). Read first_touchpoint
                // first - never the last_touchpoint, since that gets overwritten
                // by any later interaction (e.g. a logged call flips to 'voice').
                const source = (lead.first_touchpoint || lead.source || lead.last_touchpoint || 'unknown').toLowerCase()
                const lastTouch = (lead.last_touchpoint || '').toLowerCase()
                const lastActivity = lead.last_interaction_at || lead.timestamp

                const uc = lead.unified_context || {}
                const resolvedName =
                  realName(uc?.whatsapp?.profile?.full_name) ||
                  realName(uc?.web?.profile?.full_name) ||
                  realName(lead.name)
                const brandName =
                  uc?.web?.what_is_your_brand_name ||
                  uc?.whatsapp?.what_is_your_brand_name ||
                  uc?.whatsapp?.profile?.company ||
                  uc?.web?.profile?.company || ''
                // City - check every known location:
                //   brand-namespaced (set by inbound endpoint + AI extractor)
                //   channel profile blocks (legacy)
                //   raw_form_fields (from website form submissions)
                //   landing_page.city (from /api/integrations/landing-pages)
                const city =
                  uc?.[brandId]?.city ||
                  uc?.windchasers?.city ||
                  uc?.bcon?.city ||
                  uc?.whatsapp?.profile?.city ||
                  uc?.web?.profile?.city ||
                  uc?.raw_form_fields?.city ||
                  uc?.landing_page?.city ||
                  uc?.city ||                       // top-level (set by /api/agent/leads/inbound)
                  ''

                // If no real name, fall back to a REAL email, then phone - never a
                // synthetic @noemail id (that used to surface as the lead's "name").
                const cleanEmail = realEmail(lead.email)
                const displayName = resolvedName || cleanEmail || lead.phone || '-'
                const isEmailAsName = !resolvedName && !!cleanEmail

                // Scouts feature (lokazen): lead-type badge + scout lifecycle stage.
                const lkz = showScouts ? (uc?.[brandId] || {}) : {}
                const lkzUserType = lkz.user_type === 'property_owner' ? 'owner' : lkz.user_type
                const lkzType = showScouts
                  ? (lkzUserType === 'brand' ? 'Brand' : lkzUserType === 'owner' ? 'Owner' : lkzUserType === 'scout' ? 'Scout' : lkzUserType === 'connector' ? 'Connector' : '')
                  : ''
                // Scouts show their lifecycle stage (from scout_event), not a lead stage.
                const isScoutRow = showScouts && lkzUserType === 'scout'
                const rowStage = isScoutRow ? scoutStageLabel(lkz) : displayStage
                const rowStageStyle: CSSProperties = isScoutRow ? scoutStageStyleFor(rowStage) : (stageColor.style || {})
                // Scout's "area covered" is their single most useful field - dedupe
                // repeated zones ("Indiranagar, Indiranagar" -> "Indiranagar").
                const scoutLocation = isScoutRow
                  ? Array.from(new Set(String(lkz.scout_area_covered || '').split(',').map((z) => z.trim()).filter(Boolean))).join(', ')
                  : ''

                const bookingDate = lead.booking_date ||
                  uc?.web?.booking_date || uc?.web?.booking?.date ||
                  uc?.whatsapp?.booking_date || uc?.whatsapp?.booking?.date ||
                  uc?.voice?.booking_date || uc?.voice?.booking?.date ||
                  uc?.social?.booking_date || uc?.social?.booking?.date
                const bookingTime = lead.booking_time ||
                  uc?.web?.booking_time || uc?.web?.booking?.time ||
                  uc?.whatsapp?.booking_time || uc?.whatsapp?.booking?.time ||
                  uc?.voice?.booking_time || uc?.voice?.booking?.time ||
                  uc?.social?.booking_time || uc?.social?.booking?.time

                // SOURCE column = where the lead actually came from.
                //
                // TOP badge: prefer utm_source (Google / Meta / Instagram /
                //   YouTube / etc. - the ad platform that drove the visit)
                //   so a "Google ad → Web → PAT" lead reads as Google, not
                //   Web. Falls back to the channel medium (Web/WhatsApp/etc.)
                //   when no UTM is present (direct traffic, organic, etc.).
                //
                // SUB line: the specific entry point - usually form_type
                //   (PAT, Demo Booked, …). If form_type is missing we fall
                //   back to utm_medium (cpc, social, organic) so the line
                //   still tells you HOW they got here.

                // ── ATTRIBUTION (canonical) ────────────────────────────────
                // SOURCE column = the MARKETING SOURCE that drove the lead to us.
                // WhatsApp and Web are PLATFORMS (the surface they used to reach
                // out), not marketing sources, so they are explicitly rejected
                // from this column. A WA-Popup lead with channel='whatsapp' but
                // utm_source='ig' should show as Instagram, not WhatsApp.
                //
                // Priority chain (matches the server-side deriveSource logic):
                //   1. utm_source (explicit marketing tracking - gold signal)
                //   2. raw_form_fields.channel IF it's a marketing channel
                //      (ig / fb / facebook_ads / google_ads / etc.)
                //   3. attribution.source IF it's a marketing channel
                //   4. 'direct'
                //
                // Channels considered MARKETING (acceptable as source). Platform
                // values like 'whatsapp', 'web', 'voice' are NOT here.
                const MARKETING_CHANNELS = new Set([
                  'ig', 'instagram',
                  'fb', 'facebook', 'facebook_ads', 'fb_ads',
                  'meta', 'meta_ads', 'meta_forms_clickthrough',
                  'google', 'google_ads', 'googleads',
                  'bing', 'bing_ads',
                  'youtube', 'yt',
                  'linkedin', 'linkedin_ads',
                  'tiktok', 'tiktok_ads',
                  'twitter', 'x',
                  'snapchat', 'pinterest',
                  'email', 'newsletter',
                  'referral', 'organic',
                ])

                const attribution = uc?.attribution || null
                const rffChannel = String(uc?.raw_form_fields?.channel || '').toLowerCase().trim()
                const rffUtmSource = String(uc?.raw_form_fields?.utm_source || '').toLowerCase().trim()
                const attrSourceStored = String(attribution?.source || '').toLowerCase().trim()
                const attrSourceLabelStored = String(attribution?.source_label || '').trim()
                const attrFirstTouchKey = String(attribution?.first_touch || '').toLowerCase().trim()
                const attrFirstTouchLabel = String(attribution?.first_touch_label || '').trim()

                // attrSource = the EFFECTIVE source we'll surface on the SOURCE column.
                //   1) utm_source (gold), 2) marketing-channel value, 3) 'direct'
                const attrSource = (rffUtmSource && rffUtmSource !== 'direct')
                  ? rffUtmSource
                  : (rffChannel && MARKETING_CHANNELS.has(rffChannel))
                    ? rffChannel
                    : (attrSourceStored && MARKETING_CHANNELS.has(attrSourceStored))
                      ? attrSourceStored
                      : 'direct'
                // attrSourceLabel: only honour a STORED label when its STORED
                // source is also a marketing channel. Legacy rows from the
                // May-19→May-20 window have attribution.source='whatsapp' +
                // source_label='WhatsApp' baked in by the old deriveSource;
                // surfacing that label here would re-leak "WhatsApp" into the
                // SOURCE column even after we already filtered the platform
                // out of attrSource above.
                const attrSourceLabel =
                  attrSource === 'direct' &&
                  attrSourceStored &&
                  MARKETING_CHANNELS.has(attrSourceStored)
                    ? attrSourceLabelStored
                    : ''

                // Platform values that arrive as first_touchpoint but should
                // NEVER render as a source - they describe the surface the
                // lead used to message us, not the marketing source. When the
                // resolver falls all the way through to channelConfig[source]
                // and the source is one of these, show 'Direct' instead so
                // the SOURCE column stays accurate.
                const NON_MARKETING_PLATFORMS = new Set([
                  'whatsapp', 'web', 'form', 'voice', 'social',
                ])

                // utmSourceRaw drives the SOURCE pill - same priority chain.
                const utmSourceRaw = attrSource !== 'direct' ? attrSource : String(
                  uc?.web?.utm?.source ||
                  uc?.landing_page?.utm_source ||
                  ''
                ).trim().toLowerCase()
                const utmMediumRaw = String(
                  uc?.raw_form_fields?.utm_medium ||
                  uc?.web?.utm?.medium ||
                  uc?.landing_page?.utm_medium ||
                  ''
                ).trim().toLowerCase()

                // Channel-medium fallback (when no utm_source).
                const channelConfig: Record<string, { label: string; color: string }> = {
                  web: { label: 'Web', color: '#3B82F6' },
                  form: { label: 'Web', color: '#3B82F6' },
                  whatsapp: { label: 'WhatsApp', color: '#22C55E' },
                  voice: { label: 'Voice', color: '#8B5CF6' },
                  social: { label: 'Social', color: '#EC4899' },
                  facebook: { label: 'Facebook', color: '#1877F2' },
                  meta_forms: { label: 'Meta', color: '#1877F2' },
                  google: { label: 'Google', color: '#EA4335' },
                  ads: { label: 'Ads', color: '#F97316' },
                  pabbly: { label: 'Pabbly', color: '#F59E0B' },
                  referral: { label: 'Referral', color: '#10B981' },
                  organic: { label: 'Organic', color: '#84CC16' },
                  manual: { label: 'Manual', color: '#6B7280' },
                  d2d: { label: 'D2D', color: '#F97316' },
                  event: { label: 'Event', color: '#A855F7' },
                  landing: { label: 'Landing', color: '#3B82F6' },
                  unknown: { label: '-', color: '#6B7280' },
                }

                // Friendly label + color per known utm_source / channel.
                const utmSourceConfig: Record<string, { label: string; color: string }> = {
                  google: { label: 'Google Organic', color: '#EA4335' },
                  google_organic: { label: 'Google Organic', color: '#EA4335' },
                  google_ads: { label: 'Google Ads', color: '#A855F7' },
                  googleads: { label: 'Google Ads', color: '#A855F7' },
                  bing: { label: 'Bing', color: '#008373' },
                  bing_ads: { label: 'Bing Ads', color: '#008373' },
                  youtube: { label: 'YouTube', color: '#FF0000' },
                  yt: { label: 'YouTube', color: '#FF0000' },
                  meta: { label: 'Meta', color: '#1877F2' },
                  meta_ads: { label: 'Meta Ads', color: '#1877F2' },
                  meta_forms_clickthrough: { label: 'Meta Forms', color: '#1877F2' },
                  facebook: { label: 'Facebook', color: '#1877F2' },
                  facebook_ads: { label: 'Facebook Ads', color: '#1877F2' },
                  fb: { label: 'Facebook', color: '#1877F2' },
                  fb_ads: { label: 'Facebook Ads', color: '#1877F2' },
                  instagram: { label: 'Instagram', color: '#E4405F' },
                  ig: { label: 'Instagram', color: '#E4405F' },
                  linkedin: { label: 'LinkedIn', color: '#0A66C2' },
                  linkedin_ads: { label: 'LinkedIn Ads', color: '#0A66C2' },
                  twitter: { label: 'X', color: '#000000' },
                  x: { label: 'X', color: '#000000' },
                  tiktok: { label: 'TikTok', color: '#000000' },
                  tiktok_ads: { label: 'TikTok Ads', color: '#000000' },
                  whatsapp: { label: 'WhatsApp', color: '#22C55E' },
                  email: { label: 'Email', color: '#0EA5E9' },
                  newsletter: { label: 'Newsletter', color: '#0EA5E9' },
                  direct: { label: 'Direct', color: '#6B7280' },
                  organic: { label: 'Organic', color: '#84CC16' },
                  referral: { label: 'Referral', color: '#10B981' },
                }

                // Resolve the top badge:
                //   1. attribution.source_label (canonical, new leads)
                //   2. utm_source from raw_form_fields (legacy)
                //   3. Channel fallback
                let srcCfg: { label: string; color: string }
                if (utmSourceRaw && utmSourceConfig[utmSourceRaw]) {
                  srcCfg = utmSourceConfig[utmSourceRaw]
                  // Override label with the prettier server-side label if present
                  if (attrSourceLabel) srcCfg = { ...srcCfg, label: attrSourceLabel }
                } else if (attrSourceLabel) {
                  // Attribution present with an unmapped source - use the label as-is
                  srcCfg = { label: attrSourceLabel, color: '#6366F1' }
                } else if (utmSourceRaw) {
                  srcCfg = {
                    label: utmSourceRaw
                      .replace(/[_-]+/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase()),
                    color: '#6366F1',
                  }
                } else if (source && NON_MARKETING_PLATFORMS.has(source)) {
                  // Final fallback fired with a platform source (whatsapp/
                  // web/voice/etc.) - don't render it as a marketing pill.
                  // These leads simply have no marketing attribution.
                  srcCfg = { label: 'Direct', color: '#6B7280' }
                } else {
                  srcCfg = channelConfig[source] || channelConfig.unknown
                }

                // Legacy "Res1 Platform" — the old Pabbly workflow hardcoded
                // utm_source="Res1 Platform" on Meta lead-form leads. Until those
                // rows are backfilled, surface them as Meta Forms (Meta blue).
                if (/res\s*1\s*platform/i.test(srcCfg.label)) {
                  srcCfg = { label: 'Meta Forms', color: '#0668E1' }
                }

                // Google Ads → distinct PURPLE so it never reads as Meta's blue.
                // Applied after resolution so it wins regardless of which branch
                // set the color (map hit, generic attr-label fallback, etc.).
                // Google Organic stays red, so paid vs organic Google is clear too.
                if (/google\s*ads/i.test(srcCfg.label)) {
                  srcCfg = { ...srcCfg, color: '#A855F7' }
                }

                // Derive sub-source from form_type first, then utm_medium,
                // then per-channel default.
                const formTypeRaw =
                  uc?.raw_form_fields?.form_type ||
                  uc?.web?.form_submission?.form_type ||
                  uc?.landing_page?.form_name ||
                  uc?.raw_form_fields?.event_name ||
                  ''
                const formType = String(formTypeRaw).toLowerCase().trim()
                const subSourceLabels: Record<string, string> = {
                  pilot_aptitude_test: 'PAT',
                  pat_assessment: 'PAT',
                  pat: 'PAT',
                  pilot_assessment: 'PAT',
                  demo_booked: 'Demo Form',
                  demo_form: 'Demo Form',
                  demo: 'Demo',
                  whatsapp_button: 'WA Popup',
                  whatsapp_prelaunch: 'WA Popup',
                  whatsapp: 'WhatsApp',
                  web: 'Web Chat',
                  web_chat: 'Web Chat',
                  chat_widget: 'Web Chat',
                  meta_lead_form: 'Meta Lead Form',
                  facebook_lead: 'Meta Lead Form',
                  whatsapp_clickthrough: 'WA Click Through',
                  voice_call: 'Voice Call',
                  voice: 'Voice Call',
                  manual: 'Manual Entry',
                  landing_page: 'Landing Page',
                  visit_booked: 'Visit Booked',
                  visit: 'Visit',
                  eligibility: 'Eligibility',
                  guide_download: 'Guide Download',
                  guide: 'Guide',
                  contact: 'Contact Form',
                  newsletter: 'Newsletter',
                  page: 'Web Form',
                  event: 'Event',
                }
                const utmMediumLabels: Record<string, string> = {
                  cpc: 'Ads',
                  ppc: 'Ads',
                  paid: 'Ads',
                  ad: 'Ads',
                  ads: 'Ads',
                  paid_social: 'Paid Social',
                  social: 'Social',
                  organic: 'Organic',
                  email: 'Email',
                  referral: 'Referral',
                  affiliate: 'Affiliate',
                }
                let subSource = ''
                // Priority order:
                //   1. attribution.first_touch (key) → fresh label from subSourceLabels
                //      so renames take effect without re-backfill
                //   2. attribution.first_touch_label (stored, may be stale)
                //   3. raw_form_fields.form_type fallback
                if (attrFirstTouchKey && subSourceLabels[attrFirstTouchKey]) {
                  subSource = subSourceLabels[attrFirstTouchKey]
                } else if (attrFirstTouchLabel) {
                  subSource = attrFirstTouchLabel
                } else if (formType) {
                  subSource =
                    subSourceLabels[formType] ||
                    formType
                      .replace(/[_-]+/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase())
                } else if (utmMediumRaw) {
                  subSource =
                    utmMediumLabels[utmMediumRaw] ||
                    utmMediumRaw
                      .replace(/[_-]+/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase())
                } else if (source === 'meta_forms') {
                  subSource = 'Lead Form'
                } else if (source === 'facebook') {
                  subSource = 'Ads'
                } else if (source === 'google') {
                  subSource = 'Ads'
                } else if (source === 'whatsapp') {
                  subSource = 'Direct'
                } else if (source === 'voice') {
                  subSource = 'Call'
                } else if (source === 'web' || source === 'form') {
                  subSource = 'Web Form'
                }

                // Score pill colors
                // Score pill classes - using CSS variables for consistency
                const scorePillClass = score != null
                  ? (score >= 70 ? 'bg-[rgba(34,197,94,0.15)] text-[#22c55e]' : score >= 40 ? 'bg-[rgba(245,158,11,0.15)] text-[#f59e0b]' : 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]')
                  : ''

                // ── POP constituent row (electoral view) ──────────────────────
                if (brandId === 'pop') {
                  const pl = lead as any
                  const capturedAt = pl.created_at || lead.timestamp
                  const leanCfg = pl.lean ? POP_LEAN[pl.lean] : null
                  const grvCfg = pl.grievance_category ? POP_GRIEVANCE[pl.grievance_category] : null
                  // Engagement badge fills the grievance cell when there's no
                  // grievance - a supporter/volunteer/event arrival is a complete
                  // person, not a missing grievance. 'grievance' itself is the
                  // column default, so it never shows as a standalone badge.
                  const engCfg = pl.engagement_type && pl.engagement_type !== 'grievance' ? POP_ENGAGEMENT[pl.engagement_type] : null
                  const intentCfg = pl.action_intent && pl.action_intent !== 'none' ? POP_INTENT[pl.action_intent] : null
                  const loopCfg = pl.loop_status ? POP_LOOP[pl.loop_status] : null
                  // TYPE = intensity tier (who they are); magnet = how they came in.
                  const tierCfg = POP_TIER[typeof pl.intensity === 'number' ? pl.intensity : 0] || POP_TIER[0]
                  const magnetCfg = pl.magnet ? POP_MAGNET[pl.magnet] : null
                  const salience: number = typeof pl.salience === 'number' ? pl.salience : 0
                  const seatRef = pl.constituency ? POP_AC_BY_NAME.get(normSeat(pl.constituency)) : undefined
                  const acNo = seatRef?.no
                  const districtName = pl.district || seatRef?.district || ''
                  const distColor = districtName ? popDistrictColor(districtName) : ''

                  return (
                    <tr
                      key={lead.id}
                      className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                      style={{ borderBottom: '1px solid var(--border-primary)', height: '62px' }}
                      onClick={() => handleRowClick(lead)}
                    >
                      {/* CONSTITUENT - name + captured date */}
                      <td className="px-3 py-2">
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                          {displayName}
                        </div>
                        {capturedAt && (
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {new Date(capturedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        )}
                      </td>

                      {/* TYPE - intensity tier: who this person is (Voter→Cadre) */}
                      <td className="px-3 py-2 text-center">
                        {/* TYPE is just the intensity tier now. The engagement_type
                            sub-label duplicated the INTENT column (both read
                            "Volunteer" etc.) and confused more than it helped —
                            intent lives in its own column. */}
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
                          style={{ backgroundColor: `${tierCfg.color}22`, color: tierCfg.color, border: `1px solid ${tierCfg.color}44` }}
                          title={`Intensity tier ${typeof pl.intensity === 'number' ? pl.intensity : 0} - ${tierCfg.label}`}
                        >
                          {tierCfg.label}
                        </span>
                      </td>

                      {/* CONTACT - phone + email (when provided) */}
                      <td className="px-3 py-2">
                        {lead.phone && (
                          <a href={`tel:${lead.phone}`} className="text-sm block hover:underline" style={{ color: 'var(--text-primary)' }} onClick={(e) => e.stopPropagation()}>
                            {lead.phone}
                          </a>
                        )}
                        {cleanEmail && (
                          <a href={`mailto:${cleanEmail}`} className="text-xs block truncate hover:underline mt-0.5" style={{ color: '#9ca3af' }} onClick={(e) => e.stopPropagation()} title={cleanEmail}>
                            {cleanEmail}
                          </a>
                        )}
                        {!lead.phone && !cleanEmail && <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>

                      {/* CAME IN VIA - the real acquisition channel (magnet), not
                          generic marketing "source". Falls back to the touchpoint. */}
                      <td className="px-3 py-2 text-center" style={{ verticalAlign: 'middle' }}>
                        {magnetCfg ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                            style={{ backgroundColor: `${magnetCfg.color}22`, color: magnetCfg.color }}
                          >
                            {magnetCfg.label}
                          </span>
                        ) : (
                          <span className="text-[10px] whitespace-nowrap capitalize" style={{ color: 'var(--text-muted)' }}>
                            {(pl.magnet || subSource || '-').replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>

                      {/* LAST TOUCH - last channel + actor (real attribution) */}
                      <td className="px-3 py-2 text-center" style={{ verticalAlign: 'middle' }}>
                        {(() => {
                          const actor = (lead.unified_context as any)?.last_actor || null
                          const lastTouchConfig: Record<string, { label: string; color: string }> = {
                            web: { label: 'Web', color: '#3B82F6' }, form: { label: 'Form', color: '#3B82F6' },
                            whatsapp: { label: 'WhatsApp', color: '#22C55E' }, voice: { label: 'Voice', color: '#8B5CF6' },
                            social: { label: 'Social', color: '#EC4899' }, facebook: { label: 'Facebook', color: '#1877F2' },
                            facebook_lead: { label: 'Facebook', color: '#1877F2' }, meta_forms: { label: 'Meta', color: '#1877F2' },
                            google: { label: 'Google', color: '#EA4335' }, ads: { label: 'Ads', color: '#F97316' },
                            pabbly: { label: 'Pabbly', color: '#F59E0B' }, referral: { label: 'Referral', color: '#10B981' },
                            organic: { label: 'Organic', color: '#84CC16' }, manual: { label: 'Manual', color: '#6B7280' },
                            landing_page: { label: 'Landing', color: '#3B82F6' }, email: { label: 'Email', color: '#0EA5E9' },
                          }
                          const channelCfg = lastTouch
                            ? (lastTouchConfig[lastTouch] || { label: lastTouch.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), color: '#6B7280' })
                            : null
                          let actorBadge: { label: string; tooltip: string } | null = null
                          if (actor?.type === 'user' && (actor.name || actor.email)) {
                            const aname = String(actor.name || actor.email.split('@')[0] || 'User').trim()
                            actorBadge = { label: aname, tooltip: `Last touched by ${actor.email || aname}${actor.at ? ` · ${new Date(actor.at).toLocaleString()}` : ''}` }
                          } else if (actor?.type === 'proxe') {
                            actorBadge = { label: 'PROXe', tooltip: `PROXe AI handled last${actor.at ? ` · ${new Date(actor.at).toLocaleString()}` : ''}` }
                          }
                          if (!actorBadge && !channelCfg) return <span style={{ color: 'var(--text-muted)' }}>-</span>
                          return (
                            <div className="flex flex-col items-center gap-0.5">
                              {channelCfg && (
                                <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ backgroundColor: `${channelCfg.color}22`, color: channelCfg.color }} title={`Channel: ${channelCfg.label}`}>
                                  {channelCfg.label}
                                </span>
                              )}
                              {actorBadge && (
                                <span className="text-[10px] whitespace-nowrap" style={{ color: '#9ca3af' }} title={actorBadge.tooltip}>
                                  @{actorBadge.label.toLowerCase().replace(/\s+/g, '')}
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </td>

                      {/* CONSTITUENCY - numbered AC chip + seat + district color pill */}
                      <td className="px-3 py-2">
                        {pl.constituency ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              {acNo != null && (
                                <span
                                  className="inline-flex items-center justify-center text-[9px] font-bold tabular-nums rounded"
                                  title={`AC ${acNo}`}
                                  style={{ minWidth: 18, height: 16, padding: '0 4px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}
                                >
                                  {acNo}
                                </span>
                              )}
                              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{pl.constituency}</span>
                            </div>
                            {(districtName || pl.booth) && (
                              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                {districtName && (
                                  <span
                                    className="inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap"
                                    style={{ color: distColor, backgroundColor: `color-mix(in srgb, ${distColor} 16%, transparent)` }}
                                  >
                                    {districtName}
                                  </span>
                                )}
                                {pl.booth && <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{pl.booth}</span>}
                              </div>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>

                      {/* GRIEVANCE - category badge + salience + text */}
                      <td className="px-3 py-2">
                        {grvCfg ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
                              style={{ backgroundColor: `${grvCfg.color}14`, color: grvCfg.color, border: `1px solid ${grvCfg.color}33` }}
                            >
                              <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: grvCfg.color }} />
                              {grvCfg.label}
                            </span>
                            {salience > 0 && (
                              <span className="text-[10px] tracking-tighter" title={`Salience ${salience}/3`} style={{ color: '#F59E0B' }}>
                                {'●'.repeat(salience)}<span style={{ color: 'var(--border-primary)' }}>{'●'.repeat(3 - salience)}</span>
                              </span>
                            )}
                          </div>
                        ) : engCfg ? (
                          <span
                            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
                            style={{ backgroundColor: `${engCfg.color}1f`, color: engCfg.color }}
                            title={`Came in via ${engCfg.label.toLowerCase()} - no grievance raised`}
                          >
                            {engCfg.label}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                        {pl.grievance_text && (
                          <div className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-secondary)' }} title={pl.grievance_text}>
                            {pl.grievance_text}
                          </div>
                        )}
                      </td>

                      {/* LEAN - pill */}
                      <td className="px-3 py-2 text-center">
                        {leanCfg ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                            style={{ backgroundColor: `${leanCfg.color}22`, color: leanCfg.color }}
                          >
                            {leanCfg.label}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>

                      {/* INTENT - action badge */}
                      <td className="px-3 py-2 text-center">
                        {intentCfg ? (
                          <span
                            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                            style={{ backgroundColor: `${intentCfg.color}1f`, color: intentCfg.color }}
                          >
                            {intentCfg.label}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>

                      {/* LOOP - status badge */}
                      <td className="px-3 py-2 text-center">
                        {loopCfg ? (
                          <span
                            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
                            style={{ backgroundColor: `${loopCfg.color}1f`, color: loopCfg.color }}
                          >
                            {loopCfg.label}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr
                    key={lead.id}
                    className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderBottom: '1px solid var(--border-primary)', height: '62px' }}
                    onClick={() => handleRowClick(lead)}
                  >
                    {/* LEAD - 2 lines: Name + Brand · City */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                          {displayName}
                        </span>
                        {lkzType && (
                          <span
                            className="px-1.5 py-px rounded text-[9px] font-semibold tracking-wide flex-shrink-0 whitespace-nowrap"
                            style={lkzType === 'Brand'
                              ? { backgroundColor: 'rgba(255,82,0,0.14)', color: '#FF7A33' }
                              : lkzType === 'Scout'
                              ? { backgroundColor: 'rgba(139,92,246,0.16)', color: '#A78BFA' }
                              : lkzType === 'Connector'
                              ? { backgroundColor: 'rgba(16,185,129,0.16)', color: '#34D399' }
                              : { backgroundColor: 'rgba(37,99,235,0.16)', color: '#60A5FA' }}
                          >
                            {lkzType === 'Brand' ? 'Brand' : lkzType === 'Scout' ? 'Scout' : lkzType === 'Connector' ? 'Connector' : 'Owner'}
                          </span>
                        )}
                      </div>
                      {(isScoutRow ? !!scoutLocation : !!(brandName || city)) && !isEmailAsName && (
                        <div className="text-xs mt-0.5 truncate" style={{ color: '#9ca3af' }}>
                          {isScoutRow ? scoutLocation : [brandName, city].filter(Boolean).join(' \u00b7 ')}
                        </div>
                      )}
                      {/* Date the lead came in */}
                      {((lead as any).created_at || lead.timestamp) && (
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {new Date((lead as any).created_at || lead.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </td>

                    {/* CONTACT - 2 lines: Phone + Email */}
                    <td className="px-3 py-2">
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="text-sm block hover:underline" style={{ color: 'var(--text-primary)' }} onClick={(e) => e.stopPropagation()}>
                          {lead.phone}
                        </a>
                      )}
                      {cleanEmail && !isEmailAsName && (
                        <a href={`mailto:${cleanEmail}`} className="text-xs block truncate hover:underline mt-0.5" style={{ color: '#9ca3af' }} onClick={(e) => e.stopPropagation()} title={cleanEmail}>
                          {cleanEmail}
                        </a>
                      )}
                    </td>

                    {/* SOURCE - 3 lines: channel · first touch · landing page */}
                    <td className="px-3 py-2 text-center" style={{ verticalAlign: 'middle' }}>
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase whitespace-nowrap"
                          style={{ backgroundColor: `${srcCfg.color}15`, color: srcCfg.color }}
                        >
                          {srcCfg.label}
                        </span>
                        {subSource && (
                          <span
                            className="text-[10px] whitespace-nowrap"
                            style={{ color: '#9ca3af' }}
                            title={subSource}
                          >
                            {subSource}
                          </span>
                        )}
                        {(() => {
                          const pageUrl = String(
                            uc?.attribution?.page_url ||
                            uc?.raw_form_fields?.page_url ||
                            uc?.web?.form_submission?.page_url ||
                            ''
                          ).trim()
                          if (!pageUrl) return null
                          // Show only the path - strip any query string (utm_*, etc.)
                          // regardless of whether the URL is absolute or relative.
                          let pathOnly = pageUrl.split('?')[0].split('#')[0]
                          try {
                            const u = new URL(pageUrl)
                            // Click redirectors (fb.me, wa.me, m.me, l.facebook.com) carry a
                            // meaningless short-link id as their path - e.g. a WhatsApp
                            // Clickthrough lead's "/9qqSZr45W". Don't show it.
                            const REDIRECTOR_HOSTS = ['fb.me', 'wa.me', 'm.me', 'l.facebook.com', 'lm.facebook.com']
                            if (REDIRECTOR_HOSTS.includes(u.hostname.replace(/^www\./, ''))) return null
                            pathOnly = u.pathname || pathOnly
                          } catch {
                            // already stripped above for relative URLs
                          }
                          if (pathOnly.length > 28) pathOnly = pathOnly.slice(0, 26) + '…'
                          return (
                            <a
                              href={pageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[9px] whitespace-nowrap hover:underline"
                              style={{ color: '#6b7280' }}
                              title={pageUrl}
                            >
                              {pathOnly}
                            </a>
                          )
                        })()}
                      </div>
                    </td>

                    {/* LAST TOUCH - actor (top) + channel (bottom) */}
                    <td className="px-3 py-2 text-center" style={{ verticalAlign: 'middle' }}>
                      {(() => {
                        const actor = uc?.last_actor || null
                        const lastTouchConfig: Record<string, { label: string; color: string }> = {
                          web: { label: 'Web', color: '#3B82F6' },
                          form: { label: 'Form', color: '#3B82F6' },
                          whatsapp: { label: 'WhatsApp', color: '#22C55E' },
                          voice: { label: 'Voice', color: '#8B5CF6' },
                          social: { label: 'Social', color: '#EC4899' },
                          facebook: { label: 'Facebook', color: '#1877F2' },
                          facebook_lead: { label: 'Facebook', color: '#1877F2' },
                          meta_forms: { label: 'Meta', color: '#1877F2' },
                          google: { label: 'Google', color: '#EA4335' },
                          ads: { label: 'Ads', color: '#F97316' },
                          pabbly: { label: 'Pabbly', color: '#F59E0B' },
                          referral: { label: 'Referral', color: '#10B981' },
                          organic: { label: 'Organic', color: '#84CC16' },
                          manual: { label: 'Manual', color: '#6B7280' },
                          landing_page: { label: 'Landing', color: '#3B82F6' },
                          email: { label: 'Email', color: '#0EA5E9' },
                        }
                        const channelCfg = lastTouch
                          ? (lastTouchConfig[lastTouch] || {
                              label: lastTouch.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                              color: '#6B7280',
                            })
                          : null

                        // Resolve actor badge config
                        let actorBadge: { label: string; color: string; bg: string; tooltip: string } | null = null
                        if (actor?.type === 'user' && (actor.name || actor.email)) {
                          const name = String(actor.name || actor.email.split('@')[0] || 'User').trim()
                          actorBadge = {
                            label: name,
                            color: '#F59E0B',
                            bg: 'rgba(245,158,11,0.15)',
                            tooltip: `Last touched by ${actor.email || name}${actor.at ? ` · ${new Date(actor.at).toLocaleString()}` : ''}`,
                          }
                        } else if (actor?.type === 'proxe') {
                          actorBadge = {
                            label: 'PROXe',
                            color: '#8B5CF6',
                            bg: 'rgba(139,92,246,0.15)',
                            tooltip: `PROXe AI handled last${actor.at ? ` · ${new Date(actor.at).toLocaleString()}` : ''}`,
                          }
                        }

                        if (!actorBadge && !channelCfg) {
                          return <span style={{ color: 'var(--text-muted)' }}>-</span>
                        }

                        // Channel is the primary signal (which surface the
                        // last touch landed on); the actor - if any - is a
                        // sub-line "@username" beneath it.
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            {channelCfg && (
                              <span
                                className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                                style={{ backgroundColor: `${channelCfg.color}22`, color: channelCfg.color }}
                                title={`Channel: ${channelCfg.label}`}
                              >
                                {channelCfg.label}
                              </span>
                            )}
                            {actorBadge && (
                              <span
                                className="text-[10px] whitespace-nowrap"
                                style={{ color: '#9ca3af' }}
                                title={actorBadge.tooltip}
                              >
                                @{actorBadge.label.toLowerCase().replace(/\s+/g, '')}
                              </span>
                            )}
                          </div>
                        )
                      })()}
                    </td>

                    {/* SCORE - colored pill */}
                    <td className="px-3 py-2 text-center">
                      {score != null ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${scorePillClass}`}
                        >
                          {score}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}></span>
                      )}
                    </td>

                    {/* STAGE - badge (scouts show their lifecycle stage) */}
                    <td className="px-3 py-2 text-center">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                        style={rowStageStyle}
                      >
                        {rowStage}
                      </span>
                    </td>

                    {/* ACTIVE */}
                    <td className="px-3 py-2 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {timeAgo(lastActivity)}
                    </td>

                    {/* BOOKING (brand/owner) · PROPERTIES (scout) · ZOOM STATUS (webinar) */}
                    <td className="px-3 py-2 text-xs text-center">
                      {isScoutRow ? (() => {
                        const n = Number(lkz.scout_submissions_count ?? (lkz.last_submission_area ? 1 : 0)) || 0
                        return (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold tabular-nums"
                            style={n > 0 ? { background: 'rgba(16,185,129,0.15)', color: '#10b981' } : { color: 'var(--text-muted)' }}
                          >
                            {n > 0 ? `${n} submitted` : '0'}
                          </span>
                        )
                      })() : webinarView ? (() => {
                        // Webinar view: did they COMPLETE Zoom registration (came back
                        // via the Zoom → Pabbly webhook) vs just click Register?
                        const wc = uc?.[brandId] || {}
                        return wc.zoom_registered ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                            style={{ background: 'rgba(45,140,255,0.15)', color: '#4aa3ff', border: '1px solid rgba(45,140,255,0.35)' }}
                          >
                            <span aria-hidden="true">✓</span> Registered
                          </span>
                        ) : (
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Not yet</span>
                        )
                      })() : bookingDate ? (() => {
                        // Resolve session type: explicit field wins, else infer from meet link presence.
                        const brandCtx = uc?.[brandId] || uc?.windchasers || uc?.bcon || {}
                        const explicit = String(brandCtx.session_type || brandCtx.demo_type || uc?.raw_form_fields?.demo_type || '').toLowerCase()
                        const meetLink = uc?.web?.booking?.meetLink || uc?.web?.booking?.meet_link || null
                        let sessionType: 'online' | 'offline' | null = null
                        if (explicit === 'online' || explicit === 'offline') sessionType = explicit as 'online' | 'offline'
                        else if (meetLink) sessionType = 'online'
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            <Link
                              href="/dashboard/bookings"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap hover:opacity-90"
                              style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                            >
                              <span aria-hidden="true">📅</span>
                              {new Date(bookingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {bookingTime ? `, ${formatBookingTime(bookingTime)}` : ''}
                            </Link>
                            {sessionType && (
                              <span
                                className="text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap"
                                style={{ color: sessionType === 'online' ? '#3B82F6' : '#F59E0B' }}
                              >
                                {sessionType === 'online' ? 'Online' : 'Offline'}
                              </span>
                            )}
                          </div>
                        )
                      })() : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>

                    {/* Aviation columns - chip styling so the row reads as a
                        scannable set of tags rather than mixed text + chips */}
                    {showAviationColumns && (
                      <td className="px-3 py-2 text-xs text-center">
                        {lead.unified_context?.[brandId]?.user_type ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize whitespace-nowrap"
                            style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
                          >
                            {lead.unified_context[brandId].user_type}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                    )}
                    {showAviationColumns && (
                      <td className="px-3 py-2 text-xs text-center">
                        {lead.unified_context?.[brandId]?.course_interest ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                            style={{ background: 'rgba(14,165,233,0.15)', color: '#7dd3fc', border: '1px solid rgba(14,165,233,0.3)' }}
                          >
                            {normalizeCourse(lead.unified_context[brandId].course_interest)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                    )}
                    {showAviationColumns && (() => {
                      const uc = lead.unified_context || {}
                      const wc = uc[brandId] || uc.windchasers || {}
                      const rawScore = wc.pat_score ?? uc.raw_form_fields?.total_score ?? null
                      const patRaw = rawScore != null ? Number(rawScore) : null
                      // Display as /100 - see docs/pat-scoring.md
                      const patScore100 = patRaw != null && !isNaN(patRaw)
                        ? (wc.pat_score_100 ?? Math.round((patRaw * 100) / 150))
                        : null
                      // Tier - derive from raw if not stored (e.g. legacy raw_form_fields)
                      const storedTier = String(
                        wc.pat_tier || uc.raw_form_fields?.tier || ''
                      ).toLowerCase().trim()
                      const derivedTier = patRaw == null || isNaN(patRaw) ? ''
                        : patRaw >= 140 ? 'premium'
                        : patRaw >= 120 ? 'strong'
                        : patRaw >= 90  ? 'moderate'
                        : 'not-ready'
                      const tier = storedTier || derivedTier
                      const tierColors: Record<string, string> = {
                        premium:     '#EAB308', // gold
                        strong:      '#22C55E', // green
                        moderate:    '#F59E0B', // yellow / amber
                        'not-ready': '#EF4444', // red
                      }
                      const tierLabels: Record<string, string> = {
                        premium: 'Premium',
                        strong: 'Strong',
                        moderate: 'Moderate',
                        'not-ready': 'Early Stage',
                      }
                      const patColor = tierColors[tier] || 'var(--text-muted)'
                      return (
                        <td className="px-3 py-2 text-xs text-center">
                          {patScore100 !== null ? (
                            <span
                              className="inline-flex items-baseline gap-0.5 px-2 py-0.5 rounded text-[11px] font-bold tabular-nums"
                              style={{ color: patColor, background: `${patColor}18` }}
                              title={tier ? `Tier: ${tierLabels[tier] || tier} (raw ${patRaw}/150)` : undefined}
                            >
                              {patScore100}
                              <span className="text-[9px] opacity-70">/100</span>
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                      )
                    })()}

                    {/* WEBINAR: which webinar + date (webinar view only) */}
                    {webinarView && (() => {
                      const wc = lead.unified_context?.[brandId] || {}
                      return (
                        <td className="px-3 py-2 text-xs">
                          {wc.webinar_name || wc.webinar_date ? (
                            <div
                              className="leading-tight min-w-0"
                              title={[wc.webinar_name, wc.webinar_date].filter(Boolean).join(' · ')}
                            >
                              <span className="block truncate text-[11px] font-semibold" style={{ color: '#fbbf24' }}>
                                {wc.webinar_name || 'Webinar'}
                              </span>
                              {wc.webinar_date ? (
                                <span className="block truncate text-[9.5px]" style={{ color: 'var(--text-muted)' }}>{wc.webinar_date}</span>
                              ) : null}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                      )
                    })()}

                    {/* SCOUTS: Area Covered + Knows Properties (scout view only) */}
                    {scoutView && (
                      <>
                        <td className="px-3 py-2 text-center">
                          {lkz.scout_area_covered ? (
                            <span className="inline-block px-2 py-0.5 rounded-2xl text-[10px] font-semibold capitalize whitespace-normal break-words leading-snug max-w-[180px] align-middle" style={{ backgroundColor: 'rgba(124,58,237,0.15)', color: '#7c3aed' }}>
                              {lkz.scout_area_covered}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {lkz.scout_knows_properties ? (
                            <span className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>
                              {lkz.scout_knows_properties === 'yes' ? 'Yes' : lkz.scout_knows_properties === 'not_yet' ? 'Not yet' : lkz.scout_knows_properties}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                      </>
                    )}

                    {/* OWNER */}
                    <td className="px-3 py-2 text-xs">
                      {lead.unified_context?.owner?.name ? (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-full"
                          style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
                          title={lead.unified_context.owner.name}
                        >
                          {lead.unified_context.owner.name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Lead Details Modal */}
      <LeadDetailsModal
        lead={selectedLead}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onStatusUpdate={updateLeadStatus}
      />

      {/* Add Lead Modal - realtime subscription refreshes the list on insert */}
      <AddLeadModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  )
}
