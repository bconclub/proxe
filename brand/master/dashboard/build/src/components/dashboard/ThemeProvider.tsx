'use client';

import { useEffect } from 'react';

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Load saved accent theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('master-accent-theme');
    if (savedTheme) {
      const themes: Record<string, string> = {
        'master': '#666666', // Master gray
        'black': '#000000',
        'white': '#FFFFFF',
        'grey': '#666666',
        'light-gray': '#999999',
        'dark-gray': '#333333',
      };
      const color = themes[savedTheme];
      if (color) {
        document.documentElement.style.setProperty('--accent-primary', color);
        document.documentElement.style.setProperty('--accent-light', color);
        document.documentElement.style.setProperty('--accent-subtle', `${color}20`);
      }
    } else {
      // Default to Master gray if no theme saved
      const defaultColor = '#666666';
      document.documentElement.style.setProperty('--accent-primary', defaultColor);
      document.documentElement.style.setProperty('--accent-light', defaultColor);
      document.documentElement.style.setProperty('--accent-subtle', `${defaultColor}20`);
    }
  }, []);

  return <>{children}</>;
}
