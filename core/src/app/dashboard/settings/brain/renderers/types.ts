// ─────────────────────────────────────────────────────────────────────────────
// Brain renderer contract - VoiceOrb is the container (voice engine, captions,
// quick-ask, language pills); a renderer is a pure canvas animation that reads
// the live voice state through RendererEnv each frame. Three renderers ship:
// cortex (side-profile neural brain), pulseOrb (the classic orb), mandala
// (HUD rings). Each owns its own rAF loop + resize listener; destroy() must
// cancel the loop, drop the listener, and clear the canvas.
// ─────────────────────────────────────────────────────────────────────────────

import type { ResolvedPalette } from './palette'

export type OrbMode = 'idle' | 'thinking' | 'speaking' | 'error'

// Pointer ripple, ms-stamped (performance.now()) so renderers with different
// frame counters agree on age.
export type Ripple = { x: number; y: number; born: number }

export interface RendererEnv {
  getMode(): OrbMode
  getAmp(): number                   // 0..1 live speech energy (0 unless speaking)
  getWaveform(): Uint8Array | null   // time-domain samples while speaking, else null
  getRipples(): Ripple[]             // pointer ripples in canvas device px
  getThinkStart(): number | null     // performance.now() when thinking began
  getRingDoneAt(): number | null     // performance.now() when speech began (ring flash)
  palette: ResolvedPalette
}

export type BrainRenderer = { destroy(): void }
export type CreateRenderer = (canvas: HTMLCanvasElement, env: RendererEnv) => BrainRenderer

export type VariantId = 'cortex' | 'pulse' | 'mandala'
