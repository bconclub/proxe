'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  MdClose,
  MdBusiness,
  MdEmail,
  MdPhone,
  MdLanguage,
  MdTrendingUp,
  MdCalendarToday,
  MdRefresh,
  MdSmartToy,
  MdEdit,
  MdCheckCircle,
  MdAccessTime,
  MdSend,
  MdPhoneInTalk,
  MdArrowForward,
  MdWarning,
  MdInfo,
} from 'react-icons/md'

import { 
  JourneyStageId, 
  getStage, 
  getToneColor,
  LEAD_STAGE_TO_JOURNEY,
  STAGE_MAP,
} from '@/lib/constants/flowStages'
import { 
  ExtractedBusinessIntel,
  extractBusinessIntel,
  updateLeadContext,
} from '@/lib/services/contextBuilder'
import {
  StageDetectionResult,
  SuggestedAction,
  detectStage,
  executeAction,
  overrideLeadStage,
} from '@/lib/services/stageDetector'
import {
  LeadSummary,
  getLeadSummary,
  refreshSummary,
} from '@/lib/services/summaryGenerator'

// ============================================================================
// TYPES
// ============================================================================

interface Lead {
  id: string
  customer_name: string
  email?: string
  customer_phone_normalized?: string
  lead_stage: string
  lead_score: number
  response_count: number
  last_interaction_at?: string
  first_message_at?: string
  booking_date?: string
  booking_time?: string
  unified_context?: {
    business_name?: string
    business_type?: string
    email?: string
    website_url?: string
    phone?: string
    extracted_intel?: ExtractedBusinessIntel
    ai_summary?: LeadSummary
    demo_completed?: boolean
    proposal_sent?: boolean
    payment_received?: boolean
    pain_points?: string[]
    service_interests?: string[]
    [key: string]: any
  }
  metadata?: {
    stage_override?: boolean
    [key: string]: any
  }
}

interface LeadDetailsModalProps {
  lead: Lead | null
  isOpen: boolean
  onClose: () => void
  onUpdate?: () => void
}

// ============================================================================
// COMPONENTS
// ============================================================================

export default function LeadDetailsModal({
  lead,
  isOpen,
  onClose,
  onUpdate,
}: LeadDetailsModalProps) {
  const [loading, setLoading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [executingAction, setExecutingAction] = useState<string | null>(null)
  
  const [intel, setIntel] = useState<ExtractedBusinessIntel | null>(null)
  const [stageResult, setStageResult] = useState<StageDetectionResult | null>(null)
  const [summary, setSummary] = useState<LeadSummary | null>(null)
  
  const [editMode, setEditMode] = useState(false)
  const [editedIntel, setEditedIntel] = useState<Partial<ExtractedBusinessIntel>>({})

  // Load data when modal opens
  useEffect(() => {
    if (isOpen && lead) {
      loadData()
    }
  }, [isOpen, lead?.id])

  const loadData = async () => {
    if (!lead) return
    setLoading(true)

    try {
      // Load extracted intel
      const extracted = lead.unified_context?.extracted_intel || null
      setIntel(extracted)
      setEditedIntel(extracted || {})

      // Load stage detection
      const stageData: any = {
        id: lead.id,
        lead_stage: lead.lead_stage,
        response_count: lead.response_count,
        lead_score: lead.lead_score,
        first_message_at: lead.first_message_at,
        last_interaction_at: lead.last_interaction_at,
        booking_date: lead.booking_date,
        booking_time: lead.booking_time,
        unified_context: lead.unified_context,
        metadata: lead.metadata,
      }
      const detection = detectStage(stageData)
      setStageResult(detection)

      // Load summary
      const sum = lead.unified_context?.ai_summary || null
      setSummary(sum)
      
      if (!sum || !sum.text) {
        refreshLeadSummary()
      }
    } catch (error) {
      console.error('Failed to load lead data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExtract = async () => {
    if (!lead) return
    setExtracting(true)
    
    try {
      const result = await extractBusinessIntel(lead.id)
      if (result) {
        setIntel(result)
        setEditedIntel(result)
        onUpdate?.()
      }
    } catch (error) {
      console.error('Extraction failed:', error)
    } finally {
      setExtracting(false)
    }
  }

  const refreshLeadSummary = async () => {
    if (!lead) return
    setGeneratingSummary(true)
    
    try {
      const result = await refreshSummary(lead.id)
      if (result) {
        setSummary(result)
      }
    } catch (error) {
      console.error('Summary refresh failed:', error)
    } finally {
      setGeneratingSummary(false)
    }
  }

  const handleExecuteAction = async (action: SuggestedAction) => {
    if (!lead) return
    setExecutingAction(action.id)
    
    try {
      const success = await executeAction(lead.id, action)
      if (success) {
        // Refresh to show updated state
        loadData()
        onUpdate?.()
      }
    } catch (error) {
      console.error('Action execution failed:', error)
    } finally {
      setExecutingAction(null)
    }
  }

  const handleSaveEdits = async () => {
    if (!lead) return
    
    try {
      await updateLeadContext(lead.id, editedIntel)
      setIntel({ ...intel, ...editedIntel } as ExtractedBusinessIntel)
      setEditMode(false)
      onUpdate?.()
    } catch (error) {
      console.error('Save failed:', error)
    }
  }

  const handleStageOverride = async (newStage: JourneyStageId) => {
    if (!lead) return
    
    try {
      await overrideLeadStage(lead.id, newStage, 'Manual override from lead modal')
      // Refresh
      loadData()
      onUpdate?.()
    } catch (error) {
      console.error('Stage override failed:', error)
    }
  }

  const openFlowBuilder = (stageId: JourneyStageId) => {
    window.open(`/dashboard/flows?stage=${stageId}`, '_blank')
  }

  if (!isOpen || !lead) return null

  const businessName = intel?.business_name || lead.unified_context?.business_name
  const businessType = intel?.business_type || lead.unified_context?.business_type
  const email = intel?.email || lead.email || lead.unified_context?.email
  const phone = intel?.phone || lead.customer_phone_normalized
  const website = intel?.website_url || lead.unified_context?.website_url

  const stage = stageResult?.detectedStage || LEAD_STAGE_TO_JOURNEY[lead.lead_stage] || 'one_touch'
  const stageConfig = getStage(stage)
  const toneStyle = getToneColor(stageConfig.tone)

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-primary, #0f0f0f)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflow: 'auto',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <HeaderSection
          lead={lead}
          businessName={businessName}
          businessType={businessType}
          email={email}
          phone={phone}
          website={website}
          stage={stage}
          stageResult={stageResult}
          toneStyle={toneStyle}
          onClose={onClose}
          onStageOverride={handleStageOverride}
          openFlowBuilder={openFlowBuilder}
        />

        {/* Content */}
        <div style={{ padding: 24 }}>
          {/* Business Intel Section */}
          <BusinessIntelSection
            intel={intel}
            editMode={editMode}
            editedIntel={editedIntel}
            extracting={extracting}
            onEdit={() => setEditMode(true)}
            onSave={handleSaveEdits}
            onCancel={() => {
              setEditMode(false)
              setEditedIntel(intel || {})
            }}
            onExtract={handleExtract}
            onChange={setEditedIntel}
          />

          {/* Live Summary Section */}
          <SummarySection
            summary={summary}
            generating={generatingSummary}
            onRefresh={refreshLeadSummary}
          />

          {/* Stage & Next Actions Section */}
          <NextActionsSection
            stage={stage}
            stageResult={stageResult}
            actions={stageResult?.suggestedActions || []}
            executingAction={executingAction}
            onExecute={handleExecuteAction}
          />

          {/* Footer */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Lead ID: {lead.id.slice(0, 8)}... • Last updated: {intel?.extracted_at 
                ? new Date(intel.extracted_at).toLocaleString()
                : 'Never'
              }
            </span>
            <button
              onClick={loadData}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'var(--text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <MdRefresh size={16} />
              Refresh Data
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// HEADER SECTION (GPFC 3)
// ============================================================================

function HeaderSection({
  lead,
  businessName,
  businessType,
  email,
  phone,
  website,
  stage,
  stageResult,
  toneStyle,
  onClose,
  onStageOverride,
  openFlowBuilder,
}: {
  lead: Lead
  businessName?: string
  businessType?: string
  email?: string
  phone?: string
  website?: string
  stage: JourneyStageId
  stageResult: StageDetectionResult | null
  toneStyle: { bg: string; color: string; label: string }
  onClose: () => void
  onStageOverride: (stage: JourneyStageId) => void
  openFlowBuilder: (stage: JourneyStageId) => void
}) {
  const [showStageDropdown, setShowStageDropdown] = useState(false)

  const stageConfig = getStage(stage)
  const isAiDetected = stageResult?.detectedBy === 'ai' || stageResult?.detectedBy === 'rule'
  const isManual = stageResult?.detectedBy === 'manual'

  return (
    <div
      style={{
        padding: '24px 24px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)',
      }}
    >
      {/* Top Row: Avatar + Name + Close */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
        {/* Avatar */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {lead.customer_name.charAt(0).toUpperCase()}
        </div>

        {/* Name + Business Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            {lead.customer_name}
          </h2>
          
          {businessName && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-primary)',
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              <MdBusiness size={16} style={{ color: '#8b5cf6' }} />
              {businessName}
            </div>
          )}
          
          {businessType && (
            <span
              style={{
                display: 'inline-block',
                padding: '3px 10px',
                background: 'rgba(139, 92, 246, 0.15)',
                color: '#a78bfa',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              {businessType}
            </span>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <MdClose size={20} />
        </button>
      </div>

      {/* Contact Info Row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
        <ContactItem 
          icon={<MdEmail size={14} />} 
          value={email} 
          placeholder="No email captured"
          type="email"
        />
        <ContactItem 
          icon={<MdPhone size={14} />} 
          value={phone} 
          placeholder="No phone"
          type="phone"
        />
        <ContactItem 
          icon={<MdLanguage size={14} />} 
          value={website} 
          placeholder="No website"
          type="website"
        />
      </div>

      {/* Stage Badge Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Stage Badge */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowStageDropdown(!showStageDropdown)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              background: toneStyle.bg,
              border: `1px solid ${toneStyle.color}40`,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            <MdTrendingUp size={16} style={{ color: toneStyle.color }} />
            <span style={{ color: toneStyle.color, fontSize: 13, fontWeight: 600 }}>
              {stageConfig.name.toUpperCase()}
            </span>
            {isAiDetected && (
              <MdSmartToy size={14} style={{ color: toneStyle.color, opacity: 0.7 }} title="AI Detected" />
            )}
            {isManual && (
              <MdEdit size={14} style={{ color: toneStyle.color, opacity: 0.7 }} title="Manual Override" />
            )}
          </button>

          {/* Stage Dropdown */}
          {showStageDropdown && (
            <StageDropdown
              currentStage={stage}
              onSelect={(s) => {
                onStageOverride(s)
                setShowStageDropdown(false)
              }}
              onClose={() => setShowStageDropdown(false)}
            />
          )}
        </div>

        {/* Score Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: lead.lead_score >= 61 
              ? 'rgba(245, 158, 11, 0.15)' 
              : 'rgba(255,255,255,0.06)',
            borderRadius: 8,
          }}
        >
          <span style={{ 
            fontSize: 12, 
            color: lead.lead_score >= 61 ? '#f59e0b' : 'var(--text-secondary)',
            fontWeight: 600,
          }}>
            Score: {lead.lead_score}
          </span>
        </div>

        {/* Confidence Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <ConfidenceDot confidence={stageResult?.confidence || 'low'} />
          {stageResult?.detectedBy === 'manual' ? 'Manual' : 'AI Detected'}
          {stageResult?.confidence && ` • ${stageResult.confidence} confidence`}
        </div>

        {/* Flow Builder Link */}
        <button
          onClick={() => openFlowBuilder(stage)}
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            background: 'transparent',
            border: '1px dashed rgba(255,255,255,0.2)',
            borderRadius: 6,
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          View Templates
          <MdArrowForward size={14} />
        </button>
      </div>

      {/* Detection Reasons */}
      {stageResult?.reasons && stageResult.reasons.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {stageResult.reasons.map((reason, i) => (
            <span
              key={i}
              style={{
                padding: '3px 8px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 4,
                fontSize: 10,
                color: 'var(--text-muted)',
              }}
            >
              {reason}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ContactItem({
  icon,
  value,
  placeholder,
  type,
}: {
  icon: React.ReactNode
  value?: string
  placeholder: string
  type: 'email' | 'phone' | 'website'
}) {
  const hasValue = !!value

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: hasValue ? 'var(--text-secondary)' : 'var(--text-muted)',
        fontSize: 13,
      }}
    >
      {icon}
      {hasValue ? (
        type === 'website' ? (
          <a
            href={value?.startsWith('http') ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6', textDecoration: 'none' }}
          >
            {value?.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span>{value}</span>
        )
      ) : (
        <span style={{ fontStyle: 'italic', opacity: 0.6 }}>{placeholder}</span>
      )}
    </div>
  )
}

function ConfidenceDot({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const colors = {
    high: '#22c55e',
    medium: '#f59e0b',
    low: '#ef4444',
  }

  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: colors[confidence],
        display: 'inline-block',
      }}
    />
  )
}

function StageDropdown({
  currentStage,
  onSelect,
  onClose,
}: {
  currentStage: JourneyStageId
  onSelect: (stage: JourneyStageId) => void
  onClose: () => void
}) {
  const stages = Object.values(STAGE_MAP)

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          background: 'var(--bg-secondary, #1a1a1a)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          padding: 8,
          minWidth: 200,
          zIndex: 100,
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--text-muted)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 6,
          }}
        >
          Override Stage
        </div>
        {stages.map((stage) => (
          <button
            key={stage.id}
            onClick={() => onSelect(stage.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              background: currentStage === stage.id ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: 'none',
              borderRadius: 6,
              color: currentStage === stage.id ? '#fff' : 'var(--text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: stage.color,
              }}
            />
            {stage.name}
            {currentStage === stage.id && (
              <MdCheckCircle size={14} style={{ marginLeft: 'auto', color: '#22c55e' }} />
            )}
          </button>
        ))}
      </div>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99,
        }}
        onClick={onClose}
      />
    </>
  )
}

// ============================================================================
// BUSINESS INTEL SECTION (GPFC 1)
// ============================================================================

function BusinessIntelSection({
  intel,
  editMode,
  editedIntel,
  extracting,
  onEdit,
  onSave,
  onCancel,
  onExtract,
  onChange,
}: {
  intel: ExtractedBusinessIntel | null
  editMode: boolean
  editedIntel: Partial<ExtractedBusinessIntel>
  extracting: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onExtract: () => void
  onChange: (intel: Partial<ExtractedBusinessIntel>) => void
}) {
  const hasData = intel?.business_name || intel?.business_type || intel?.pain_points?.length

  return (
    <Section title="Business Intelligence" icon={<MdBusiness size={18} />}>
      {!hasData && !editMode ? (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 10,
            border: '1px dashed rgba(255,255,255,0.1)',
          }}
        >
          <p style={{ margin: '0 0 12px 0', color: 'var(--text-muted)', fontSize: 14 }}>
            No business intelligence extracted yet
          </p>
          <button
            onClick={onExtract}
            disabled={extracting}
            style={{
              padding: '10px 20px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 8,
              color: '#3b82f6',
              fontSize: 13,
              fontWeight: 600,
              cursor: extracting ? 'not-allowed' : 'pointer',
              opacity: extracting ? 0.6 : 1,
            }}
          >
            {extracting ? 'Extracting...' : 'Extract from Conversation'}
          </button>
        </div>
      ) : editMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            label="Business Name"
            value={editedIntel.business_name || ''}
            onChange={(v) => onChange({ ...editedIntel, business_name: v })}
          />
          <Input
            label="Business Type"
            value={editedIntel.business_type || ''}
            onChange={(v) => onChange({ ...editedIntel, business_type: v })}
          />
          <Input
            label="Email"
            value={editedIntel.email || ''}
            onChange={(v) => onChange({ ...editedIntel, email: v })}
          />
          <Input
            label="Website"
            value={editedIntel.website_url || ''}
            onChange={(v) => onChange({ ...editedIntel, website_url: v })}
          />
          <TextArea
            label="Pain Points (comma separated)"
            value={editedIntel.pain_points?.join(', ') || ''}
            onChange={(v) => onChange({ ...editedIntel, pain_points: v.split(',').map(s => s.trim()).filter(Boolean) })}
          />
          <TextArea
            label="Service Interests (comma separated)"
            value={editedIntel.service_interests?.join(', ') || ''}
            onChange={(v) => onChange({ ...editedIntel, service_interests: v.split(',').map(s => s.trim()).filter(Boolean) })}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={onSave}
              style={{
                padding: '10px 20px',
                background: '#22c55e',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save Changes
            </button>
            <button
              onClick={onCancel}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8,
                color: 'var(--text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
            }}
          >
            <InfoItem label="Business Name" value={intel?.business_name} />
            <InfoItem label="Business Type" value={intel?.business_type} />
            <InfoItem label="Decision Timeline" value={intel?.decision_timeline} />
            <InfoItem label="Budget Indication" value={intel?.budget_indication} />
          </div>
          
          {(intel?.pain_points?.length || intel?.service_interests?.length) && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {intel?.pain_points?.length ? (
                <TagList label="Pain Points" tags={intel.pain_points} color="#ef4444" />
              ) : null}
              {intel?.service_interests?.length ? (
                <TagList label="Service Interests" tags={intel.service_interests} color="#3b82f6" />
              ) : null}
            </div>
          )}
          
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={onEdit}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <MdEdit size={14} />
              Edit
            </button>
            <button
              onClick={onExtract}
              disabled={extracting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: extracting ? 'not-allowed' : 'pointer',
                opacity: extracting ? 0.6 : 1,
              }}
            >
              <MdRefresh size={14} />
              {extracting ? 'Extracting...' : 'Re-extract'}
            </button>
          </div>
        </div>
      )}
    </Section>
  )
}

function InfoItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: value ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 500 }}>
        {value || '—'}
      </div>
    </div>
  )
}

function TagList({ label, tags, color }: { label: string; tags: string[]; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tags.map((tag, i) => (
          <span
            key={i}
            style={{
              padding: '4px 10px',
              background: `${color}20`,
              color,
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// SUMMARY SECTION (GPFC 4)
// ============================================================================

function SummarySection({
  summary,
  generating,
  onRefresh,
}: {
  summary: LeadSummary | null
  generating: boolean
  onRefresh: () => void
}) {
  return (
    <Section title="Live Summary" icon={<MdSmartToy size={18} />}>
      {generating || !summary?.text ? (
        <div
          style={{
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 10,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              border: '2px solid rgba(255,255,255,0.1)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Generating AI summary...
          </span>
        </div>
      ) : (
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.7,
              color: 'var(--text-primary)',
            }}
          >
            {summary.text}
          </p>
          
          {summary.keyPoints && (
            <div
              style={{
                marginTop: 16,
                padding: 16,
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 8,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 12,
              }}
            >
              <KeyPoint label="Business" value={summary.keyPoints.business} />
              <KeyPoint label="Status" value={summary.keyPoints.currentStatus} />
              <KeyPoint label="Goals" value={summary.keyPoints.goals} />
              <KeyPoint label="Next Action" value={summary.keyPoints.nextAction} />
            </div>
          )}
          
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Generated: {new Date(summary.generatedAt).toLocaleString()}
            </span>
            <button
              onClick={onRefresh}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: 'transparent',
                border: 'none',
                color: '#3b82f6',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <MdRefresh size={14} />
              Refresh
            </button>
          </div>
        </div>
      )}
    </Section>
  )
}

function KeyPoint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
        {value || '—'}
      </div>
    </div>
  )
}

// ============================================================================
// NEXT ACTIONS SECTION (GPFC 5)
// ============================================================================

function NextActionsSection({
  stage,
  stageResult,
  actions,
  executingAction,
  onExecute,
}: {
  stage: JourneyStageId
  stageResult: StageDetectionResult | null
  actions: SuggestedAction[]
  executingAction: string | null
  onExecute: (action: SuggestedAction) => void
}) {
  const stageConfig = getStage(stage)
  
  return (
    <Section title="Next Actions" icon={<MdCalendarToday size={18} />}>
      {actions.length === 0 ? (
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 10,
            color: 'var(--text-muted)',
            fontSize: 14,
          }}
        >
          No actions recommended for this stage
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {actions.map((action) => {
            const isExecuting = executingAction === action.id
            const isOverdue = action.dueIn && action.dueIn < 0
            const isDueSoon = action.dueIn && action.dueIn < 60 && action.dueIn >= 0

            return (
              <div
                key={action.id}
                style={{
                  padding: 16,
                  background: isOverdue 
                    ? 'rgba(239, 68, 68, 0.08)' 
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isOverdue ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                {/* Action Icon */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: action.type === 'send_template' 
                      ? 'rgba(59, 130, 246, 0.15)' 
                      : action.type === 'schedule_call'
                      ? 'rgba(139, 92, 246, 0.15)'
                      : 'rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: action.type === 'send_template' 
                      ? '#3b82f6' 
                      : action.type === 'schedule_call'
                      ? '#8b5cf6'
                      : 'var(--text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  {action.type === 'send_template' ? <MdSend size={18} /> : 
                   action.type === 'schedule_call' ? <MdPhoneInTalk size={18} /> : 
                   <MdAccessTime size={18} />}
                </div>

                {/* Action Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {action.label}
                    </span>
                    {(isOverdue || isDueSoon) && (
                      <span
                        style={{
                          padding: '2px 6px',
                          background: isOverdue ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: isOverdue ? '#ef4444' : '#f59e0b',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        {isOverdue ? `Overdue ${Math.abs(Math.round(action.dueIn! / 60))}h` : 'Due soon'}
                      </span>
                    )}
                  </div>
                  
                  <p
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                    }}
                  >
                    {action.description}
                  </p>
                  
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      fontSize: 12,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <MdAccessTime size={14} />
                    {action.timing}
                    {action.templateId && (
                      <>
                        <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
                        <span style={{ color: '#3b82f6' }}>Template: {action.templateId}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Execute Button */}
                {action.autoExecutable && (
                  <button
                    onClick={() => onExecute(action)}
                    disabled={isExecuting}
                    style={{
                      padding: '8px 16px',
                      background: stageConfig.color + '20',
                      border: `1px solid ${stageConfig.color}40`,
                      borderRadius: 6,
                      color: stageConfig.color,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: isExecuting ? 'not-allowed' : 'pointer',
                      opacity: isExecuting ? 0.6 : 1,
                      flexShrink: 0,
                    }}
                  >
                    {isExecuting ? '...' : 'Execute'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          color: 'var(--text-primary)',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          color: 'var(--text-primary)',
          fontSize: 14,
          outline: 'none',
        }}
      />
    </div>
  )
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          color: 'var(--text-primary)',
          fontSize: 14,
          outline: 'none',
          resize: 'vertical',
        }}
      />
    </div>
  )
}
