'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MdCheck, MdUnfoldMore } from 'react-icons/md'
import { WORKSPACE_COOKIE } from '@/lib/workspaceCookie'

export interface WorkspaceDef {
  id: string
  label: string
  icon?: string
  color?: string
}

/**
 * Workspace switcher — PROXe <-> BCON without leaving the domain.
 *
 * This replaces the cross-deployment jump the artifact switcher was doing.
 * That jump changed origin, and sessions are per-origin, so "switching brand"
 * meant logging in again. The two brands share one Supabase and are separated
 * by a `brand` column, so the switch is a data scope: set a cookie, refresh,
 * every server route re-reads it. One login, one domain.
 *
 * Shows the real brand marks rather than a generic glyph. Each deployment's
 * public/ carries both brands' icons for exactly this reason — a deployment
 * only stages its own assets and would 404 on a sibling's logo otherwise.
 */
export default function WorkspaceSwitcher({ workspaces }: { workspaces: WorkspaceDef[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string>(workspaces[0]?.id ?? '')
  const [pending, setPending] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // Read after mount, never during render: the cookie does not exist on the
  // server's first pass and reading it in render would hydrate-mismatch.
  useEffect(() => {
    const m = document.cookie.match(new RegExp(`(?:^|; )${WORKSPACE_COOKIE}=([^;]*)`))
    const v = m ? decodeURIComponent(m[1]) : null
    if (v && workspaces.some((w) => w.id === v)) setActive(v)
  }, [workspaces])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = async (id: string) => {
    if (id === active) { setOpen(false); return }
    setPending(id)
    try {
      const res = await fetch('/api/dashboard/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: id }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setActive(id)
      setOpen(false)
      // refresh(), not reload(): re-runs the server components so every scoped
      // query re-reads the cookie, without throwing away client state.
      router.refresh()
    } catch {
      // Leave `active` alone — showing a workspace we failed to switch to would
      // claim a scope the server is not applying.
      setOpen(false)
    } finally {
      setPending(null)
    }
  }

  const current = workspaces.find((w) => w.id === active) ?? workspaces[0]
  if (!current || workspaces.length < 2) return null

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, width: '100%',
          padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
          background: 'var(--bg-hover, rgba(255,255,255,0.05))',
          border: '1px solid var(--border, rgba(255,255,255,0.1))',
          color: 'inherit', font: 'inherit',
        }}
      >
        <Mark ws={current} size={22} />
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1, textAlign: 'left' }}>{current.label}</span>
        <MdUnfoldMore size={16} style={{ opacity: 0.55 }} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60,
            background: 'var(--bg-card, #16161c)',
            border: '1px solid var(--border, rgba(255,255,255,0.12))',
            borderRadius: 12, padding: 6,
            boxShadow: '0 14px 40px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: '0.12em', opacity: 0.5, padding: '6px 8px 8px', fontWeight: 700 }}>
            WORKSPACE
          </div>
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="option"
              aria-selected={w.id === active}
              disabled={pending !== null}
              onClick={() => void select(w.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                padding: '9px 8px', borderRadius: 8, cursor: pending ? 'wait' : 'pointer',
                background: w.id === active ? 'var(--bg-hover, rgba(255,255,255,0.06))' : 'transparent',
                border: 0, color: 'inherit', font: 'inherit', textAlign: 'left',
              }}
            >
              <Mark ws={w} size={20} />
              <span style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{w.label}</span>
              {pending === w.id
                ? <span style={{ fontSize: 11, opacity: 0.6 }}>…</span>
                : w.id === active && <MdCheck size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Brand mark, falling back to a coloured monogram if the asset is missing. */
function Mark({ ws, size }: { ws: WorkspaceDef; size: number }) {
  const [broken, setBroken] = useState(false)
  const box: React.CSSProperties = {
    width: size, height: size, borderRadius: 6, flexShrink: 0,
    objectFit: 'contain', background: 'rgba(255,255,255,0.06)',
  }
  if (ws.icon && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={ws.icon} alt="" style={box} onError={() => setBroken(true)} />
  }
  return (
    <span
      style={{
        ...box,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: ws.color || '#7c3aed', color: '#fff',
        fontSize: size * 0.5, fontWeight: 800,
      }}
    >
      {ws.label.charAt(0)}
    </span>
  )
}
