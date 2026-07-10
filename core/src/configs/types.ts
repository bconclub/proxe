// Artifacts — brand-level surfaces built ON TOP of the PROXe engine (e.g. POP's
// War Room, leader app, D2D field tool). All artifacts share the same person
// variables in all_leads; each is a different lens/tool over that data. Brands
// that define `artifacts` get an artifact switcher dropdown on the sidebar
// brand header; brands without it keep the plain header.
export type ArtifactStatus = 'live' | 'wip' | 'coming_soon';
export type ArtifactFeatureStatus = 'live' | 'wip' | 'planned';
export interface ArtifactFeature {
  name: string;
  status: ArtifactFeatureStatus;
}
export interface ArtifactDef {
  id: string;
  name: string;
  description?: string;      // one-liner shown under the name in the switcher
  status: ArtifactStatus;    // live = clickable, wip = clickable if href, coming_soon = disabled
  href?: string;             // internal route ('/war-room') or full URL; omit = not navigable yet
  external?: boolean;        // true → open in new tab
  icon?: string;             // string key mapped to an icon inside the switcher component (config stays serializable)
  features?: ArtifactFeature[]; // full feature checklist — rendered on /dashboard/artifacts
}

// CORE COMMUNICATIONS — the checklist of every message the brand's agent must
// handle autonomously, surfaced on Brain → Eval → Communications. Each entry is
// hand-curated DISPLAY TRUTH (same philosophy as configs/journeys.ts): it
// mirrors send-truth in whatsappSender.ts + the intake routes, with `status`
// and `note` kept honest in the same commit as sender changes.
export interface CoreCommunication {
  id: string;                       // stable slug, e.g. 'fb_pilot_welcome'
  category: 'welcome' | 'inbound' | 'confirmation' | 'reminder' | 'followup';
  title: string;                    // 'FB Lead Ad welcome — pilot'
  trigger: string;                  // plain words: what makes this fire
  channel: 'whatsapp' | 'webchat';
  template?: string;                // Meta template name, when templated
  body?: string;                    // display mirror with {{vars}}; absent → no preview/send
  buttons?: string[];               // quick-reply chips (max 3 sent by the bench)
  status: 'live' | 'partial' | 'missing' | 'off';
  note?: string;                    // honesty line: why partial/missing, warnings
  sampleParams?: Record<string, string>; // per-entry overrides of the sample fill
}

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
    brainActions?: boolean;     // Brain drives the UI (open lead/page, dial) via the ACTIONS trailer
    pipelineFunnel?: boolean;   // Pipeline funnel widget
    followUpSequence?: boolean; // re-engagement follow-up cron (needs approved template)
    warRoom?: boolean;          // /war-room constituency view (needs vw_war_room_* views in the brand's Supabase)
    scouts?: boolean;           // Scout segment: /dashboard/scouts, scout widget mode, scout KB scope (lokazen)
  };
  // The Brain (voice orb + insights) — per-brand CONTENT for a shared
  // functionality. Every field is optional; core/src/lib/brain/brainConfig.ts
  // fills generic business defaults, so a brand can enable features.brain with
  // no block at all and still get a working, neutral Brain. POP moves its
  // campaign persona/vocabulary/languages/palette here instead of hardcoding.
  brain?: {
    persona?: string;            // appended to "You are the living Brain of <name>" (e.g. ' — the intelligence behind a political campaign operation in Punjab')
    vocabularyRule?: string;     // full "Vocabulary:" prompt paragraph
    quickQuestions?: string[];   // the ?-button fan-out
    thinkingSteps?: { briefing: string[]; question: string[] }; // orb captions while gathering
    languages?: Array<{ id: string; label: string; promptRule: string }>; // speaking languages (first = default)
    voiceId?: string;            // ElevenLabs voice (env ELEVENLABS_VOICE_ID still wins)
    orbPalette?: {
      chromeRgb: [number, number, number];              // rings/glow/links
      sweepRgb?: [number, number, number];              // radar sweep arm
      particleHues?: Array<{ hue: number; spread: number; weight: number }>; // weighted hue mix
    };
    summaryPrompt?: string;      // person-summary system prompt (summarizer.ts)
    reflectionPersona?: string;  // learning-summary persona (replaces "sales agent")
    evalJourneys?: 'pop' | 'business' | 'none'; // Eval tab content ('none' hides the journeys bench)
    communications?: CoreCommunication[];       // CORE COMMUNICATIONS checklist (Eval → Communications sub)
    voiceAgent?: {
      testDefaults?: { name?: string; business?: string; industry?: string; phone?: string };
      voiceNumber?: string;      // display number on the voice tab
      engines?: Array<'vapi' | 'elevenlabs' | 'sarvam'>; // show engine picker when >1
      languages?: Array<'pa' | 'hi' | 'en'>;             // show starting-language picker when >1
      showBusinessFields?: boolean;
      promptsEditor?: boolean;   // show the per-language voice-prompts editor
    };
  };
  // Dashboard vocabulary overrides. The dashboard shell was written in
  // business-CRM English (Leads, High Intent, Booked Calls, Priority Lead
  // Queue…) — a brand whose audience isn't "sales leads" (e.g. pop = voters/
  // citizens) remaps just the words here. Key = the default English string
  // (or a dotted key where noted at the call site), value = the brand's term.
  // Missing keys fall back to the default, so other brands are untouched.
  labels?: Record<string, string>;
  // Artifact surfaces built on the engine (see ArtifactDef above). Presence of
  // this array turns the sidebar brand header into an artifact switcher.
  artifacts?: ArtifactDef[];
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
