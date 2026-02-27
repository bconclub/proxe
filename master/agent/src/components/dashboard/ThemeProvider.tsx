'use client';

import { useEffect } from 'react';
import { getBrandConfig, getCurrentBrandId } from '@/configs';

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Load accent theme from brand config on mount
  useEffect(() => {
    const brandId = getCurrentBrandId();
    const config = getBrandConfig(brandId);
    const color = config.colors.primary;

    document.documentElement.style.setProperty('--accent-primary', color);
    document.documentElement.style.setProperty('--accent-light', color);
    document.documentElement.style.setProperty('--accent-subtle', `${color}20`);

    // Also set dark mode background colors from brand config
    document.documentElement.style.setProperty('--bg-primary', config.colors.primaryDark);
    document.documentElement.style.setProperty('--bg-secondary', config.colors.primaryDark);
    document.documentElement.style.setProperty('--border-primary', config.colors.borderColor);
  }, []);

  return <>{children}</>;
}
