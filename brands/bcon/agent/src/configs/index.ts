import { proxeConfig } from './proxe.config';
import type { BrandConfig } from './proxe.config';

export const brandConfigs: Record<string, BrandConfig> = {
  bcon: proxeConfig,
};

export function getBrandConfig(brand: string): BrandConfig {
  return brandConfigs[brand.toLowerCase()] || proxeConfig;
}

export { proxeConfig };
export type { BrandConfig };
