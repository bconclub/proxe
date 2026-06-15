/**
 * Client helper for the GLOBAL dashboard preferences (sounds + theme). (BCON)
 *
 * Ported from Windchasers. The server
 * (/api/dashboard/settings/preferences) is the source of truth; this just
 * fetches it, pushes changes, and mirrors the sound prefs into the same
 * localStorage keys the sound-prefs helper reads — so one user's setting
 * reaches every user on their next load.
 */

import { setMuted, setEventEnabled, type SoundEvent } from './sound-prefs'

export interface GlobalPrefs {
  sounds?: { muted?: boolean; new?: boolean; update?: boolean; ready?: boolean }
  theme?: { mode?: 'brand' | 'bw-dark' | 'bw-light'; accent?: string }
}

export async function fetchGlobalPrefs(): Promise<GlobalPrefs> {
  try {
    const res = await fetch('/api/dashboard/settings/preferences', { credentials: 'include' })
    if (!res.ok) return {}
    const data = await res.json()
    return (data.prefs as GlobalPrefs) || {}
  } catch {
    return {}
  }
}

/** Fire-and-forget save of a partial prefs object. Non-fatal on failure. */
export async function saveGlobalPrefs(partial: GlobalPrefs): Promise<void> {
  try {
    await fetch('/api/dashboard/settings/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(partial),
    })
  } catch {
    /* non-fatal — local change already applied */
  }
}

/** Mirror global sound prefs into localStorage so sound-prefs reads them. */
export function applySoundsToLocal(sounds?: GlobalPrefs['sounds']) {
  if (!sounds) return
  if (typeof sounds.muted === 'boolean') setMuted(sounds.muted)
  ;(['new', 'update', 'ready'] as SoundEvent[]).forEach((ev) => {
    const v = sounds[ev]
    if (typeof v === 'boolean') setEventEnabled(ev, v)
  })
}
