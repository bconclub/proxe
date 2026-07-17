import type { BrandConfig } from '@/configs/types';

export const bconConfig: BrandConfig = {
  name: 'BCON',
  brand: 'bcon',
  tagline: 'BCON',
  website: 'https://bconclub.com',
  iconPath: '/bcon-icon.png',
  widget: {
    headerName: 'BCON AI',
    welcomeSequence: [
      { text: "HI i am PROXe, BCON's AI Marketing Strategist\n\nHow can I help with your marketing today?", delay: 0 },
    ],
  },
  // BCON runs the Vapi voice/calls stack and the dashboard extras.
  features: {
    voice: true,
    brain: true,
    pipelineFunnel: true,
    followUpSequence: false, // gated until the re-engagement template is approved
    campaigns: true, // AI campaign workspace
  },
  // The Brain's sales CONTENT for BCON — the persona/prompts the Brain uses on
  // this brand (functionality is shared across brands; content lives here).
  brain: {
    persona: " — the intelligence behind BCON's marketing and AI growth operation",
    summaryPrompt: `You are summarizing a sales conversation for the BCON team. Generate a brief but complete summary that includes:
1. BUSINESS: What does this lead's business do? (from what THEY said, not form data)
2. PROBLEM: What challenges or needs did they mention?
3. DISCUSSION: What solutions or services were discussed?
4. BOOKING: Was a call booked? What date/time? Did booking succeed or fail?
5. STATUS: Are they engaged, cold, frustrated, or lost?
6. RED FLAGS: Did they ask for a human? Get upset? Hit any errors?
7. NEXT STEP: What should the team do next?

FORM FIELD INTERPRETATION - get these right:
- VOLUME means how many leads they WANT to handle, NOT how many they currently get. "Upto 100" = wants to scale to 100 leads.
- URGENCY means how ready they are to start, NOT how urgent their problem is.
- "No, I am setting up" for AI SYSTEMS = they have no AI yet, they are exploring.
- WEBSITE "Yes, I have" = they have a website. "No" = they don't.
Do NOT misrepresent these fields. "Upto 100 leads" does NOT mean "handles 100 leads."

Keep it to 3-5 sentences max. Be specific - use actual details from the conversation, not generic phrases like "high intent" or "shows interest".

BAD: "Lead shows high intent with 50% response rate. Re-engage with follow-up."
GOOD: "Wasi runs Design Lyf Realty & Interiors in Bangalore - interior design focus. Getting Meta ad leads but quality is poor. Tried to book Monday 3pm but booking tool looped. Got frustrated and asked for a human. Needs manual outreach to recover - call him directly."`,
    reflectionPersona: 'the BCON sales agent',
    evalJourneys: 'business',
    voiceAgent: {
      testDefaults: { name: 'Thanzeel', business: 'BCON Club', industry: 'Marketing and AI', phone: '9731660933' },
      voiceNumber: '+918046733388',
      showBusinessFields: true,
    },
  },
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
    // Primary Colors - Dark/Electric Purple Palette
    primary: '#8B5CF6',              // Electric purple
    primaryLight: '#E0D4FC',          // Light lavender
    primaryDark: '#0A0A0B',           // Near black
    primaryVibrant: '#A78BFA',        // Vibrant purple

    // Gradient
    gradientStart: '#0A0A0B',
    gradientMid: '#8B5CF6',
    gradientEnd: '#A78BFA',

    // Backgrounds
    darkBg: '#0A0A0B',
    darkCard: 'rgba(139, 92, 246, 0.3)',
    darkSurface: 'rgba(10, 10, 11, 0.4)',
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
    bgPrimary: 'rgba(10, 10, 11, 0.05)',
    bgHeader: 'rgba(10, 10, 11, 0.85)',
    bgMessageArea: 'rgba(139, 92, 246, 0.03)',
    bgHover: 'rgba(139, 92, 246, 0.12)',
    bgActive: 'rgba(139, 92, 246, 0.15)',

    // Chat Bubbles
    bubbleUserBg: 'rgba(139, 92, 246, 0.25)',
    bubbleUserBorder: 'rgba(139, 92, 246, 0.7)',
    bubbleUserShadow: '0 8px 32px rgba(139, 92, 246, 0.25)',
    bubbleAiBg: 'rgba(10, 10, 11, 0.3)',
    bubbleAiBorder: 'rgba(10, 10, 11, 0.7)',
    bubbleAiShadow: '0 8px 32px rgba(10, 10, 11, 0.25)',

    // Buttons
    buttonBg: 'rgba(139, 92, 246, 0.25)',
    buttonHover: 'rgba(139, 92, 246, 0.35)',
    buttonActive: 'rgba(139, 92, 246, 0.45)',
  },
  // Quick Actions: shown on first chat load
  quickButtons: [
    'Explore AI Marketing Solutions',
    'Book AI Brand Audit',
    'AI Lead Machine',
    'See Work Portfolio',
  ],
  exploreButtons: [
    'Customer Acquisition',
    'Brand Management',
    'Content and Ads',
    'Book a Strategy Call'
  ],
  // Follow-up Buttons: Dynamic, generated by Claude
  followUpButtons: [],
  // First Message Buttons: Dynamic, generated by Claude
  firstMessageButtons: [],
  // Welcome video embed (disabled temporarily)
  showWelcomeVideo: false,
  welcomeVideoUrl: 'https://player.vimeo.com/video/1182869056',
  welcomeVideoTitle: 'PROXe Beta Live',
};

export const brandConfig = bconConfig;
