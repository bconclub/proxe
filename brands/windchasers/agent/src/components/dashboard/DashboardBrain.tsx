'use client'

/**
 * DashboardBrain — ask-anything panel over the live dashboard data.
 *
 * Floating button (home page, stacked under the eye + bell) opens a right
 * slide-out chat. Questions go to /api/dashboard/brain, which gathers
 * aggregates (leads today, pipeline, today's changes, upcoming bookings) and
 * answers with Sonnet 4.6.
 */

import { useState, useRef, useEffect, useCallback, Fragment } from 'react'
import { MdClose, MdSend } from 'react-icons/md'
import ProxeMark from '@/components/ProxeMark'

type Msg = { role: 'user' | 'assistant'; content: string }

// Inline bold: split on **...** and wrap the captured parts in <strong>.
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((p, i) =>
    i % 2 === 1
      ? <strong key={`${keyPrefix}-b-${i}`}>{p}</strong>
      : <Fragment key={`${keyPrefix}-t-${i}`}>{p}</Fragment>,
  )
}

// Minimal markdown: bold, "- " bullets, blank-line spacing. The brain replies
// in markdown; without this the bubble showed literal ** and - .
const isPipeRow = (s: string) => s.includes('|')
const isSepRow = (s: string) => /^[\s|:_-]+$/.test(s) && s.includes('|')
const splitCells = (s: string) => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())

function renderRich(content: string) {
  const lines = content.replace(/\r/g, '').split('\n')
  const out: React.ReactNode[] = []
  let bullets: string[] = []
  const flush = (key: string) => {
    if (bullets.length === 0) return
    out.push(
      <ul key={`ul-${key}`} className="list-disc pl-4 space-y-0.5 my-1">
        {bullets.map((b, i) => <li key={`li-${key}-${i}`}>{renderInline(b, `li-${key}-${i}`)}</li>)}
      </ul>,
    )
    bullets = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i].trimEnd()

    // ── Table block: 2+ consecutive pipe rows → real <table> ────────────────
    if (isPipeRow(line) && i + 1 < lines.length && isPipeRow(lines[i + 1].trimEnd())) {
      flush(String(i))
      const block: string[] = []
      let j = i
      while (j < lines.length && isPipeRow(lines[j].trimEnd())) { block.push(lines[j].trimEnd()); j++ }
      const rows = block.filter((r) => !isSepRow(r)).map(splitCells)
      if (rows.length >= 1) {
        const header = rows[0]
        const body = rows.slice(1)
        out.push(
          <table key={`tb-${i}`} className="w-full text-xs my-1.5" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {header.map((c, ci) => (
                  <th key={ci} className="text-left font-semibold py-1 pr-3"
                    style={{ borderBottom: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>
                    {renderInline(c, `th-${i}-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            {body.length > 0 && (
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className="py-1 pr-3 align-top" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                        {renderInline(c, `td-${i}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )}
          </table>,
        )
      }
      i = j
      continue
    }

    // Lone pipe row (rare) → join cells so no raw pipes show.
    let text = line
    if (isPipeRow(text) && !isSepRow(text)) text = splitCells(text).filter(Boolean).join('  ·  ')
    else if (isSepRow(text)) { i++; continue }

    // Horizontal rule.
    if (/^\s*-{3,}\s*$/.test(text)) { i++; continue }

    // Heading "### Foo" → bold line.
    const h = text.match(/^\s*#{1,6}\s+(.*)$/)
    if (h) { flush(String(i)); out.push(<p key={`h-${i}`} className="font-semibold mt-1">{renderInline(h[1], `h-${i}`)}</p>); i++; continue }

    // Bullet.
    const m = text.match(/^\s*[-*•]\s+(.*)$/)
    if (m) { bullets.push(m[1]); i++; continue }

    flush(String(i))
    if (text.trim() === '') { out.push(<div key={`sp-${i}`} className="h-1.5" />); i++; continue }
    out.push(<p key={`p-${i}`} className="leading-snug">{renderInline(text, `p-${i}`)}</p>)
    i++
  }
  flush('end')
  return out
}

const SUGGESTIONS = [
  'What happened today?',
  'How many leads today?',
  "What's my pipeline?",
  'Any upcoming bookings?',
]

const LOADING_MSGS = [
  'Pulling lead numbers…',
  'Reading your pipeline…',
  "Checking today's bookings…",
  'Crunching the data…',
]

export default function DashboardBrain() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [followups, setFollowups] = useState<string[]>([])
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MSGS[0])
  const endRef = useRef<HTMLDivElement | null>(null)

  // Rotate the loading status so it reads as real work, not a stuck "Thinking…".
  useEffect(() => {
    if (!loading) return
    let i = 0
    setLoadingMsg(LOADING_MSGS[0])
    const id = setInterval(() => { i = (i + 1) % LOADING_MSGS.length; setLoadingMsg(LOADING_MSGS[i]) }, 1200)
    return () => clearInterval(id)
  }, [loading])

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, open])

  const ask = useCallback(async (question: string) => {
    const q = question.trim()
    if (!q || loading) return
    setError(null)
    const history = messages.slice(-6)
    setMessages((m) => [...m, { role: 'user', content: q }])
    setInput('')
    setFollowups([])
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to answer')
      setMessages((m) => [...m, { role: 'assistant', content: data.answer || '(no answer)' }])
      setFollowups(Array.isArray(data.followups) ? data.followups : [])
    } catch (err: any) {
      setError(err?.message || 'Failed to answer')
    } finally {
      setLoading(false)
    }
  }, [loading, messages])

  return (
    <>
      {/* Brain button — stacked under the eye (14) + bell (54). */}
      <button
        onClick={() => setOpen(true)}
        className="fixed z-[60] flex items-center justify-center rounded-full shadow-lg transition hover:opacity-90"
        style={{
          top: '94px',
          right: '20px',
          width: '36px',
          height: '36px',
          backgroundColor: 'var(--button-bg)',
          color: 'var(--text-button)',
          border: '1px solid var(--border-primary)',
        }}
        aria-label="Ask PROXe"
        title="Ask PROXe"
      >
        <ProxeMark size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70]" aria-modal="true" role="dialog">
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={() => setOpen(false)} />
          <div
            className="absolute top-0 right-0 h-full flex flex-col shadow-2xl"
            style={{
              width: '420px',
              maxWidth: '94vw',
              backgroundColor: 'var(--bg-secondary)',
              borderLeft: '1px solid var(--border-primary)',
              animation: 'wc-brain-in 220ms cubic-bezier(0.2,0,0,1)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-primary)' }}>
              <div className="flex items-center gap-2">
                <ProxeMark size={18} color="var(--accent-primary)" />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Ask PROXe</h3>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-md" style={{ color: 'var(--text-secondary)' }} aria-label="Close">
                <MdClose size={18} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <ProxeMark size={30} color="var(--accent-primary)" className="mx-auto" />
                  <p className="text-sm mt-2" style={{ color: 'var(--text-primary)' }}>Ask anything about your dashboard.</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Leads, pipeline, today’s activity, bookings.</p>
                  <div className="flex flex-col gap-2 mt-4">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => ask(s)}
                        className="text-left text-xs px-3 py-2 rounded-lg border transition-colors"
                        style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[85%] px-3 py-2 rounded-2xl text-sm"
                    style={
                      m.role === 'user'
                        ? { backgroundColor: 'var(--button-bg)', color: 'var(--text-button)', borderBottomRightRadius: 4, whiteSpace: 'pre-wrap' }
                        : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', borderBottomLeftRadius: 4 }
                    }
                  >
                    {m.role === 'assistant' ? renderRich(m.content) : m.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-2xl text-sm" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                    <ProxeMark size={14} color="var(--accent-primary)" className="animate-pulse" />
                    <span>{loadingMsg}</span>
                  </div>
                </div>
              )}
              {/* Tap-through follow-ups after the latest answer */}
              {!loading && followups.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {followups.map((f) => (
                    <button
                      key={f}
                      onClick={() => ask(f)}
                      className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                      style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-subtle)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-3 border-t flex items-center gap-2 flex-shrink-0" style={{ borderColor: 'var(--border-primary)' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }}
                placeholder="Ask about your dashboard…"
                disabled={loading}
                className="flex-1 px-3 py-2 rounded-lg border text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] disabled:opacity-50"
                style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={() => ask(input)}
                disabled={loading || !input.trim()}
                className="p-2 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: 'var(--button-bg)', color: 'var(--text-button)' }}
                aria-label="Send"
              >
                <MdSend size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes wc-brain-in {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}
