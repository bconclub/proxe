'use client';

import { useEffect } from 'react';

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Load saved accent theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('proxe-accent-theme');
    if (savedTheme) {
      const themes: Record<string, string> = {
        'proxe': '#8B5CF6',
        'gold': '#afd510',
        'orange': '#fc7301',
        'grey': '#6B7280',
      };
      const color = themes[savedTheme];
      if (color) {
        document.documentElement.style.setProperty('--accent-primary', color);
        document.documentElement.style.setProperty('--accent-light', color);
        document.documentElement.style.setProperty('--accent-subtle', `${color}20`);
      }
    }
  }, []);

  return <>{children}</>;
}

