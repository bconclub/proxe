/**
 * Notification sound preferences — single source of truth (BCON).
 *
 * Ported from Windchasers. Used by NotificationCenter (new-lead / update
 * alerts), the home-page "ready" cue, and the Settings "Notifications &
 * Sounds" panel. All read/write the SAME localStorage keys so toggling mute
 * in one place is honoured everywhere (after the next play).
 *
 * Sound files live in public/sounds/ (new-lead.mp3, update.mp3, page-load.mp3
 * — copied from the Windchasers set).
 */

export type SoundEvent = 'new' | 'update' | 'ready'

export const SOUND_FILES: Record<SoundEvent, string> = {
  new: '/sounds/new-lead.mp3',
  update: '/sounds/update.mp3',
  ready: '/sounds/page-load.mp3',
}

export const SOUND_LABELS: Record<SoundEvent, string> = {
  new: 'New lead',
  update: 'Lead update',
  ready: 'Page ready',
}

// Per-event playback gain (0..1). Page-ready cue is loud — turn it down hard.
const SOUND_VOLUME: Record<SoundEvent, number> = {
  new: 1.0,
  update: 1.0,
  ready: 0.18,
}

// Master mute key kept as-is for back-compat with the existing bell toggle.
const MUTED_KEY = 'bcon-notif-muted'
const ENABLED_KEY: Record<SoundEvent, string> = {
  new: 'bcon-sound-new',
  update: 'bcon-sound-update',
  ready: 'bcon-sound-ready',
}

function read(key: string): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, val: string) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, val) } catch { /* private mode — ignore */ }
}

export function isMuted(): boolean {
  return read(MUTED_KEY) === '1'
}
export function setMuted(v: boolean) {
  write(MUTED_KEY, v ? '1' : '0')
}

// Per-event toggles default ON (including the page-ready cue).
export function isEventEnabled(ev: SoundEvent): boolean {
  return read(ENABLED_KEY[ev]) !== '0'
}
export function setEventEnabled(ev: SoundEvent, v: boolean) {
  write(ENABLED_KEY[ev], v ? '1' : '0')
}

// Lazily-built, reused <audio> elements so we don't re-fetch on every play.
const cache: Partial<Record<SoundEvent, HTMLAudioElement>> = {}

// When a cue (e.g. the page-load "ready" sound) fires before the user has
// interacted with the page, the browser's autoplay policy rejects play().
// Arm a one-shot listener that retries the cue on the first gesture.
let armedFor: SoundEvent | null = null
function armGestureRetry(ev: SoundEvent) {
  if (typeof document === 'undefined') return
  if (armedFor) { armedFor = ev; return } // listener already pending — just update target
  armedFor = ev
  const retry = () => {
    document.removeEventListener('pointerdown', retry)
    document.removeEventListener('keydown', retry)
    document.removeEventListener('touchstart', retry)
    const pending = armedFor
    armedFor = null
    if (pending) preview(pending)
  }
  document.addEventListener('pointerdown', retry, { once: true })
  document.addEventListener('keydown', retry, { once: true })
  document.addEventListener('touchstart', retry, { once: true })
}

/** Play an event sound, respecting master mute + the per-event toggle. */
export function playSound(ev: SoundEvent) {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return
  if (isMuted() || !isEventEnabled(ev)) return
  preview(ev)
}

/** Play a sound IGNORING toggles — for the Configure preview buttons. */
export function preview(ev: SoundEvent) {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return
  let a = cache[ev]
  if (!a) { a = new Audio(SOUND_FILES[ev]); cache[ev] = a }
  try {
    a.currentTime = 0
    a.volume = SOUND_VOLUME[ev]
    void a.play().catch(() => {
      // Autoplay blocked (no user gesture yet) — retry on first interaction.
      armGestureRetry(ev)
    })
  } catch { /* ignore */ }
}
