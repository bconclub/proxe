'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  MdAdd, MdClose, MdCheckCircle, MdSchedule, MdError, MdWhatsapp, MdRefresh, MdArrowBack, MdInfoOutline,
} from 'react-icons/md'
import Link from 'next/link'

// ── types ────────────────────────────────────────────────────────────────────
type Category = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
type VarType = 'NUMBER' | 'NAMED'
type BtnType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE'
interface Btn { type: BtnType; text: string; url?: string; phone_number?: string; example?: string }
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
const BTN_LABELS: { value: BtnType; label: string }[] = [
  { value: 'QUICK_REPLY', label: 'Custom (quick reply)' },
  { value: 'URL', label: 'Visit website' },
  { value: 'PHONE_NUMBER', label: 'Call phone number' },
  { value: 'COPY_CODE', label: 'Copy offer code' },
]
const NUM_RE = /\{\{\s*(\d+)\s*\}\}/g
const NAME_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g
const ANY_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

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
  const [varType, setVarType] = useState<VarType>('NUMBER')
  const [headerText, setHeaderText] = useState('')
  const [headerSample, setHeaderSample] = useState('')
  const [body, setBody] = useState('')
  const [samples, setSamples] = useState<Record<string, string>>({}) // keyed by number-string or name
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

  // AUTO-DETECT the variable style from what's actually typed, so the sample
  // fields always match. (Bug: a Number-mode default + a named {{customer_name}}
  // showed NO sample fields → submitted with no examples → Meta auto-rejected.)
  // Body content wins; the dropdown only seeds the style while the body is empty.
  const effType: VarType = useMemo(() => {
    if (/\{\{\s*[a-zA-Z]/.test(body)) return 'NAMED'
    if (/\{\{\s*\d/.test(body)) return 'NUMBER'
    return varType
  }, [body, varType])
  const mixedVars = /\{\{\s*[a-zA-Z]/.test(body) && /\{\{\s*\d/.test(body)

  // variable keys present in the body, per detected style
  const bodyVars = useMemo(() => {
    const out: string[] = []
    const re = effType === 'NAMED' ? new RegExp(NAME_RE) : new RegExp(NUM_RE)
    let m: RegExpExecArray | null
    while ((m = re.exec(body))) { if (!out.includes(m[1])) out.push(m[1]) }
    return effType === 'NUMBER' ? out.sort((a, b) => parseInt(a, 10) - parseInt(b, 10)) : out
  }, [body, effType])

  const headerVarKey = useMemo(() => {
    const m = headerText.match(effType === 'NAMED' ? /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/ : /\{\{\s*(\d+)\s*\}\}/)
    return m ? m[1] : null
  }, [headerText, effType])

  const addVariable = () => {
    if (effType === 'NAMED') {
      setBody((b) => b + `{{variable_${bodyVars.length + 1}}}`)
    } else {
      const next = (bodyVars.length ? Math.max(...bodyVars.map(Number)) : 0) + 1
      setBody((b) => b + `{{${next}}}`)
    }
  }

  const resetForm = () => {
    setName(''); setCategory('MARKETING'); setLanguage('en_US'); setVarType('NUMBER'); setHeaderText(''); setHeaderSample('')
    setBody(''); setSamples({}); setFooter(''); setButtons([]); setSubmitError(null); setSubmitOk(null)
  }

  const submit = async () => {
    setSubmitError(null); setSubmitOk(null)
    if (!/^[a-z0-9_]+$/.test(name)) { setSubmitError('Name: lowercase letters, digits and underscores only.'); return }
    if (!body.trim()) { setSubmitError('Body text is required.'); return }
    if (mixedVars) { setSubmitError('Don’t mix named ({{name}}) and numbered ({{1}}) variables — pick one style.'); return }
    if (bodyVars.some((k) => !(samples[k] || '').trim())) { setSubmitError('Fill a sample value for every body variable.'); return }
    if (headerVarKey && !headerSample.trim()) { setSubmitError('Header has a variable — add a sample value.'); return }

    setSubmitting(true)
    try {
      const payload: any = { name, category, language, varType: effType, body: body.trim() }
      if (effType === 'NAMED') payload.bodyNamedExamples = bodyVars.map((k) => ({ param_name: k, example: samples[k] || '' }))
      else payload.bodyExample = bodyVars.map((k) => samples[k] || '')

      if (headerText.trim()) {
        payload.header = { text: headerText.trim() }
        if (headerVarKey) {
          if (effType === 'NAMED') payload.header.namedExample = { param_name: headerVarKey, example: headerSample.trim() }
          else payload.header.example = headerSample.trim()
        }
      }
      if (footer.trim()) payload.footer = footer.trim()

      const validButtons = buttons
        .filter((b) => (b.type === 'COPY_CODE' ? (b.example || '').trim() : b.text.trim()) && (b.type !== 'URL' || b.url?.trim()) && (b.type !== 'PHONE_NUMBER' || b.phone_number?.trim()))
        .map((b) => b.type === 'COPY_CODE' ? { type: 'COPY_CODE', example: b.example } : b)
      if (validButtons.length) payload.buttons = validButtons

      const res = await fetch('/api/whatsapp/templates/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Submission failed.')
      const sent = Array.isArray(data.submittedComponents) ? data.submittedComponents.join(' + ') : ''
      setSubmitOk(`“${data.name}” submitted — status ${String(data.status || 'PENDING').toLowerCase()}.${sent ? ` Sent to Meta: ${sent}.` : ''} Meta is reviewing it.`)
      resetForm()
      await load()
      setComposerOpen(false)
    } catch (e: any) {
      setSubmitError(e?.message || 'Submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  // preview: swap {{n}} / {{name}} with the sample (or leave the token)
  const fill = (text: string) => text.replace(ANY_RE, (_m, k) => samples[k] || `{{${k}}}`)

  // ── styles ──
  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }
  const ctaStyle: React.CSSProperties = { background: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)' }

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
          <button onClick={() => { resetForm(); setComposerOpen((v) => !v) }} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" style={ctaStyle}>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              </div>
              <div>
                <label style={labelStyle}>Type of variable</label>
                <select value={varType} onChange={(e) => { setVarType(e.target.value as VarType); setSamples({}); setBody(''); setHeaderText(''); setHeaderSample('') }} style={inputStyle}>
                  <option value="NUMBER">Number — {'{{1}}'}, {'{{2}}'}</option>
                  <option value="NAMED">Named — {'{{order_id}}'}</option>
                </select>
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>A template uses one style throughout. Changing it clears the body.</p>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Header <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· optional, text</span></label>
              <input value={headerText} onChange={(e) => setHeaderText(e.target.value)} maxLength={60} placeholder={varType === 'NAMED' ? 'Hi {{name}} 👋' : 'Hi {{1}} 👋'} style={inputStyle} />
              {headerVarKey && (
                <input value={headerSample} onChange={(e) => setHeaderSample(e.target.value)} placeholder={`Sample for {{${headerVarKey}}}`} style={{ ...inputStyle, marginTop: 6 }} />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label style={labelStyle}>Body</label>
                <button onClick={addVariable} className="text-[11px] font-semibold" style={{ color: 'var(--accent-primary)' }}>+ Add variable</button>
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={1024} placeholder={varType === 'NAMED' ? 'Your order {{order_id}} ships on {{ship_date}}.' : 'Your order {{1}} ships on {{2}}.'} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              {bodyVars.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><MdInfoOutline size={13} /> Sample values (Meta needs one per variable)</p>
                  {bodyVars.map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{`{{${k}}}`}</span>
                      <input value={samples[k] || ''} onChange={(e) => setSamples((s) => ({ ...s, [k]: e.target.value }))} placeholder={`Sample for {{${k}}}`} style={{ ...inputStyle, padding: '6px 9px', fontSize: 13 }} />
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
                <label style={labelStyle}>Buttons <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· optional, up to 3 shown</span></label>
                {buttons.length < 3 && <button onClick={() => setButtons((b) => [...b, { type: 'QUICK_REPLY', text: '' }])} className="text-[11px] font-semibold" style={{ color: 'var(--accent-primary)' }}>+ Add button</button>}
              </div>
              <div className="space-y-2">
                {buttons.map((btn, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select value={btn.type} onChange={(e) => setButtons((b) => b.map((x, j) => j === i ? { ...x, type: e.target.value as BtnType } : x))} style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 13 }}>
                      {BTN_LABELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {btn.type === 'COPY_CODE' ? (
                      <input value={btn.example || ''} onChange={(e) => setButtons((b) => b.map((x, j) => j === i ? { ...x, example: e.target.value } : x))} placeholder="Offer code — e.g. SAVE20" maxLength={15} style={{ ...inputStyle, flex: 1, minWidth: 140, padding: '6px 9px', fontSize: 13 }} />
                    ) : (
                      <input value={btn.text} onChange={(e) => setButtons((b) => b.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} placeholder="Button text" maxLength={25} style={{ ...inputStyle, flex: 1, minWidth: 120, padding: '6px 9px', fontSize: 13 }} />
                    )}
                    {btn.type === 'URL' && <input value={btn.url || ''} onChange={(e) => setButtons((b) => b.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://…" style={{ ...inputStyle, flex: 1, minWidth: 140, padding: '6px 9px', fontSize: 13 }} />}
                    {btn.type === 'PHONE_NUMBER' && <input value={btn.phone_number || ''} onChange={(e) => setButtons((b) => b.map((x, j) => j === i ? { ...x, phone_number: e.target.value } : x))} placeholder="+9198…" style={{ ...inputStyle, flex: 1, minWidth: 120, padding: '6px 9px', fontSize: 13 }} />}
                    <button onClick={() => setButtons((b) => b.filter((_, j) => j !== i))} style={{ color: 'var(--text-muted)' }}><MdClose size={16} /></button>
                  </div>
                ))}
              </div>
            </div>

            {submitError && <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(239,68,68,.12)', color: '#ef4444' }}>{submitError}</div>}
            <button onClick={submit} disabled={submitting} className="w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50" style={ctaStyle}>
              {submitting ? 'Submitting to Meta…' : 'Submit for approval'}
            </button>
          </div>

          {/* live preview */}
          <div>
            <label style={labelStyle}>Preview</label>
            <div className="rounded-xl p-3" style={{ background: '#0b141a', minHeight: 180, backgroundImage: 'radial-gradient(rgba(255,255,255,.03) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
              <div className="rounded-lg px-2.5 py-2" style={{ background: '#fff', color: '#111', maxWidth: 260, boxShadow: '0 1px 1px rgba(0,0,0,.2)' }}>
                {headerText.trim() && <div className="text-sm font-bold mb-1" style={{ wordBreak: 'break-word' }}>{fill(headerText)}</div>}
                <div className="text-sm whitespace-pre-wrap" style={{ wordBreak: 'break-word' }}>{fill(body || 'Your message body…')}</div>
                {footer.trim() && <div className="text-[11px] mt-1.5" style={{ color: '#667781' }}>{footer}</div>}
                <div className="text-[10px] mt-1 text-right" style={{ color: '#667781' }}>12:00</div>
              </div>
              {buttons.filter((b) => b.type === 'COPY_CODE' ? (b.example || '').trim() : b.text.trim()).length > 0 && (
                <div className="mt-1 space-y-1" style={{ maxWidth: 260 }}>
                  {buttons.filter((b) => b.type === 'COPY_CODE' ? (b.example || '').trim() : b.text.trim()).map((b, i) => (
                    <div key={i} className="rounded-lg py-2 text-center text-sm font-medium" style={{ background: '#fff', color: '#1da5fe' }}>
                      {b.type === 'COPY_CODE' ? 'Copy offer code' : b.text}
                    </div>
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
