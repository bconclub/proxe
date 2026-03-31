'use client'

import React, { useState, useEffect } from 'react'
import {
  MdClose,
  MdCheckCircle,
  MdWarning,
  MdSchedule,
  MdWhatsapp,
  MdPhoneInTalk,
  MdContentCopy,
  MdSave,
} from 'react-icons/md'

import {
  JourneyStageId,
  Channel,
  Variant,
  getStage,
} from '@/lib/constants/flowStages'

interface MetaTemplate {
  id: string
  name: string
  language: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED'
  category: string
  components: any[]
}

interface TemplateAssignmentModalProps {
  isOpen: boolean
  onClose: () => void
  stageId: JourneyStageId | null
  day: number | null
  channel: Channel | null
  brand?: string
  onAssigned: () => void
}

export default function TemplateAssignmentModal({
  isOpen,
  onClose,
  stageId,
  day,
  channel,
  brand = 'default',
  onAssigned,
}: TemplateAssignmentModalProps) {
  const [metaTemplates, setMetaTemplates] = useState<MetaTemplate[]>([])
  const [existingTemplates, setExistingTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form state
  const [selectedVariant, setSelectedVariant] = useState<Variant>('A')
  const [selectedMetaTemplate, setSelectedMetaTemplate] = useState<string>('')
  const [customContent, setCustomContent] = useState('')

  const stage = stageId ? getStage(stageId) : null

  useEffect(() => {
    if (isOpen && stageId && day && channel) {
      loadData()
    }
  }, [isOpen, stageId, day, channel])

  const loadData = async () => {
    setLoading(true)
    try {
      // Fetch Meta templates
      const metaRes = await fetch('/api/dashboard/flows/templates?source=meta')
      const metaData = await metaRes.json()
      setMetaTemplates(metaData.templates || [])

      // Fetch existing templates for this slot
      if (stageId && day && channel) {
        const existingRes = await fetch(
          `/api/dashboard/flows/templates?stage=${stageId}&day=${day}&channel=${channel}`
        )
        const existingData = await existingRes.json()
        setExistingTemplates(existingData.templates || [])
      }
    } catch (error) {
      console.error('Failed to load templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!stageId || !day || !channel || !selectedMetaTemplate) return

    setSaving(true)
    try {
      const metaTemplate = metaTemplates.find(t => t.name === selectedMetaTemplate)
      
      const res = await fetch('/api/dashboard/flows/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId,
          day,
          channel,
          variant: selectedVariant,
          metaTemplateName: selectedMetaTemplate,
          content: customContent || metaTemplate?.components?.find((c: any) => c.type === 'BODY')?.text || '',
          language: metaTemplate?.language || 'en',
          brand,
        }),
      })

      if (res.ok) {
        onAssigned()
        onClose()
      } else {
        const err = await res.json()
        alert('Failed to assign: ' + (err.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Save failed:', error)
      alert('Failed to assign template')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !stageId || !day || !channel) return null

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
          maxWidth: 560,
          maxHeight: '90vh',
          overflow: 'auto',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              Assign Template
            </h2>
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: 13,
                color: 'var(--text-secondary)',
              }}
            >
              {stage?.name} • Day {day} • {channel === 'whatsapp' ? 'WhatsApp' : 'Voice'}
            </p>
          </div>
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

        {/* Content */}
        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '2px solid rgba(255,255,255,0.1)',
                  borderTopColor: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px',
                }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                Loading templates...
              </span>
            </div>
          ) : (
            <>
              {/* Variant Selector */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  Variant (A/B/C Test)
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['A', 'B', 'C'] as Variant[]).map((v) => {
                    const existing = existingTemplates.find((t) => t.variant === v)
                    return (
                      <button
                        key={v}
                        onClick={() => setSelectedVariant(v)}
                        style={{
                          flex: 1,
                          padding: '12px 16px',
                          background:
                            selectedVariant === v
                              ? 'rgba(59, 130, 246, 0.2)'
                              : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${
                            selectedVariant === v
                              ? '#3b82f6'
                              : 'rgba(255,255,255,0.1)'
                          }`,
                          borderRadius: 8,
                          cursor: 'pointer',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color:
                              selectedVariant === v ? '#3b82f6' : 'var(--text-primary)',
                          }}
                        >
                          Variant {v}
                        </div>
                        {existing && (
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 11,
                              color:
                                existing.meta_status === 'approved'
                                  ? '#22c55e'
                                  : existing.meta_status === 'rejected'
                                  ? '#ef4444'
                                  : '#f59e0b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                            }}
                          >
                            {existing.meta_status === 'approved' ? (
                              <MdCheckCircle size={12} />
                            ) : (
                              <MdWarning size={12} />
                            )}
                            {existing.meta_status}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Meta Template Selector */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  Meta Template
                </label>
                <select
                  value={selectedMetaTemplate}
                  onChange={(e) => {
                    setSelectedMetaTemplate(e.target.value)
                    const template = metaTemplates.find(
                      (t) => t.name === e.target.value
                    )
                    if (template) {
                      const bodyText =
                        template.components?.find((c: any) => c.type === 'BODY')
                          ?.text || ''
                      setCustomContent(bodyText)
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Select a template...</option>
                  {metaTemplates.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name} ({template.status.toLowerCase()})
                    </option>
                  ))}
                </select>
                {metaTemplates.length === 0 && (
                  <p
                    style={{
                      margin: '8px 0 0 0',
                      fontSize: 12,
                      color: '#ef4444',
                    }}
                  >
                    <MdWarning size={12} style={{ marginRight: 4 }} />
                    No Meta templates found. Sync with Meta first.
                  </p>
                )}
              </div>

              {/* Content Preview/Edit */}
              {selectedMetaTemplate && (
                <div style={{ marginBottom: 20 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      marginBottom: 8,
                      textTransform: 'uppercase',
                      fontWeight: 600,
                    }}
                  >
                    Content Preview
                  </label>
                  <textarea
                    value={customContent}
                    onChange={(e) => setCustomContent(e.target.value)}
                    rows={6}
                    style={{
                      width: '100%',
                      padding: 12,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      color: 'var(--text-primary)',
                      fontSize: 14,
                      lineHeight: 1.6,
                      resize: 'vertical',
                      outline: 'none',
                    }}
                  />
                  <p
                    style={{
                      margin: '8px 0 0 0',
                      fontSize: 11,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <MdContentCopy size={11} style={{ marginRight: 4 }} />
                    Edit if needed - this is stored for reference
                  </p>
                </div>
              )}

              {/* Existing Assignments */}
              {existingTemplates.length > 0 && (
                <div
                  style={{
                    marginBottom: 20,
                    padding: 16,
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 8,
                  }}
                >
                  <h4
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Currently Assigned
                  </h4>
                  {existingTemplates.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      <span
                        style={{
                          padding: '2px 8px',
                          background:
                            t.variant === 'A'
                              ? 'rgba(59,130,246,0.2)'
                              : t.variant === 'B'
                              ? 'rgba(34,197,94,0.2)'
                              : 'rgba(139,92,246,0.2)',
                          color:
                            t.variant === 'A'
                              ? '#3b82f6'
                              : t.variant === 'B'
                              ? '#22c55e'
                              : '#8b5cf6',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {t.variant}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          fontSize: 13,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {t.meta_template_name}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color:
                            t.meta_status === 'approved'
                              ? '#22c55e'
                              : t.meta_status === 'rejected'
                              ? '#ef4444'
                              : '#f59e0b',
                        }}
                      >
                        {t.meta_status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleSave}
                  disabled={!selectedMetaTemplate || saving}
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    background: '#3b82f6',
                    border: 'none',
                    borderRadius: 8,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: !selectedMetaTemplate || saving ? 'not-allowed' : 'pointer',
                    opacity: !selectedMetaTemplate || saving ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <MdSave size={18} />
                  {saving ? 'Saving...' : 'Assign Template'}
                </button>
                <button
                  onClick={onClose}
                  style={{
                    padding: '12px 24px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8,
                    color: 'var(--text-secondary)',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
