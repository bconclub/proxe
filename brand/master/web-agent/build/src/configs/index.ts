import { MasterConfig } from './brand.config';
import type { BrandConfig } from './brand.config';

export const brandConfigs: Record<string, BrandConfig> = {
  master: MasterConfig,
};

export function getBrandConfig(brand: string): BrandConfig {
  return brandConfigs[brand.toLowerCase()] || MasterConfig;
}

export { MasterConfig };
export type { BrandConfig };

