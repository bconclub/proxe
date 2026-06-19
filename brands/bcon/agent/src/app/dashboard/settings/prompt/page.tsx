'use client';

import { useEffect, useState } from 'react';

type Channel = 'system' | 'web' | 'voice';
const CHANNELS: { key: Channel; label: string; hint: string }[] = [
  { key: 'system', label: 'System (WhatsApp + default)', hint: 'The base persona the agent uses on WhatsApp and anywhere a channel-specific prompt is not set.' },
  { key: 'web', label: 'Web chat', hint: 'Overrides the system prompt for the website chat widget. Leave blank to use System.' },
  { key: 'voice', label: 'Voice', hint: 'Overrides the system prompt for voice calls. Leave blank to use System.' },
];

export default function AgentPromptConfigPage() {
  const [prompts, setPrompts] = useState<Record<Channel, string>>({ system: '', web: '', voice: '' });
  const [defaults, setDefaults] = useState<Record<Channel, string>>({ system: '', web: '', voice: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [active, setActive] = useState<Channel>('system');

  useEffect(() => {
    fetch('/api/dashboard/settings/prompt')
      .then((r) => r.json())
      .then((d) => {
        setPrompts({ system: d.prompts?.system || '', web: d.prompts?.web || '', voice: d.prompts?.voice || '' });
        setDefaults({ system: d.defaults?.system || '', web: d.defaults?.web || '', voice: d.defaults?.voice || '' });
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const res = await fetch('/api/dashboard/settings/prompt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompts),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  if (loading) return <div className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>;

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Agent Prompt</h1>
      <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)' }}>
        Edit the agent&apos;s persona per channel. Saved prompts override the built-in default for this brand; leave a channel blank to use the default.
      </p>

      <div className="flex gap-1 mb-3">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setActive(c.key)}
            className="text-xs font-medium rounded px-3 py-1.5 transition-colors"
            style={{
              color: active === c.key ? 'var(--text-button)' : 'var(--text-secondary)',
              backgroundColor: active === c.key ? 'var(--button-bg)' : 'var(--bg-tertiary)',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>{CHANNELS.find((c) => c.key === active)?.hint}</p>

      <textarea
        value={prompts[active]}
        onChange={(e) => setPrompts((p) => ({ ...p, [active]: e.target.value }))}
        placeholder={defaults[active] ? `Using default:\n\n${defaults[active].slice(0, 600)}${defaults[active].length > 600 ? '…' : ''}` : ''}
        rows={18}
        className="w-full rounded-lg p-3 text-xs font-mono resize-y"
        style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)' }}
      />

      <div className="flex items-center gap-3 mt-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
          style={{ backgroundColor: 'var(--button-bg)', color: 'var(--text-button)' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setPrompts((p) => ({ ...p, [active]: '' }))}
          className="text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          Clear (use default)
        </button>
        {saved && <span className="text-xs" style={{ color: '#22c55e' }}>✓ Saved</span>}
      </div>
    </div>
  );
}
