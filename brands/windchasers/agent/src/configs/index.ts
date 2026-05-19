import { windchasersConfig } from './brand.config';
import type { BrandConfig } from './types';

/**
 * SINGLE SOURCE OF TRUTH for this codebase's brand identity.
 *
 * This repo lives at `brands/windchasers/agent/` — it IS the windchasers
 * deployment. Brand is a compile-time constant, NOT an env var with a
 * fallback. Other brands (e.g. bcon) have their own forks of this codebase
 * with their own BRAND_ID constant.
 *
 * Never read NEXT_PUBLIC_BRAND_ID / NEXT_PUBLIC_BRAND with a fallback string
 * anywhere. Always import BRAND_ID from here.
 */
export const BRAND_ID = 'windchasers' as const;

export const brandConfigs: Record<string, BrandConfig> = {
  windchasers: windchasersConfig,
};

/** Brand → data-theme mapping for CSS selectors */
export const brandThemeMap: Record<string, string> = {
  windchasers: 'aviation-gold',
};

/**
 * Get brand config. The `brand` arg only exists for historical call sites
 * that accept an explicit override; for this deployment, it always resolves
 * to windchasers.
 */
export function getBrandConfig(_brand?: string): BrandConfig {
  return windchasersConfig;
}

/**
 * Get current brand ID. Always returns BRAND_ID for this deployment.
 * Function form retained so call sites don't need to change shape.
 */
export function getCurrentBrandId(): string {
  return BRAND_ID;
}

export { windchasersConfig };
export type { BrandConfig };
