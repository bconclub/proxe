'use client';

import { useEffect } from 'react';

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Load saved accent theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('windchasers-accent-theme');
    if (savedTheme) {
      const themes: Record<string, string> = {
        'windchasers': '#C9A961', // Windchasers gold
        'gold': '#C9A961',
        'orange': '#fc7301',
        'grey': '#6B7280',
      };
      const color = themes[savedTheme];
      if (color) {
        document.documentElement.style.setProperty('--accent-primary', color);
        document.documentElement.style.setProperty('--accent-light', color);
        document.documentElement.style.setProperty('--accent-subtle', `${color}20`);
      }
    } else {
      // Default to Windchasers gold if no theme saved
      const defaultColor = '#C9A961';
      document.documentElement.style.setProperty('--accent-primary', defaultColor);
      document.documentElement.style.setProperty('--accent-light', defaultColor);
      document.documentElement.style.setProperty('--accent-subtle', `${defaultColor}20`);
    }
  }, []);

  return <>{children}</>;
}
