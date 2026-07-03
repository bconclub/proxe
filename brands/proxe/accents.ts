/**
 * PROXe accent palette. RULE: a brand's UI uses ONLY its own brand colour or a
 * neutral — never another brand's colours. Three accent options (brand /
 * monochrome / grey); dark vs light is the separate Dashboard Mode. Standard
 * semantic colours (success green / error red / info blue) are unaffected.
 *
 * This file is brand-PRIVATE (never synced) so each brand owns its palette.
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
  { id: 'brand', name: 'PROXe', color: '#8B5CF6' },
  { id: 'mono',  name: 'Black & White', color: '#FAFAFA' },
  { id: 'grey',  name: 'Black & Grey',  color: '#6B7280' },
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
