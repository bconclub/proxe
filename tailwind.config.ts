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
          50: '#f5f0fa',
          100: '#e9dff5',
          200: '#d3bfeb',
          300: '#b894dd',
          400: '#9a5fc9',
          500: '#7d3fb5',
          600: '#5B1A8C',
          700: '#4a1573',
          800: '#3a1059',
          900: '#2a0c40',
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


