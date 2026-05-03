'use client'

import { useEffect, useState, useMemo, type CSSProperties } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { formatDateTime } from '@/lib/utils'
import { useRealtimeLeads } from '@/hooks/useRealtimeLeads'
import LeadDetailsModal from './LeadDetailsModal'
import type { Lead } from '@/types'
import { calculateLeadScore } from '@/lib/leadScoreCalculator'
import { getCurrentBrandId } from '@/configs'
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
  MdAdd,
  MdClose,
  MdViewList,
  MdViewColumn,
} from 'react-icons/md'
import { createClient } from '@/lib/supabase/client'
import { FaWhatsapp } from 'react-icons/fa'

const STATUS_OPTIONS = [
  'New Lead',
  'Follow Up',
  'RNR (No Response)',
  'Interested',
  'Wrong Enquiry',
  'Call Booked',
  'Closed'
]

const getStatusColor = (status: string | null) => {
  const statusColors: Record<string, { bg: string; text: string; style?: CSSProperties }> = {
    'New Lead': { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-800 dark:text-blue-200' },
    'Follow Up': { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200' },
    'RNR (No Response)': { bg: 'bg-gray-100 dark:bg-gray-900', text: 'text-gray-800 dark:text-gray-200' },
    'Interested': { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200' },
    'Wrong Enquiry': { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200' },
    'Call Booked': { bg: '', text: '', style: { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' } },
    'Closed': { bg: 'bg-slate-100 dark:bg-slate-900', text: 'text-slate-800 dark:text-slate-200' },
  }
  return statusColors[status || 'New Lead'] || statusColors['New Lead']
}

const getStageColor = (stage: string | null) => {
  const stageColors: Record<string, { bg: string; text: string; style?: CSSProperties }> = {
    'New': { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
    'Engaged': { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300' },
    'Qualified': { bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-700 dark:text-yellow-300' },
    'High Intent': { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
    'Booking Made': { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' },
    'Converted': { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
    'Closed Lost': { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
    'Not Qualified': { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300' },
    'In Sequence': { bg: '', text: '', style: { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' } },
    'Cold': { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-300' },
    'R&R': { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  }
  return stageColors[stage || 'New'] || stageColors['New']
}

const getScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return 'var(--text-secondary)'
  if (score >= 90) return '#22C55E'
  if (score >= 70) return '#F97316'
  return 'var(--text-secondary)'
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
}

// Pipeline kanban view
function PipelineView({
  leads,
  calculatedScores,
  onLeadClick,
}: {
  leads: ExtendedLead[]
  calculatedScores: Record<string, number>
  onLeadClick: (lead: ExtendedLead) => void
}) {
  const getScore = (lead: ExtendedLead) => {
    const calc = calculatedScores[lead.id]
    return calc !== undefined ? calc : (lead.lead_score ?? 0)
  }

  const columns = [
    { key: 'cold', label: 'Cold', min: 0, max: 40, color: '#3B82F6' },
    { key: 'warm', label: 'Warm', min: 41, max: 70, color: '#F97316' },
    { key: 'hot', label: 'Hot', min: 71, max: 100, color: '#EF4444' },
  ] as const

  const buckets = {
    cold: leads.filter(l => getScore(l) <= 40).sort((a, b) => getScore(b) - getScore(a)),
    warm: leads.filter(l => { const s = getScore(l); return s >= 41 && s <= 70 }).sort((a, b) => getScore(b) - getScore(a)),
    hot: leads.filter(l => getScore(l) >= 71).sort((a, b) => getScore(b) - getScore(a)),
  }

  const getCompany = (lead: ExtendedLead) =>
    lead.unified_context?.whatsapp?.profile?.company ||
    lead.unified_context?.web?.profile?.company ||
    lead.brand || null

  const getChannels = (lead: ExtendedLead): string[] => {
    const channels: string[] = []
    const ctx = lead.unified_context || {}
    if (ctx.web) channels.push('web')
    if (ctx.whatsapp) channels.push('whatsapp')
    if (ctx.voice) channels.push('voice')
    if (ctx.social) channels.push('social')
    if (channels.length === 0) {
      const src = (lead.first_touchpoint || lead.source || '').toLowerCase()
      if (['web', 'whatsapp', 'voice', 'social'].includes(src)) channels.push(src)
    }
    return channels
  }

  const getLatestNote = (lead: ExtendedLead): string | null => {
    const ctx = lead.unified_context || {}
    return ctx.latest_admin_note || ctx.admin_notes?.[0]?.note || null
  }

  const channelIcons: Record<string, { icon: typeof MdLanguage; color: string }> = {
    web: { icon: MdLanguage, color: '#3B82F6' },
    whatsapp: { icon: MdChat, color: '#22C55E' },
    voice: { icon: MdCall, color: '#8B5CF6' },
    social: { icon: MdPerson, color: '#EC4899' },
  }

  return (
    <div className="flex gap-3 p-4 overflow-x-auto" style={{ minHeight: '60vh' }}>
      {columns.map(col => {
        const items = buckets[col.key]
        return (
          <div key={col.key} className="flex-1 min-w-[260px] flex flex-col rounded-lg border" style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)' }}>
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2 rounded-t-lg" style={{ backgroundColor: `${col.color}15` }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: col.color }}>
                  {col.label}
                </span>
              </div>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${col.color}20`, color: col.color }}>
                {items.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2" style={{ maxHeight: 'calc(80vh - 120px)' }}>
              {items.length === 0 ? (
                <p className="text-center text-xs py-8" style={{ color: 'var(--text-muted)' }}>No leads</p>
              ) : items.map(lead => {
                const score = getScore(lead)
                const company = getCompany(lead)
                const channels = getChannels(lead)
                const note = getLatestNote(lead)
                const lastActivity = lead.last_interaction_at || lead.timestamp

                return (
                  <div
                    key={lead.id}
                    className="rounded-md border p-2.5 cursor-pointer transition-all hover:shadow-sm"
                    style={{
                      borderColor: 'var(--border-primary)',
                      backgroundColor: 'var(--bg-primary)',
                    }}
                    onClick={() => onLeadClick(lead)}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = col.color }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)' }}
                  >
                    {/* Name + Score */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {lead.name || 'Unknown'}
                      </span>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 tabular-nums"
                        style={{ backgroundColor: `${col.color}15`, color: col.color }}
                      >
                        {score}
                      </span>
                    </div>

                    {/* Company */}
                    {company && (
                      <p className="text-[11px] truncate mb-1" style={{ color: 'var(--text-secondary)' }}>
                        {company}
                      </p>
                    )}

                    {/* Channel icons + last activity */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1">
                        {channels.map(ch => {
                          const cfg = channelIcons[ch]
                          if (!cfg) return null
                          const Icon = cfg.icon
                          return <Icon key={ch} size={12} style={{ color: cfg.color }} title={ch} />
                        })}
                      </div>
                      <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {timeAgo(lastActivity)}
                      </span>
                    </div>

                    {/* Latest note */}
                    {note && (
                      <p
                        className="text-[10px] leading-tight mt-1 pt-1 border-t line-clamp-2"
                        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-primary)' }}
                      >
                        {note}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function LeadsTable({
  limit: initialLimit,
  sourceFilter: initialSourceFilter,
  hideFilters = false,
  showLimitSelector = false,
  showViewAll = false,
}: LeadsTableProps) {
  const { leads, loading, error } = useRealtimeLeads()
  const brandId = getCurrentBrandId()
  const showAviationColumns = brandId === 'windchasers'
  const searchParams = useSearchParams()
  const [filteredLeads, setFilteredLeads] = useState<ExtendedLead[]>([])
  const [calculatedScores, setCalculatedScores] = useState<Record<string, number>>({})
  const [calculatingScores, setCalculatingScores] = useState(false)
  const [scoreTrends, setScoreTrends] = useState<Record<string, { prev: number; diff: number }>>({})

  // Preset filter from URL: ?filter=engaged | warm
  const presetFilter = searchParams.get('filter') || 'all'

  const [dateFilter, setDateFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>(initialSourceFilter || 'all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [userTypeFilter, setUserTypeFilter] = useState<string>('all')
  const [courseInterestFilter, setCourseInterestFilter] = useState<string>('all')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [limit, setLimit] = useState<number>(initialLimit || 50)

  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list')

  // Add Lead modal state
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false)
  const [addLeadForm, setAddLeadForm] = useState({ name: '', phone: '', email: '', source: 'manual', context_note: '', auto_sequence: true })
  const [addLeadSubmitting, setAddLeadSubmitting] = useState(false)
  const [addLeadError, setAddLeadError] = useState<string | null>(null)
  const [addLeadDuplicateId, setAddLeadDuplicateId] = useState<string | null>(null)
  const [addLeadSuccess, setAddLeadSuccess] = useState(false)

  useEffect(() => {
    if (initialLimit) {
      setLimit(initialLimit)
    }
  }, [initialLimit])

  useEffect(() => {
    let filtered = [...leads]

    // Apply preset filter from URL (?filter=engaged or ?filter=warm)
    if (presetFilter === 'engaged') {
      const engagedStages = ['Engaged', 'Qualified', 'High Intent', 'Booking Made', 'Converted']
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
        const score = lead.lead_score ?? 0
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
      filtered = filtered.filter((lead) => lead.status === statusFilter)
    }

    if (userTypeFilter !== 'all') {
      filtered = filtered.filter((lead) => {
        const brandData = lead.unified_context?.[brandId] || {}
        return (brandData.user_type || brandData.business_type) === userTypeFilter
      })
    }

    if (courseInterestFilter !== 'all') {
      filtered = filtered.filter((lead) => {
        const brandData = lead.unified_context?.[brandId] || {}
        return brandData.course_interest === courseInterestFilter
      })
    }

    if (limit) {
      filtered = filtered.slice(0, limit)
    }

    setFilteredLeads(filtered as ExtendedLead[])
  }, [leads, dateFilter, sourceFilter, statusFilter, userTypeFilter, courseInterestFilter, limit, presetFilter])

  useEffect(() => {
    if (filteredLeads.length === 0) return

    const fetchTrends = async () => {
      try {
        const supabase = createClient()
        const leadIds = filteredLeads.slice(0, 50).map(l => l.id)

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
    if (filteredLeads.length === 0) return

    setCalculatingScores(true)
    const calculateScores = async () => {
      const scores: Record<string, number> = {}
      const leadsToCalculate = filteredLeads.slice(0, 50)

      await Promise.all(
        leadsToCalculate.map(async (lead) => {
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
  }, [filteredLeads])

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
        ? `${formatDateTime(bookingDate).split(',')[0]}, ${(() => {
          const timeParts = bookingTime.toString().split(':');
          if (timeParts.length < 2) return bookingTime.toString();
          const hours = parseInt(timeParts[0], 10);
          const minutes = parseInt(timeParts[1], 10);
          if (isNaN(hours) || isNaN(minutes)) return bookingTime.toString();
          const period = hours >= 12 ? 'PM' : 'AM';
          const hours12 = hours % 12 || 12;
          const minutesStr = minutes.toString().padStart(2, '0');
          return `${hours12}:${minutesStr} ${period}`;
        })()}`
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

  const handleAddLeadSubmit = async () => {
    setAddLeadError(null)
    setAddLeadDuplicateId(null)
    setAddLeadSubmitting(true)
    try {
      const res = await fetch('/api/dashboard/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addLeadForm),
      })
      const data = await res.json()
      if (res.status === 409) {
        setAddLeadError('Lead with this phone already exists')
        setAddLeadDuplicateId(data.existing_lead_id)
        return
      }
      if (!res.ok) {
        setAddLeadError(data.error || 'Failed to create lead')
        return
      }
      setAddLeadSuccess(true)
      setTimeout(() => {
        setIsAddLeadOpen(false)
        setAddLeadForm({ name: '', phone: '', email: '', source: 'manual', context_note: '', auto_sequence: true })
        setAddLeadSuccess(false)
      }, 1500)
    } catch {
      setAddLeadError('Network error — please try again')
    } finally {
      setAddLeadSubmitting(false)
    }
  }

  // Filter select style — compact Vercel-like
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
    <div className="leads-table">
      {/* Header row: Title left, filters + actions right */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {presetFilter === 'engaged' ? 'Engaged Leads' : presetFilter === 'warm' ? 'Warm Leads' : 'Leads'}
          </h2>
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {filteredLeads.length}{leads.length !== filteredLeads.length ? ` / ${leads.length}` : ''}
          </span>
          {presetFilter !== 'all' && (
            <Link
              href="/dashboard/leads"
              className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-gray-100 dark:hover:bg-[#333]"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            >
              Clear filter
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!hideFilters && (
            <>
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
                </select>
              )}

              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={filterClass} style={filterStyle}>
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status}</option>
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
                  <option value="DGCA">DGCA</option>
                  <option value="Flight">Flight</option>
                  <option value="Heli">Heli</option>
                  <option value="Cabin">Cabin</option>
                  <option value="Drone">Drone</option>
                </select>
              )}
            </>
          )}

          {showLimitSelector && (
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={filterClass} style={filterStyle}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          )}

          {/* View toggle */}
          <div className="flex items-center rounded-md border overflow-hidden" style={{ borderColor: 'var(--border-primary)' }}>
            <button
              onClick={() => setViewMode('list')}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: viewMode === 'list' ? 'var(--accent-primary)' : 'var(--bg-primary)',
                color: viewMode === 'list' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              <MdViewList size={14} />
              List
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: viewMode === 'pipeline' ? 'var(--accent-primary)' : 'var(--bg-primary)',
                color: viewMode === 'pipeline' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              <MdViewColumn size={14} />
              Pipeline
            </button>
          </div>

          <button
            onClick={() => { setIsAddLeadOpen(true); setAddLeadError(null); setAddLeadDuplicateId(null); setAddLeadSuccess(false) }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md text-white transition-colors"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <MdAdd size={14} />
            Add Lead
          </button>

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
              className="px-2.5 py-1 text-xs font-medium rounded-md text-white"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              View All
            </Link>
          )}
        </div>
      </div>

      {/* Pipeline View */}
      {viewMode === 'pipeline' && (
        <PipelineView
          leads={filteredLeads}
          calculatedScores={calculatedScores}
          onLeadClick={handleRowClick}
        />
      )}

      {/* Table */}
      {viewMode === 'list' && <div className="overflow-x-auto overflow-y-visible pb-6">
        <table className="w-full" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '11%' }} />  {/* Name */}
            <col style={{ width: '11%' }} />  {/* Brand */}
            <col style={{ width: '15%' }} />  {/* Email */}
            <col style={{ width: '10%' }} />  {/* Phone */}
            <col style={{ width: '6%' }} />   {/* Source */}
            {showAviationColumns && <col style={{ width: '7%' }} />}
            {showAviationColumns && <col style={{ width: '8%' }} />}
            <col style={{ width: '5%' }} />   {/* Score */}
            <col style={{ width: '8%' }} />   {/* Stage */}
            <col style={{ width: '8%' }} />   {/* Status */}
            <col style={{ width: '6%' }} />   {/* Activity */}
            <col style={{ width: '9%' }} />   {/* Booking */}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
              {[
                'Name',
                'Brand',
                'Email',
                'Phone',
                'Source',
                ...(showAviationColumns ? ['Type', 'Course'] : []),
                'Score',
                'Stage',
                'Status',
                'Activity',
                'Booking',
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredLeads.length === 0 ? (
              <tr>
                <td
                  colSpan={showAviationColumns ? 13 : 11}
                  className="px-3 py-8 text-center text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  No leads found
                </td>
              </tr>
            ) : (
              filteredLeads.map((lead) => {
                const calculatedScore = calculatedScores[lead.id]
                const score = calculatedScore !== undefined ? calculatedScore : (lead.lead_score ?? null)
                const stage = lead.lead_stage ?? (lead as any).leadStage ?? (lead as any).stage ?? null
                const displayStage = stage || 'New'
                const stageColor = getStageColor(displayStage)
                const statusColor = getStatusColor(lead.status)
                const source = (lead.first_touchpoint || lead.source || 'unknown').toLowerCase()
                const lastActivity = lead.last_interaction_at || lead.timestamp

                const bookingDate = lead.booking_date ||
                  lead.unified_context?.web?.booking_date ||
                  lead.unified_context?.web?.booking?.date ||
                  lead.unified_context?.whatsapp?.booking_date ||
                  lead.unified_context?.whatsapp?.booking?.date ||
                  lead.unified_context?.voice?.booking_date ||
                  lead.unified_context?.voice?.booking?.date ||
                  lead.unified_context?.social?.booking_date ||
                  lead.unified_context?.social?.booking?.date
                const bookingTime = lead.booking_time ||
                  lead.unified_context?.web?.booking_time ||
                  lead.unified_context?.web?.booking?.time ||
                  lead.unified_context?.whatsapp?.booking_time ||
                  lead.unified_context?.whatsapp?.booking?.time ||
                  lead.unified_context?.voice?.booking_time ||
                  lead.unified_context?.voice?.booking?.time ||
                  lead.unified_context?.social?.booking_time ||
                  lead.unified_context?.social?.booking?.time

                const sourceConfig: Record<string, { label: string; color: string }> = {
                  web: { label: 'Web', color: '#3B82F6' },
                  whatsapp: { label: 'WA', color: '#22C55E' },
                  voice: { label: 'Voice', color: '#8B5CF6' },
                  social: { label: 'Social', color: '#EC4899' },
                  unknown: { label: 'Other', color: '#6B7280' },
                }
                const srcCfg = sourceConfig[source] || sourceConfig.unknown

                return (
                  <tr
                    key={lead.id}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid var(--border-primary)' }}
                    onClick={() => handleRowClick(lead)}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    {/* Name */}
                    <td className="px-3 py-2 truncate">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {lead.name || '-'}
                      </span>
                    </td>

                    {/* Brand */}
                    <td className="px-3 py-2 truncate text-sm" style={{ color: 'var(--text-secondary)' }} title={
                      lead.unified_context?.whatsapp?.profile?.company ||
                      lead.unified_context?.web?.profile?.company || ''
                    }>
                      {lead.unified_context?.whatsapp?.profile?.company ||
                       lead.unified_context?.web?.profile?.company || '-'}
                    </td>

                    {/* Email */}
                    <td className="px-3 py-2 truncate text-sm" style={{ color: 'var(--text-secondary)' }} title={lead.email || '-'}>
                      {lead.email || '-'}
                    </td>

                    {/* Phone */}
                    <td className="px-3 py-2 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {lead.phone || '-'}
                    </td>

                    {/* Source */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        style={{
                          backgroundColor: `${srcCfg.color}15`,
                          color: srcCfg.color,
                        }}
                      >
                        {srcCfg.label}
                      </span>
                    </td>

                    {/* Aviation: User Type */}
                    {showAviationColumns && (
                      <td className="px-3 py-2 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {(() => {
                          const brandData = lead.unified_context?.[brandId] || {}
                          return brandData.user_type || '-'
                        })()}
                      </td>
                    )}

                    {/* Aviation: Course */}
                    {showAviationColumns && (
                      <td className="px-3 py-2 whitespace-nowrap text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {(() => {
                          const brandData = lead.unified_context?.[brandId] || {}
                          return brandData.course_interest || '-'
                        })()}
                      </td>
                    )}

                    {/* Score */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: getScoreColor(score) }}
                      >
                        {score !== null && score !== undefined ? score : '-'}
                      </span>
                    </td>

                    {/* Stage */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${stageColor.bg} ${stageColor.text}`}
                        style={stageColor.style}
                      >
                        {displayStage}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {lead.status ? (
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColor.bg} ${statusColor.text}`}
                          style={statusColor.style}
                        >
                          {lead.status}
                        </span>
                      ) : (
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>-</span>
                      )}
                    </td>

                    {/* Last Activity */}
                    <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {timeAgo(lastActivity)}
                    </td>

                    {/* Booking — compact chip with calendar icon */}
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {bookingDate || bookingTime ? (
                        <Link
                          href="/dashboard/bookings"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap hover:opacity-90"
                          style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                        >
                          <span aria-hidden="true">📅</span>
                          {bookingDate ? formatDateTime(bookingDate).split(',')[0] : ''}
                          {bookingDate && bookingTime ? ', ' : ''}
                          {bookingTime ? (() => {
                            const timeParts = bookingTime.toString().split(':')
                            if (timeParts.length < 2) return bookingTime.toString()
                            const hours = parseInt(timeParts[0], 10)
                            const minutes = parseInt(timeParts[1], 10)
                            if (isNaN(hours) || isNaN(minutes)) return bookingTime.toString()
                            const period = hours >= 12 ? 'PM' : 'AM'
                            const hours12 = hours % 12 || 12
                            return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
                          })() : ''}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>}

      {/* Lead Details Modal */}
      <LeadDetailsModal
        lead={selectedLead}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onStatusUpdate={updateLeadStatus}
      />

      {/* Add Lead Modal */}
      {isAddLeadOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40"
            onClick={() => setIsAddLeadOpen(false)}
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setIsAddLeadOpen(false)}
          >
            <div
              className="relative rounded-lg shadow-xl w-full max-w-md"
              style={{ backgroundColor: 'var(--bg-primary)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Add New Lead</h3>
                <button onClick={() => setIsAddLeadOpen(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#333]">
                  <MdClose size={16} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>

              {/* Form */}
              <div className="px-5 py-4 flex flex-col gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Name *</label>
                  <input
                    type="text"
                    value={addLeadForm.name}
                    onChange={(e) => setAddLeadForm({ ...addLeadForm, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:ring-1"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent-primary)' } as CSSProperties}
                    placeholder="Lead name"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium mb-1 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Phone *</label>
                  <input
                    type="tel"
                    value={addLeadForm.phone}
                    onChange={(e) => setAddLeadForm({ ...addLeadForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:ring-1"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent-primary)' } as CSSProperties}
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium mb-1 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Email</label>
                  <input
                    type="email"
                    value={addLeadForm.email}
                    onChange={(e) => setAddLeadForm({ ...addLeadForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:ring-1"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent-primary)' } as CSSProperties}
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium mb-1 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Source</label>
                  <select
                    value={addLeadForm.source}
                    onChange={(e) => setAddLeadForm({ ...addLeadForm, source: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border outline-none cursor-pointer"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                  >
                    <option value="manual">Manual Entry</option>
                    <option value="referral">Referral</option>
                    <option value="walk-in">Walk-in</option>
                    <option value="phone-call">Phone Call</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium mb-1 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Context Note</label>
                  <textarea
                    value={addLeadForm.context_note}
                    onChange={(e) => setAddLeadForm({ ...addLeadForm, context_note: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border outline-none focus:ring-1 resize-none"
                    style={{ borderColor: 'var(--border-primary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', '--tw-ring-color': 'var(--accent-primary)' } as CSSProperties}
                    rows={3}
                    placeholder="Add any context about this lead - what they need, how you met them, etc."
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={addLeadForm.auto_sequence}
                    onChange={(e) => setAddLeadForm({ ...addLeadForm, auto_sequence: e.target.checked })}
                    className="rounded"
                    style={{ accentColor: 'var(--accent-primary)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-primary)' }}>Start outreach sequence automatically</span>
                </label>

                {/* Error / Duplicate */}
                {addLeadError && (
                  <div className="text-xs px-3 py-2 rounded-md" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
                    {addLeadError}
                    {addLeadDuplicateId && (
                      <button
                        onClick={() => {
                          setIsAddLeadOpen(false)
                          const lead = leads.find(l => l.id === addLeadDuplicateId)
                          if (lead) { setSelectedLead(lead as any); setIsModalOpen(true) }
                        }}
                        className="ml-2 underline font-medium"
                      >
                        View existing lead
                      </button>
                    )}
                  </div>
                )}

                {/* Success */}
                {addLeadSuccess && (
                  <div className="text-xs px-3 py-2 rounded-md" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' }}>
                    Lead created successfully!
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: 'var(--border-primary)' }}>
                <button
                  onClick={() => setIsAddLeadOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border transition-colors"
                  style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLeadSubmit}
                  disabled={addLeadSubmitting || !addLeadForm.name.trim() || !addLeadForm.phone.trim()}
                  className="px-3 py-1.5 text-xs font-medium rounded-md text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  {addLeadSubmitting ? 'Creating...' : 'Create Lead'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
