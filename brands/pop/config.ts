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
      { text: 'Raise a grievance, get campaign updates, or volunteer - how can I help?', delay: 800 },
    ],
  },
  // Pulse of Punjab (POP) runs the full grievance-driven campaign stack:
  // grievance intake on every channel, WhatsApp/SMS/voice follow-up, pipeline,
  // and the re-engagement sequence. Senders are guardrailed to mock in this
  // pitch build (see lib/services/sendGuardrail.ts) so nothing fires for real
  // until live numbers are wired.
  features: {
    voice: true,
    brain: true, // enabled for POP - the Calls tab is the voice A/B latency bench
    pipelineFunnel: true,
    followUpSequence: true,
    warRoom: true,
  },
  // POP artifacts - the surfaces built on top of the engine. Clicking the
  // sidebar brand header opens the artifact switcher listing these. All of
  // them read/write the SAME person variables in all_leads (phone = merge
  // key); see brands/pop/docs/artifacts.md for the full architecture.
  artifacts: [
    {
      id: 'overview',
      name: 'Overview',
      description: 'Campaign command dashboard - the engine home',
      status: 'live',
      href: '/dashboard',
      icon: 'grid',
    },
    {
      id: 'war-room',
      name: 'War Room',
      description: 'The command center - voices, seats, intensity, grievance loop',
      status: 'live',
      href: '/war-room',
      icon: 'map',
      features: [
        { name: 'Live state dashboard', status: 'live' },
        { name: 'Constituency dashboards', status: 'live' },
        { name: 'Heat maps (117 seats)', status: 'live' },
        { name: 'Lead funnel - intensity ladder', status: 'live' },
        { name: 'Volunteer monitoring', status: 'live' },
        { name: 'Daily targets', status: 'live' },
        { name: 'Event monitoring', status: 'live' },
        { name: 'AI summaries', status: 'live' },
        { name: 'Media monitoring (Listen digest)', status: 'wip' },
        { name: 'Candidate dashboards', status: 'planned' },
        { name: 'Predictive analytics', status: 'planned' },
      ],
    },
    {
      id: 'd2d',
      name: 'D2D',
      description: 'Volunteer cadre activation - backend + monitoring on PROXe',
      status: 'wip',
      href: '/dashboard/d2d',
      icon: 'door',
      features: [
        { name: 'Lead generation (person merge on knock)', status: 'live' },
        { name: 'Issue reporting (doorstep grievances)', status: 'live' },
        { name: 'Household surveys (per-knock payload)', status: 'live' },
        { name: 'QR verification (badge codes)', status: 'live' },
        { name: 'Booth assignment (cadre registry)', status: 'live' },
        { name: 'Geo-tagging', status: 'live' },
        { name: 'Follow-up reminders (revisit tasks)', status: 'live' },
        { name: 'Volunteer field app (separate build)', status: 'planned' },
      ],
    },
    {
      id: 'listen',
      name: 'Listener',
      description: 'Listen first, engage better - sentiment capture (internal)',
      status: 'wip',
      href: '/dashboard/listen',
      icon: 'radar',
      features: [
        { name: 'Signal intake API (all 10 sources)', status: 'live' },
        { name: 'Trending issues', status: 'live' },
        { name: 'Crisis alerts', status: 'live' },
        { name: 'Constituency mood (signals)', status: 'live' },
        { name: 'Opposition messaging tracking', status: 'live' },
        { name: 'Positive stories tracking', status: 'live' },
        { name: 'WhatsApp trends bridge', status: 'wip' },
        { name: 'Emerging narratives', status: 'wip' },
        { name: 'Social scrapers (X/FB/IG/YT/news)', status: 'planned' },
        { name: 'Viral content detection', status: 'planned' },
        { name: 'Communication recommendations', status: 'planned' },
      ],
    },
    {
      id: 'pulse-app',
      name: 'Pulse of Punjab',
      description: 'Leadership intelligence - the leader-facing app',
      status: 'wip',
      href: 'https://pulse-punjab.vercel.app',
      external: true,
      icon: 'pulse',
      features: [
        { name: 'Emerging issues (API)', status: 'live' },
        { name: 'Constituency mood (API)', status: 'live' },
        { name: 'MLA performance - derived from our data (API)', status: 'live' },
        { name: 'Volunteer energy (API)', status: 'live' },
        { name: 'Push recommendations to War Room team', status: 'live' },
        { name: 'Issue heat maps (app render)', status: 'wip' },
        { name: 'AI recommendations', status: 'planned' },
      ],
    },
  ],
  // The Brain's campaign CONTENT — persona, vocabulary, questions, languages,
  // voice, palette. The Brain FUNCTIONALITY ships to every brand; this block is
  // what makes POP's brain talk like a campaign (moved from core hardcodes).
  brain: {
    persona: ' — the intelligence behind a political campaign operation in Punjab',
    vocabularyRule: `Vocabulary: this is a CAMPAIGN, not a sales pipeline. NEVER say "lead", "leads", "pipeline", "hot/warm/cold", "bookings" or CRM words. Say: people, voices, citizens, constituencies, grievances, intent, momentum. Talk about WHERE things are happening — which constituencies people are speaking up from, what issues they're raising, whether they're leaning toward us, who's ready to volunteer or vote. "leader_pushes" in the data are directives the leader pushed to the war-room team plus PROXe's own suggestions, with their status. "news_buzz" is what's moving in news and social media in the last 24 hours — topics, negativity, crisis and opposition signals; use it when talking about what's buzzing or what people are seeing.`,
    quickQuestions: [
      'How are the constituencies doing?',
      'What are the latest leader actions?',
      'What news is buzzing right now?',
      'What needs my attention today?',
    ],
    thinkingSteps: {
      briefing: [
        'reading today…', 'checking the war room…', 'checking recent pushes from leaders…',
        'reading new voices by constituency…', 'checking what people are responding to…', 'putting it into words…',
      ],
      question: ['listening…', 'checking the war room…', 'reading the latest signals…', 'putting it into words…'],
    },
    languages: [
      { id: 'en', label: 'EN', promptRule: 'Speak in natural conversational English.' },
      { id: 'pa', label: 'ਪੰਜਾਬੀ', promptRule: 'Speak ENTIRELY in natural conversational Punjabi (Gurmukhi script). Spell numbers out in Punjabi words.' },
      { id: 'hi', label: 'हिंदी', promptRule: 'Speak ENTIRELY in natural conversational Hindi (Devanagari script). Spell numbers out in Hindi words.' },
    ],
    voiceId: '2zRM7PkgwBPiau2jvVXc', // Monika Sogam
    orbPalette: {
      // Campaign tricolor — blue-led (deep campaign blue), green + a touch of
      // saffron. Deliberately NOT saffron-led; orange alone is the opposition.
      chromeRgb: [37, 89, 196],
      sweepRgb: [34, 160, 92],
      particleHues: [
        { hue: 215, spread: 10, weight: 60 }, // campaign blue
        { hue: 145, spread: 8, weight: 25 },  // green
        { hue: 25, spread: 6, weight: 15 },   // saffron flecks
      ],
    },
    summaryPrompt: `You are summarizing a citizen conversation for the Pulse of Punjab campaign team. Write 2-3 SHORT plain sentences:
1. Who they are and how they reached us (web / WhatsApp / call), and their constituency or place if mentioned.
2. What they raised — grievance, question, support, volunteering — with the specific issue in their own words.
3. Where it stands and the next step for the team, if any.

Rules: plain prose only — NO markdown, NO asterisks, NO headings, NO meta-commentary. NEVER say there is nothing to summarize; summarize whatever happened, even a single click ("Raised a grievance about X via the web portal"). Never use sales words (lead, pipeline, booking, qualification).`,
    reflectionPersona: 'the Pulse of Punjab campaign brain',
    evalJourneys: 'pop',
    voiceAgent: {
      engines: ['vapi', 'elevenlabs', 'sarvam'],
      languages: ['pa', 'hi', 'en'],
      promptsEditor: true,
    },
  },
  // Voter-native dashboard vocabulary. POP's audience is citizens/voters, not
  // sales leads - the dashboard shell's business-CRM words are remapped here
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
    'Push to book a call': 'Call back - hear them out',
    'Share pricing + offers': 'Send grievance status update',
    'Share program details': 'Share campaign update',
    'Onboard / next steps': 'Invite to volunteer',
    // Misc shell
    'Founder': 'Team',
    'Customer Journey': 'Voter Journey',
    // Stage names (display-only - the stored lead_stage values are unchanged)
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
    // No pop block in theme.css - widget derives its palette from colors below.
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
