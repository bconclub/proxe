'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MdSearch, MdFilterList, MdDragIndicator } from 'react-icons/md'

// --- Types ---

interface Lead {
  id: string
  name: string
  company?: string
  brand?: string
  lead_score: number | null
  first_touchpoint: string | null
  last_touchpoint: string | null
  last_interaction_at: string | null
  city: string | null
  lead_stage: string | null
  phone?: string
}

interface Stage {
  id: string
  label: string
  color: string
}

const STAGES: Stage[] = [
  { id: 'New', label: 'New', color: '#6b7280' },
  { id: 'Engaged', label: 'Engaged', color: '#3b82f6' },
  { id: 'MQL', label: 'MQL', color: '#06b6d4' },
  { id: 'SQL', label: 'SQL', color: '#8b5cf6' },
  { id: 'Booking Made', label: 'Booking Made', color: '#f59e0b' },
  { id: 'Call/Demo Done', label: 'Call/Demo Done', color: '#22c55e' },
  { id: 'Proposal Sent', label: 'Proposal Sent', color: '#22c55e' },
  { id: 'Closed Won', label: 'Closed Won', color: '#22c55e' },
  { id: 'Closed Lost', label: 'Closed Lost', color: '#ef4444' },
]

// Map DB lead_stage to pipeline column
function mapStageToColumn(stage: string | null): string {
  if (!stage) return 'New'
  const map: Record<string, string> = {
    'New': 'New',
    'Engaged': 'Engaged',
    'Qualified': 'MQL',
    'High Intent': 'SQL',
    'Booking Made': 'Booking Made',
    'Converted': 'Closed Won',
    'Cold': 'Closed Lost',
    'Closed Lost': 'Closed Lost',
  }
  return map[stage] || 'New'
}

// Map pipeline column back to DB stage for PATCH
function mapColumnToDbStage(column: string): string {
  const map: Record<string, string> = {
    'New': 'New',
    'Engaged': 'Engaged',
    'MQL': 'Qualified',
    'SQL': 'High Intent',
    'Booking Made': 'Booking Made',
    'Call/Demo Done': 'High Intent',
    'Proposal Sent': 'High Intent',
    'Closed Won': 'Converted',
    'Closed Lost': 'Closed Lost',
  }
  return map[column] || 'New'
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function scoreColor(score: number | null): { bg: string; text: string } {
  if (score === null || score === undefined) return { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' }
  if (score >= 60) return { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' }
  if (score >= 30) return { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' }
  return { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' }
}

function channelIcon(lead: Lead) {
  const channel = lead.last_touchpoint || lead.first_touchpoint
  if (channel === 'whatsapp') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#22c55e">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.214l-.293-.175-2.828.84.84-2.828-.175-.293A8 8 0 1112 20z"/>
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#6b7280">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
    </svg>
  )
}

// --- Sortable Lead Card ---

function SortableLeadCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCard lead={lead} />
    </div>
  )
}

function LeadCard({ lead }: { lead: Lead }) {
  const sc = scoreColor(lead.lead_score)
  return (
    <div
      style={{
        background: 'var(--bg-secondary, rgba(255,255,255,0.04))',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'grab',
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
      className="lead-card"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, lineHeight: '18px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.name || 'Unknown'}
          </div>
          {(lead.company || lead.brand) && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lead.company || lead.brand}
            </div>
          )}
        </div>
        {lead.lead_score !== null && lead.lead_score !== undefined && (
          <span
            style={{
              background: sc.bg,
              color: sc.text,
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            {lead.lead_score}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        {channelIcon(lead)}
        <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          {relativeTime(lead.last_interaction_at)}
        </span>
        {lead.city && (
          <>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10 }}>·</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lead.city}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// --- Column ---

function StageColumn({ stage, leads }: { stage: Stage; leads: Lead[] }) {
  return (
    <div
      style={{
        minWidth: 260,
        maxWidth: 300,
        flex: '1 0 260px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        style={{
          borderTop: `3px solid ${stage.color}`,
          background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTopColor: stage.color,
          borderTopWidth: 3,
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 14px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}>{stage.label}</span>
          <span
            style={{
              color: 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: 500,
              background: 'rgba(255,255,255,0.06)',
              padding: '2px 8px',
              borderRadius: 10,
            }}
          >
            {leads.length}
          </span>
        </div>
        {/* Cards */}
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            {leads.map((lead) => (
              <SortableLeadCard key={lead.id} lead={lead} />
            ))}
          </SortableContext>
          {leads.length === 0 && (
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', padding: '20px 0', opacity: 0.5 }}>
              No leads
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Main Page ---

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'web'>('all')
  const [sortBy, setSortBy] = useState<'score' | 'activity'>('activity')
  const [activeId, setActiveId] = useState<string | null>(null)
  // Track pipeline column assignment per lead
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/leads?limit=500')
      const data = await res.json()
      const fetched: Lead[] = data.leads || []
      setLeads(fetched)
      // Build initial column map from DB stage
      const map: Record<string, string> = {}
      fetched.forEach((l) => {
        map[l.id] = mapStageToColumn(l.lead_stage)
      })
      setColumnMap(map)
    } catch (err) {
      console.error('Failed to fetch leads:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  // Filter + sort
  const filteredLeads = leads.filter((l) => {
    if (search) {
      const q = search.toLowerCase()
      const nameMatch = (l.name || '').toLowerCase().includes(q)
      const companyMatch = (l.company || l.brand || '').toLowerCase().includes(q)
      if (!nameMatch && !companyMatch) return false
    }
    if (channelFilter !== 'all') {
      const ch = l.last_touchpoint || l.first_touchpoint || ''
      if (channelFilter === 'whatsapp' && ch !== 'whatsapp') return false
      if (channelFilter === 'web' && ch === 'whatsapp') return false
    }
    return true
  })

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    if (sortBy === 'score') return (b.lead_score || 0) - (a.lead_score || 0)
    return new Date(b.last_interaction_at || 0).getTime() - new Date(a.last_interaction_at || 0).getTime()
  })

  // Group by pipeline column
  const grouped: Record<string, Lead[]> = {}
  STAGES.forEach((s) => (grouped[s.id] = []))
  sortedLeads.forEach((l) => {
    const col = columnMap[l.id] || mapStageToColumn(l.lead_stage)
    if (grouped[col]) grouped[col].push(l)
    else grouped['New'].push(l)
  })

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const leadId = active.id as string
    const overId = over.id as string

    // Determine target column: either dropped on a column or on another lead
    let targetColumn: string | null = null

    // Check if dropped on a stage column
    const stage = STAGES.find((s) => s.id === overId)
    if (stage) {
      targetColumn = stage.id
    } else {
      // Dropped on a lead — find that lead's column
      targetColumn = columnMap[overId] || null
    }

    if (!targetColumn) return
    const currentColumn = columnMap[leadId]
    if (currentColumn === targetColumn) return

    // Optimistically update
    setColumnMap((prev) => ({ ...prev, [leadId]: targetColumn! }))

    // PATCH to API
    const dbStage = mapColumnToDbStage(targetColumn)
    try {
      await fetch(`/api/dashboard/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: dbStage,
          stage_override: true,
          override_reason: `Moved to ${targetColumn} via pipeline`,
        }),
      })
    } catch (err) {
      console.error('Failed to update stage:', err)
      // Revert on error
      setColumnMap((prev) => ({ ...prev, [leadId]: currentColumn }))
    }
  }

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading pipeline…</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '0 2px' }}>
        <h1 style={{ color: 'var(--text-primary)', fontSize: 18, fontWeight: 700, margin: 0 }}>Pipeline</h1>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}
        </span>
        <div style={{ flex: 1 }} />

        {/* Channel filters */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'whatsapp', 'web'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.08)',
                background: channelFilter === ch ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: channelFilter === ch ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {ch === 'all' ? 'All' : ch === 'whatsapp' ? 'WhatsApp' : 'Web'}
            </button>
          ))}
        </div>

        {/* Sort toggle */}
        <button
          onClick={() => setSortBy(sortBy === 'score' ? 'activity' : 'score')}
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <MdFilterList size={14} />
          {sortBy === 'score' ? 'By Score' : 'By Activity'}
        </button>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <MdSearch
            size={16}
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
          />
          <input
            type="text"
            placeholder="Search leads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              paddingLeft: 30,
              padding: '6px 12px 6px 30px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-primary)',
              fontSize: 13,
              width: 200,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Kanban Board */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div style={{ display: 'flex', gap: 12, height: '100%', minWidth: 'fit-content', paddingBottom: 8 }}>
            {STAGES.map((stage) => (
              <StageColumn key={stage.id} stage={stage} leads={grouped[stage.id]} />
            ))}
          </div>
          <DragOverlay>
            {activeLead ? <LeadCard lead={activeLead} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <style>{`
        .lead-card:hover {
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  )
}
