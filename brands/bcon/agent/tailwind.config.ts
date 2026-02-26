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
          50: '#faf8f3',
          100: '#f5f0e6',
          200: '#E8D5B7',
          300: '#d4c19a',
          400: '#C9A961',
          500: '#b8964f',
          600: '#9d7a3d',
          700: '#7d5f2f',
          800: '#5d4522',
          900: '#3d2e16',
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


