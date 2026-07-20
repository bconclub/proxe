// ONE active brand per build. `@brand` resolves to /brands/<BRAND_ID> via the
// next.config alias, so no other brand's config is ever bundled. Adding a brand
// = a new /brands/<id> folder - this file never changes.
import { brandConfig } from '@brand/config';
import type { BrandConfig } from './types';

export const brandConfigs: Record<string, BrandConfig> = {
  [brandConfig.brand]: brandConfig,
};

/** Brand → data-theme attribute for CSS selectors. */
export const brandThemeMap: Record<string, string> = {
  [brandConfig.brand]: (brandConfig as any).themeDataAttr || brandConfig.brand,
};

/** Single-brand build: the arg is ignored - there is only the active brand. */
export function getBrandConfig(_brand?: string): BrandConfig {
  return brandConfig;
}

export function getCurrentBrandId(): string {
  return brandConfig.brand;
}

export const BRAND_ID = brandConfig.brand;

/**
 * Brand-aware dashboard vocabulary. Pass the default English string; if the
 * active brand's config.labels remaps it, the brand's term comes back -
 * otherwise the default is returned unchanged. Lets a non-business brand
 * (pop = voters) rename "Leads"/"High Intent"/"Booked Calls" etc. without
 * forking components or touching other brands.
 */
export function brandLabel(defaultLabel: string): string {
  return brandConfig.labels?.[defaultLabel] ?? defaultLabel;
}

export { brandConfig };
export type { BrandConfig };
