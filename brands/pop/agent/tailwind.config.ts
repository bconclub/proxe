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
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8B5CF6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
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


