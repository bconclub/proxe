'use client'

import { useCallback, useEffect, useState } from 'react'
import { MdCheckCircle, MdOpenInNew, MdRefresh } from 'react-icons/md'

/**
 * Connect this person's Telegram, so reminders reach THEM.
 *
 * The group chat gets what happened; this gets what you owe. A call-back you
 * promised is only useful to the person who promised it - in a group it is
 * noise to everyone else, and easy to assume somebody else has it.
 *
 * Tap-to-link rather than paste-your-chat-id: nobody knows their own numeric
 * Telegram id, and looking it up means sending people to a third-party bot.
 * Tapping proves ownership of the chat at the same time.
 */

interface State {
  linked: boolean
  username?: string | null
  linkedAt?: string | null
  botConfigured?: boolean
  needsMigration?: boolean
  error?: string
}

export default function TelegramConnect() {
  const [state, setState] = useState<State | null>(null)
  const [link, setLink] = useState<{ url: string; code: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard/telegram/link', { cache: 'no-store' })
      setState(await r.json())
    } catch {
      setState({ linked: false, error: 'Could not read your Telegram status' })
    }
  }, [])

  useEffect(() => { load() }, [load])

  // While a link is open the user is off in Telegram; poll so the card flips
  // to "connected" on its own instead of asking them to refresh.
  useEffect(() => {
    if (!link || state?.linked) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [link, state?.linked, load])

  const connect = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/dashboard/telegram/link', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || 'Could not create a link')
      setLink({ url: d.url, code: d.code })
      window.open(d.url, '_blank', 'noopener')
    } catch (e: any) {
      setErr(e?.message || 'Could not create a link')
    }
    setBusy(false)
  }

  const disconnect = async () => {
    setBusy(true); setErr(null)
    try {
      await fetch('/api/dashboard/telegram/link', { method: 'DELETE' })
      setLink(null)
      await load()
    } catch (e: any) {
      setErr(e?.message || 'Could not disconnect')
    }
    setBusy(false)
  }

  const linked = !!state?.linked

  return (
    <div className="pt-4 mt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
            Telegram reminders
            {linked && <MdCheckCircle size={15} style={{ color: '#22c55e' }} />}
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {linked
              ? `Connected${state?.username ? ` as ${state.username}` : ''}. When you promise to call someone back, the nudge comes to you here.`
              : 'Get your own call-back reminders on Telegram. The team group keeps getting the shared feed either way.'}
          </p>

          {state?.needsMigration && (
            <p className="text-xs mt-1.5" style={{ color: '#f59e0b' }}>
              The Telegram columns are not on this database yet (migration 042).
            </p>
          )}
          {state && !state.botConfigured && !linked && !state.needsMigration && (
            <p className="text-xs mt-1.5" style={{ color: '#f59e0b' }}>
              No bot is configured for this brand yet.
            </p>
          )}
          {err && <p className="text-xs mt-1.5" style={{ color: '#ef4444' }}>{err}</p>}

          {link && !linked && (
            <div className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Telegram should have opened. If it did not,{' '}
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent-primary)' }}>
                open the link
              </a>{' '}
              and tap Start. Code <b>{link.code}</b>, good for 30 minutes.
              <span className="ml-1 inline-flex items-center gap-1"><MdRefresh size={12} /> waiting…</span>
            </div>
          )}
        </div>

        <div className="shrink-0">
          {linked ? (
            <button
              onClick={disconnect}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40"
              style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={busy || state?.botConfigured === false}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
              style={{ background: 'var(--accent-primary)', color: '#fff' }}
            >
              {busy ? 'Working…' : 'Connect Telegram'} <MdOpenInNew size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
