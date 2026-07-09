'use client';

// Appearance — dashboard mode + accent theme + live preview. Extracted from the
// old single-scroll settings page when Configure became a card grid.

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useTheme } from '@/components/dashboard/ThemeProvider';
import { MdArrowBack } from 'react-icons/md';
import { ACCENT_THEMES } from '@/lib/accent-theme';
import { saveGlobalPrefs } from '@/lib/dashboard-prefs';
import { BRAND_ID } from '@/configs';

export default function AppearancePage() {
  const { theme, setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState(ACCENT_THEMES[0].id);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem(`${BRAND_ID}-accent-theme`);
    if (savedTheme) {
      setSelectedTheme(savedTheme);
      applyTheme(savedTheme);
    } else {
      applyTheme(ACCENT_THEMES[0].id);
    }
  }, [theme]);

  function applyTheme(themeId: string) {
    const t = ACCENT_THEMES.find(x => x.id === themeId);
    if (t) {
      document.documentElement.style.setProperty('--accent-primary', t.color);
      document.documentElement.style.setProperty('--accent-light', t.color);
      document.documentElement.style.setProperty('--accent-subtle', `${t.color}20`);
    }
  }

  function handleThemeSelect(themeId: string) {
    setSelectedTheme(themeId);
    applyTheme(themeId);
    localStorage.setItem(`${BRAND_ID}-accent-theme`, themeId);
    saveGlobalPrefs({ theme: { accent: themeId } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl">
        <a href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-xs mb-4" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <MdArrowBack size={15} /> Configure
        </a>
        <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Appearance</h1>

        {/* Dashboard Mode */}
        <div className="mb-8">
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>Dashboard Mode</h3>
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              {[
                { id: 'bw-dark', label: 'Dark', icon: '🌙' },
                { id: 'bw-light', label: 'Light', icon: '☀️' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => {
                    setTheme(mode.id as 'bw-dark' | 'bw-light');
                    saveGlobalPrefs({ theme: { mode: mode.id as 'bw-dark' | 'bw-light' } });
                  }}
                  className="p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: theme === mode.id ? 'var(--accent-primary)' : 'transparent',
                  }}
                >
                  <span className="text-2xl">{mode.icon}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{mode.label}</span>
                  {theme === mode.id && (
                    <span className="text-xs font-medium" style={{ color: 'var(--accent-primary)' }}>✓ Active</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Accent Color */}
        <div className="mb-8">
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>Accent Color</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {ACCENT_THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleThemeSelect(t.id)}
                  className={`p-4 rounded-lg border-2 transition-all ${selectedTheme === t.id ? 'border-current' : 'border-transparent'}`}
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderColor: selectedTheme === t.id ? t.color : 'transparent',
                  }}
                >
                  <div className="w-12 h-12 rounded-full mx-auto mb-3" style={{ background: t.color }} />
                  <p className="text-sm font-medium text-center" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                  <p className="text-xs text-center mt-1" style={{ color: 'var(--text-secondary)' }}>{t.color}</p>
                  {selectedTheme === t.id && (
                    <div className="mt-2 text-xs text-center font-medium" style={{ color: t.color }}>✓ Active</div>
                  )}
                </button>
              ))}
            </div>
            {saved && (
              <div className="mt-4 p-3 rounded-lg text-sm text-center" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                Theme saved successfully!
              </div>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="mb-8">
          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-secondary)' }}>Preview</h3>
            <div className="flex flex-wrap gap-4">
              <button className="px-4 py-2 rounded-lg font-medium text-[var(--text-button)]" style={{ background: 'var(--button-bg)' }}>Primary Button</button>
              <button className="px-4 py-2 rounded-lg font-medium border" style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)', background: 'transparent' }}>Secondary Button</button>
              <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>Badge</span>
              <a href="#" className="font-medium hover:underline" style={{ color: 'var(--accent-primary)' }}>Link Text</a>
            </div>
            <div className="mt-4 p-4 rounded-lg border-l-4" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--accent-primary)' }}>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>This is how accent colors appear in cards and highlights.</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
