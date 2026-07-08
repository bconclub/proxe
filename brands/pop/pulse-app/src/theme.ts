/**
 * Pulse of Punjab - design system.
 * Premium dark "election-night" theme: deep slate canvas, saffron/azure accents.
 * Tokens are consumed across every component so the look stays consistent.
 */

// Palette extracted from the official "Punjab Yatra 2026 · ਪੰਜਾਬੀਅਤ ਦੀ ਲਹਿਰ"
// design deck: deep royal blue #003C90 surfaces, white type, saffron-orange
// #F06C18 accent (the "lehar"/wave), bright blue #006CD8 highlight.
export const colors = {
  bg: '#003C90', // Punjab Yatra brand blue - primary surface
  bgElev: '#002C6E', // deeper blue - rails, tab bar, headers
  surface: '#0A47A0', // card on blue
  surface2: '#12539E',
  surface3: '#1C61BC',
  border: 'rgba(255,255,255,0.16)',
  border2: 'rgba(255,255,255,0.30)',

  text: '#FFFFFF',
  textDim: '#CFE0F8',
  faint: '#93B0DE',

  accent: '#F06C18', // saffron-orange - primary accent (the "lehar")
  accentDim: 'rgba(240,108,24,0.20)',
  azure: '#2E8DE6', // bright blue highlight (#006CD8 family)
  azureDim: 'rgba(46,141,230,0.20)',
  green: '#2FD08A',
  greenDim: 'rgba(47,208,138,0.18)',
  red: '#F2545B',

  mapBg: '#00214B', // deep brand navy - keeps the choropleth legible
  white: '#FFFFFF',
};

// The Indian tricolor - the "lehar"/wave motif from the deck (page 1 background +
// bus wraps). Used as the signature accent (header wave, section flags).
export const india = {
  saffron: '#FC7404',
  white: '#FFFFFF',
  green: '#4EB457',
  greenDeep: '#1F8A3B',
  blue: '#003C90',
};

/** Tricolor gradient stops (saffron → white → green) for the lehar accent. */
export const TRICOLOR = ['#FC7404', '#FFFFFF', '#4EB457'];

/** Party colors brightened for legibility on the dark map. */
export const party: Record<string, string> = {
  AAP: '#2A93D6',
  INC: '#79C7EE',
  SAD: '#6E8BCB',
  BJP: '#F5A623',
  BSP: '#8685EC',
  IND: '#9AA7BD',
};

/** Phase (priority) colors - P1 frontline, P2 mobilization, P3 conversion.
 *  P2 tied to the brand saffron-orange. */
export const phase: Record<string, string> = {
  P1: '#2E8DE6',
  P2: '#F06C18',
  P3: '#2FD08A',
};

/** Engagement heat ramp - low→high; low end lifted so it reads on brand navy. */
export const HEAT_RAMP = [
  '#2A5A86', '#2F6E9E', '#2F84BC', '#2E9AD2',
  '#46ABE6', '#79C6F0', '#A7DBF8', '#CFEDFD',
];

/** Youth-density ramp - dim→mint, low youth recedes, high youth glows. */
export const YOUTH_RAMP = [
  '#1C5A3A', '#1F7048', '#249060', '#2FAE78',
  '#52C698', '#7FDAB4', '#A8ECCE',
];

/** Grievance load ramp - low (calm green) → high (alarm red). */
export const GRIEV_RAMP = [
  '#2FD08A', '#8AD16A', '#D8C544', '#F0A93A', '#F0743A', '#F2545B',
];

/** Age-band segment colors for the detail stacked bar - youth bands warm
 *  (brand orange), older bands cool blue; all tuned to read on blue cards. */
export const AGE_COLORS = [
  '#FFC79A', '#F7A062', '#BFE6FA', '#8FD0F4', '#5FB6EA', '#3E97D6', '#C2D2EC',
];

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export const space = (n: number) => n * 4;

export const font = {
  // Inter loaded via expo-font; falls back to system if unavailable.
  ui: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  display: 'Sora_700Bold',
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  float: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
};

export const theme = { colors, party, phase, radius, space, font, shadow };
export default theme;
