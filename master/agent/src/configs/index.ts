import { proxeConfig } from './proxe.config';
import { windchasersConfig } from './brand.config';
import { bconConfig } from './bcon.config';
import type { BrandConfig } from './proxe.config';

export const brandConfigs: Record<string, BrandConfig> = {
  proxe: proxeConfig,
  windchasers: windchasersConfig,
  bcon: bconConfig,
};

/** Brand → data-theme mapping for CSS selectors */
export const brandThemeMap: Record<string, string> = {
  windchasers: 'aviation-gold',
  proxe: 'proxe-purple',
  bcon: 'bcon-electric',
};

/**
 * Get brand config. Checks explicit brand param first, then NEXT_PUBLIC_BRAND_ID env var, falls back to windchasers.
 */
export function getBrandConfig(brand?: string): BrandConfig {
  const brandId = brand || process.env.NEXT_PUBLIC_BRAND_ID || 'windchasers';
  return brandConfigs[brandId.toLowerCase()] || windchasersConfig;
}

/**
 * Get current brand ID from env var, with fallback.
 */
export function getCurrentBrandId(): string {
  return process.env.NEXT_PUBLIC_BRAND_ID || 'windchasers';
}

export { proxeConfig, windchasersConfig, bconConfig };
export type { BrandConfig };
