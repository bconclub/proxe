'use client'

/**
 * The "dashboard loaded" cue - and, mostly, the rules for NOT playing it.
 *
 * It started as "chime once per full page load", which in practice meant a pop
 * on nearly every navigation: the shell remounts when you cross out of
 * /dashboard (war-room), a couple of settings pages mount a SECOND
 * DashboardLayout inside the route layout's one, and any hard refresh counts.
 * Founder: "every page loading is going patka patka - that's not needed. When
 * we reload after a long time and something updates, that is when we can have
 * that."
 *
 * So the cue now fires only when it carries information:
 *
 *   1. the running app version changed since the last time we chimed
 *      (something actually shipped), or
 *   2. it has been QUIET_HOURS since the last chime (you have been away and
 *      are sitting back down).
 *
 * Anything else is silent. Both facts live in localStorage, so the rule holds
 * across reloads and tabs rather than resetting with the page.
 */

import { playSound } from './sound-prefs'

const LAST_KEY = 'wc-ready-last'       // ISO of the last chime
const VERSION_KEY = 'wc-ready-version' // app version we last chimed for

/** How long away counts as "a long time". */
const QUIET_HOURS = 4

// Duplicate mounts within ONE page load must never double-chime. Module scope,
// so every DashboardLayout instance on the page shares it (the nested-layout
// pages mount two).
let chimedThisLoad = false

function read(key: string): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(key) } catch { return null }
}

/**
 * Decide and play. Call once the sound prefs have hydrated AND the running
 * version is known - chiming before prefs land would ignore a muted team.
 * `version` may be null if /api/build-info failed; the time rule still applies.
 */
export function maybePlayReadyCue(version: string | null) {
  if (typeof window === 'undefined') return
  if (chimedThisLoad) return
  chimedThisLoad = true // claim the slot even if we decide not to play

  const lastAt = read(LAST_KEY)
  const lastVersion = read(VERSION_KEY)

  const shipped = !!version && !!lastVersion && version !== lastVersion
  const lastMs = lastAt ? Date.parse(lastAt) : NaN
  // No record yet (first ever load in this browser) counts as "a long time".
  const longGap = Number.isNaN(lastMs) || Date.now() - lastMs > QUIET_HOURS * 3600_000

  // Remember this load either way, so a silent load still moves the clock and
  // records the version - otherwise every load would look like an update.
  try {
    localStorage.setItem(LAST_KEY, new Date().toISOString())
    if (version) localStorage.setItem(VERSION_KEY, version)
  } catch { /* private mode */ }

  if (shipped || longGap) playSound('ready')
}
