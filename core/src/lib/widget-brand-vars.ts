import type { BrandConfig } from '@/configs/types';

/**
 * Bridge config.colors → the CSS custom properties ChatWidget.module.css
 * consumes. Brands without a dedicated block in theme.css would otherwise
 * inherit another brand's look (bw-dark white buttons / PROXe purple
 * fallbacks). Opt-in via styles.colorVarsFromConfig so brands that already
 * have hand-tuned theme.css blocks keep their exact rendering.
 *
 * Only call on widget-only pages (/widget, /widget/bubble) - the vars are set
 * inline on <html>, which would override dashboard theme switching elsewhere.
 */
const VAR_MAP: [cssVar: string, key: keyof BrandConfig['colors']][] = [
  ['--primary-color', 'primary'],
  ['--primary-vibrant', 'primaryVibrant'],
  ['--white', 'white'],
  ['--text-primary', 'textPrimary'],
  ['--text-button', 'textButton'],
  ['--border-medium', 'borderMedium'],
  ['--border-accent', 'borderAccent'],
  ['--border-glow', 'borderGlow'],
  ['--chat-border-color', 'borderColor'],
  ['--glass-shadow', 'glassShadow'],
  ['--bg-hover', 'bgHover'],
  ['--bg-message-area', 'bgMessageArea'],
  ['--bubble-user-bg', 'bubbleUserBg'],
  ['--bubble-user-border', 'bubbleUserBorder'],
  ['--bubble-user-shadow', 'bubbleUserShadow'],
  ['--bubble-ai-bg', 'bubbleAiBg'],
  ['--bubble-ai-border', 'bubbleAiBorder'],
  ['--bubble-ai-shadow', 'bubbleAiShadow'],
  ['--button-bg', 'buttonBg'],
  ['--button-hover', 'buttonHover'],
  // Closed-bubble chrome (ring + glow + backdrop) - otherwise hardcoded gold.
  ['--bubble-ring', 'primaryVibrant'],
  ['--bubble-ring-glow', 'borderGlow'],
  ['--bubble-bg', 'darkBg'],
];

export function applyBrandColorVars(config: BrandConfig): void {
  if (typeof document === 'undefined') return;
  if (!config.styles?.colorVarsFromConfig) return;
  const root = document.documentElement;
  for (const [cssVar, key] of VAR_MAP) {
    const value = config.colors?.[key];
    if (value) root.style.setProperty(cssVar, String(value));
  }
}
