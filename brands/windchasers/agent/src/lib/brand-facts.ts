/**
 * WindChasers Brand Facts - Single Source of Truth
 *
 * All three channels (web, whatsapp, voice) import from this file.
 * Update facts HERE only. Channel prompts must never duplicate these.
 */

// ============================================================================
// CORE BRAND IDENTITY
// ============================================================================
export const BRAND_IDENTITY = {
  name: 'WindChasers Aviation Academy',
  shortName: 'WindChasers',
  founded: 2024,
  founder: {
    name: 'Sumaiya Ali',
    role: 'Founder and CEO',
    backgroundContext:
      'She started WindChasers in 2024 after researching pilot training for her own daughter and finding the process opaque and inconsistent.',
  },
  location: {
    city: 'Bengaluru',
    fullAddress:
      'Site No 1, Opp Poorna Prajna Education Center, 3rd floor, New Airport Road, Hennur Bagalur Main Road, Kothanur, Bengaluru, Karnataka 560077',
    neighborhood: 'Kothanur',
  },
  contact: {
    phonePrimary: '+91 9591004043',
    phoneWhatsApp: '+91 9035098425',
    email: 'aviators@windchasers.in',
    website: 'pilot.windchasers.in',
  },
} as const;

// ============================================================================
// LOCKED FACTUAL ANSWERS - Use exact wording. Never paraphrase the numbers.
// ============================================================================
export const LOCKED_ANSWERS = {
  cost: {
    display: 'up to ₹80 lakh',
    displaySpoken: 'up to eighty lakh',
    rule: 'NEVER quote a range. NEVER quote a lower bound. NEVER say "₹40 to 75 lakh" or any similar phrasing. If pressed for a lower number, defer: "It depends on the path. A counsellor will walk through specifics on the 1:1 call."',
    covers: 'ground school, flight hours, DGCA exams, and certification',
  },
  timeline: {
    display: '18 to 24 months',
    displaySpoken: 'eighteen to twenty four months',
    rule: 'NEVER quote shorter. NEVER quote location-specific shorter timelines (no "12 to 18 months abroad" or "8 to 12 months overseas"). Same timeline whether in India or abroad.',
  },
  dgcaSequence: {
    display:
      'Eligibility → DGCA Ground Classes + Theory Exams → Flight Training → Final Certifications → CPL Issued',
    detailed: [
      'Eligibility: 12th pass with Physics and Maths, Class 1 medical from DGCA-approved centre, Computer Number from DGCA',
      'Ground Classes and Theory Exams: 6 DGCA theory papers (Air Navigation, Aviation Meteorology, Air Regulations, Aircraft & Engines (Technical General), Aircraft Specific (Technical Specific), Radio Telephony / Communication), in-house at our Bengaluru campus',
      'Flight Training: Starts ONLY AFTER theory exams are cleared. 200 hours minimum at DGCA-approved partner FTOs',
      'Final Certifications: RTR(A), English Language Proficiency, CPL flight test',
      'DGCA issues the Commercial Pilot License at the end',
    ],
    rule: 'NEVER say ground classes and flight training happen in parallel. Theory is FIRST. Flight is AFTER.',
  },
  dgcaFraming: {
    display:
      'DGCA-aligned ground training. DGCA-approved partner Flying Training Organisations for flight training.',
    rule: 'NEVER say "DGCA-approved" for WindChasers itself. WindChasers is DGCA-aligned (ground classes). The partner FTOs are DGCA-approved (flight training). This distinction matters and must be preserved.',
  },
  faculty: {
    display: 'DGCA-aligned training with commercial pilot instructors',
    rule: 'NEVER name individual instructors in user-facing replies. NEVER say "ex-Air Force pilots" or "CAA-certified instructors". Faculty profiles are shared on the counsellor call. If user presses, say: "I can share specific instructor profiles for your program on a 1:1 call."',
  },
  eligibility: {
    academic: '12th pass with Physics and Mathematics. NIOS qualifies if PCM was missed in school.',
    age: 'Start training at 17. CPL issued at 18.',
    medical: 'Class 1 medical from a DGCA-approved medical centre.',
    english: 'ICAO Level 4 English proficiency.',
    rule: 'NEVER declare someone "eligible" or "not eligible" from a chat or call. The qualifier is the Pilot Assessment on the website or a counsellor review. Frame eligibility as "you meet the basic gate" or "you qualify to take the next step", not as "you are eligible".',
  },
  loanPartners: {
    display: 'HDFC Credila, Avanse, Auxilo',
    coverage: 'up to ₹40 lakh',
  },
  community: {
    whatsappLink: 'https://chat.whatsapp.com/B7nQhU9J5IFEWMmC6qLd8V',
    description: 'WindChasers aviation aspirants community',
    rule: 'Share the community link when the user explicitly asks to join the community, asks if there is a group/community, taps a "Join Community" button, or shows interest after a counsellor recommends it. Do not push the link unsolicited in every message.',
  },
  internationalPartners: {
    display: 'USA, Canada, New Zealand, Australia, South Africa',
    rule: 'Flight training abroad happens at DGCA-recognized partner schools in these countries. Mention only when the user asks about international or abroad training.',
  },
} as const;

// ============================================================================
// PROGRAMS - The complete authoritative list.
// ============================================================================
export const PROGRAMS = {
  offered: [
    {
      id: 'dgca-ground',
      name: 'DGCA Ground Classes',
      shortDescription: 'Theory training for the 6 DGCA papers, conducted at our Bengaluru campus.',
      whereGround: 'in-house at Bengaluru',
      whereFlight: null,
    },
    {
      id: 'ppl',
      name: 'Private Pilot License (PPL)',
      shortDescription: 'Ground classes with us, flight training at our DGCA-approved partner FTOs.',
      whereGround: 'in-house at Bengaluru',
      whereFlight: 'at DGCA-approved partner FTOs',
    },
    {
      id: 'cpl',
      name: 'Commercial Pilot License (CPL)',
      shortDescription: 'Ground classes with us, flight training at our DGCA-approved partner FTOs.',
      whereGround: 'in-house at Bengaluru',
      whereFlight: 'at DGCA-approved partner FTOs',
    },
    {
      id: 'helicopter',
      name: 'Helicopter Pilot Training',
      shortDescription: 'Ground classes with us, flight training at our partner helicopter schools.',
      whereGround: 'in-house at Bengaluru',
      whereFlight: 'at partner helicopter schools',
    },
    {
      id: 'cabin-crew',
      name: 'Cabin Crew Training',
      shortDescription: 'Conducted in-house at our Bengaluru campus.',
      whereGround: 'in-house at Bengaluru',
      whereFlight: null,
    },
    {
      id: 'type-rating',
      name: 'Type Rating',
      shortDescription: 'Boeing 737 and Airbus A320 type rating preparation.',
      whereGround: null,
      whereFlight: null,
    },
    {
      id: 'international',
      name: 'International Flight Schools',
      shortDescription:
        'Direct placement at our partner flight schools in the USA, Canada, New Zealand, Australia, and South Africa.',
      whereGround: null,
      whereFlight: 'at partner schools abroad',
    },
  ],
  notOffered: [
    'Drone training',
    'Drone Flying and Designing',
    'ATC Training',
    'Air Traffic Control',
    'Airport Operations',
    'Aircraft Performance Engineer',
    'Airline Operations Control',
    'Airline Quality and Safety Management',
    'Aviation Technical Writer',
    'Fire Service Examination Preparation',
  ],
} as const;

// ============================================================================
// HARD RULES - Must never be broken on any channel.
// ============================================================================
export const HARD_RULES = [
  'Never quote pilot salaries. If asked: "Pay scales are competitive and aligned with the industry. The counsellor will share details on the 1:1 call."',
  'Never declare anyone "eligible" or "not eligible". The qualifier is the Pilot Assessment on the website or a counsellor review.',
  'Never quote cost as a range. Always "up to ₹80 lakh". If pressed for a lower number, defer to the counsellor.',
  'Never quote a timeline shorter than 18 to 24 months. Same in India or abroad.',
  'Never claim WindChasers is a DGCA-approved Flying Training Organisation. WindChasers is DGCA-aligned for ground classes. Flight training is at DGCA-approved partner FTOs.',
  'Never name individual instructors. Never say "ex-Air Force pilots". Use "DGCA-aligned training with commercial pilot instructors".',
  'Never mention drone, ATC, airport operations, or any program from the notOffered list.',
  'Never push a booking on the first turn. Information first, booking after.',
  'Never volunteer pricing or cost info unless the user explicitly asks.',
  'Never volunteer definitions of programs the user already named (CPL, PPL, helicopter, etc). Acknowledge and ask what they want to know.',
  'Never end every message with the same booking CTA. Vary the close. Sometimes no CTA.',
  'Never give walls of text. Each response is 1 to 2 sentences max for WhatsApp, 2 to 4 for web chat, 1 to 2 spoken sentences for voice.',
  'Never invent faculty names, partner names, or fee numbers. If unsure, defer to the counsellor.',
] as const;

// ============================================================================
// PRIMARY CTAs - In order of precedence.
// ============================================================================
export const PRIMARY_CTAS = {
  primary: {
    label: 'Book a Demo Session',
    description: 'Come to the Kothanur campus, meet the team, sit in the simulator',
    intent: 'demo_session',
    url: 'https://pilot.windchasers.in/demo',
    whenToPush:
      'After 2 to 3 substantive questions, or when the user signals seriousness. Default close for chat conversations.',
  },
  secondary: {
    label: 'Book a 1-on-1 Consultation',
    description: 'A real conversation with a counsellor about your specific situation',
    intent: 'consultation',
    url: 'https://pilot.windchasers.in/demo?intent=consultation',
    whenToPush:
      'When the user is not ready to visit but wants a deeper conversation. Or as fallback after Demo Session is declined.',
  },
  tertiary: {
    label: 'Take the Pilot Assessment',
    description: '3-minute test that scores aptitude and fit',
    intent: 'assessment',
    url: 'https://pilot.windchasers.in/assessment',
    whenToPush:
      'Lower-commitment alternative for users not ready for any booking. Surface only on second or third exchange.',
  },
} as const;

// ============================================================================
// BANNED PHRASES
// ============================================================================
export const BANNED_PHRASES = [
  'revolutionary',
  'cutting-edge',
  'guaranteed',
  'world-class',
  'best in class',
  'transformative',
  '100% pass rate',
  '95% pass rate',
  'limited seats',
  'ex-Air Force',
  'CAA-certified',
  'DGCA-certified',
  'check your email',
  'log into dashboard',
] as const;

// ============================================================================
// EXPORT - Brand fact bundle injected into all channel prompts.
// ============================================================================
export function getBrandFactsForPrompt(): string {
  return `
=================================================================================
LOCKED FACTS — These take precedence over knowledge base retrieval.
=================================================================================
COST: ${LOCKED_ANSWERS.cost.display}. Covers ${LOCKED_ANSWERS.cost.covers}. ${LOCKED_ANSWERS.cost.rule}
TIMELINE: ${LOCKED_ANSWERS.timeline.display}. ${LOCKED_ANSWERS.timeline.rule}
DGCA SEQUENCE: ${LOCKED_ANSWERS.dgcaSequence.display}. ${LOCKED_ANSWERS.dgcaSequence.rule}
DGCA FRAMING: ${LOCKED_ANSWERS.dgcaFraming.display}. ${LOCKED_ANSWERS.dgcaFraming.rule}
FACULTY: ${LOCKED_ANSWERS.faculty.display}. ${LOCKED_ANSWERS.faculty.rule}
ELIGIBILITY: ${LOCKED_ANSWERS.eligibility.academic} Age: ${LOCKED_ANSWERS.eligibility.age} Medical: ${LOCKED_ANSWERS.eligibility.medical} ${LOCKED_ANSWERS.eligibility.rule}
LOAN PARTNERS: ${LOCKED_ANSWERS.loanPartners.display}. Coverage ${LOCKED_ANSWERS.loanPartners.coverage}.
INTERNATIONAL: ${LOCKED_ANSWERS.internationalPartners.display}. ${LOCKED_ANSWERS.internationalPartners.rule}
COMMUNITY: ${LOCKED_ANSWERS.community.description} — share the link ${LOCKED_ANSWERS.community.whatsappLink} ${LOCKED_ANSWERS.community.rule}
FOUNDER: ${BRAND_IDENTITY.founder.name}, ${BRAND_IDENTITY.founder.role}. Founded ${BRAND_IDENTITY.founded}.
LOCATION: ${BRAND_IDENTITY.location.fullAddress}.
PROGRAMS OFFERED: ${PROGRAMS.offered.map(p => p.name).join(', ')}.
PROGRAMS NOT OFFERED (NEVER MENTION AS AVAILABLE): ${PROGRAMS.notOffered.join(', ')}.
HARD RULES:
${HARD_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}
BANNED PHRASES (NEVER USE): ${BANNED_PHRASES.join(', ')}.
PRIMARY CTA: ${PRIMARY_CTAS.primary.label}. ${PRIMARY_CTAS.primary.whenToPush}
SECONDARY CTA: ${PRIMARY_CTAS.secondary.label}. ${PRIMARY_CTAS.secondary.whenToPush}
TERTIARY CTA: ${PRIMARY_CTAS.tertiary.label}. ${PRIMARY_CTAS.tertiary.whenToPush}
=================================================================================`.trim();
}
