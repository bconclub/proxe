'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MdClose, MdSend, MdRefresh } from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'

/**
 * WhatsAppTemplatePicker — popover that lists approved Meta WhatsApp message
 * templates and lets the operator send one to the currently-open lead. Used
 * in the inbox reply bar as a fallback when the 24h conversation window has
 * expired (templates are the only sanctioned way to re-open the window).
 *
 * The template list is fetched lazily on first open and cached in localStorage
 * for 10 minutes — Meta's API is slow and the list rarely changes.
 *
 * Variable extraction: Meta returns templates with components that may contain
 * placeholders like {{1}}, {{2}}. We parse those out of the BODY component
 * and render an input field per variable so the operator can fill them in.
 */

const TEMPLATE_CACHE_KEY = 'wc-wa-template-cache-v1'
const TEMPLATE_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | string
  text?: string
  format?: string
  buttons?: any[]
}

interface MetaTemplate {
  name: string
  status: string
  category: string
  language: string
  components: TemplateComponent[]
}

interface WhatsAppTemplatePickerProps {
  open: boolean
  onClose: () => void
  leadId: string
  leadName?: string | null
  onSent?: () => void
  /** anchor element to position the popover near (e.g. the trigger button) */
  anchorRef?: React.RefObject<HTMLElement>
}

interface CachedResponse {
  templates: MetaTemplate[]
  cachedAt: number
}

function loadCache(): CachedResponse | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TEMPLATE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedResponse
    if (Date.now() - parsed.cachedAt > TEMPLATE_CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function saveCache(templates: MetaTemplate[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      TEMPLATE_CACHE_KEY,
      JSON.stringify({ templates, cachedAt: Date.now() } satisfies CachedResponse),
    )
  } catch {
    /* localStorage full / disabled — silently fall back to in-memory */
  }
}

/** Extract {{N}} placeholders from a template body and return the highest N. */
function countBodyVariables(template: MetaTemplate): number {
  const body = template.components.find((c) => c.type === 'BODY')
  if (!body?.text) return 0
  const matches = body.text.match(/\{\{(\d+)\}\}/g) || []
  return matches.reduce((max, m) => {
    const n = parseInt(m.replace(/\{|\}/g, ''), 10)
    return Number.isFinite(n) ? Math.max(max, n) : max
  }, 0)
}

/** Render the body text with {{1}}, {{2}}… replaced by the operator's inputs. */
function renderBodyPreview(template: MetaTemplate, params: string[]): string {
  const body = template.components.find((c) => c.type === 'BODY')
  if (!body?.text) return '(no body)'
  return body.text.replace(/\{\{(\d+)\}\}/g, (_match, n) => {
    const idx = parseInt(n, 10) - 1
    return params[idx]?.trim() || `{{${n}}}`
  })
}

export default function WhatsAppTemplatePicker({
  open,
  onClose,
  leadId,
  leadName,
  onSent,
}: WhatsAppTemplatePickerProps) {
  const [templates, setTemplates] = useState<MetaTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<MetaTemplate | null>(null)
  const [params, setParams] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sentMessage, setSentMessage] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Reset state on every open
  useEffect(() => {
    if (open) {
      setSelectedTemplate(null)
      setParams([])
      setError(null)
      setSentMessage(null)
    }
  }, [open, leadId])

  // Initial fetch — use cache when available
  useEffect(() => {
    if (!open) return
    const cached = loadCache()
    if (cached) {
      setTemplates(cached.templates)
      return
    }
    void fetchTemplates(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function fetchTemplates(forceRefresh: boolean) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/whatsapp/templates', {
        cache: forceRefresh ? 'no-store' : 'default',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Failed to load templates (${res.status})`)
      }
      const data = await res.json()
      const approved = (data.templates || []).filter(
        (t: MetaTemplate) => String(t.status || '').toUpperCase() === 'APPROVED',
      )
      setTemplates(approved)
      saveCache(approved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  function handleSelectTemplate(t: MetaTemplate) {
    setSelectedTemplate(t)
    setParams(new Array(countBodyVariables(t)).fill(''))
    setError(null)
  }

  async function handleSendTemplate() {
    if (!selectedTemplate || sending) return
    setSending(true)
    setError(null)
    try {
      const previewText = renderBodyPreview(selectedTemplate, params)
      const res = await fetch('/api/dashboard/inbox/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          channel: 'whatsapp',
          action: 'send_template',
          templateName: selectedTemplate.name,
          languageCode: selectedTemplate.language || 'en_US',
          bodyParams: params.filter((p) => p.length > 0),
          // Persist the rendered text so the conversation log reads naturally
          renderedText: previewText,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || data?.error?.error?.message || `Send failed (${res.status})`)
      }
      setSentMessage(`Template "${selectedTemplate.name}" sent.`)
      onSent?.()
      // Close after a short confirmation flash
      window.setTimeout(() => onClose(), 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send template')
    } finally {
      setSending(false)
    }
  }

  const variableCount = useMemo(
    () => (selectedTemplate ? countBodyVariables(selectedTemplate) : 0),
    [selectedTemplate],
  )
  const allParamsFilled = useMemo(
    () => params.slice(0, variableCount).every((p) => p.trim().length > 0),
    [params, variableCount],
  )

  if (!open) return null

  return (
    <>
      {/* backdrop — clicking it closes the popover */}
      <div
        className="fixed inset-0 z-[70]"
        onClick={onClose}
        aria-hidden="true"
        style={{ background: 'rgba(0,0,0,0.35)' }}
      />
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Send WhatsApp template"
        className="fixed z-[71] flex flex-col rounded-xl border shadow-2xl"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-primary)',
          width: 'min(440px, 92vw)',
          maxHeight: '70vh',
          right: '24px',
          bottom: '96px',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2 border-b"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <FaWhatsapp size={14} style={{ color: '#25D366' }} />
          <span className="text-[12px] font-semibold flex-1">
            {selectedTemplate ? selectedTemplate.name : 'WhatsApp templates'}
          </span>
          {!selectedTemplate && (
            <button
              type="button"
              onClick={() => fetchTemplates(true)}
              className="p-1 rounded hover:opacity-80"
              title="Refresh template list"
              aria-label="Refresh"
              disabled={loading}
            >
              <MdRefresh size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:opacity-80"
            title="Close"
            aria-label="Close"
          >
            <MdClose size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3">
          {error && (
            <div
              className="mb-2 px-2.5 py-1.5 rounded text-[11px]"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
            >
              {error}
            </div>
          )}

          {sentMessage && (
            <div
              className="mb-2 px-2.5 py-1.5 rounded text-[11px]"
              style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}
            >
              {sentMessage}
            </div>
          )}

          {/* List view */}
          {!selectedTemplate && (
            <>
              {loading && templates.length === 0 && (
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Loading templates…
                </div>
              )}
              {!loading && templates.length === 0 && !error && (
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  No approved templates found on this WABA.
                </div>
              )}
              <ul className="space-y-1.5">
                {templates.map((t) => {
                  const body = t.components.find((c) => c.type === 'BODY')
                  const preview = body?.text?.slice(0, 110) || '(no body)'
                  return (
                    <li key={`${t.name}-${t.language}`}>
                      <button
                        type="button"
                        onClick={() => handleSelectTemplate(t)}
                        className="w-full text-left p-2 rounded-lg border hover:opacity-90 transition"
                        style={{
                          background: 'var(--bg-primary)',
                          borderColor: 'var(--border-primary)',
                        }}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[11px] font-semibold truncate flex-1">
                            {t.name}
                          </span>
                          <span
                            className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                            style={{
                              background: 'rgba(99,102,241,0.18)',
                              color: '#a5b4fc',
                            }}
                          >
                            {t.category}
                          </span>
                          <span
                            className="text-[8px] uppercase tracking-wider"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {t.language}
                          </span>
                        </div>
                        <div
                          className="text-[10px] leading-snug"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {preview}
                          {body?.text && body.text.length > 110 ? '…' : ''}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {/* Detail / parameter form */}
          {selectedTemplate && (
            <div>
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="text-[10px] mb-2 underline"
                style={{ color: 'var(--text-muted)' }}
              >
                ← back to list
              </button>

              {variableCount > 0 && (
                <div className="mb-3">
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Variables ({variableCount})
                  </div>
                  <div className="space-y-1.5">
                    {Array.from({ length: variableCount }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-mono"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {`{{${i + 1}}}`}
                        </span>
                        <input
                          type="text"
                          value={params[i] || ''}
                          onChange={(e) => {
                            const next = [...params]
                            next[i] = e.target.value
                            setParams(next)
                          }}
                          placeholder={
                            i === 0 && leadName ? leadName : `Value for {{${i + 1}}}`
                          }
                          className="flex-1 text-[12px] px-2 py-1 rounded border outline-none"
                          style={{
                            background: 'var(--bg-primary)',
                            borderColor: 'var(--border-primary)',
                            color: 'var(--text-primary)',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Preview
              </div>
              <div
                className="p-2.5 rounded-lg text-[12px] whitespace-pre-wrap leading-snug mb-3"
                style={{
                  background: 'rgba(37,211,102,0.08)',
                  borderLeft: '3px solid #25D366',
                  color: 'var(--text-primary)',
                }}
              >
                {renderBodyPreview(selectedTemplate, params)}
              </div>

              <button
                type="button"
                onClick={handleSendTemplate}
                disabled={sending || !allParamsFilled}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold transition disabled:opacity-50"
                style={{
                  background: '#25D366',
                  color: '#0a0a0a',
                }}
              >
                <MdSend size={14} />
                {sending ? 'Sending…' : 'Send template'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
