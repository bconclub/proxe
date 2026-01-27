import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'exo-2': ['var(--font-exo-2)', 'sans-serif'],
        'zen-dots': ['var(--font-zen-dots)', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
        dark: {
          darkest: '#0D0D0D',
          darker: '#1A1A1A',
          dark: '#262626',
          base: '#333333',
        },
        light: {
          white: '#ffffff',
          lightest: '#f6f6f6',
          lighter: '#ececec',
          light: '#d0d0d0',
        },
      },
    },
  },
  plugins: [],
}
export default config


