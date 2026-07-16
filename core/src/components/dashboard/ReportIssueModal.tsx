'use client'

/**
 * Report Issue — one modal, every brand. A teammate hits the sidebar button,
 * pastes/drops a screenshot, says what's wrong, and the report lands in the
 * brand's own Supabase storage (`issue-reports` bucket) via
 * /api/dashboard/report-issue. HQ pulls every brand's bucket into the
 * issues vault with scripts/issues-sync/pull-issues.mjs.
 *
 * Brand-neutral by construction: brand id/name come from getBrandConfig(),
 * everything else is theme CSS vars.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getBrandConfig } from '@/configs'
import { APP_VERSION } from '@/lib/generated-version'
import { MdClose, MdOutlineImage, MdCheckCircle } from 'react-icons/md'

// ---------------------------------------------------------------------------
// Console-error ring buffer. Installed once on first import (dashboard layout
// imports this file, so it's armed on every dashboard page). Reports carry the
// last few runtime errors — often the actual bug, for free.
// ---------------------------------------------------------------------------
const errorBuffer: string[] = []
const ERROR_BUFFER_MAX = 8
if (typeof window !== 'undefined' && !(window as any).__issueErrorBufferArmed) {
  ;(window as any).__issueErrorBufferArmed = true
  window.addEventListener('error', (e) => {
    const line = `${new Date().toISOString()} ${e.message} (${e.filename ?? '?'}:${e.lineno ?? '?'})`
    errorBuffer.push(line)
    if (errorBuffer.length > ERROR_BUFFER_MAX) errorBuffer.shift()
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason)
    errorBuffer.push(`${new Date().toISOString()} unhandled rejection: ${reason}`)
    if (errorBuffer.length > ERROR_BUFFER_MAX) errorBuffer.shift()
  })
}

const SEVERITIES = [
  { id: 'blocking', label: 'Blocking work' },
  { id: 'broken', label: "Something's wrong" },
  { id: 'idea', label: 'Suggestion' },
] as const

const MAX_SHOTS = 4
const MAX_SHOT_BYTES = 8 * 1024 * 1024

interface Shot {
  file: File
  url: string // object URL for preview
}

interface ReportIssueModalProps {
  open: boolean
  onClose: () => void
}

export default function ReportIssueModal({ open, onClose }: ReportIssueModalProps) {
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<string>('broken')
  const [shots, setShots] = useState<Shot[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneId, setDoneId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Captured at open so a route change mid-typing doesn't relabel the report.
  const pageAtOpen = useRef<string>('')

  const addFiles = useCallback((files: FileList | File[]) => {
    setError(null)
    setShots((prev) => {
      const next = [...prev]
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) continue
        if (f.size > MAX_SHOT_BYTES) {
          setError('Image too large (max 8MB).')
          continue
        }
        if (next.length >= MAX_SHOTS) break
        next.push({ file: f, url: URL.createObjectURL(f) })
      }
      return next
    })
  }, [])

  // Paste-to-attach anywhere while the modal is open — the core flow:
  // PrtScn / Win+Shift+S, then Ctrl+V straight into the modal.
  useEffect(() => {
    if (!open) return
    pageAtOpen.current = window.location.pathname + window.location.search
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imgs: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) imgs.push(f)
        }
      }
      if (imgs.length) {
        e.preventDefault()
        addFiles(imgs)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKey)
    // Focus the textarea so paste + typing both just work.
    setTimeout(() => textareaRef.current?.focus(), 50)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, addFiles, onClose])

  // Fresh form on every open; revoke stale previews on unmount/close.
  useEffect(() => {
    if (open) {
      setDescription('')
      setSeverity('broken')
      setShots((prev) => {
        prev.forEach((s) => URL.revokeObjectURL(s.url))
        return []
      })
      setError(null)
      setDoneId(null)
      setSubmitting(false)
    }
  }, [open])

  const removeShot = (idx: number) => {
    setShots((prev) => {
      const s = prev[idx]
      if (s) URL.revokeObjectURL(s.url)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleSubmit = async () => {
    if (submitting) return
    if (!description.trim() && shots.length === 0) {
      setError('Add a screenshot or describe the issue.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { brand, name } = getBrandConfig()
      const fd = new FormData()
      fd.append('description', description.trim())
      fd.append('severity', severity)
      fd.append(
        'context',
        JSON.stringify({
          brand,
          brand_name: name,
          page: pageAtOpen.current || window.location.pathname,
          url: window.location.href,
          version: APP_VERSION,
          user_agent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          screen: `${window.screen.width}x${window.screen.height}`,
          online: navigator.onLine,
          recent_errors: errorBuffer.slice(-ERROR_BUFFER_MAX),
        }),
      )
      shots.forEach((s) => fd.append('screenshots', s.file, s.file.name || 'screenshot.png'))

      const res = await fetch('/api/dashboard/report-issue', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to send (${res.status})`)
      }
      setDoneId(data.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send report')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="report-issue-overlay fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="report-issue-modal w-full rounded-xl shadow-2xl flex flex-col"
        style={{
          maxWidth: '540px',
          maxHeight: 'min(640px, 92vh)',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Report an issue"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between flex-shrink-0 px-5 py-4 border-b"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Report an issue
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Paste a screenshot (Ctrl+V) and tell us what went wrong.
            </p>
          </div>
          <button
            onClick={onClose}
            className="touch-44 p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            aria-label="Close"
          >
            <MdClose size={18} />
          </button>
        </div>

        {doneId ? (
          /* Success state */
          <div className="flex flex-col items-center text-center px-6 py-10 gap-3">
            <MdCheckCircle size={40} style={{ color: 'var(--accent-primary)' }} />
            <div className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Report sent
            </div>
            <div className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              Logged as <span className="font-mono">{doneId}</span>. The team reviews every
              report — fixes ship in updates.
            </div>
            <button
              onClick={onClose}
              className="mt-3 px-5 py-2 rounded-lg text-[13px] font-semibold"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)' }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {/* Screenshot zone */}
              <div
                className="rounded-lg flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
                style={{
                  border: `1.5px dashed ${dragOver ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  backgroundColor: dragOver ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                  padding: shots.length ? '10px' : '22px 16px',
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) addFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                {shots.length === 0 ? (
                  <>
                    <MdOutlineImage size={26} style={{ color: 'var(--text-muted)' }} />
                    <div className="text-[13px] mt-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Paste, drop, or click to add a screenshot
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Win+Shift+S then Ctrl+V works great
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-4 gap-2 w-full">
                    {shots.map((s, i) => (
                      <div key={s.url} className="relative rounded-md overflow-hidden" style={{ border: '1px solid var(--border-primary)' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt={`Screenshot ${i + 1}`} className="w-full h-16 object-cover" />
                        <button
                          onClick={(e) => { e.stopPropagation(); removeShot(i) }}
                          className="absolute top-0.5 right-0.5 rounded-full flex items-center justify-center"
                          style={{ width: 18, height: 18, backgroundColor: 'rgba(0,0,0,0.65)', color: '#fff' }}
                          aria-label={`Remove screenshot ${i + 1}`}
                        >
                          <MdClose size={12} />
                        </button>
                      </div>
                    ))}
                    {shots.length < MAX_SHOTS && (
                      <div
                        className="flex items-center justify-center rounded-md h-16 text-[11px]"
                        style={{ border: '1px dashed var(--border-primary)', color: 'var(--text-muted)' }}
                      >
                        + add
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              <textarea
                ref={textareaRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What's wrong? What did you expect to happen?"
                rows={3}
                className="w-full rounded-lg px-3 py-2.5 text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              />

              {/* Severity chips */}
              <div className="flex items-center gap-2 flex-wrap">
                {SEVERITIES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSeverity(s.id)}
                    className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors"
                    style={{
                      border: `1px solid ${severity === s.id ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                      backgroundColor: severity === s.id ? 'var(--accent-subtle)' : 'transparent',
                      color: severity === s.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {error && (
                <div className="text-[12px] rounded-md px-3 py-2" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between flex-shrink-0 px-5 py-3.5 border-t"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Page, app version &amp; browser info attach automatically.
              </span>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-opacity"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--bg-primary)',
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                {submitting ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
