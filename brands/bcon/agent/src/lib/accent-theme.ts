/**
 * BCON accent themes — shared between the Configure page (interactive picker)
 * and the global-prefs hydration in DashboardLayout, so both apply the exact
 * same accent colours and never diverge.
 *
 * Ported from Windchasers. DEFAULT is BCON's brand accent (electric purple
 * #8B5CF6). The remaining accent OPTIONS are carried over from WC so the
 * picker offers the same selectable palette across brands.
 */

export type ThemeMode = 'brand' | 'bw-dark' | 'bw-light'

export interface AccentTheme {
  id: string
  name: string
  color: string
  bgSecondary?: string
  bgTertiary?: string
  bgHover?: string
  borderPrimary?: string
  textPrimary?: string
  textSecondary?: string
  buttonBg?: string
  textButton?: string
}

export const ACCENT_THEMES: AccentTheme[] = [
  { id: 'bcon', name: 'BCON Purple', color: '#8B5CF6' },
  { id: 'gold', name: 'Electric Lime', color: '#afd510' },
  { id: 'orange', name: 'Sunset Orange', color: '#fc7301' },
  { id: 'grey', name: 'Neutral Grey', color: '#6B7280' },
]

export const DEFAULT_ACCENT_ID = ACCENT_THEMES[0].id

/**
 * Apply an accent's COLOUR tokens. This is the SAFE variant used app-wide on
 * load: it only sets accent vars and never strips the mode's base bg/text vars
 * (ThemeProvider has just set those), so running it on every page can't leave a
 * page un-themed. The Configure page keeps its own picker logic for live
 * switching.
 */
export function applyAccentColor(themeId: string, _mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const accent = ACCENT_THEMES.find((t) => t.id === themeId)
  if (!accent) return
  const root = document.documentElement

  root.style.setProperty('--accent-primary', accent.color)
  root.style.setProperty('--accent-light', accent.color)
  root.style.setProperty('--accent-subtle', `${accent.color}20`)
}
