'use client'

// Campaigns — a chat-driven campaign builder. Describe who you want to reach;
// the brain pulls the real audience (count + sample), lines up approved
// WhatsApp templates or drafts fresh ones with {{variables}}, and the campaign
// saves as 'ready'. Sending stays a separate explicit step (not built here).

import React, { useEffect, useRef, useState } from 'react'
import {
  MdCampaign, MdSend, MdPersonOutline, MdCheckCircle, MdEditNote,
  MdDeleteOutline, MdExpandMore, MdExpandLess, MdOutlineSms,
} from 'react-icons/md'
import { brandConfig } from '@/configs'

// ─── Types (mirror the API) ──────────────────────────────────────────────────

interface Audience {
  description: string
  filters: Record<string, unknown>
  count: number
  with_phone: number
  sample: Array<{ name: string; phone?: string; stage?: string }>
}
interface Tpl {
  name: string
  body: string
  footer?: string | null
  buttons?: string[] | null
  status: 'approved' | 'draft'
  variables?: string[]
}
interface Reply {
  message: string
  audience: Audience | null
  templates: Tpl[]
  drafts: Tpl[]
  suggestedCampaignName: string | null
}
interface Msg {
  role: 'user' | 'assistant'
  content: string
  reply?: Reply
}
interface SavedCampaign {
  id: string
  name: string
  status: string
  audience: { description: string; count: number }
  template: { name: string; status: string } | null
  created_at: string
}

const GREEN = '#22c55e', AMBER = '#f59e0b', PURPLE = '#8b5cf6'

const SUGGESTIONS = [
  'Webinar registrants who never replied on WhatsApp',
  'Qualified pilot-training leads from the last 30 days',
  'Cabin Crew leads that came from Instagram',
  'Leads that went quiet for 14+ days — re-engagement',
]

// Body text with {{variables}} highlighted.
function TplBody({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^}]+\}\})/g)
  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((p, i) =>
        /^\{\{[^}]+\}\}$/.test(p)
          ? <span key={i} className="font-semibold px-1 rounded" style={{ background: `${PURPLE}22`, color: PURPLE }}>{p}</span>
          : <span key={i}>{p}</span>,
      )}
    </span>
  )
}

// WhatsApp-style template preview card.
function TemplateCard({ t, selected, onSelect }: { t: Tpl; selected: boolean; onSelect: () => void }) {
  const tone = t.status === 'approved' ? GREEN : AMBER
  return (
    <button
      type="button"
      onClick={onSelect}
      className="text-left rounded-xl border p-3 w-full transition-all"
      style={{
        borderColor: selected ? PURPLE : 'var(--border-primary)',
        boxShadow: selected ? `0 0 0 1px ${PURPLE}` : 'none',
        background: 'var(--bg-secondary)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ background: `${tone}22`, color: tone }}>
          {t.status === 'approved' ? 'Approved' : 'Draft'}
        </span>
        <span className="text-[11px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{t.name}</span>
        {selected && <MdCheckCircle size={15} style={{ color: PURPLE, marginLeft: 'auto', flexShrink: 0 }} />}
      </div>
      <div className="rounded-lg px-3 py-2 text-[12.5px] leading-relaxed" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
        <TplBody text={t.body} />
        {t.footer && <div className="text-[10.5px] mt-1.5" style={{ color: 'var(--text-muted)' }}>{t.footer}</div>}
      </div>
      {(t.buttons?.length || 0) > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {t.buttons!.map((b) => (
            <span key={b} className="text-[11px] px-2.5 py-1 rounded-md border" style={{ borderColor: 'var(--border-primary)', color: '#3b82f6' }}>{b}</span>
          ))}
        </div>
      )}
    </button>
  )
}

function AudienceCard({ a }: { a: Audience }) {
  const chips = Object.entries(a.filters || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: `color-mix(in srgb, #3b82f6 35%, var(--border-primary))`, background: `color-mix(in srgb, #3b82f6 6%, var(--bg-secondary))` }}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full shrink-0" style={{ background: '#3b82f622', color: '#3b82f6' }}><MdPersonOutline size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{a.with_phone ?? a.count}</span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>reachable on WhatsApp{a.count !== a.with_phone ? ` · ${a.count} matched total` : ''}</span>
          </div>
          <div className="text-[12px] truncate" style={{ color: 'var(--text-secondary)' }}>{a.description}</div>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex gap-1.5 mt-2.5 flex-wrap">
          {chips.map(([k, v]) => (
            <span key={k} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{k}: {String(v)}</span>
          ))}
        </div>
      )}
      {(a.sample?.length || 0) > 0 && (
        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          {a.sample.slice(0, 8).map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[11.5px] min-w-0">
              <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
              <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{s.phone}</span>
              {s.stage && <span className="shrink-0 text-[9.5px] px-1.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>{s.stage}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CampaignsPage() {
  // Feature gate — the nav row is hidden for brands without the flag, but the
  // URL is still typeable; show a plain notice instead of a dead chat.
  if (!brandConfig.features?.campaigns) {
    return (
      <div className="max-w-[560px] mx-auto text-center py-20">
        <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Campaigns isn't enabled for this brand</div>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Switch it on in the brand config (features.campaigns) to use the campaign builder.</div>
      </div>
    )
  }
  return <CampaignsChat />
}

function CampaignsChat() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Latest plan the user can save: audience from the newest assistant reply +
  // whichever template card they picked.
  const [selectedTpl, setSelectedTpl] = useState<Tpl | null>(null)
  const [campaignName, setCampaignName] = useState('')
  const [saving, setSaving] = useState(false)

  const [saved, setSaved] = useState<SavedCampaign[]>([])
  const [showSaved, setShowSaved] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)

  const loadSaved = () => {
    fetch('/api/dashboard/campaigns')
      .then((r) => r.json())
      .then((d) => setSaved(Array.isArray(d.campaigns) ? d.campaigns : []))
      .catch(() => {})
  }
  useEffect(loadSaved, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const latestReply = [...messages].reverse().find((m) => m.role === 'assistant' && m.reply)?.reply || null
  const audience = latestReply?.audience || null

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setError(null)
    setInput('')
    const next: Msg[] = [...messages, { role: 'user' as const, content: q }]
    setMessages(next)
    setBusy(true)
    try {
      const res = await fetch('/api/dashboard/campaigns/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Campaign brain failed')
      const reply: Reply = d.reply
      setMessages((cur) => [...cur, { role: 'assistant', content: reply.message, reply }])
      setSelectedTpl(null)
      if (reply.suggestedCampaignName) setCampaignName(reply.suggestedCampaignName)
    } catch (e: any) {
      setError(e.message)
      setMessages((cur) => cur.slice(0, -1))
      setInput(q)
    }
    setBusy(false)
  }

  const saveCampaign = async () => {
    if (!audience || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim() || `Campaign ${new Date().toLocaleDateString()}`,
          audience,
          template: selectedTpl,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || 'Save failed')
      loadSaved()
      setShowSaved(true)
      setMessages((cur) => [...cur, {
        role: 'assistant',
        content: `Saved "${d.campaign.name}" — ${d.campaign.audience.count} people${selectedTpl ? `, template ${selectedTpl.name}` : ''}. Status: ${d.campaign.status}.`,
      }])
    } catch (e: any) {
      setError(e.message)
    }
    setSaving(false)
  }

  const removeCampaign = async (id: string) => {
    await fetch(`/api/dashboard/campaigns?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
    loadSaved()
  }

  return (
    <div className="max-w-[880px] mx-auto flex flex-col" style={{ height: 'calc(100vh - 96px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 pb-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0" style={{ background: `${PURPLE}1c`, color: PURPLE }}>
          <MdCampaign size={22} />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Campaigns</h1>
          <p className="text-[11.5px]" style={{ color: 'var(--text-secondary)' }}>
            Say who you want to reach — {brandConfig.name} pulls the list and lines up the message.
          </p>
        </div>
      </div>

      {/* Saved campaigns */}
      {saved.length > 0 && (
        <div className="rounded-xl border mb-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
          <button
            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => setShowSaved((s) => !s)}
          >
            Saved campaigns · {saved.length}
            <span className="ml-auto" style={{ color: 'var(--text-muted)' }}>{showSaved ? <MdExpandLess size={16} /> : <MdExpandMore size={16} />}</span>
          </button>
          {showSaved && (
            <div className="px-3.5 pb-3 space-y-1.5">
              {saved.slice(0, 8).map((c) => (
                <div key={c.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border-primary)' }}>
                  <span
                    className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0"
                    style={{
                      background: c.status === 'ready' ? `${GREEN}22` : c.status === 'sent' ? '#3b82f622' : 'var(--bg-hover)',
                      color: c.status === 'ready' ? GREEN : c.status === 'sent' ? '#3b82f6' : 'var(--text-muted)',
                    }}
                  >
                    {c.status}
                  </span>
                  <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
                  <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>{c.audience?.count} people</span>
                  {c.template && (
                    <span className="text-[10.5px] font-mono truncate hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{c.template.name}</span>
                  )}
                  <button onClick={() => removeCampaign(c.id)} className="ml-auto shrink-0 p-1" title="Delete" style={{ color: 'var(--text-muted)' }}>
                    <MdDeleteOutline size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${PURPLE}1c`, color: PURPLE }}><MdOutlineSms size={24} /></span>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Who do you want to reach?</div>
            <div className="text-xs max-w-[380px]" style={{ color: 'var(--text-secondary)' }}>
              Describe the audience in plain words. I'll pull the matching leads, show approved templates, or draft new ones with variables.
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-[560px] mt-1">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-[11.5px] px-3 py-1.5 rounded-full border transition-colors hover:opacity-80" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'space-y-2.5'}>
            {m.role === 'user' ? (
              <div className="rounded-2xl rounded-br-md px-3.5 py-2 max-w-[75%] text-[13px]" style={{ background: `color-mix(in srgb, var(--accent-primary) 16%, var(--bg-primary))`, color: 'var(--text-primary)' }}>
                {m.content}
              </div>
            ) : (
              <>
                <div className="rounded-2xl rounded-bl-md px-3.5 py-2 max-w-[85%] text-[13px] leading-relaxed" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}>
                  {m.content}
                </div>
                {m.reply?.audience && <AudienceCard a={m.reply.audience} />}
                {(m.reply?.templates?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Approved templates — pick one</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {m.reply!.templates.map((t) => (
                        <TemplateCard key={t.name} t={{ ...t, status: 'approved' }} selected={selectedTpl?.name === t.name} onSelect={() => setSelectedTpl({ ...t, status: 'approved' })} />
                      ))}
                    </div>
                  </div>
                )}
                {(m.reply?.drafts?.length || 0) > 0 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <MdEditNote size={13} /> Fresh drafts — need Meta approval before sending
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {m.reply!.drafts.map((t) => (
                        <TemplateCard key={t.name} t={{ ...t, status: 'draft' }} selected={selectedTpl?.name === t.name} onSelect={() => setSelectedTpl({ ...t, status: 'draft' })} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: PURPLE }} />
            Pulling the audience…
          </div>
        )}
      </div>

      {/* Save bar — appears once there's an audience */}
      {audience && (
        <div className="flex items-center gap-2 mt-2.5 rounded-xl border px-3 py-2.5 flex-wrap" style={{ borderColor: `color-mix(in srgb, ${GREEN} 35%, var(--border-primary))`, background: `color-mix(in srgb, ${GREEN} 5%, var(--bg-secondary))` }}>
          <span className="text-[11.5px] font-semibold shrink-0" style={{ color: 'var(--text-primary)' }}>
            {audience.with_phone ?? audience.count} people{selectedTpl ? ` · ${selectedTpl.name}` : ' · no template picked'}
          </span>
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="Campaign name…"
            className="flex-1 min-w-[160px] text-[12px] px-2.5 py-1.5 rounded-md border outline-none"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={saveCampaign}
            disabled={saving}
            className="text-[12px] font-bold px-3.5 py-1.5 rounded-md shrink-0"
            style={{ background: GREEN, color: '#08130b', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : selectedTpl ? 'Save campaign' : 'Save as draft'}
          </button>
        </div>
      )}

      {error && <div className="text-xs mt-2" style={{ color: '#ef4444' }}>{error}</div>}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input) }}
        className="flex items-center gap-2 mt-2.5 rounded-xl border px-3 py-2"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Try: "Qualified pilot leads from the last 30 days"'
          disabled={busy}
          className="flex-1 text-[13px] bg-transparent outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
        <button type="submit" disabled={busy || !input.trim()} className="p-1.5 rounded-lg shrink-0" style={{ color: input.trim() && !busy ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
          <MdSend size={18} />
        </button>
      </form>
    </div>
  )
}
