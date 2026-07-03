/**
 * Brand accent themes — shared between the Configure page (interactive
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
    id: 'lokazen-orange',
    name: 'Lokazen Orange',
    color: '#FF5200',
    bgSecondary: '#14161C',
    bgTertiary: 'rgba(255, 82, 0, 0.12)',
    bgHover: 'rgba(255, 82, 0, 0.16)',
    borderPrimary: 'rgba(255, 82, 0, 0.32)',
    textPrimary: '#F8F9FA',
    textSecondary: 'rgba(248, 249, 250, 0.75)',
    buttonBg: '#FF5200',
    textButton: '#FFFFFF',
  },
  { id: 'red', name: 'Lokazen Red', color: '#E4002B' },
  { id: 'gold', name: 'Electric Lime', color: '#afd510' },
  { id: 'grey', name: 'Neutral Grey', color: '#6B7280' },
]

export const DEFAULT_ACCENT_ID = ACCENT_THEMES[0].id

/**
 * Apply an accent's COLOUR tokens, plus the Lokazen-Orange dark bg/text overrides
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

  // Lokazen Orange takes over bg/text only when NOT in light mode (otherwise it
  // stomps light-mode readability). Other accents leave the mode's base bg/text
  // exactly as ThemeProvider set them.
  if (accent.id === 'lokazen-orange' && mode !== 'bw-light') {
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
