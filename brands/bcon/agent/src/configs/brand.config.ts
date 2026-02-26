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
    // Primary Colors - Electric Purple Palette
    primary: '#8B5CF6',
    primaryLight: '#E0D4FC',
    primaryDark: '#1A1025',
    primaryVibrant: '#A78BFA',

    // Gradient
    gradientStart: '#1A1025',
    gradientMid: '#8B5CF6',
    gradientEnd: '#A78BFA',

    // Backgrounds
    darkBg: '#0D0A14',
    darkCard: 'rgba(139, 92, 246, 0.3)',
    darkSurface: 'rgba(26, 16, 37, 0.4)',
    glassBg: 'rgba(139, 92, 246, 0.05)',
    glassBorder: 'rgba(224, 212, 252, 0.1)',
    glassShadow: 'rgba(139, 92, 246, 0.2)',

    // Text Colors
    textPrimary: '#E0D4FC',
    textSecondary: 'rgba(224, 212, 252, 0.7)',
    textTertiary: 'rgba(224, 212, 252, 0.5)',
    textMuted: 'rgba(224, 212, 252, 0.4)',
    white: '#E0D4FC',

    // Borders
    borderLight: 'rgba(224, 212, 252, 0.08)',
    borderMedium: 'rgba(224, 212, 252, 0.12)',
    borderAccent: 'rgba(139, 92, 246, 0.3)',
    borderGlow: 'rgba(139, 92, 246, 0.4)',
    borderColor: 'rgba(139, 92, 246, 0.2)',

    // Accents
    greenSuccess: '#10B981',
    cyanAccent: '#A78BFA',
    orangeAccent: '#8B5CF6',
    goldAccent: '#A78BFA',

    // Background Variants
    bgPrimary: 'rgba(26, 16, 37, 0.05)',
    bgHeader: 'rgba(26, 16, 37, 0.85)',
    bgMessageArea: 'rgba(139, 92, 246, 0.03)',
    bgHover: 'rgba(139, 92, 246, 0.12)',
    bgActive: 'rgba(139, 92, 246, 0.15)',

    // Chat Bubbles
    bubbleUserBg: 'rgba(139, 92, 246, 0.25)',
    bubbleUserBorder: 'rgba(139, 92, 246, 0.7)',
    bubbleUserShadow: '0 8px 32px rgba(139, 92, 246, 0.25)',
    bubbleAiBg: 'rgba(26, 16, 37, 0.3)',
    bubbleAiBorder: 'rgba(26, 16, 37, 0.7)',
    bubbleAiShadow: '0 8px 32px rgba(26, 16, 37, 0.25)',

    // Buttons
    buttonBg: 'rgba(139, 92, 246, 0.12)',
    buttonHover: 'rgba(139, 92, 246, 0.2)',
    buttonActive: 'rgba(139, 92, 246, 0.3)',
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
