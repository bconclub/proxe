export interface BrandConfig {
  name: string;
  brand: string;
  // Per-brand feature toggles. Code for these features ships to ALL brands
  // (promoted via master), but each brand switches them on/off here — e.g.
  // Windchasers carries the Voice/Calls code but keeps voice:false until they
  // want outbound calling, BCON runs voice:true.
  features?: {
    voice?: boolean;            // Vapi outbound calls + /dashboard/calls
    brain?: boolean;            // Dashboard Brain insights
    pipelineFunnel?: boolean;   // Pipeline funnel widget
    followUpSequence?: boolean; // re-engagement follow-up cron (needs approved template)
  };
  apiUrl?: string;
  supabase?: {
    url?: string;
    anonKey?: string;
  };
  // System prompt configuration
  systemPrompt?: {
    path?: string; // Path to system prompt file (e.g., '@/api/prompts/proxe-prompt')
    getPrompt?: (context: string, state?: string) => string; // Function to generate prompt
  };
  // CSS/styling configuration
  styles?: {
    themePath?: string; // Path to theme CSS file (e.g., '@/styles/themes/proxe.css')
    customStyles?: string; // Inline custom styles if needed
  };
  // Chat structure customization
  chatStructure?: {
    showQuickButtons?: boolean;
    showFollowUpButtons?: boolean;
    maxFollowUps?: number;
    avatar?: {
      type: 'logo' | 'icon' | 'image';
      source?: string; // Path to SVG or image
    };
  };
  colors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    primaryVibrant: string;
    gradientStart: string;
    gradientMid: string;
    gradientEnd: string;
    darkBg: string;
    darkCard: string;
    darkSurface: string;
    glassBg: string;
    glassBorder: string;
    glassShadow: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textMuted: string;
    white: string;
    textButton?: string;
    borderLight: string;
    borderMedium: string;
    borderAccent: string;
    borderGlow: string;
    borderColor: string;
    greenSuccess: string;
    tealAccent?: string;
    cyanAccent?: string;
    pinkAccent?: string;
    goldAccent?: string;
    orangeAccent?: string;
    burgundyAccent?: string;
    bgPrimary: string;
    bgHeader: string;
    bgMessageArea: string;
    bgHover: string;
    bgActive: string;
    bubbleUserBg: string;
    bubbleUserBorder: string;
    bubbleUserShadow: string;
    bubbleAiBg: string;
    bubbleAiBorder: string;
    bubbleAiShadow: string;
    buttonBg: string;
    buttonHover: string;
    buttonActive: string;
  };
  quickButtons: string[];
  exploreButtons?: string[];
  followUpButtons: string[]; // Default follow-up buttons
  firstMessageButtons?: string[]; // Buttons specifically for first message
}
