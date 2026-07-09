'use client';

// Notifications & Sounds — master mute + per-event toggles. Extracted from the
// old single-scroll settings page when Configure became a card grid.

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { MdArrowBack } from 'react-icons/md';
import {
  SOUND_LABELS,
  type SoundEvent,
  isMuted,
  setMuted as persistMuted,
  isEventEnabled,
  setEventEnabled,
  preview as previewSound,
} from '@/lib/sound-prefs';
import { saveGlobalPrefs } from '@/lib/dashboard-prefs';
import { brandLabel } from '@/configs';

const SOUND_EVENTS: { ev: SoundEvent; hint: string }[] = [
  { ev: 'new', hint: `Pop cue when a fresh ${brandLabel('Lead').toLowerCase()} is scored` },
  { ev: 'update', hint: 'Pop on a stage or score change' },
  { ev: 'ready', hint: 'Cue when the home page finishes loading' },
];

export default function NotificationsPage() {
  const [soundMuted, setSoundMuted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<Record<SoundEvent, boolean>>({
    new: true, update: true, ready: true,
  });

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

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl">
        <a href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-xs mb-4" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <MdArrowBack size={15} /> Configure
        </a>
        <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Notifications &amp; Sounds</h1>

        <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
          {/* Master mute */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
            <div>
              <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>All notification sounds</h3>
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
              <span className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all" style={{ left: soundMuted ? '4px' : '24px' }} />
            </button>
          </div>

          {/* Per-event toggles + preview */}
          <div className="flex flex-col gap-3">
            {SOUND_EVENTS.map(({ ev, hint }) => {
              const on = soundEnabled[ev] && !soundMuted;
              return (
                <div key={ev} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg-tertiary)', opacity: soundMuted ? 0.5 : 1 }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{SOUND_LABELS[ev]}</p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{hint}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <button
                      onClick={() => previewSound(ev)}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors hover:border-[var(--accent-primary)]"
                      style={{ borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}
                      title={`Preview ${SOUND_LABELS[ev]} sound`}
                    >
                      ▶ Preview
                    </button>
                    <button
                      onClick={() => toggleEvent(ev)}
                      disabled={soundMuted}
                      role="switch"
                      aria-checked={soundEnabled[ev]}
                      aria-label={`Toggle ${SOUND_LABELS[ev]} sound`}
                      className="relative w-11 h-6 rounded-full transition-colors disabled:cursor-not-allowed"
                      style={{ background: on ? 'var(--accent-primary)' : 'var(--bg-secondary)' }}
                    >
                      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: soundEnabled[ev] ? '22px' : '2px' }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
