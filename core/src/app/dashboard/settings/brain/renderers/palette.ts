// ─────────────────────────────────────────────────────────────────────────────
// resolvePalette() - the Brain's colour system, shared by every renderer.
//
// A brand may supply brain.orbPalette (chrome rgb + weighted particle-hue mix
// + sweep color); without it everything derives from the brand's own primary
// colour (NOT the dashboard --accent-primary, which is monochrome in the bw
// themes). Light themes swap glowing whites for accent-weighted inks so the
// visualization never reads as a smudge on white. Client-side only - reads
// getComputedStyle; call from inside a mount effect.
// ─────────────────────────────────────────────────────────────────────────────

import { getBrandConfig } from '@/configs'
import type { BrandConfig } from '@/configs/types'

type OrbPalette = NonNullable<NonNullable<BrandConfig['brain']>['orbPalette']>

export interface ResolvedPalette {
  h: number                          // accent hue
  s: number                          // accent saturation (%)
  rgb: [number, number, number]      // chrome: rings / glow / links
  sweepRgb: [number, number, number] // radar sweep arm
  particleHue(): number              // per-particle hue draw (weighted mix or accent spread)
  isLight: boolean
  coreRGB: string                    // nucleus core ink ('r,g,b')
  glowMul: number                    // glow softening on light themes
  pLightBase: number                 // particle lightness base (%)
  pLightSpan: number                 // particle lightness span (%)
}

function cssLuma(varName: string): number {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
    const m = v.match(/^#?([0-9a-f]{6})$/i)
    if (!m) return 0
    const n = parseInt(m[1], 16)
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  } catch { return 0 }
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number } {
  const r1 = r / 255, g1 = g / 255, b1 = b / 255
  const max = Math.max(r1, g1, b1), min = Math.min(r1, g1, b1), d = max - min
  let h = 0
  if (d) {
    if (max === r1) h = ((g1 - b1) / d) % 6
    else if (max === g1) h = (b1 - r1) / d + 2
    else h = (r1 - g1) / d + 4
    h = (h * 60 + 360) % 360
  }
  const l = (max + min) / 2
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
  return { h, s: Math.max(45, Math.round(s * 100)) }
}

function accentColor(): { h: number; s: number; rgb: [number, number, number] } {
  const fallback = { h: 262, s: 83, rgb: [139, 92, 246] as [number, number, number] }
  try {
    // The visualization is a BRAND element - always render in the brand's own
    // colour regardless of the light/dark theme.
    let hex = ''
    try {
      const c = getBrandConfig().colors
      hex = (c.primary || c.primaryVibrant || '').trim()
    } catch { /* fall through to CSS var */ }
    if (!/^#?[0-9a-f]{6}$/i.test(hex)) {
      hex = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
    }
    const m = hex.match(/^#?([0-9a-f]{6})$/i)
    if (!m) return fallback
    const n = parseInt(m[1], 16)
    const rgb: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    return { ...rgbToHsl(...rgb), rgb }
  } catch { return fallback }
}

export function resolvePalette(pal?: OrbPalette): ResolvedPalette {
  const ac = pal ? { ...rgbToHsl(...pal.chromeRgb), rgb: pal.chromeRgb } : accentColor()
  const [ar, ag, ab] = ac.rgb
  const isLight = cssLuma('--bg-primary') > 0.5
  const particleHue = (): number => {
    const hues = pal?.particleHues
    if (!hues?.length) return ac.h + (Math.random() * 36 - 18) - (Math.random() < 0.2 ? 40 : 0)
    const total = hues.reduce((s, x) => s + x.weight, 0) || 1
    let r = Math.random() * total
    for (const x of hues) { if ((r -= x.weight) <= 0) return x.hue + Math.random() * x.spread * 2 - x.spread }
    return hues[0].hue
  }
  return {
    h: ac.h,
    s: ac.s,
    rgb: ac.rgb,
    sweepRgb: pal?.sweepRgb || ac.rgb,
    particleHue,
    isLight,
    coreRGB: isLight ? `${ar},${ag},${ab}` : '255,255,255',
    glowMul: isLight ? 0.45 : 1,
    pLightBase: isLight ? 34 : 56,
    pLightSpan: isLight ? 12 : 14,
  }
}
