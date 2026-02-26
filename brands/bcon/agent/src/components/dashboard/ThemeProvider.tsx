'use client';

import { useEffect } from 'react';

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Load saved accent theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('bcon-accent-theme');
    if (savedTheme) {
      const themes: Record<string, string> = {
        'bcon': '#CCFF00', // BCON neon lime
        'lime': '#CCFF00',
        'purple': '#6B2FE8',
        'grey': '#6B7280',
      };
      const color = themes[savedTheme];
      if (color) {
        document.documentElement.style.setProperty('--accent-primary', color);
        document.documentElement.style.setProperty('--accent-light', color);
        document.documentElement.style.setProperty('--accent-subtle', `${color}20`);
      }
    } else {
      // Default to BCON neon lime
      const defaultColor = '#CCFF00';
      document.documentElement.style.setProperty('--accent-primary', defaultColor);
      document.documentElement.style.setProperty('--accent-light', defaultColor);
      document.documentElement.style.setProperty('--accent-subtle', `${defaultColor}20`);
    }
  }, []);

  return <>{children}</>;
}
