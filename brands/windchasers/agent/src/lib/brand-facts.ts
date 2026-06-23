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
    // Google Maps link sent to leads who want to visit the academy. Swap for the
    // exact Google Business "share" link if/when available for a precise pin.
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=Windchasers+Aviation+Academy+Kothanur+Bengaluru+560077',
  },
  contact: {
    phonePrimary: '+91 9591004043',
    phoneWhatsApp: '+91 9035098425',
    email: 'aviators@windchasers.in',
    website: 'windchasers.in',
  },
} as const;

// ============================================================================
// LOCKED FACTUAL ANSWERS - Use exact wording. Never paraphrase the numbers.
// ============================================================================
export const LOCKED_ANSWERS = {
  cost: {
    display: 'around ₹60–70 lakh on average',
    displaySpoken: 'around sixty to seventy lakh on average',
    rule: 'This is the FULL end-to-end pilot-training (CPL) journey, driven mainly by the flying-school fees. Quote ONE simple figure — "around ₹60–70 lakh on average" — do NOT rattle off ranges, lower bounds, or the old ₹80 lakh number (keep it simple so it does not confuse people). Do NOT answer a DGCA-ground-classes fee question with this number — for the ground classes course use groundClassesFee below. If pressed for an exact figure, defer: "It depends on the flying school you choose — a counsellor will walk through specifics on the 1:1 call."',
    covers: 'end-to-end: ground classes + DGCA prep, loan/documentation/medicals help, flight training at a partner flying school (India or abroad), licence conversion, and airline interview prep — until you land your first pilot job',
  },
  journey: {
    display: 'End-to-end support from registration to your first pilot job.',
    phases: [
      'Ground classes at our Bengaluru academy — 4 subjects if you plan to fly abroad, 6 if you plan to fly in India. We teach 5 days a week and run a mock test every 6th day; doubt-clearing sessions, revisions and re-attending any class are included. Before the DGCA papers we run an in-house exam modelled on the real ones — you sit the papers once you score 80%+, so you clear in one go (it matters for airline interviews later).',
      'Alongside ground classes we help with your education loan, document filing, Class-1 medicals and DGCA computer number.',
      'Flight training — we enroll you in a partner flying school in India or abroad (tie-ups across 11 countries including India, multiple schools). Schools visit the academy for seminars so you can pick the right fit; we assist with the process, documentation and visa. Investment averages around ₹60–70 lakh.',
      'While you are at the school we stay in touch and ensure the school follows the process properly.',
      'On return we help with conversion flying — converting your foreign licence to an Indian one.',
      'Airline interview training — we prep you for the interviews (mentors inside airlines keep us posted on openings and what they look for). Our support runs until you get the job.',
    ],
    rule: 'Use when the user asks how it works, what is included, what you offer end-to-end, or about the process/steps. Share only the relevant phase(s) concisely — do NOT dump all six unless they want the full picture. Keep it conversational and to the point.',
  },
  groundClassesFee: {
    display:
      'DGCA Ground Classes (offline or online). 4 Subjects: ₹2.35 lakh, 3 to 4 months. 6 Subjects: ₹2.75 lakh, 4 to 5 months. Registration is a SEPARATE one-time ₹20,000 (not added onto each price).',
    subjects4: 'Air Navigation, Air Regulations, Aviation Meteorology, RTR. ₹2.35 lakh, 3 to 4 months.',
    subjects6: 'The 4 above plus Technical General and Technical Specific. ₹2.75 lakh, 4 to 5 months.',
    rule: 'When the user asks about the DGCA GROUND CLASSES fee / theory course fee / "fees for DGCA" / ground class price / what the classes cost, give THIS course fee — NOT the ₹80 lakh figure. Present it FORMATTED across multiple lines (per the prompt template), never as one run-on sentence. The two tracks are a choice: 4 subjects (₹2.35 lakh, 3-4 months) OR 6 subjects (₹2.75 lakh, 4-5 months). The ₹20,000 is a one-time registration fee on its own line — do NOT write "plus ₹20,000" on each price, and never say "3.5 months". ₹80 lakh is the whole CPL journey, quoted only when they ask the full cost to become a pilot.',
  },
  timeline: {
    display: '18 to 24 months',
    displaySpoken: 'eighteen to twenty four months',
    rule: 'NEVER quote shorter. NEVER quote location-specific shorter timelines (no "12 to 18 months abroad" or "8 to 12 months overseas"). Same timeline whether in India or abroad.',
  },
  batchSchedule: {
    display: 'A new batch starts on the 7th of every month',
    rule: 'When asked when the next batch / ground classes start, ANSWER DIRECTLY with the fact: a new batch starts on the 7th of every month (e.g. the June batch starts on 7 June, July batch on 7 July). Do NOT say it "depends on readiness/eligibility" and do NOT deflect the batch date to a counsellor — give the 7th-of-the-month answer first, then you may offer the counsellor for enrolment specifics.',
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
    // Loan amount depends on the applicant's collateral — never quote a figure.
    coverage: 'amount depends on collateral — do NOT state any loan figure or upper limit',
  },
  ageCareerPath: {
    display: 'No DGCA age limit on the CPL. Airlines prefer pilots ~18-30 for cockpit jobs.',
    over30: 'Flying Instructor (CPL, pays on par with an airline pilot), Helicopter pilot (CHPL), or PPL (always available).',
    rule: 'DGCA sets NO age limit on the CPL — anyone can earn it. But airlines prefer ~18-30 for flying jobs. For a lead OVER 30 whose goal is an airline cockpit, be HONEST (do not promise an airline job) AND encouraging — point them to the strong, equally well-paying paths: Flying Instructor, Helicopter (CHPL), or PPL. NEVER tell a 30+ lead "yes, airline pilot, no problem". Under 30 / unknown age: standard airline-pilot CPL path, no need to raise age.',
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
  'Quote the journey cost as ONE simple figure: "around ₹60–70 lakh on average". Do not list ranges or multiple numbers (no ₹80 lakh, no 55 lakh–1 crore). If pressed for an exact figure, defer to the counsellor.',
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
    url: 'https://windchasers.in/demo',
    whenToPush:
      'After 2 to 3 substantive questions, or when the user signals seriousness. Default close for chat conversations.',
  },
  secondary: {
    label: 'Book a 1-on-1 Consultation',
    description: 'A real conversation with a counsellor about your specific situation',
    intent: 'consultation',
    url: 'https://windchasers.in/demo?intent=consultation',
    whenToPush:
      'When the user is not ready to visit but wants a deeper conversation. Or as fallback after Demo Session is declined.',
  },
  tertiary: {
    label: 'Take the Pilot Assessment',
    description: '3-minute test that scores aptitude and fit',
    intent: 'assessment',
    url: 'https://windchasers.in/assessment',
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
COST (FULL CPL JOURNEY): ${LOCKED_ANSWERS.cost.display}. Covers ${LOCKED_ANSWERS.cost.covers}. ${LOCKED_ANSWERS.cost.rule}
DGCA GROUND CLASSES FEE: ${LOCKED_ANSWERS.groundClassesFee.display}. 4-subject: ${LOCKED_ANSWERS.groundClassesFee.subjects4}. 6-subject: ${LOCKED_ANSWERS.groundClassesFee.subjects6}. ${LOCKED_ANSWERS.groundClassesFee.rule}
TIMELINE: ${LOCKED_ANSWERS.timeline.display}. ${LOCKED_ANSWERS.timeline.rule}
BATCH SCHEDULE: ${LOCKED_ANSWERS.batchSchedule.display}. ${LOCKED_ANSWERS.batchSchedule.rule}
DGCA SEQUENCE: ${LOCKED_ANSWERS.dgcaSequence.display}. ${LOCKED_ANSWERS.dgcaSequence.rule}
DGCA FRAMING: ${LOCKED_ANSWERS.dgcaFraming.display}. ${LOCKED_ANSWERS.dgcaFraming.rule}
FACULTY: ${LOCKED_ANSWERS.faculty.display}. ${LOCKED_ANSWERS.faculty.rule}
ELIGIBILITY: ${LOCKED_ANSWERS.eligibility.academic} Age: ${LOCKED_ANSWERS.eligibility.age} Medical: ${LOCKED_ANSWERS.eligibility.medical} ${LOCKED_ANSWERS.eligibility.rule}
LOAN PARTNERS: ${LOCKED_ANSWERS.loanPartners.display}. We have a dedicated team to help applicants get a bank loan. ${LOCKED_ANSWERS.loanPartners.coverage}. NEVER mention any loan amount, upper limit, or figure (e.g. "40 lakh") — loan amount is determined by the bank based on the applicant's collateral.
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
