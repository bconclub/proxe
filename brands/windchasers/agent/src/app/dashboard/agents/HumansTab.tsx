'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MdPeople, MdEmail, MdSettings } from 'react-icons/md';

type Member = { id: string; name: string; email: string | null };

/**
 * Humans tab — the managing team (real people) working leads alongside the AI
 * agents. Read-only list sourced from dashboard_users via /team-members;
 * add/remove/roles are managed in Configure → Users.
 */
export default function HumansTab() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard/team-members')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setMembers(Array.isArray(d.members) ? d.members : []); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <MdPeople size={20} style={{ color: 'var(--accent-primary)' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Humans</h2>
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>{members.length}</span>
        </div>
        <Link
          href="/dashboard/settings/users"
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md"
          style={{ backgroundColor: 'var(--button-bg)', color: 'var(--text-button)' }}
        >
          <MdSettings size={14} /> Manage team
        </Link>
      </div>
      <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
        The people managing leads alongside the AI agents. They can own leads, log calls, and reply in the inbox.
      </p>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading team…</p>
      ) : members.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          No team members yet. Add them in Configure → Users.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 p-3 rounded-lg border"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
              >
                {(m.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{m.name}</p>
                {m.email && (
                  <p className="text-xs truncate flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                    <MdEmail size={11} /> {m.email}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
