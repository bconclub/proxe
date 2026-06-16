/**
 * Windchasers accent themes — shared between the Configure page (interactive
 * picker) and the global-prefs hydration in DashboardLayout, so both apply the
 * exact same accent colours and never diverge.
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
  {
    id: 'aviation-gold',
    name: 'Aviation Gold',
    color: '#C9A961',
    bgSecondary: '#1A0F0A',
    bgTertiary: 'rgba(201, 169, 97, 0.12)',
    bgHover: 'rgba(201, 169, 97, 0.16)',
    borderPrimary: 'rgba(201, 169, 97, 0.32)',
    textPrimary: '#E8D5B7',
    textSecondary: 'rgba(232, 213, 183, 0.75)',
    buttonBg: '#C9A961',
    textButton: '#1A0F0A',
  },
  { id: 'gold', name: 'Electric Lime', color: '#afd510' },
  { id: 'orange', name: 'Sunset Orange', color: '#fc7301' },
  { id: 'grey', name: 'Neutral Grey', color: '#6B7280' },
]

export const DEFAULT_ACCENT_ID = ACCENT_THEMES[0].id

/**
 * Apply an accent's COLOUR tokens, plus the Aviation-Gold dark bg/text overrides
 * when in a non-light mode. This is the SAFE variant used app-wide on load: it
 * never strips the mode's base bg/text vars (ThemeProvider has just set those),
 * so running it on every page can't leave a page un-themed. The Configure page
 * keeps its own picker logic for live switching.
 */
export function applyAccentColor(themeId: string, mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const accent = ACCENT_THEMES.find((t) => t.id === themeId)
  if (!accent) return
  const root = document.documentElement

  root.style.setProperty('--accent-primary', accent.color)
  root.style.setProperty('--accent-light', accent.color)
  root.style.setProperty('--accent-subtle', `${accent.color}20`)

  // Aviation Gold takes over bg/text only when NOT in light mode (otherwise it
  // stomps light-mode readability). Other accents leave the mode's base bg/text
  // exactly as ThemeProvider set them.
  if (accent.id === 'aviation-gold' && mode !== 'bw-light') {
    root.style.setProperty('--bg-secondary', accent.bgSecondary!)
    root.style.setProperty('--bg-tertiary', accent.bgTertiary!)
    root.style.setProperty('--bg-hover', accent.bgHover!)
    root.style.setProperty('--border-primary', accent.borderPrimary!)
    root.style.setProperty('--text-primary', accent.textPrimary!)
    root.style.setProperty('--text-secondary', accent.textSecondary!)
    root.style.setProperty('--button-bg', accent.buttonBg!)
    root.style.setProperty('--text-button', accent.textButton!)
  }
}
