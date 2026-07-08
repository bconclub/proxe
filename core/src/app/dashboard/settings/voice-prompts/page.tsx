'use client'

// Voice Prompts — the ONE core place to edit the grievance call prompts.
// Per language (pa/hi/en): Opening (start line) · Prompt (body) · Closing (end
// lines). Saved to dashboard_settings; read by BOTH V1 (Vapi) and V3 (Sarvam).
// Blank a field to fall back to the brand file default.

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { MdRecordVoiceOver, MdSave, MdRestartAlt, MdCheckCircle } from 'react-icons/md'

type Lang = 'pa' | 'hi' | 'en'
type Fields = { opening: string; body: string; closing: string }
type LangData = Fields & { default: Fields }
const LANGS: Array<{ id: Lang; label: string; native: string }> = [
  { id: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { id: 'hi', label: 'Hindi', native: 'हिंदी' },
  { id: 'en', label: 'English', native: 'English' },
]

export default function VoicePromptsPage() {
  const [data, setData] = useState<Record<Lang, LangData> | null>(null)
  const [tab, setTab] = useState<Lang>('pa')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard/settings/voice-prompt')
      .then((r) => r.json())
      .then((d) => { if (d.langs) setData(d.langs) })
      .catch(() => setErr('Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const set = (lang: Lang, field: keyof Fields, val: string) =>
    setData((prev) => (prev ? { ...prev, [lang]: { ...prev[lang], [field]: val } } : prev))

  const resetField = (lang: Lang, field: keyof Fields) =>
    setData((prev) => (prev ? { ...prev, [lang]: { ...prev[lang], [field]: prev[lang].default[field] } } : prev))

  const save = async () => {
    if (!data) return
    setSaving(true); setErr(null); setSaved(false)
    try {
      const payload: Record<Lang, Fields> = {
        pa: { opening: data.pa.opening, body: data.pa.body, closing: data.pa.closing },
        hi: { opening: data.hi.opening, body: data.hi.body, closing: data.hi.closing },
        en: { opening: data.en.opening, body: data.en.body, closing: data.en.closing },
      }
      const r = await fetch('/api/dashboard/settings/voice-prompt', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error((await r.json())?.error || 'Save failed')
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setErr(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const cur = data?.[tab]
  const isDirty = (f: keyof Fields) => cur && cur[f] !== cur.default[f]

  const field = (key: keyof Fields, label: string, hint: string, rows: number) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-primary)' }}>
          {label}{isDirty(key) && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--accent-primary)' }}>edited</span>}
        </label>
        {isDirty(key) && (
          <button onClick={() => resetField(tab, key)} title="Reset to default"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <MdRestartAlt size={14} /> Reset
          </button>
        )}
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-muted)' }}>{hint}</p>
      <textarea
        value={cur?.[key] ?? ''}
        onChange={(e) => set(tab, key, e.target.value)}
        rows={rows}
        spellCheck={false}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 10, resize: 'vertical',
          fontSize: 13, lineHeight: 1.55, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', outline: 'none',
        }}
      />
    </div>
  )

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 20px 60px', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <MdRecordVoiceOver size={22} style={{ color: 'var(--accent-primary)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Voice Prompts</h1>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          The one place the grievance call reads from — used by <b>V1</b> (Vapi) and <b>V3</b> (Sarvam) alike.
          Edit the exact words spoken. Saves apply to the next call — no deploy. Blank a field to use the default.
        </p>

        {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}

        {!loading && data && (
          <>
            <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 11, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', marginBottom: 20 }}>
              {LANGS.map((l) => {
                const on = tab === l.id
                return (
                  <button key={l.id} onClick={() => setTab(l.id)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '7px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: on ? 'var(--accent-subtle)' : 'transparent', color: on ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  }}>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{l.native}</span>
                    <span style={{ fontSize: 10, fontWeight: 600 }}>{l.label}</span>
                  </button>
                )
              })}
            </div>

            {field('opening', 'Opening (start line)', 'The first line the agent says. Vapi calls this the first message.', 3)}
            {field('body', 'Prompt (body)', 'The full instructions — identity, question flow, rules, guardrails.', 18)}
            {field('closing', 'Closing (end lines)', 'The exact lines said, verbatim, as the final turn before ending the call.', 5)}

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, position: 'sticky', bottom: 0, padding: '14px 0', background: 'linear-gradient(transparent, var(--bg-primary) 30%)' }}>
              <button onClick={save} disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 800, cursor: saving ? 'default' : 'pointer', background: 'var(--button-bg)', color: 'var(--text-button)', opacity: saving ? 0.6 : 1 }}>
                <MdSave size={18} /> {saving ? 'Saving…' : 'Save prompts'}
              </button>
              {saved && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#22c55e' }}><MdCheckCircle size={16} /> Saved — live on the next call</span>}
              {err && <span style={{ fontSize: 13, color: '#ef4444' }}>{err}</span>}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
