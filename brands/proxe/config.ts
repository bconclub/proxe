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
    welcomeSequence: [
      { text: "Hi, I'm PROXe. Ask me anything, I'm the product.", delay: 0 },
      { text: 'Losing leads somewhere between inquiry and sale? That’s exactly what I fix.', delay: 900 },
    ],
  },
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
  quickButtons: ['What\'s PROXe', 'Deploy PROXe', 'PROXe Pricing', 'Book a Demo'],
  exploreButtons: ['Web PROXe', 'WhatsApp PROXe', 'Voice PROXe', 'Social PROXe'],
  followUpButtons: ['Schedule a Call', 'Book a Demo', 'Deploy PROXe', 'Get a Call Back', 'Talk to The Team'],
  firstMessageButtons: ['Learn More', 'Book a Demo'],
};

export const brandConfig = proxeConfig;
