import type { BrandConfig } from '@/configs';

export const bconConfig: BrandConfig = {
  name: 'BCON Club',
  brand: 'bcon',
  apiUrl: '/api/agent/web/chat',
  systemPrompt: {
    path: '@/api/prompts/bcon-prompt',
  },
  styles: {
    themePath: '@/styles/theme.css',
  },
  chatStructure: {
    showQuickButtons: true,
    showFollowUpButtons: true,
    maxFollowUps: 3,
    avatar: {
      type: 'image',
      source: '/bcon-icon.png',
    },
  },
  colors: {
    // Primary Colors — Neon Lime + Electric Purple on Black
    // Sourced from bconclub.com
    primary: '#CCFF00',              // Neon lime — primary CTA
    primaryLight: '#FFFFFF',          // White text
    primaryDark: '#0A0A0A',           // Near-black background
    primaryVibrant: '#6B2FE8',        // Electric purple — secondary accent

    // Gradient
    gradientStart: '#0A0A0A',
    gradientMid: '#6B2FE8',
    gradientEnd: '#CCFF00',

    // Backgrounds
    darkBg: '#0A0A0A',
    darkCard: 'rgba(28, 28, 28, 0.4)',
    darkSurface: 'rgba(28, 28, 28, 0.6)',
    glassBg: 'rgba(204, 255, 0, 0.05)',
    glassBorder: 'rgba(255, 255, 255, 0.1)',
    glassShadow: 'rgba(107, 47, 232, 0.2)',

    // Text Colors
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textTertiary: 'rgba(255, 255, 255, 0.5)',
    textMuted: '#A3A3A3',
    white: '#FFFFFF',

    // Borders
    borderLight: 'rgba(255, 255, 255, 0.08)',
    borderMedium: 'rgba(255, 255, 255, 0.12)',
    borderAccent: 'rgba(204, 255, 0, 0.3)',
    borderGlow: 'rgba(204, 255, 0, 0.4)',
    borderColor: 'rgba(204, 255, 0, 0.15)',

    // Accents
    greenSuccess: '#CCFF00',
    cyanAccent: '#6B2FE8',
    orangeAccent: '#CCFF00',
    goldAccent: '#6B2FE8',

    // Background Variants
    bgPrimary: 'rgba(28, 28, 28, 0.05)',
    bgHeader: 'rgba(10, 10, 10, 0.9)',
    bgMessageArea: 'rgba(204, 255, 0, 0.02)',
    bgHover: 'rgba(204, 255, 0, 0.08)',
    bgActive: 'rgba(204, 255, 0, 0.12)',

    // Chat Bubbles
    bubbleUserBg: 'rgba(204, 255, 0, 0.15)',
    bubbleUserBorder: 'rgba(204, 255, 0, 0.5)',
    bubbleUserShadow: '0 8px 32px rgba(204, 255, 0, 0.15)',
    bubbleAiBg: 'rgba(107, 47, 232, 0.15)',
    bubbleAiBorder: 'rgba(107, 47, 232, 0.4)',
    bubbleAiShadow: '0 8px 32px rgba(107, 47, 232, 0.15)',

    // Buttons
    buttonBg: 'rgba(204, 255, 0, 0.08)',
    buttonHover: 'rgba(204, 255, 0, 0.15)',
    buttonActive: 'rgba(204, 255, 0, 0.25)',
  },
  quickButtons: [
    'Explore AI Solutions',
    'Book a Strategy Call',
    'See Our Work',
  ],
  exploreButtons: [
    'AI in Business',
    'Brand Marketing',
    'Business Apps',
    'PROXe Platform',
  ],
  followUpButtons: [],
  firstMessageButtons: [],
};
