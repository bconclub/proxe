import { proxeConfig } from './proxe.config';
import { windchasersConfig } from './brand.config';
import type { BrandConfig } from './proxe.config';

/**
 * SINGLE SOURCE OF TRUTH for this codebase's brand identity.
 *
 * This repo lives at `brands/windchasers/agent/` — it IS the windchasers
 * deployment. Brand is a compile-time constant, NOT an env var with a
 * fallback. Other brands (e.g. bcon) have their own forks of this codebase.
 *
 * Never read NEXT_PUBLIC_BRAND_ID or NEXT_PUBLIC_BRAND with a `|| 'bcon'` /
 * `|| 'windchasers'` fallback anywhere. Always import BRAND_ID from here.
 */
export const BRAND_ID = 'windchasers' as const;

export const brandConfigs: Record<string, BrandConfig> = {
  proxe: proxeConfig,
  windchasers: windchasersConfig,
};

/** Brand → data-theme mapping for CSS selectors */
export const brandThemeMap: Record<string, string> = {
  windchasers: 'aviation-gold',
  proxe: 'proxe-purple',
};

/**
 * Get brand config. The `brand` arg only exists for historical call sites
 * that pass an explicit override (e.g. cross-brand admin scripts). For this
 * deployment, omitting it always resolves to windchasers.
 */
export function getBrandConfig(brand?: string): BrandConfig {
  const brandId = (brand || BRAND_ID).toLowerCase();
  return brandConfigs[brandId] || windchasersConfig;
}

/**
 * Get current brand ID. Always returns BRAND_ID for this deployment.
 * Function form retained so call sites don't need to change shape.
 */
export function getCurrentBrandId(): string {
  return BRAND_ID;
}

export { proxeConfig, windchasersConfig };
export type { BrandConfig };
