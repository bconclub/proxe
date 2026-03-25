'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getBrandConfig, getCurrentBrandId } from '@/configs';

export type ThemeMode = 'brand' | 'bw-dark' | 'bw-light';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'bw-dark',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = 'proxe-theme';

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeMode>('bw-dark');

  const applyTheme = useCallback((mode: ThemeMode) => {
    const html = document.documentElement;
    const brandId = getCurrentBrandId();
    const config = getBrandConfig(brandId);

    // Clear previous data-theme and dark/light classes
    html.removeAttribute('data-theme');
    html.classList.remove('dark', 'light');

    if (mode === 'bw-dark') {
      html.setAttribute('data-theme', 'bw-dark');
      html.classList.add('dark');
      html.style.setProperty('--accent-primary', '#ffffff');
      html.style.setProperty('--accent-light', '#ffffff');
      html.style.setProperty('--accent-subtle', 'rgba(255,255,255,0.1)');
      html.style.setProperty('--bg-primary', '#000000');
      html.style.setProperty('--bg-secondary', '#111111');
      html.style.setProperty('--bg-tertiary', '#1a1a1a');
      html.style.setProperty('--bg-hover', 'rgba(255,255,255,0.06)');
      html.style.setProperty('--border-primary', 'rgba(255,255,255,0.1)');
      html.style.setProperty('--text-primary', '#ffffff');
      html.style.setProperty('--text-secondary', 'rgba(255,255,255,0.6)');
      html.style.setProperty('--text-muted', 'rgba(255,255,255,0.4)');
    } else if (mode === 'bw-light') {
      html.setAttribute('data-theme', 'bw-light');
      html.classList.add('light');
      html.style.setProperty('--accent-primary', '#000000');
      html.style.setProperty('--accent-light', '#000000');
      html.style.setProperty('--accent-subtle', 'rgba(0,0,0,0.08)');
      html.style.setProperty('--bg-primary', '#ffffff');
      html.style.setProperty('--bg-secondary', '#fafafa');
      html.style.setProperty('--bg-tertiary', '#f2f2f2');
      html.style.setProperty('--bg-hover', 'rgba(0,0,0,0.04)');
      html.style.setProperty('--border-primary', 'rgba(0,0,0,0.1)');
      html.style.setProperty('--text-primary', '#000000');
      html.style.setProperty('--text-secondary', 'rgba(0,0,0,0.6)');
      html.style.setProperty('--text-muted', 'rgba(0,0,0,0.4)');
    } else {
      // 'brand' mode - original behavior
      const color = config.colors.primary;
      html.setAttribute('data-theme', `${brandId}-electric`);
      html.classList.add('dark');
      html.style.setProperty('--accent-primary', color);
      html.style.setProperty('--accent-light', color);
      html.style.setProperty('--accent-subtle', `${color}20`);
      html.style.setProperty('--bg-primary', config.colors.primaryDark);
      html.style.setProperty('--bg-secondary', config.colors.primaryDark);
      html.style.setProperty('--bg-tertiary', 'rgba(255, 255, 255, 0.02)');
      html.style.setProperty('--bg-hover', '#1A1A1A');
      html.style.setProperty('--border-primary', config.colors.borderColor);
      html.style.setProperty('--text-primary', '#ffffff');
      html.style.setProperty('--text-secondary', '#999999');
    }
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
    applyTheme(mode);
  }, [applyTheme]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const mode = saved && ['brand', 'bw-dark', 'bw-light'].includes(saved) ? saved : 'bw-dark';
    setThemeState(mode);
    applyTheme(mode);
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
