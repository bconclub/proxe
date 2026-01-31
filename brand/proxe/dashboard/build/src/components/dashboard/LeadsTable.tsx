'use client'

import { useEffect, useState, useMemo, type CSSProperties } from 'react'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { useRealtimeLeads } from '@/hooks/useRealtimeLeads'
import LeadDetailsModal from './LeadDetailsModal'
import type { Lead } from '@/types'
import { calculateLeadScore } from '@/lib/leadScoreCalculator'
import { MdLanguage, MdCall, MdHistory, MdPerson, MdAccessTime, MdTrendingUp, MdTrendingDown, MdRemove, MdFilterList, MdFileDownload, MdSearch } from 'react-icons/md'
import { FaWhatsapp, FaGlobe, FaPhoneAlt, FaUser } from 'react-icons/fa'

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
        'New': { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-800 dark:text-blue-200' },
        'Engaged': { bg: 'bg-cyan-100 dark:bg-cyan-900', text: 'text-cyan-800 dark:text-cyan-200' },
        'Qualified': { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200' },
        'High Intent': { bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-800 dark:text-orange-200' },
        'Booking Made': { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200' },
        'Converted': { bg: 'bg-emerald-100 dark:bg-emerald-900', text: 'text-emerald-800 dark:text-emerald-200' },
        'Closed Lost': { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200' },
        'In Sequence': { bg: '', text: '', style: { backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' } },
        'Cold': { bg: 'bg-gray-100 dark:bg-gray-900', text: 'text-gray-800 dark:text-gray-200' },
    }
    return stageColors[stage || 'New'] || stageColors['New']
}

const getScoreBadgeStyle = (score: number | null | undefined): {
    bg: string;
    badgeColor: string;
    textColor: string;
    label: string;
    hex: string;
    border: string;
} => {
    if (score === null || score === undefined) {
        return {
            bg: 'rgba(156, 163, 175, 0.05)',
            badgeColor: 'bg-gray-400',
            textColor: 'text-gray-500 dark:text-gray-400',
            label: 'N/A',
            hex: '#9CA3AF',
            border: 'rgba(156, 163, 175, 0.2)'
        }
    }
    if (score >= 90) {
        // Hot (90-100): Green
        return {
            bg: 'rgba(34, 197, 94, 0.05)',
            badgeColor: 'bg-green-500',
            textColor: 'text-green-700 dark:text-green-400',
            label: 'Hot',
            hex: '#22C55E',
            border: 'rgba(34, 197, 94, 0.2)'
        }
    }
    if (score >= 70) {
        // Warm (70-89): Orange
        return {
            bg: 'rgba(249, 115, 22, 0.05)',
            badgeColor: 'bg-orange-500',
            textColor: 'text-orange-700 dark:text-orange-400',
            label: 'Warm',
            hex: '#F97316',
            border: 'rgba(249, 115, 22, 0.2)'
        }
    }
    // Cold (0-69): Blue
    return {
        bg: 'rgba(59, 130, 246, 0.05)',
        badgeColor: 'bg-blue-500',
        textColor: 'text-blue-700 dark:text-blue-400',
        label: 'Cold',
        hex: '#3B82F6',
        border: 'rgba(59, 130, 246, 0.2)'
    }
}

// Using Lead type from @/types to match LeadDetailsModal expectations
// Extending it with additional properties from useRealtimeLeads
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
    const [filteredLeads, setFilteredLeads] = useState<ExtendedLead[]>([])
    const [calculatedScores, setCalculatedScores] = useState<Record<string, number>>({})
    const [calculatingScores, setCalculatingScores] = useState(false)
    const [dateFilter, setDateFilter] = useState<string>('all')
    const [sourceFilter, setSourceFilter] = useState<string>(initialSourceFilter || 'all')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [limit, setLimit] = useState<number>(initialLimit || 10)

    // Update limit when initialLimit prop changes
    useEffect(() => {
        if (initialLimit) {
            setLimit(initialLimit)
        }
    }, [initialLimit])

    useEffect(() => {
        let filtered = [...leads]

        // Apply date filter (use last_interaction_at if available, fallback to timestamp)
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

        // Apply source filter (use first_touchpoint or last_touchpoint)
        if (sourceFilter !== 'all') {
            filtered = filtered.filter(
                (lead) =>
                    lead.first_touchpoint === sourceFilter ||
                    lead.last_touchpoint === sourceFilter
            )
        }

        // Apply status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter((lead) => lead.status === statusFilter)
        }

        // Apply limit
        if (limit) {
            filtered = filtered.slice(0, limit)
        }

        setFilteredLeads(filtered as ExtendedLead[])
    }, [leads, dateFilter, sourceFilter, statusFilter, limit])

    // Calculate scores for filtered leads (same calculation as modal)
    useEffect(() => {
        if (filteredLeads.length === 0) return

        setCalculatingScores(true)
        const calculateScores = async () => {
            const scores: Record<string, number> = {}
            // Calculate scores for visible leads (limit to avoid performance issues)
            const leadsToCalculate = filteredLeads.slice(0, 50) // Limit to first 50 for performance

            await Promise.all(
                leadsToCalculate.map(async (lead) => {
                    try {
                        const result = await calculateLeadScore(lead as Lead)
                        scores[lead.id] = result.score
                    } catch (err) {
                        console.error(`Error calculating score for lead ${lead.id}:`, err)
                        // Fallback to stored score if calculation fails
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
        // Convert ExtendedLead to Lead type expected by LeadDetailsModal
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

            // Update local state immediately for better UX
            setFilteredLeads((prev) =>
                prev.map((lead) =>
                    lead.id === leadId ? { ...lead, status: newStatus } : lead
                )
            )

            // Update selected lead if modal is open
            if (selectedLead && selectedLead.id === leadId) {
                setSelectedLead({ ...selectedLead, status: newStatus || null })
            }
        } catch (err) {
            console.error('Error updating status:', err)
            throw err
        }
    }

    const exportToCSV = () => {
        const headers = ['Name', 'Email', 'Phone', 'First Touch', 'Timeline', 'Score', 'Stage', 'Key Event']
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
            const masterData = lead.unified_context?.master || {}
            const timeline = masterData.plan_to_fly || masterData.timeline || ''
            return [
                lead.name || '',
                lead.email || '',
                lead.phone || '',
                lead.first_touchpoint || lead.source || '',
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

    if (loading) {
        return <div className="leads-table-loading text-center py-8 text-gray-900 dark:text-gray-100">Loading leads...</div>
    }

    if (error) {
        return <div className="leads-table-error text-center py-8 text-red-600 dark:text-red-400">Error: {error}</div>
    }

    return (
        <div className="leads-table">
            {/* Header with Limit Selector and View All */}
            {(showLimitSelector || showViewAll) && (
                <div className="leads-table-header mb-4 flex items-center justify-between">
                    {showLimitSelector && (
                        <div className="leads-table-limit-selector flex items-center gap-2">
                            <span className="leads-table-limit-label text-sm" style={{ color: 'var(--text-secondary)' }}>
                                Show:
                            </span>
                            <select
                                value={limit}
                                onChange={(e) => setLimit(Number(e.target.value))}
                                className="leads-table-limit-select px-3 py-1.5 border rounded-md text-sm"
                                style={{
                                    borderColor: 'var(--border-primary)',
                                    backgroundColor: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                }}
                            >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                            </select>
                        </div>
                    )}
                    {showViewAll && (
                        <Link
                            href="/dashboard/leads"
                            className="leads-table-view-all-link text-sm font-medium hover:underline"
                            style={{ color: 'var(--accent-primary)' }}
                        >
                            View All →
                        </Link>
                    )}
                </div>
            )}

            {/* Filters - Only show if not hidden */}
            {!hideFilters && (
                <div className="leads-table-filters mb-4 flex flex-wrap gap-4">
                    <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="leads-table-filter leads-table-filter-date px-3 py-2 border border-gray-300 dark:border-[#3a3a3a] bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-white rounded-md text-sm"
                    >
                        <option value="all">All Dates</option>
                        <option value="today">Today</option>
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                    </select>

                    {!initialSourceFilter && (
                        <select
                            value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value)}
                            className="leads-table-filter leads-table-filter-source px-3 py-2 border border-gray-300 dark:border-[#3a3a3a] bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-white rounded-md text-sm"
                        >
                            <option value="all">All Sources</option>
                            <option value="web">Web</option>
                            <option value="whatsapp">WhatsApp</option>
                            <option value="voice">Voice</option>
                            <option value="social">Social</option>
                        </select>
                    )}

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="leads-table-filter leads-table-filter-status px-3 py-2 border border-gray-300 dark:border-[#3a3a3a] bg-white dark:bg-[#0a0a0a] text-gray-900 dark:text-white rounded-md text-sm"
                    >
                        <option value="all">All Statuses</option>
                        {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                                {status}
                            </option>
                        ))}
                    </select>

                    <button
                        onClick={exportToCSV}
                        className="leads-table-export-button ml-auto px-4 py-2 text-white rounded-md text-sm transition-colors"
                        style={{ backgroundColor: '#666666' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#555555'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#666666'}
                    >
                        Export CSV
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="leads-table-container overflow-x-auto overflow-y-visible">
                <table className="leads-table-table min-w-full divide-y divide-gray-200 dark:divide-[#262626]">
                    <thead className="leads-table-thead bg-gray-50 dark:bg-[#0a0a0a]">
                        <tr className="leads-table-thead-row">
                            <th className="leads-table-th leads-table-th-name px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Name
                            </th>
                            <th className="leads-table-th leads-table-th-email px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Email
                            </th>
                            <th className="leads-table-th leads-table-th-phone px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Phone
                            </th>
                            <th className="leads-table-th leads-table-th-first-touch px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                First Touch
                            </th>
                            <th className="leads-table-th leads-table-th-timeline px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Timeline
                            </th>
                            <th className="leads-table-th leads-table-th-score px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Score
                            </th>
                            <th className="leads-table-th leads-table-th-stage px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Stage
                            </th>
                            <th className="leads-table-th leads-table-th-key-event px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Key Event
                            </th>
                        </tr>
                    </thead>
                    <tbody className="leads-table-tbody bg-white dark:bg-[#0a0a0a] divide-y divide-gray-200 dark:divide-[#3a3a3a]">
                        {filteredLeads.length === 0 ? (
                            <tr className="leads-table-empty-row">
                                <td colSpan={8} className="leads-table-empty-cell px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                                    No leads found
                                </td>
                            </tr>
                        ) : (
                            filteredLeads.map((lead) => (
                                <tr
                                    key={lead.id}
                                    className="leads-table-row hover:bg-gray-50 dark:hover:bg-[#2A1F1A] cursor-pointer transition-colors"
                                    onClick={() => handleRowClick(lead)}
                                >
                                    <td className="leads-table-cell leads-table-cell-name px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                        {lead.name || '-'}
                                    </td>
                                    <td className="leads-table-cell leads-table-cell-email px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {lead.email || '-'}
                                    </td>
                                    <td className="leads-table-cell leads-table-cell-phone px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {lead.phone || '-'}
                                    </td>
                                    <td className="leads-table-cell leads-table-cell-first-touch px-6 py-4 whitespace-nowrap text-sm">
                                        {(() => {
                                            const source = (lead.first_touchpoint || lead.source || 'unknown').toLowerCase()
                                            const config: Record<string, any> = {
                                                web: { icon: MdLanguage, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Web' },
                                                whatsapp: { icon: FaWhatsapp, color: 'text-green-500', bg: 'bg-green-500/10', label: 'WhatsApp' },
                                                voice: { icon: MdCall, color: 'text-purple-500', bg: 'bg-purple-500/10', label: 'Voice' },
                                                social: { icon: MdPerson, color: 'text-pink-500', bg: 'bg-pink-500/10', label: 'Social' },
                                                unknown: { icon: MdHistory, color: 'text-gray-500', bg: 'bg-gray-500/10', label: 'Other' }
                                            }
                                            const active = config[source] || config.unknown
                                            const Icon = active.icon
                                            return (
                                                <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${active.bg}`} >
                                                    <Icon className={active.color} size={14} />
                                                    <span className={`text-[10px] uppercase font-bold ${active.color}`} >
                                                        {active.label}
                                                    </span>
                                                </div>
                                            )
                                        })()}
                                    </td>
                                    <td className="leads-table-cell leads-table-cell-timeline px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {(() => {
                                            const masterData = lead.unified_context?.master || {}
                                            const timeline = masterData.plan_to_fly
                                            if (!timeline) return '-'
                                            // Format timeline for display
                                            const timelineMap: Record<string, string> = {
                                                'asap': 'ASAP',
                                                '1-3mo': '1-3 Months',
                                                '6+mo': '6+ Months',
                                                '1yr+': '1 Year+'
                                            }
                                            return timelineMap[timeline] || timeline
                                        })()}
                                    </td>
                                    <td className="leads-table-cell leads-table-cell-score px-6 py-4 whitespace-nowrap text-sm">
                                        {(() => {
                                            // Use calculated score (same as modal) if available, otherwise fallback to stored score
                                            const calculatedScore = calculatedScores[lead.id]
                                            const score = calculatedScore !== undefined ? calculatedScore : (lead.lead_score ?? (lead as any).leadScore ?? (lead as any).score ?? null)
                                            const badgeStyle = getScoreBadgeStyle(score)
                                            return (
                                                <div
                                                    className="leads-table-score-badge relative rounded-lg px-3 py-1.5 transition-all hover:scale-105 shadow-sm group border"
                                                    style={{
                                                        backgroundColor: badgeStyle.bg,
                                                        borderColor: badgeStyle.border
                                                    }}
                                                >
                                                    {/* Colored indicator at top */}
                                                    <div
                                                        className="absolute top-0 left-0 right-0 h-0.5 rounded-t-lg transition-all group-hover:h-1.5"
                                                        style={{ backgroundColor: badgeStyle.hex }}
                                                    ></div>
                                                    <div className="flex items-center justify-center">
                                                        <span className={`leads-table-score-value font-extrabold text-base ${badgeStyle.textColor}`}
                                                        >
                                                            {score !== null && score !== undefined ? score : '--'}
                                                        </span>
                                                        {(lead.stage_override || (lead as any).stageOverride) && (
                                                            <span className="leads-table-score-override text-[10px] ml-1 opacity-50" title="Manual override">🔒</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })()}
                                    </td>
                                    <td className="leads-table-cell leads-table-cell-stage px-6 py-4 whitespace-nowrap text-sm">
                                        {(() => {
                                            // Try multiple possible property names for stage
                                            const stage = lead.lead_stage ?? (lead as any).leadStage ?? (lead as any).stage ?? null
                                            const subStage = lead.sub_stage ?? (lead as any).subStage ?? null
                                            // Use default stage 'New' if stage is null/undefined/empty
                                            const displayStage = stage || 'New'
                                            if (displayStage && displayStage !== '-') {
                                                return (
                                                    <span
                                                        className={`leads-table-stage-badge px-2.5 py-1 inline-flex text-[10px] font-bold uppercase tracking-wider rounded-full shadow-sm ${getStageColor(displayStage).bg || ''} ${getStageColor(displayStage).text || ''}`}
                                                        style={(getStageColor(displayStage) as any).style}
                                                    >
                                                        {displayStage}
                                                        {subStage && (
                                                            <span className="leads-table-stage-substage ml-1 text-[9px] opacity-75">({subStage})</span>
                                                        )}
                                                    </span>
                                                )
                                            }
                                            return '-'
                                        })()}
                                    </td>
                                    <td className="leads-table-cell leads-table-cell-key-event px-6 py-4 whitespace-nowrap text-sm">
                                        {(() => {
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
                                            if (bookingDate || bookingTime) {
                                                const dateStr = bookingDate ? formatDateTime(bookingDate).split(',')[0] : '';
                                                const timeStr = bookingTime ? (() => {
                                                    const timeParts = bookingTime.toString().split(':');
                                                    if (timeParts.length < 2) return bookingTime.toString();
                                                    const hours = parseInt(timeParts[0], 10);
                                                    const minutes = parseInt(timeParts[1], 10);
                                                    if (isNaN(hours) || isNaN(minutes)) return bookingTime.toString();
                                                    const period = hours >= 12 ? 'PM' : 'AM';
                                                    const hours12 = hours % 12 || 12;
                                                    const minutesStr = minutes.toString().padStart(2, '0');
                                                    return `${hours12}:${minutesStr} ${period}`;
                                                })() : '';
                                                return (
                                                    <Link
                                                        href="/dashboard/bookings"
                                                        className="leads-table-key-event-link text-blue-600 dark:text-blue-400 hover:opacity-80 transition-opacity flex items-center gap-1.5 font-medium"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <MdAccessTime size={14} className="flex-shrink-0" />
                                                        <span>{dateStr && timeStr ? `${dateStr}, ${timeStr}` : dateStr || timeStr || '-'}</span>
                                                    </Link>
                                                );
                                            }
                                            return '-';
                                        })()}
                                    </td>
                                </tr>
                            ))
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
