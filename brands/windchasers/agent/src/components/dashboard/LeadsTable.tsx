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
  MdSearch,
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
    'New Lead': { bg: '', text: '', style: { backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa' } },
    'Follow Up': { bg: '', text: '', style: { backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' } },
    'RNR (No Response)': { bg: '', text: '', style: { backgroundColor: 'rgba(107,114,128,0.15)', color: '#9ca3af' } },
    'Interested': { bg: '', text: '', style: { backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' } },
    'Wrong Enquiry': { bg: '', text: '', style: { backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' } },
    'Call Booked': { bg: '', text: '', style: { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' } },
    'Closed': { bg: '', text: '', style: { backgroundColor: 'rgba(100,116,139,0.15)', color: '#94a3b8' } },
  }
  return statusColors[status || 'New Lead'] || statusColors['New Lead']
}

const getStageColor = (stage: string | null) => {
  const stageColors: Record<string, { bg: string; text: string; style?: CSSProperties }> = {
    'New': { bg: '', text: '', style: { backgroundColor: 'rgba(107,114,128,0.15)', color: '#9ca3af' } },
    'Engaged': { bg: '', text: '', style: { backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa' } },
    'Qualified': { bg: '', text: '', style: { backgroundColor: 'rgba(168,85,247,0.15)', color: '#a855f7' } },
    'High Intent': { bg: '', text: '', style: { backgroundColor: 'rgba(249,115,22,0.15)', color: '#f97316' } },
    'Booking Made': { bg: '', text: '', style: { backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' } },
    'Converted': { bg: '', text: '', style: { backgroundColor: 'rgba(16,185,129,0.15)', color: '#10b981' } },
    'Closed Lost': { bg: '', text: '', style: { backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' } },
    'Not Qualified': { bg: '', text: '', style: { backgroundColor: 'rgba(244,63,94,0.15)', color: '#f43f5e' } },
    'In Sequence': { bg: '', text: '', style: { backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' } },
    'Cold': { bg: '', text: '', style: { backgroundColor: 'rgba(107,114,128,0.15)', color: '#6b7280' } },
    'R&R': { bg: '', text: '', style: { backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' } },
  }
  return stageColors[stage || 'New'] || stageColors['New']
}

const getScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return 'var(--text-secondary)'
  if (score >= 70) return '#22C55E'
  if (score >= 40) return '#F59E0B'
  return '#EF4444'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [scoreFilter, setScoreFilter] = useState<string>('all')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [limit, setLimit] = useState<number>(initialLimit || 50)

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
  }, [leads, dateFilter, sourceFilter, statusFilter, userTypeFilter, courseInterestFilter, scoreFilter, searchQuery, limit, presetFilter, calculatedScores])

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
            {presetFilter === 'engaged' ? 'Engaged Leads' : presetFilter === 'warm' ? 'Warm Leads' : 'Leads'}
          </h2>
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {filteredLeads.length}{leads.length !== filteredLeads.length ? ` / ${leads.length}` : ''}
          </span>
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
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto overflow-y-auto flex-1 pb-6">
        <table className="w-full" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '27%' }} />  {/* Lead */}
            <col style={{ width: '20%' }} />  {/* Contact */}
            <col style={{ width: '6%' }} />   {/* Source */}
            <col style={{ width: '7%' }} />   {/* Score */}
            <col style={{ width: '13%' }} />  {/* Stage */}
            <col style={{ width: '9%' }} />   {/* Active */}
            <col style={{ width: '16%' }} />  {/* Booking */}
            {showAviationColumns && <col style={{ width: '7%' }} />}
            {showAviationColumns && <col style={{ width: '8%' }} />}
          </colgroup>
          <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
              {[
                'Lead',
                'Contact',
                'Source',
                'Score',
                'Stage',
                'Active',
                'Booking',
                ...(showAviationColumns ? ['Type', 'Course'] : []),
              ].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
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
                  colSpan={showAviationColumns ? 9 : 7}
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
                // SOURCE = the most recent medium the lead came through.
                // Falls back to first_touchpoint and the legacy `source` field
                // so older leads still render something.
                const source = (lead.last_touchpoint || lead.first_touchpoint || lead.source || 'unknown').toLowerCase()
                const lastActivity = lead.last_interaction_at || lead.timestamp

                const uc = lead.unified_context || {}
                const resolvedName =
                  uc?.whatsapp?.profile?.full_name ||
                  uc?.web?.profile?.full_name ||
                  lead.name || ''
                const brandName =
                  uc?.web?.what_is_your_brand_name ||
                  uc?.whatsapp?.what_is_your_brand_name ||
                  uc?.whatsapp?.profile?.company ||
                  uc?.web?.profile?.company || ''
                const city =
                  uc?.whatsapp?.profile?.city ||
                  uc?.web?.profile?.city || ''

                // If no name, use email as primary identifier
                const displayName = resolvedName || lead.email || lead.phone || '-'
                const isEmailAsName = !resolvedName && !!lead.email

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
                //   YouTube / etc. — the ad platform that drove the visit)
                //   so a "Google ad → Web → PAT" lead reads as Google, not
                //   Web. Falls back to the channel medium (Web/WhatsApp/etc.)
                //   when no UTM is present (direct traffic, organic, etc.).
                //
                // SUB line: the specific entry point — usually form_type
                //   (PAT, Demo Booked, …). If form_type is missing we fall
                //   back to utm_medium (cpc, social, organic) so the line
                //   still tells you HOW they got here.

                // Pull UTM info — website's /api/leads stuffs UTM into
                // custom_fields, which PROXe stores under raw_form_fields.
                // Older leads have it under web.utm.
                const utmSourceRaw = String(
                  uc?.raw_form_fields?.utm_source ||
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
                  unknown: { label: '-', color: '#6B7280' },
                }

                // Friendly label + color per known utm_source.
                const utmSourceConfig: Record<string, { label: string; color: string }> = {
                  google: { label: 'Google', color: '#EA4335' },
                  google_ads: { label: 'Google', color: '#EA4335' },
                  googleads: { label: 'Google', color: '#EA4335' },
                  youtube: { label: 'YouTube', color: '#FF0000' },
                  yt: { label: 'YouTube', color: '#FF0000' },
                  meta: { label: 'Meta', color: '#1877F2' },
                  facebook: { label: 'Meta', color: '#1877F2' },
                  fb: { label: 'Meta', color: '#1877F2' },
                  instagram: { label: 'Instagram', color: '#E4405F' },
                  ig: { label: 'Instagram', color: '#E4405F' },
                  linkedin: { label: 'LinkedIn', color: '#0A66C2' },
                  twitter: { label: 'X', color: '#000000' },
                  x: { label: 'X', color: '#000000' },
                  tiktok: { label: 'TikTok', color: '#000000' },
                  whatsapp: { label: 'WhatsApp', color: '#22C55E' },
                  email: { label: 'Email', color: '#0EA5E9' },
                  newsletter: { label: 'Newsletter', color: '#0EA5E9' },
                  direct: { label: 'Direct', color: '#6B7280' },
                  organic: { label: 'Organic', color: '#84CC16' },
                  referral: { label: 'Referral', color: '#10B981' },
                }

                // Resolve the top badge: utm_source wins, then channel.
                let srcCfg: { label: string; color: string }
                if (utmSourceRaw && utmSourceConfig[utmSourceRaw]) {
                  srcCfg = utmSourceConfig[utmSourceRaw]
                } else if (utmSourceRaw) {
                  // Unknown utm_source — title-case it and use a neutral colour.
                  srcCfg = {
                    label: utmSourceRaw
                      .replace(/[_-]+/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase()),
                    color: '#6366F1',
                  }
                } else {
                  srcCfg = channelConfig[source] || channelConfig.unknown
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
                  pat: 'PAT',
                  demo_booked: 'Demo Booked',
                  demo: 'Demo',
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
                if (formType) {
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

                return (
                  <tr
                    key={lead.id}
                    className="cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ borderBottom: '1px solid var(--border-primary)', height: '62px' }}
                    onClick={() => handleRowClick(lead)}
                  >
                    {/* LEAD - 2 lines: Name + Brand · City */}
                    <td className="px-3 py-2">
                      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                        {displayName}
                      </div>
                      {(brandName || city) && !isEmailAsName && (
                        <div className="text-xs mt-0.5 truncate" style={{ color: '#9ca3af' }}>
                          {[brandName, city].filter(Boolean).join(' \u00b7 ')}
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
                      {lead.email && !isEmailAsName && (
                        <a href={`mailto:${lead.email}`} className="text-xs block truncate hover:underline mt-0.5" style={{ color: '#9ca3af' }} onClick={(e) => e.stopPropagation()} title={lead.email}>
                          {lead.email}
                        </a>
                      )}
                    </td>

                    {/* SOURCE - medium badge + sub-source on its own line, no truncate */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                        style={{ backgroundColor: `${srcCfg.color}15`, color: srcCfg.color }}
                      >
                        {srcCfg.label}
                      </span>
                      {subSource && (
                        <div
                          className="text-[10px] mt-0.5"
                          style={{ color: '#9ca3af' }}
                          title={subSource}
                        >
                          {subSource}
                        </div>
                      )}
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

                    {/* STAGE - badge */}
                    <td className="px-3 py-2">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                        style={stageColor.style || {}}
                      >
                        {displayStage}
                      </span>
                    </td>

                    {/* ACTIVE */}
                    <td className="px-3 py-2 text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {timeAgo(lastActivity)}
                    </td>

                    {/* BOOKING - green if booked, empty if not */}
                    <td className="px-3 py-2 text-xs">
                      {bookingDate ? (
                        <Link
                          href="/dashboard/bookings"
                          className="hover:underline"
                          style={{ color: '#22c55e' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {new Date(bookingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {bookingTime ? (() => {
                            const tp = bookingTime.toString().split(':');
                            if (tp.length < 2) return `, ${bookingTime}`;
                            const h = parseInt(tp[0], 10), m = parseInt(tp[1], 10);
                            if (isNaN(h) || isNaN(m)) return `, ${bookingTime}`;
                            return `, ${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
                          })() : ''}
                        </Link>
                      ) : null}
                    </td>

                    {/* Aviation columns */}
                    {showAviationColumns && (
                      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {lead.unified_context?.[brandId]?.user_type || ''}
                      </td>
                    )}
                    {showAviationColumns && (
                      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {lead.unified_context?.[brandId]?.course_interest || ''}
                      </td>
                    )}
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
    </div>
  )
}
