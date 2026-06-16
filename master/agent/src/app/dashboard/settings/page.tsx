'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useTheme } from '@/components/dashboard/ThemeProvider';
import {
  SOUND_LABELS,
  type SoundEvent,
  isMuted,
  setMuted as persistMuted,
  isEventEnabled,
  setEventEnabled,
  preview as previewSound,
} from '@/lib/sound-prefs';
import { ACCENT_THEMES } from '@/lib/accent-theme';
import { saveGlobalPrefs } from '@/lib/dashboard-prefs';

const SOUND_EVENTS: { ev: SoundEvent; hint: string }[] = [
  { ev: 'new', hint: 'Warm marimba knock when a fresh lead is scored' },
  { ev: 'update', hint: 'Soft pop on a stage or score change' },
  { ev: 'ready', hint: 'Calm glass ding when the home page finishes loading' },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState(ACCENT_THEMES[0].id);
  const [saved, setSaved] = useState(false);

  // Notification sound prefs (mirror localStorage via the sound-prefs helper).
  const [soundMuted, setSoundMuted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<Record<SoundEvent, boolean>>({
    new: true, update: true, ready: true,
  });

  // Hydrate sound prefs on mount (localStorage is client-only).
  useEffect(() => {
    setSoundMuted(isMuted());
    setSoundEnabled({
      new: isEventEnabled('new'),
      update: isEventEnabled('update'),
      ready: isEventEnabled('ready'),
    });
  }, []);

  function toggleMuted() {
    setSoundMuted((m) => {
      const next = !m;
      persistMuted(next);
      // Global: applies to every user on their next load.
      saveGlobalPrefs({ sounds: { muted: next, ...soundEnabled } });
      return next;
    });
  }
  function toggleEvent(ev: SoundEvent) {
    setSoundEnabled((prev) => {
      const next = { ...prev, [ev]: !prev[ev] };
      setEventEnabled(ev, next[ev]);
      saveGlobalPrefs({ sounds: { muted: soundMuted, ...next } });
      return next;
    });
  }

  // Load saved theme on mount, and re-apply whenever the dashboard mode
  // (dark/light/brand) changes — otherwise the accent's bg/text overrides
  // can stomp the freshly-set light/dark vars and produce an unreadable
  // half-themed state across the rest of the app.
  useEffect(() => {
    const storageKey = 'windchasers-accent-theme';
    const savedTheme = localStorage.getItem(storageKey);
    if (savedTheme && ACCENT_THEMES.some(({ id }) => id === savedTheme)) {
      setSelectedTheme(savedTheme);
      applyTheme(savedTheme);
    } else {
      applyTheme(ACCENT_THEMES[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Apply theme to CSS variables.
  // The accent always sets the colour tokens. The Aviation-Gold preset also
  // ships dark-brown bg/text overrides for the branded dark look, but those
  // are NEVER applied in light mode — otherwise the light-mode bg/text from
  // ThemeProvider gets stomped and the app becomes unreadable.
  function applyTheme(themeId: string) {
    const accent = ACCENT_THEMES.find(t => t.id === themeId);
    if (!accent) return;
    const root = document.documentElement;

    root.style.setProperty('--accent-primary', accent.color);
    root.style.setProperty('--accent-light', accent.color);
    root.style.setProperty('--accent-subtle', `${accent.color}20`);

    // Always clear any previously-set Aviation-Gold bg/text overrides first
    // so switching from gold → another accent (or to light mode) restores
    // ThemeProvider's bg/text vars.
    root.style.removeProperty('--bg-secondary');
    root.style.removeProperty('--bg-tertiary');
    root.style.removeProperty('--bg-hover');
    root.style.removeProperty('--border-primary');
    root.style.removeProperty('--text-primary');
    root.style.removeProperty('--text-secondary');
    root.style.removeProperty('--button-bg');
    root.style.removeProperty('--text-button');

    // Aviation Gold only takes over bg/text when we are NOT in light mode.
    const isLight = theme === 'bw-light';
    if (accent.id === 'aviation-gold' && !isLight) {
      root.style.setProperty('--bg-secondary', accent.bgSecondary!);
      root.style.setProperty('--bg-tertiary', accent.bgTertiary!);
      root.style.setProperty('--bg-hover', accent.bgHover!);
      root.style.setProperty('--border-primary', accent.borderPrimary!);
      root.style.setProperty('--text-primary', accent.textPrimary!);
      root.style.setProperty('--text-secondary', accent.textSecondary!);
      root.style.setProperty('--button-bg', accent.buttonBg!);
      root.style.setProperty('--text-button', accent.textButton!);
    }
  }

  // Handle theme selection
  function handleThemeSelect(themeId: string) {
    setSelectedTheme(themeId);
    applyTheme(themeId);
    localStorage.setItem('windchasers-accent-theme', themeId);
    // Global: every user picks up this accent on their next load.
    saveGlobalPrefs({ theme: { accent: themeId } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl">
        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Configure</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            How the dashboard and your website chat widget look. Team members live
            under <span style={{ color: 'var(--accent-primary)' }}>Humans</span>.
          </p>
        </div>

        {/* ── Appearance ─────────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Appearance
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Currently running:{' '}
            <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
              {theme === 'bw-light' ? 'Light' : theme === 'brand' ? 'Brand' : 'Dark'}
            </span>
            {' '}· Dark is the default for everyone until you change it.
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            {[
              { id: 'bw-dark', label: 'Dark', icon: '🌙', hint: 'Easy on the eyes' },
              { id: 'bw-light', label: 'Light', icon: '☀️', hint: 'Bright rooms' },
            ].map((mode) => {
              const active = theme === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => {
                    setTheme(mode.id as 'bw-dark' | 'bw-light');
                    // Global: dashboard mode for everyone on next load.
                    saveGlobalPrefs({ theme: { mode: mode.id as 'bw-dark' | 'bw-light' } });
                  }}
                  className="p-4 rounded-xl border-2 transition-all flex items-center gap-3 text-left"
                  style={{
                    background: 'var(--bg-secondary)',
                    borderColor: active ? 'var(--accent-primary)' : 'var(--border-primary)',
                  }}
                >
                  <span className="text-2xl leading-none">{mode.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                      {mode.label}
                      {active && <span style={{ color: 'var(--accent-primary)' }}>✓</span>}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{mode.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Theme (accent) ─────────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Theme
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            The accent colour used across the dashboard and your chat widget.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {ACCENT_THEMES.map((t) => {
              const active = selectedTheme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleThemeSelect(t.id)}
                  className="p-4 rounded-xl border-2 transition-all"
                  style={{
                    background: 'var(--bg-secondary)',
                    borderColor: active ? t.color : 'var(--border-primary)',
                  }}
                >
                  <div className="w-12 h-12 rounded-full mx-auto mb-3" style={{ background: t.color }} />
                  <p className="text-sm font-medium text-center" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                  <p className="text-xs text-center mt-1" style={{ color: 'var(--text-secondary)' }}>{t.color}</p>
                  {active && (
                    <div className="mt-2 text-xs text-center font-medium" style={{ color: t.color }}>✓ Active</div>
                  )}
                </button>
              );
            })}
          </div>

          {saved && (
            <div className="mt-4 p-3 rounded-lg text-sm text-center" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
              Theme saved.
            </div>
          )}
        </section>

        {/* Widget Appearance preview removed — the Agents › Web tab already
            previews the live widget, so duplicating it here was redundant. */}

        {/* ── Preview ────────────────────────────────────────────────── */}
        {/* Theme samples — how the chosen accent renders across common UI. */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Preview
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Live samples of how the accent appears in the dashboard.
          </p>

          <div className="p-6 rounded-xl" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
            <div className="flex flex-wrap items-center gap-4">
              <button className="px-4 py-2 rounded-lg font-medium" style={{ background: 'var(--button-bg)', color: 'var(--text-button)' }}>
                Primary Button
              </button>
              <button className="px-4 py-2 rounded-lg font-medium border" style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)', background: 'transparent' }}>
                Secondary Button
              </button>
              <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                Badge
              </span>
              <a href="#" className="font-medium hover:underline" style={{ color: 'var(--accent-primary)' }}>
                Link Text
              </a>
              {/* Launcher chip — same accent the widget uses */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center shadow" style={{ background: 'var(--button-bg)' }} title="Chat launcher">
                <svg className="w-5 h-5" style={{ color: 'var(--text-button)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
            </div>

            <div className="mt-4 p-4 rounded-lg border-l-4" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--accent-primary)' }}>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                This is how accent colours appear in cards and highlights.
              </p>
            </div>
          </div>
        </section>

        {/* ── Notifications & Sounds ─────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Notifications &amp; Sounds
          </h2>

          <div className="p-6 rounded-xl" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
            {/* Master mute */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
              <div>
                <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  All notification sounds
                </h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {soundMuted ? 'Muted — no sounds will play' : 'On — events below play their sound'}
                </p>
              </div>
              <button
                onClick={toggleMuted}
                role="switch"
                aria-checked={!soundMuted}
                aria-label="Toggle all notification sounds"
                className="relative w-12 h-7 rounded-full transition-colors flex-shrink-0"
                style={{ background: soundMuted ? 'var(--bg-tertiary)' : 'var(--accent-primary)' }}
              >
                <span
                  className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all"
                  style={{ left: soundMuted ? '4px' : '24px' }}
                />
              </button>
            </div>

            {/* Per-event toggles + preview */}
            <div className="flex flex-col gap-3">
              {SOUND_EVENTS.map(({ ev, hint }) => {
                const on = soundEnabled[ev] && !soundMuted;
                return (
                  <div
                    key={ev}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ background: 'var(--bg-tertiary)', opacity: soundMuted ? 0.5 : 1 }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {SOUND_LABELS[ev]}
                      </p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {hint}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {/* Preview — always playable so you can audition while muted */}
                      <button
                        onClick={() => previewSound(ev)}
                        className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors hover:border-[var(--accent-primary)]"
                        style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
                        title={`Preview ${SOUND_LABELS[ev]} sound`}
                      >
                        ▶ Preview
                      </button>
                      {/* Per-event toggle */}
                      <button
                        onClick={() => toggleEvent(ev)}
                        disabled={soundMuted}
                        role="switch"
                        aria-checked={soundEnabled[ev]}
                        aria-label={`Toggle ${SOUND_LABELS[ev]} sound`}
                        className="relative w-11 h-6 rounded-full transition-colors disabled:cursor-not-allowed"
                        style={{ background: on ? 'var(--accent-primary)' : 'var(--bg-secondary)' }}
                      >
                        <span
                          className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                          style={{ left: soundEnabled[ev] ? '22px' : '2px' }}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        {/* ── Token usage (test) ─────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            Token usage
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Test</span>
          </h2>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            See roughly how much Claude spend goes to agent chat, scoring, and notes/summaries.
          </p>
          <a
            href="/tokens"
            className="block p-5 rounded-xl border transition-colors hover:bg-[var(--bg-hover)]"
            style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Open token usage</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Spend by area · experimental</div>
              </div>
              <span className="text-lg" style={{ color: 'var(--accent-primary)' }}>→</span>
            </div>
          </a>
        </section>
      </div>
    </DashboardLayout>
  );
}
