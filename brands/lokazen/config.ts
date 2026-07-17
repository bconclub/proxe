import type { BrandConfig } from '@/configs/types';

export const lokazenConfig: BrandConfig = {
  name: 'Lokazen',
  brand: 'lokazen',
  tagline: 'Bangalore',
  website: 'https://lokazen.in',
  iconPath: '/lokazen-icon.jpg',
  markPath: '/lokazen-mark.svg', // transparent 3-orb mark for loading screens (iconPath jpg is a square box)
  widget: {
    headerName: 'Lokazen',
    welcomeSequence: [
      { text: "Hi, I'm Loka,", delay: 0 },
      { text: "Lokazen's commercial real estate assistant.", delay: 800 },
      { text: 'Looking for space, or have a property to list? Tell me what you need.', delay: 1600 },
    ],
  },
  // Sensible defaults for a fresh brand — flip on as Lokazen adopts each feature.
  features: {
    voice: false,
    brain: true, // Brain ships to every brand; content is generic until a brain{} block is added
    pipelineFunnel: true,
    followUpSequence: false,
    scouts: true, // Scout segment: /dashboard/scouts + scout widget mode + scout KB scope
    leadAccess: true, // Per-user ownership + Owner/Brand/Scout access + Humans overview (needs migration 005)
    campaigns: true, // AI campaign workspace
  },
  brain: {
    persona: ' — the intelligence behind Lokazen\'s commercial real-estate matching operation in Bangalore',
    vocabularyRule: 'Vocabulary: speak in the language of commercial real estate — brands, property owners, scouts, listings, areas, site visits, deals. No CRM jargon, no internal system terms.',
    quickQuestions: [
      'What needs my attention today?',
      'What came in today?',
      'Which area is getting the most listings?',
      'Anything at risk right now?',
    ],
    voiceId: '2zRM7PkgwBPiau2jvVXc',
    // Brings the Eval tab into Lokazen's Brain — the business lead-gen journey
    // bench (every message a lead can receive, by permutation). 'none' would hide
    // it; 'business' = the generic lead ladder (owners/brands), same bench BCON uses.
    evalJourneys: 'business',
  },
  apiUrl: '/api/agent/web/chat',
  systemPrompt: {
    path: '@/api/prompts/lokazen-prompt',
  },
  styles: {
    // TODO: dedicated themes/lokazen.css follow-up; using shared theme for now.
    themePath: '@/styles/theme.css',
    // No lokazen block in theme.css — widget derives its palette from colors below.
    colorVarsFromConfig: true,
  },
  chatStructure: {
    showQuickButtons: true,
    showFollowUpButtons: true,
    maxFollowUps: 3,
    avatar: {
      type: 'image',
      source: '/lokazen-icon.jpg',
    },
  },
  colors: {
    // Lokazen brand — hot orange primary, red secondary (pulled from globals.css --d2-brand / --d2-brand-2)
    primary: '#FF5200',              // Lokazen orange
    primaryLight: '#FFF3EE',          // orange tint (cards/highlights)
    primaryDark: '#0A0B0F',           // near-black dashboard page
    primaryVibrant: '#E4002B',        // brand red accent

    // Gradient
    gradientStart: '#0A0B0F',
    gradientMid: '#FF5200',
    gradientEnd: '#E4002B',

    // Backgrounds (dark dashboard tokens: --d2-bg-page / --d2-bg-card)
    darkBg: '#0A0B0F',
    darkCard: 'rgba(255, 82, 0, 0.10)',
    darkSurface: 'rgba(20, 22, 28, 0.6)',
    glassBg: 'rgba(255, 82, 0, 0.05)',
    glassBorder: 'rgba(248, 249, 250, 0.10)',
    glassShadow: 'rgba(255, 82, 0, 0.20)',

    // Text
    textPrimary: '#F8F9FA',
    textSecondary: 'rgba(248, 249, 250, 0.7)',
    textTertiary: 'rgba(248, 249, 250, 0.5)',
    textMuted: 'rgba(248, 249, 250, 0.4)',
    white: '#FFFFFF',
    textButton: '#FFFFFF',

    // Borders
    borderLight: 'rgba(248, 249, 250, 0.08)',
    borderMedium: 'rgba(248, 249, 250, 0.12)',
    borderAccent: 'rgba(255, 82, 0, 0.3)',
    borderGlow: 'rgba(255, 82, 0, 0.4)',
    borderColor: 'rgba(255, 82, 0, 0.2)',

    // Accents
    greenSuccess: '#10B981',
    orangeAccent: '#FF5200',
    goldAccent: '#FF5200',
    burgundyAccent: '#E4002B',

    // Background variants
    bgPrimary: 'rgba(20, 22, 28, 0.05)',
    bgHeader: 'rgba(10, 11, 15, 0.85)',
    bgMessageArea: 'rgba(255, 82, 0, 0.03)',
    bgHover: 'rgba(255, 82, 0, 0.12)',
    bgActive: 'rgba(255, 82, 0, 0.15)',

    // Chat bubbles
    bubbleUserBg: 'rgba(255, 82, 0, 0.22)',
    bubbleUserBorder: 'rgba(255, 82, 0, 0.7)',
    bubbleUserShadow: '0 8px 32px rgba(255, 82, 0, 0.25)',
    bubbleAiBg: 'rgba(20, 22, 28, 0.4)',
    bubbleAiBorder: 'rgba(20, 22, 28, 0.7)',
    bubbleAiShadow: '0 8px 32px rgba(10, 11, 15, 0.25)',

    // Buttons
    buttonBg: 'rgba(255, 82, 0, 0.12)',
    buttonHover: 'rgba(255, 82, 0, 0.2)',
    buttonActive: 'rgba(255, 82, 0, 0.3)',
  },
  // 3 buttons shown when chat opens — split across both audiences
  quickButtons: [
    'Find Commercial Space',
    'List My Property',
    'Talk to Lokazen team',
  ],
  // Shown when exploring — commercial property types
  exploreButtons: [
    'Retail',
    'Office',
    'Warehouse',
    'Restaurant Space',
  ],
  followUpButtons: ['Get Matched', 'Book a Site Visit', 'Talk to Lokazen team', 'Request a Callback'],
  firstMessageButtons: ['I need space', 'I have a property'],
  support: {
    whatsapp: '+916366826978',
    email: 'support@lokazen.in',
  },
};

export const brandConfig = lokazenConfig;
