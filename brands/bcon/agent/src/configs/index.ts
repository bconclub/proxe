import { bconConfig } from './brand.config';
import { proxeConfig } from './proxe.config';
import type { BrandConfig } from './proxe.config';

export const brandConfigs: Record<string, BrandConfig> = {
  bcon: bconConfig,
  proxe: proxeConfig,
};

export function getBrandConfig(brand: string): BrandConfig {
  return brandConfigs[brand.toLowerCase()] || bconConfig;
}

export { bconConfig, proxeConfig };
export type { BrandConfig };
