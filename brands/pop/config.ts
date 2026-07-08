import type { BrandConfig } from '@/configs/types';

export const popConfig: BrandConfig = {
  name: 'Pulse of Punjab',
  brand: 'pop',
  tagline: 'Pulse of Punjab',
  website: 'https://goproxe.com',
  iconPath: '/pop-icon.png',
  widget: {
    headerName: 'Pulse of Punjab',
    welcomeSequence: [
      { text: "Hi, I am PROXe, Pulse of Punjab's AI assistant.", delay: 0 },
      { text: 'Raise a grievance, get campaign updates, or volunteer — how can I help?', delay: 800 },
    ],
  },
  // Pulse of Punjab (POP) runs the full grievance-driven campaign stack:
  // grievance intake on every channel, WhatsApp/SMS/voice follow-up, pipeline,
  // and the re-engagement sequence. Senders are guardrailed to mock in this
  // pitch build (see lib/services/sendGuardrail.ts) so nothing fires for real
  // until live numbers are wired.
  features: {
    voice: true,
    brain: true, // enabled for POP — the Calls tab is the voice A/B latency bench
    pipelineFunnel: true,
    followUpSequence: true,
    warRoom: true,
  },
  // Voter-native dashboard vocabulary. POP's audience is citizens/voters, not
  // sales leads — the dashboard shell's business-CRM words are remapped here
  // (key = default English string used in core components, via brandLabel()).
  labels: {
    // Overview KPIs
    'High Intent Leads': 'Strong Supporters',
    'flagged high-intent by PROXe': 'flagged strong support by PROXe',
    'Booked Calls / Events': 'Grievances Logged',
    'Follow-up Health': 'Loop Health',
    // Engine funnel
    'Engine Overview': 'Outreach Engine',
    'Total Leads': 'People Reached',
    'Engaged': 'Responded',
    'Warm': 'Supportive',
    'Booked': 'Grievance Logged',
    'Your follow-up engine is performing well': 'Your grievance loop is performing well',
    // Priority queue
    'Priority Lead Queue': 'Priority Follow-ups',
    'Leads that need your attention now': 'People who need your attention now',
    'Lead': 'Person',
    'High Intent': 'High Salience',
    'Comparing': 'Undecided',
    'Push to book a call': 'Call back — hear them out',
    'Share pricing + offers': 'Send grievance status update',
    'Share program details': 'Share campaign update',
    'Onboard / next steps': 'Invite to volunteer',
    // Misc shell
    'Founder': 'Team',
    'Customer Journey': 'Voter Journey',
    // Stage names (display-only — the stored lead_stage values are unchanged)
    'Qualified': 'Supporter',
    'Booking Made': 'Call Scheduled',
    'Converted': 'Volunteer',
    'Closed Lost': 'Opposed',
    'Not Qualified': 'Not Reachable',
    'Cold': 'Inactive',
  },
  apiUrl: '/api/agent/web/chat',
  systemPrompt: {
    path: '@/api/prompts/pop-prompt',
  },
  styles: {
    themePath: '@/styles/theme.css',
    // No pop block in theme.css — widget derives its palette from colors below.
    colorVarsFromConfig: true,
  },
  chatStructure: {
    showQuickButtons: true,
    showFollowUpButtons: true,
    maxFollowUps: 3,
    avatar: {
      type: 'image',
      source: '/pop-icon.png',
    },
  },
  colors: {
    // Punjab campaign palette - deep blue + saffron + green (India tricolor "lehar")
    primary: '#003C90',              // Deep campaign blue
    primaryLight: '#EAF1FB',          // Light wash
    primaryDark: '#06182E',           // Near-navy black
    primaryVibrant: '#F06C18',         // Saffron accent

    // Gradient (saffron -> blue lehar)
    gradientStart: '#06182E',
    gradientMid: '#003C90',
    gradientEnd: '#F06C18',

    // Backgrounds
    darkBg: '#06182E',
    darkCard: 'rgba(0, 60, 144, 0.30)',
    darkSurface: 'rgba(6, 24, 46, 0.40)',
    glassBg: 'rgba(0, 60, 144, 0.06)',
    glassBorder: 'rgba(234, 241, 251, 0.10)',
    glassShadow: 'rgba(0, 60, 144, 0.25)',

    // Text Colors
    textPrimary: '#EAF1FB',
    textSecondary: 'rgba(234, 241, 251, 0.72)',
    textTertiary: 'rgba(234, 241, 251, 0.52)',
    textMuted: 'rgba(234, 241, 251, 0.40)',
    white: '#FFFFFF',

    // Borders
    borderLight: 'rgba(234, 241, 251, 0.08)',
    borderMedium: 'rgba(234, 241, 251, 0.12)',
    borderAccent: 'rgba(240, 108, 24, 0.35)',
    borderGlow: 'rgba(240, 108, 24, 0.45)',
    borderColor: 'rgba(0, 60, 144, 0.25)',

    // Accents
    greenSuccess: '#4EB457',          // Tricolor green
    cyanAccent: '#6EA5D4',
    orangeAccent: '#F06C18',           // Saffron
    goldAccent: '#F06C18',

    // Background Variants
    bgPrimary: 'rgba(6, 24, 46, 0.05)',
    bgHeader: 'rgba(6, 24, 46, 0.85)',
    bgMessageArea: 'rgba(0, 60, 144, 0.03)',
    bgHover: 'rgba(0, 60, 144, 0.14)',
    bgActive: 'rgba(240, 108, 24, 0.16)',

    // Chat Bubbles
    bubbleUserBg: 'rgba(0, 60, 144, 0.28)',
    bubbleUserBorder: 'rgba(0, 60, 144, 0.72)',
    bubbleUserShadow: '0 8px 32px rgba(0, 60, 144, 0.25)',
    bubbleAiBg: 'rgba(6, 24, 46, 0.32)',
    bubbleAiBorder: 'rgba(6, 24, 46, 0.70)',
    bubbleAiShadow: '0 8px 32px rgba(6, 24, 46, 0.25)',

    // Buttons
    buttonBg: 'rgba(240, 108, 24, 0.20)',
    buttonHover: 'rgba(240, 108, 24, 0.32)',
    buttonActive: 'rgba(240, 108, 24, 0.44)',
  },
  // Quick Actions: shown on first chat load (grievance-first campaign)
  quickButtons: [
    'Raise a Grievance',
    'See Top Grievances',
    'Get Campaign Updates',
    'Volunteer',
  ],
  // Grievance categories surfaced on "explore"
  exploreButtons: [
    'Water and Power',
    'Roads and Transport',
    'Jobs and MSP',
    'Health and Education',
  ],
  // Follow-up Buttons: Dynamic, generated by Claude
  followUpButtons: [],
  // First Message Buttons: Dynamic, generated by Claude
  firstMessageButtons: [],
  showWelcomeVideo: false,
};

export const brandConfig = popConfig;
