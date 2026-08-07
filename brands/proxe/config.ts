// proxe used to re-declare a STALE inline copy of BrandConfig here — it
// drifted behind the canonical type (missing iconPath/labels/brain/…). Import
// the real one so this brand keeps type-checking as the schema grows.
import type { BrandConfig } from '@/configs/types';

export const proxeConfig: BrandConfig = {
  name: 'PROXe',
  brand: 'proxe',
  tagline: 'Never Miss a Lead Ever Again',
  website: 'https://goproxe.com',
  // <html data-theme> — matches the [data-theme="proxe-purple"] block in
  // core/src/styles/theme.css (without this the theme block is orphaned and
  // the app falls back to data-theme="proxe", which nothing styles).
  themeDataAttr: 'proxe-purple',
  iconPath: '/proxe-icon.png',
  widget: {
    headerName: 'PROXe',
    // Split across three bubbles the way Windchasers' Avia opens: identity,
    // then what it does, then the question. One long paragraph reads like a
    // brochure; three short bubbles read like someone typing to you.
    welcomeSequence: [
      { text: 'Hi, I am PROXe, your customer-facing AI.', delay: 0 },
      { text: 'I take care of your leads and conversations across all channels.', delay: 800 },
      { text: 'What would you like to do today?', delay: 1600 },
    ],
  },
  // This deployment shares Beacon's Supabase, so it must say which rows are
  // its own - without this it would list BCON's service leads too. One entry
  // means no tabs render; it is purely a scope.
  leadBrands: [
    { id: 'proxe', label: 'PROXe', icon: '/proxe-icon.png', color: '#7c3aed' },
    { id: 'bcon', label: 'BCON', icon: '/bcon-icon.png', color: '#22c55e' },
  ],
  // Mirror of BCON's switcher so the jump works both ways.
  artifacts: [
    {
      id: 'proxe-os',
      name: 'PROXe',
      description: 'Product leads from goproxe.com, checkout and billing',
      status: 'live',
      href: '/dashboard',
      icon: 'pulse',
    },
    {
      id: 'bcon-os',
      name: 'BCON',
      description: 'Service leads, campaigns and the marketing agent',
      status: 'live',
      href: 'https://proxe.bconclub.com/dashboard',
      external: true,
      icon: 'grid',
    },
  ],
  features: {
    voice: false,
    brain: true, // Brain ships to every brand; content is generic until a brain{} block is added
    pipelineFunnel: true, // dashboard pipeline view — ad leads land here
    followUpSequence: false, // on once PROXe follow-up templates are authored
    campaigns: true, // AI campaign workspace
    logCallChat: true, // chat with PROXe after logging a call
  },
  styles: {
    // Bridge config.colors into CSS vars so the widget carries the PROXe
    // palette without a per-brand stylesheet.
    colorVarsFromConfig: true,
  },
  chatStructure: {
    showQuickButtons: true,
    showFollowUpButtons: true,
    maxFollowUps: 3,
    avatar: {
      type: 'logo',
      // DashboardLayout reads the sidebar mark from chatStructure.avatar.source
      // and deliberately never falls back to another brand's asset — without
      // this the header rendered the name with no icon at all.
      source: '/proxe-icon.png',
    },
  },
  colors: {
    primary: '#5B1A8C', // Main purple theme
    primaryLight: '#FDFEFD',
    primaryDark: '#2B4A7D', // Darker blue-purple
    primaryVibrant: '#A03BA8', // Lighter purple accent
    gradientStart: '#2B4A7D',
    gradientMid: '#5B1A8C',
    gradientEnd: '#A03BA8',
    darkBg: '#0A0A0A',
    darkCard: 'rgba(91, 26, 140, 0.3)',
    darkSurface: 'rgba(43, 74, 125, 0.4)',
    glassBg: 'rgba(91, 26, 140, 0.05)',
    glassBorder: 'rgba(253, 254, 253, 0.1)',
    glassShadow: 'rgba(91, 26, 140, 0.2)',
    textPrimary: '#FDFEFD',
    textSecondary: 'rgba(253, 254, 253, 0.7)',
    textTertiary: 'rgba(253, 254, 253, 0.5)',
    textMuted: 'rgba(253, 254, 253, 0.4)',
    white: '#FDFEFD',
    borderLight: 'rgba(253, 254, 253, 0.08)',
    borderMedium: 'rgba(253, 254, 253, 0.12)',
    borderAccent: 'rgba(91, 26, 140, 0.3)',
    borderGlow: 'rgba(91, 26, 140, 0.4)',
    borderColor: 'rgba(91, 26, 140, 0.2)',
    greenSuccess: '#10B981',
    cyanAccent: '#6EA5D4', // Light blue accent
    orangeAccent: '#A03BA8', // Purple accent
    goldAccent: '#A03BA8', // Purple accent
    bgPrimary: 'rgba(43, 74, 125, 0.05)',
    bgHeader: 'rgba(43, 74, 125, 0.85)',
    bgMessageArea: 'rgba(91, 26, 140, 0.03)',
    bgHover: 'rgba(91, 26, 140, 0.12)',
    bgActive: 'rgba(91, 26, 140, 0.15)',
    bubbleUserBg: 'rgba(91, 26, 140, 0.25)',
    bubbleUserBorder: 'rgba(91, 26, 140, 0.7)',
    bubbleUserShadow: '0 8px 32px rgba(91, 26, 140, 0.25)',
    bubbleAiBg: 'rgba(43, 74, 125, 0.3)',
    bubbleAiBorder: 'rgba(43, 74, 125, 0.7)',
    bubbleAiShadow: '0 8px 32px rgba(43, 74, 125, 0.25)',
    buttonBg: 'rgba(91, 26, 140, 0.12)',
    buttonHover: 'rgba(91, 26, 140, 0.2)',
    buttonActive: 'rgba(91, 26, 140, 0.3)',
  },
  // Three, not four: the welcome now ends on "What would you like to do today?"
  // and three options read as a clear choice where four start to read as a menu.
  // These are the three real answers to that question - understand it, price it,
  // or talk to someone.
  quickButtons: ['What\'s PROXe', 'PROXe Pricing', 'Book a Demo'],
  exploreButtons: ['Web PROXe', 'WhatsApp PROXe', 'Voice PROXe', 'Social PROXe'],
  followUpButtons: ['Schedule a Call', 'Book a Demo', 'Deploy PROXe', 'Get a Call Back', 'Talk to The Team'],
  firstMessageButtons: ['Learn More', 'Book a Demo'],
};

export const brandConfig = proxeConfig;
