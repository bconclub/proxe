'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  MdTune, MdCheckCircle, MdErrorOutline, MdRemoveCircleOutline, MdRefresh,
  MdLock, MdLink, MdInput, MdPerson,
} from 'react-icons/md'

interface Field { env: string; label: string; secret: boolean; required: boolean; set: boolean; value: string | null }
interface Integration { id: string; name: string; desc: string; status: 'connected' | 'partial' | 'missing'; fields: Field[] }
interface ConfigData {
  integrations: Integration[]
  sources: { id: string; label: string }[]
  channels: { label: string; value: string | null }[]
  leadFields: { key: string; label: string; required: boolean }[]
}

const STATUS: Record<Integration['status'], { label: string; color: string; bg: string; icon: any }> = {
  connected: { label: 'Connected', color: '#22c55e', bg: 'rgba(34,197,94,.13)', icon: MdCheckCircle },
  partial:   { label: 'Partial',   color: '#f59e0b', bg: 'rgba(245,158,11,.13)', icon: MdErrorOutline },
  missing:   { label: 'Not set',   color: '#ef4444', bg: 'rgba(239,68,68,.13)', icon: MdRemoveCircleOutline },
}

const CARD: React.CSSProperties = {
  border: '1px solid var(--border-primary)', borderRadius: 12,
  background: 'var(--bg-secondary)', boxShadow: '0 6px 18px rgba(0,0,0,0.22)', padding: 16,
}

function SectionTitle({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) {
  return (
    <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
      <Icon size={18} style={{ color: 'var(--accent-primary)' }} /> {title}
      {hint && <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>· {hint}</span>}
    </h2>
  )
}

export default function ConfigPage() {
  const [data, setData] = useState<ConfigData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/dashboard/config')
      if (res.status === 401 || res.status === 403) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'Admins only.'); setData(null); return
      }
      if (!res.ok) { setError('Failed to load configuration.'); return }
      setData(await res.json())
    } catch { setError('Network error loading configuration.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div style={{ minHeight: 'calc(100vh - 48px)', color: 'var(--text-primary)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.1, fontWeight: 700 }}>Config</h1>
          <p style={{ margin: '3px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Every integration, channel, source and lead field in one place. Secret values are never shown - only whether they’re set.
          </p>
        </div>
        <button type="button" onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '0 14px', border: '1px solid var(--border-primary)', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <MdRefresh size={16} /> {loading ? 'Checking…' : 'Refresh'}
        </button>
      </header>

      {error && (
        <div style={{ ...CARD, borderColor: 'rgba(239,68,68,.4)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <MdLock size={18} style={{ color: '#ef4444' }} />
          <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{error}</span>
        </div>
      )}

      {!error && loading && !data && (
        <div style={{ ...CARD, color: 'var(--text-secondary)', fontSize: 14 }}>Loading configuration…</div>
      )}

      {!error && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* ── Integrations ───────────────────────────────────────── */}
          <section>
            <SectionTitle icon={MdTune} title="Integrations" hint="connection status + identifiers" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
              {data.integrations.map((intg) => {
                const st = STATUS[intg.status]
                const StIcon = st.icon
                return (
                  <div key={intg.id} style={CARD}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{intg.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{intg.desc}</div>
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: st.bg, color: st.color }}>
                        <StIcon size={13} /> {st.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {intg.fields.map((f) => (
                        <div key={f.env} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 10px', borderRadius: 8, background: 'var(--bg-tertiary)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', minWidth: 0 }}>
                            {f.secret && <MdLock size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</span>
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right',
                            color: f.secret ? (f.set ? '#22c55e' : 'var(--text-muted)') : (f.value ? 'var(--text-primary)' : 'var(--text-muted)') }}>
                            {f.secret ? (f.set ? '•••• set' : 'not set') : (f.value || '-')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── Channels ───────────────────────────────────────────── */}
          <section>
            <SectionTitle icon={MdLink} title="Connected channels" hint="where leads come in & messages go out" />
            <div style={{ ...CARD, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {data.channels.map((c) => (
                <div key={c.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-tertiary)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.value ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.value || 'not set'}</div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Sources ────────────────────────────────────────────── */}
          <section>
            <SectionTitle icon={MdInput} title="Lead sources" hint="how inbound leads are attributed" />
            <div style={{ ...CARD, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {data.sources.map((s) => (
                <span key={s.id} style={{ fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 999, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{s.label}</span>
              ))}
            </div>
          </section>

          {/* ── Lead fields ────────────────────────────────────────── */}
          <section>
            <SectionTitle icon={MdPerson} title="Lead fields" hint="what the agent collects" />
            <div style={{ ...CARD, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
              {data.leadFields.map((f) => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 11px', borderRadius: 8, background: 'var(--bg-tertiary)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{f.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: f.required ? '#f59e0b' : 'var(--text-muted)' }}>{f.required ? 'REQUIRED' : 'optional'}</span>
                </div>
              ))}
            </div>
          </section>

          <p style={{ margin: '4px 2px 0', fontSize: 11, color: 'var(--text-muted)' }}>
            Secrets are read from the deployment environment and shown only as set / not set. Editing tokens from here (write-only) is coming next.
          </p>
        </div>
      )}
    </div>
  )
}
