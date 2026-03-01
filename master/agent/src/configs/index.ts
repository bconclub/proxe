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
 * Resolve brand ID from env vars.
 * Supports both NEXT_PUBLIC_BRAND_ID and NEXT_PUBLIC_BRAND for backwards compat.
 */
function getBrandFromEnv(): string | undefined {
  return process.env.NEXT_PUBLIC_BRAND_ID || process.env.NEXT_PUBLIC_BRAND || undefined;
}

/**
 * Detect brand from hostname when env var is missing.
 * Runs client-side only (ThemeProvider, etc.).
 */
function detectBrandFromHostname(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname.toLowerCase();
  if (host.includes('bcon')) return 'bcon';
  if (host.includes('proxe')) return 'proxe';
  if (host.includes('windchasers')) return 'windchasers';
  return null;
}

/**
 * Get brand config. Checks explicit brand param first, then env vars,
 * then hostname detection, falls back to windchasers.
 */
export function getBrandConfig(brand?: string): BrandConfig {
  const brandId = brand || getBrandFromEnv() || detectBrandFromHostname() || 'windchasers';
  return brandConfigs[brandId.toLowerCase()] || windchasersConfig;
}

/**
 * Get current brand ID from env vars, hostname detection, or fallback.
 */
export function getCurrentBrandId(): string {
  return getBrandFromEnv() || detectBrandFromHostname() || 'windchasers';
}

export { proxeConfig, windchasersConfig, bconConfig };
export type { BrandConfig };
