'use client';

import { useEffect, useState } from 'react';

type TabMeta = { key: string; label: string; hint: string };

export default function LeadModalConfigPage() {
  const [catalog, setCatalog] = useState<TabMeta[]>([]);
  const [tabs, setTabs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/settings/lead-modal')
      .then((r) => r.json())
      .then((d) => {
        setCatalog(d.catalog || []);
        setTabs(d.tabs || {});
      })
      .finally(() => setLoading(false));
  }, []);

  const enabled = (key: string) => tabs[key] !== false; // default on
  const toggle = (key: string) => setTabs((t) => ({ ...t, [key]: !(t[key] !== false) }));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const res = await fetch('/api/dashboard/settings/lead-modal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabs }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  if (loading) return <div className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Lead Modal</h1>
      <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)' }}>
        Choose which tabs appear in the lead-detail modal for this brand. Turn off the ones your team doesn&apos;t use.
      </p>

      <div className="space-y-2">
        {catalog.map((t) => (
          <label
            key={t.key}
            className="flex items-center justify-between rounded-lg px-4 py-3 cursor-pointer"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
          >
            <span>
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.label}</span>
              <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{t.hint}</span>
            </span>
            <input
              type="checkbox"
              checked={enabled(t.key)}
              onChange={() => toggle(t.key)}
              className="h-4 w-4 accent-[var(--accent-primary)]"
            />
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
          style={{ backgroundColor: 'var(--button-bg)', color: 'var(--text-button)' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-xs" style={{ color: '#22c55e' }}>✓ Saved</span>}
      </div>
    </div>
  );
}
