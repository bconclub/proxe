// ONE active brand per build. `@brand` resolves to /brands/<BRAND_ID> via the
// next.config alias, so no other brand's config is ever bundled. Adding a brand
// = a new /brands/<id> folder — this file never changes.
import { brandConfig } from '@brand/config';
import type { BrandConfig } from './types';

export const brandConfigs: Record<string, BrandConfig> = {
  [brandConfig.brand]: brandConfig,
};

/** Brand → data-theme attribute for CSS selectors. */
export const brandThemeMap: Record<string, string> = {
  [brandConfig.brand]: (brandConfig as any).themeDataAttr || brandConfig.brand,
};

/** Single-brand build: the arg is ignored — there is only the active brand. */
export function getBrandConfig(_brand?: string): BrandConfig {
  return brandConfig;
}

export function getCurrentBrandId(): string {
  return brandConfig.brand;
}

export const BRAND_ID = brandConfig.brand;

export { brandConfig };
export type { BrandConfig };
