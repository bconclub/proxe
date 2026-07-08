export interface BrandConfig {
  name: string;
  brand: string;
  tagline?: string;          // login/invite subtitle (e.g. 'WindChasers Aviation Academy')
  website?: string;          // public site linked from auth pages
  themeDataAttr?: string;    // <html data-theme> value (defaults to `brand`)
  iconPath?: string;         // favicon/app icon path in the brand's public/ (defaults to /logo.png)
  markPath?: string;         // transparent logo mark for loading screens (defaults to iconPath); use a PNG/SVG with no background box
  // Widget chrome + copy. Everything here used to be hardcoded windchasers
  // strings in ChatWidget — brand identity lives in the pack, not in core.
  widget?: {
    headerName?: string;                              // chat header title (defaults to `name`)
    welcomeSequence?: { text: string; delay: number }[]; // opening AI bubbles
    leadContextWelcome?: string;                      // welcome when a pre-loaded lead context exists
    assessmentUrl?: string;                           // external assessment flow (windchasers)
  };
  // Per-brand feature toggles. Code for these features ships to ALL brands
  // (promoted via master), but each brand switches them on/off here — e.g.
  // Windchasers carries the Voice/Calls code but keeps voice:false until they
  // want outbound calling, BCON runs voice:true.
  features?: {
    voice?: boolean;            // Vapi outbound calls + /dashboard/calls
    brain?: boolean;            // Dashboard Brain insights
    pipelineFunnel?: boolean;   // Pipeline funnel widget
    followUpSequence?: boolean; // re-engagement follow-up cron (needs approved template)
    warRoom?: boolean;          // /war-room constituency view (needs vw_war_room_* views in the brand's Supabase)
    scouts?: boolean;           // Scout segment: /dashboard/scouts, scout widget mode, scout KB scope (lokazen)
  };
  // Dashboard vocabulary overrides. The dashboard shell was written in
  // business-CRM English (Leads, High Intent, Booked Calls, Priority Lead
  // Queue…) — a brand whose audience isn't "sales leads" (e.g. pop = voters/
  // citizens) remaps just the words here. Key = the default English string
  // (or a dotted key where noted at the call site), value = the brand's term.
  // Missing keys fall back to the default, so other brands are untouched.
  labels?: Record<string, string>;
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
    // Widget pages derive their CSS variables from config.colors instead of
    // theme.css. For brands without a hand-tuned theme.css block — otherwise
    // they render in another brand's defaults (bw-dark white / PROXe purple).
    colorVarsFromConfig?: boolean;
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
  showWelcomeVideo?: boolean;
  quickButtons: string[];
  exploreButtons?: string[];
  followUpButtons: string[]; // Default follow-up buttons
  firstMessageButtons?: string[]; // Buttons specifically for first message
}
