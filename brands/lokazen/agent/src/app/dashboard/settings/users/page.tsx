'use client'

import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { MdPersonAdd, MdContentCopy, MdDelete, MdCheck, MdRefresh } from 'react-icons/md'

interface DashboardUser {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'viewer' | string
  is_active: boolean | null
  created_at: string | null
  last_login: string | null
}

interface PendingInvite {
  id: string
  email: string
  token: string
  role: string
  invited_by: string | null
  expires_at: string
  created_at: string | null
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<DashboardUser[]>([])
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Only admins see activity (last active), status, role controls, and invites.
  // Viewers get a redacted, name-only roster from the API (isAdmin === false).
  const [isAdmin, setIsAdmin] = useState(false)

  // Invite form state
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'viewer'>('viewer')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ url: string; email: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/users')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to load users')
      }
      const data = await res.json()
      setUsers(data.users || [])
      setInvites(data.pendingInvites || [])
      setIsAdmin(data.isAdmin === true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Auto-refresh every 30s while this page is open so "Live now" /
  // "Last active" reflect the team's actual activity in near-real time.
  // The DashboardLayout heartbeats every 60s, so a 30s refresh here gives
  // us a worst-case ~90s lag from a teammate's last action → us seeing it.
  // Pause while the tab is hidden — no point polling for a background user.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      load()
    }, 30_000)
    return () => clearInterval(id)
  }, [load])

  // Relative-time formatter for the Last Active column. "Live now" green
  // dot when seen within 2 minutes (covers the 60s heartbeat + grace).
  const formatLastActive = (iso: string | null): { label: string; live: boolean } => {
    if (!iso) return { label: 'Never logged in', live: false }
    const then = new Date(iso).getTime()
    if (isNaN(then)) return { label: '—', live: false }
    const diffSec = Math.floor((Date.now() - then) / 1000)
    if (diffSec < 120) return { label: 'Live now', live: true }
    if (diffSec < 60 * 60) return { label: `${Math.floor(diffSec / 60)} min ago`, live: false }
    if (diffSec < 60 * 60 * 24) return { label: `${Math.floor(diffSec / 3600)}h ago`, live: false }
    const days = Math.floor(diffSec / 86400)
    if (days < 7) return { label: `${days}d ago`, live: false }
    return { label: new Date(iso).toLocaleDateString(), live: false }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to invite')
      setInviteResult({ url: data.inviteUrl, email: inviteEmail.trim() })
      setInviteEmail('')
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setInviting(false)
    }
  }

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this invitation URL:', url)
    }
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/dashboard/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update role')
      }
      load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleToggleActive = async (userId: string, currentActive: boolean | null) => {
    try {
      const res = await fetch(`/api/dashboard/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update status')
      }
      load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm('Revoke this pending invitation?')) return
    try {
      const res = await fetch(`/api/dashboard/users/invitations/${inviteId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to revoke invitation')
      }
      load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleResendInvite = (token: string) => {
    const url = `${window.location.origin}/auth/accept-invite?token=${token}`
    handleCopy(url)
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{isAdmin ? 'User Management' : 'Team'}</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {isAdmin
                ? 'Invite teammates and manage roles. All actions a user takes are logged on the leads they touch.'
                : 'The people on your team. Only admins can manage roles or see activity.'}
            </p>
          </div>
          {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="p-2 rounded-lg border border-[var(--border-primary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
              title="Refresh"
            >
              <MdRefresh size={18} />
            </button>
            <button
              onClick={() => { setShowInviteModal(true); setInviteResult(null); setError(null) }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#C9A961', color: '#1A1A1A' }}
            >
              <MdPersonAdd size={16} />
              Invite User
            </button>
          </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Pending Invitations */}
        {invites.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Pending invitations ({invites.length})
            </h2>
            <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
              <table className="w-full">
                <thead className="bg-[var(--bg-secondary)]">
                  <tr>
                    <th className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-[var(--text-secondary)]">Email</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-[var(--text-secondary)]">Role</th>
                    <th className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-[var(--text-secondary)]">Expires</th>
                    <th className="text-right text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-[var(--text-secondary)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((inv) => (
                    <tr key={inv.id} className="border-t border-[var(--border-primary)]">
                      <td className="px-4 py-3 text-sm text-[var(--text-primary)]">{inv.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                          style={inv.role === 'admin'
                            ? { background: 'rgba(168,85,247,0.15)', color: '#a855f7' }
                            : { background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                          {inv.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => handleResendInvite(inv.token)}
                            className="text-xs text-[var(--accent-primary)] hover:underline"
                            title="Copy invite link"
                          >
                            Copy Link
                          </button>
                          <button
                            onClick={() => handleRevokeInvite(inv.id)}
                            className="text-xs text-red-400 hover:underline"
                          >
                            Revoke
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Active Users */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            Team members ({users.length})
          </h2>
          <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
            <table className="w-full">
              <thead className="bg-[var(--bg-secondary)]">
                <tr>
                  <th className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-[var(--text-secondary)]">Name / Email</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-[var(--text-secondary)]">Role</th>
                  {isAdmin && (
                    <>
                      <th className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-[var(--text-secondary)]">Last Active</th>
                      <th className="text-left text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-[var(--text-secondary)]">Status</th>
                      <th className="text-right text-[10px] font-bold uppercase tracking-wider px-4 py-2 text-[var(--text-secondary)]">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={isAdmin ? 5 : 2} className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">Loading…</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 5 : 2} className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">No users yet</td></tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-t border-[var(--border-primary)]">
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{u.full_name || u.email.split('@')[0]}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className="text-xs border border-[var(--border-primary)] rounded px-2 py-1 outline-none"
                            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', colorScheme: 'light dark' }}
                          >
                            <option value="admin" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>admin</option>
                            <option value="viewer" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>viewer</option>
                          </select>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                            style={u.role === 'admin'
                              ? { background: 'rgba(168,85,247,0.15)', color: '#a855f7' }
                              : { background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                            {u.role}
                          </span>
                        )}
                      </td>
                      {isAdmin && (<>
                      <td className="px-4 py-3 text-xs">
                        {(() => {
                          const { label, live } = formatLastActive(u.last_login)
                          if (live) {
                            return (
                              <span className="inline-flex items-center gap-1.5 text-green-400 font-semibold">
                                <span
                                  className="inline-block w-1.5 h-1.5 rounded-full bg-green-400"
                                  style={{ boxShadow: '0 0 6px rgba(74,222,128,0.8)' }}
                                  aria-hidden="true"
                                />
                                Live now
                              </span>
                            )
                          }
                          return (
                            <span
                              className={u.last_login ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] italic'}
                              title={u.last_login ? new Date(u.last_login).toLocaleString() : undefined}
                            >
                              {label}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          u.is_active === false ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'
                        }`}>
                          {u.is_active === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleToggleActive(u.id, u.is_active)}
                          className="text-xs text-[var(--text-secondary)] hover:text-red-400 hover:underline"
                          title={u.is_active === false ? 'Reactivate user' : 'Deactivate user'}
                        >
                          {u.is_active === false ? 'Reactivate' : 'Deactivate'}
                        </button>
                      </td>
                      </>)}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Invite Modal */}
        {showInviteModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => { setShowInviteModal(false); setInviteResult(null) }}
          >
            <div
              className="w-full max-w-md rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">
                {inviteResult ? 'Invitation created' : 'Invite a teammate'}
              </h3>

              {inviteResult ? (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--text-secondary)]">
                    Share this link with <strong className="text-[var(--text-primary)]">{inviteResult.email}</strong>.
                    They'll set their own password.
                  </p>
                  <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 text-xs break-all text-[var(--text-primary)] font-mono">
                    {inviteResult.url}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopy(inviteResult.url)}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                      style={{ background: '#C9A961', color: '#1A1A1A' }}
                    >
                      {copied ? <><MdCheck size={16} /> Copied</> : <><MdContentCopy size={16} /> Copy link</>}
                    </button>
                    <button
                      onClick={() => { setShowInviteModal(false); setInviteResult(null) }}
                      className="px-3 py-2 rounded-lg text-sm border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInvite} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@windchasers.com"
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'admin' | 'viewer')}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border-primary)] text-sm outline-none"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', colorScheme: 'light dark' }}
                    >
                      <option value="viewer" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Viewer (can log calls + notes)</option>
                      <option value="admin" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Admin (can also invite users)</option>
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={inviting || !inviteEmail.trim()}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                      style={{ background: '#C9A961', color: '#1A1A1A' }}
                    >
                      {inviting ? 'Creating…' : 'Create invitation'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      className="px-3 py-2 rounded-lg text-sm border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
