'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  MdAdd, MdClose, MdCheckCircle, MdSchedule, MdError, MdWhatsapp, MdRefresh, MdArrowBack, MdInfoOutline,
} from 'react-icons/md'
import Link from 'next/link'

// ── types ────────────────────────────────────────────────────────────────────
type Category = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
type BtnType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'
interface Btn { type: BtnType; text: string; url?: string; phone_number?: string }
interface MetaTemplate { name: string; status: string; category: string; language: string; components?: any[] }

const LANGS = [
  { code: 'en_US', label: 'English (US)' },
  { code: 'en', label: 'English' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt_BR', label: 'Portuguese (BR)' },
  { code: 'ar', label: 'Arabic' },
]
const CATEGORIES: { value: Category; hint: string }[] = [
  { value: 'MARKETING', hint: 'Promotions, offers, announcements' },
  { value: 'UTILITY', hint: 'Order updates, reminders, alerts' },
  { value: 'AUTHENTICATION', hint: 'One-time passcodes' },
]
const VAR_RE = /\{\{\s*(\d+)\s*\}\}/g

function statusTint(s: string): { bg: string; color: string; icon: any; label: string } {
  const u = (s || '').toUpperCase()
  if (u === 'APPROVED') return { bg: 'rgba(34,197,94,.13)', color: '#22c55e', icon: MdCheckCircle, label: 'Approved' }
  if (u === 'REJECTED' || u === 'DISABLED' || u === 'PAUSED') return { bg: 'rgba(239,68,68,.13)', color: '#ef4444', icon: MdError, label: u.charAt(0) + u.slice(1).toLowerCase() }
  return { bg: 'rgba(245,158,11,.13)', color: '#f59e0b', icon: MdSchedule, label: u ? u.charAt(0) + u.slice(1).toLowerCase() : 'Pending' }
}

export default function WhatsAppTemplatesPage() {
  const [list, setList] = useState<MetaTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [phone, setPhone] = useState<{ verifiedName?: string; displayNumber?: string } | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)

  // composer fields
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('MARKETING')
  const [language, setLanguage] = useState('en_US')
  const [headerText, setHeaderText] = useState('')
  const [headerSample, setHeaderSample] = useState('')
  const [body, setBody] = useState('')
  const [samples, setSamples] = useState<Record<number, string>>({})
  const [footer, setFooter] = useState('')
  const [buttons, setButtons] = useState<Btn[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitOk, setSubmitOk] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const res = await fetch('/api/whatsapp/templates')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setList(data.templates || [])
      setPhone(data.phoneInfo || null)
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load templates.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  // body variables, in order, deduped
  const bodyVars = useMemo(() => {
    const out: number[] = []
    let m: RegExpExecArray | null
    const re = new RegExp(VAR_RE)
    while ((m = re.exec(body))) { const n = parseInt(m[1], 10); if (!out.includes(n)) out.push(n) }
    return out.sort((a, b) => a - b)
  }, [body])
  const headerHasVar = /\{\{\s*1\s*\}\}/.test(headerText)

  const addVariable = () => {
    const next = (bodyVars.length ? Math.max(...bodyVars) : 0) + 1
    setBody((b) => b + `{{${next}}}`)
  }

  const resetForm = () => {
    setName(''); setCategory('MARKETING'); setLanguage('en_US'); setHeaderText(''); setHeaderSample('')
    setBody(''); setSamples({}); setFooter(''); setButtons([]); setSubmitError(null); setSubmitOk(null)
  }

  const submit = async () => {
    setSubmitError(null); setSubmitOk(null)
    if (!/^[a-z0-9_]+$/.test(name)) { setSubmitError('Name: lowercase letters, digits and underscores only.'); return }
    if (!body.trim()) { setSubmitError('Body text is required.'); return }
    if (bodyVars.some((n) => !(samples[n] || '').trim())) { setSubmitError('Fill a sample value for every body variable.'); return }
    if (headerHasVar && !headerSample.trim()) { setSubmitError('Header has a variable — add a sample value.'); return }

    setSubmitting(true)
    try {
      const payload: any = {
        name, category, language, body: body.trim(),
        bodyExample: bodyVars.map((n) => samples[n] || ''),
      }
      if (headerText.trim()) payload.header = { text: headerText.trim(), ...(headerHasVar ? { example: headerSample.trim() } : {}) }
      if (footer.trim()) payload.footer = footer.trim()
      const validButtons = buttons.filter((b) => b.text.trim() && (b.type !== 'URL' || b.url?.trim()) && (b.type !== 'PHONE_NUMBER' || b.phone_number?.trim()))
      if (validButtons.length) payload.buttons = validButtons

      const res = await fetch('/api/whatsapp/templates/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Submission failed.')
      setSubmitOk(`“${data.name}” submitted — status ${String(data.status || 'PENDING').toLowerCase()}. Meta is reviewing it.`)
      resetForm()
      await load()
      setComposerOpen(false)
    } catch (e: any) {
      setSubmitError(e?.message || 'Submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── styles ──
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
        <MdArrowBack size={16} /> Settings
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <MdWhatsapp style={{ color: '#25D366' }} /> WhatsApp Message Templates
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border" style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>
            <MdRefresh size={15} /> Refresh
          </button>
          <button onClick={() => { resetForm(); setComposerOpen((v) => !v) }} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'var(--accent-primary)', color: '#fff' }}>
            {composerOpen ? <><MdClose size={15} /> Close</> : <><MdAdd size={16} /> Create template</>}
          </button>
        </div>
      </div>
      <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
        Create and submit message templates straight to Meta for approval{phone?.verifiedName ? ` · ${phone.verifiedName}${phone.displayNumber ? ` (${phone.displayNumber})` : ''}` : ''}.
      </p>

      {submitOk && <div className="mb-4 rounded-lg px-4 py-3 text-sm flex items-start gap-2" style={{ background: 'rgba(34,197,94,.12)', color: '#22c55e' }}><MdCheckCircle size={18} /> {submitOk}</div>}

      {/* ── Composer ── */}
      {composerOpen && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 mb-7 rounded-xl border p-5" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}>
          {/* form */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>Template name</label>
                <input value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} placeholder="order_confirmation" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Language</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} style={inputStyle}>
                  {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label} · {l.code}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Category</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c.value} onClick={() => setCategory(c.value)} title={c.hint}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                    style={{ borderColor: category === c.value ? 'var(--accent-primary)' : 'var(--border-primary)', background: category === c.value ? 'var(--accent-subtle)' : 'transparent', color: category === c.value ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                    {c.value.charAt(0) + c.value.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{CATEGORIES.find((c) => c.value === category)?.hint}</p>
            </div>

            <div>
              <label style={labelStyle}>Header <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· optional, text</span></label>
              <input value={headerText} onChange={(e) => setHeaderText(e.target.value)} maxLength={60} placeholder="Hi {{1}} 👋" style={inputStyle} />
              {headerHasVar && (
                <input value={headerSample} onChange={(e) => setHeaderSample(e.target.value)} placeholder="Sample for {{1}} — e.g. Sam" style={{ ...inputStyle, marginTop: 6 }} />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label style={labelStyle}>Body</label>
                <button onClick={addVariable} className="text-[11px] font-semibold" style={{ color: 'var(--accent-primary)' }}>+ Add variable</button>
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={1024} placeholder={'Your order {{1}} is confirmed and ships on {{2}}.'} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              {bodyVars.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><MdInfoOutline size={13} /> Sample values (Meta needs one per variable)</p>
                  {bodyVars.map((n) => (
                    <div key={n} className="flex items-center gap-2">
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{`{{${n}}}`}</span>
                      <input value={samples[n] || ''} onChange={(e) => setSamples((s) => ({ ...s, [n]: e.target.value }))} placeholder={`Sample for {{${n}}}`} style={{ ...inputStyle, padding: '6px 9px', fontSize: 13 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Footer <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· optional, no variables</span></label>
              <input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={60} placeholder="Reply STOP to opt out" style={inputStyle} />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label style={labelStyle}>Buttons <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· optional</span></label>
                {buttons.length < 3 && <button onClick={() => setButtons((b) => [...b, { type: 'QUICK_REPLY', text: '' }])} className="text-[11px] font-semibold" style={{ color: 'var(--accent-primary)' }}>+ Add button</button>}
              </div>
              <div className="space-y-2">
                {buttons.map((btn, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select value={btn.type} onChange={(e) => setButtons((b) => b.map((x, j) => j === i ? { ...x, type: e.target.value as BtnType } : x))} style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 13 }}>
                      <option value="QUICK_REPLY">Quick reply</option>
                      <option value="URL">Visit URL</option>
                      <option value="PHONE_NUMBER">Call phone</option>
                    </select>
                    <input value={btn.text} onChange={(e) => setButtons((b) => b.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} placeholder="Button text" maxLength={25} style={{ ...inputStyle, flex: 1, minWidth: 120, padding: '6px 9px', fontSize: 13 }} />
                    {btn.type === 'URL' && <input value={btn.url || ''} onChange={(e) => setButtons((b) => b.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://…" style={{ ...inputStyle, flex: 1, minWidth: 140, padding: '6px 9px', fontSize: 13 }} />}
                    {btn.type === 'PHONE_NUMBER' && <input value={btn.phone_number || ''} onChange={(e) => setButtons((b) => b.map((x, j) => j === i ? { ...x, phone_number: e.target.value } : x))} placeholder="+9198…" style={{ ...inputStyle, flex: 1, minWidth: 120, padding: '6px 9px', fontSize: 13 }} />}
                    <button onClick={() => setButtons((b) => b.filter((_, j) => j !== i))} style={{ color: 'var(--text-muted)' }}><MdClose size={16} /></button>
                  </div>
                ))}
              </div>
            </div>

            {submitError && <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(239,68,68,.12)', color: '#ef4444' }}>{submitError}</div>}
            <button onClick={submit} disabled={submitting} className="w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent-primary)', color: '#fff' }}>
              {submitting ? 'Submitting to Meta…' : 'Submit for approval'}
            </button>
          </div>

          {/* live preview */}
          <div>
            <label style={labelStyle}>Preview</label>
            <div className="rounded-xl p-3" style={{ background: '#0b141a', minHeight: 180, backgroundImage: 'radial-gradient(rgba(255,255,255,.03) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
              <div className="rounded-lg px-2.5 py-2" style={{ background: '#fff', color: '#111', maxWidth: 260, boxShadow: '0 1px 1px rgba(0,0,0,.2)' }}>
                {headerText.trim() && <div className="text-sm font-bold mb-1" style={{ wordBreak: 'break-word' }}>{headerText.replace(/\{\{\s*1\s*\}\}/g, headerSample || '{{1}}')}</div>}
                <div className="text-sm whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>
                  {(body || 'Your message body…').replace(VAR_RE, (_m, n) => samples[parseInt(n, 10)] || `{{${n}}}`)}
                </div>
                {footer.trim() && <div className="text-[11px] mt-1.5" style={{ color: '#667781' }}>{footer}</div>}
                <div className="text-[10px] mt-1 text-right" style={{ color: '#667781' }}>12:00</div>
              </div>
              {buttons.filter((b) => b.text.trim()).length > 0 && (
                <div className="mt-1 space-y-1" style={{ maxWidth: 260 }}>
                  {buttons.filter((b) => b.text.trim()).map((b, i) => (
                    <div key={i} className="rounded-lg py-2 text-center text-sm font-medium" style={{ background: '#fff', color: '#1da5fe' }}>{b.text}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Existing templates ── */}
      <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Your templates {list.length > 0 && `· ${list.length}`}</h2>
      {loading ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>Loading templates…</p>
      ) : loadError ? (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,.1)', color: '#ef4444' }}>{loadError}</div>
      ) : list.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>No templates yet — create your first one.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((t) => {
            const tint = statusTint(t.status)
            const Icon = tint.icon
            const bodyComp = (t.components || []).find((c: any) => c.type === 'BODY')
            return (
              <div key={`${t.name}-${t.language}`} className="rounded-xl border p-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: tint.bg, color: tint.color }}><Icon size={12} /> {tint.label}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
                  <span>{(t.category || '').toLowerCase()}</span>·<span>{t.language}</span>
                </div>
                {bodyComp?.text && <p className="text-xs line-clamp-3" style={{ color: 'var(--text-secondary)' }}>{bodyComp.text}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
