// Real, Meta-APPROVED WhatsApp template bodies (body + footer + buttons),
// keyed by the exact template name we send. Source of truth = what Meta stores
// (fetched from the WABA message_templates API). We log the RENDERED body +
// buttons to the conversation so the dashboard inbox shows the ACTUAL template
// the customer received — not a hand-written one-line mirror.
//
// Windchasers-scoped: every name here is a `windchasers_*` template and is only
// referenced from windchasers-gated send paths, mirroring whatsappSender.ts
// (which already hardcodes these same template names). Update this file whenever
// a template's copy/buttons change on Meta, or a new version is approved.

export type WaTemplateBody = {
  /** Body text with {{param}} placeholders, exactly as approved on Meta. */
  body: string
  /** Footer line (small grey text under the body), if the template has one. */
  footer?: string
  /** Button labels, in order. Rendered as WhatsApp-style buttons in the inbox. */
  buttons?: string[]
  /** 'url' for link buttons (shown with a link affordance), else quick-reply. */
  buttonType?: 'url' | 'quick_reply'
}

export const WA_TEMPLATE_BODIES: Record<string, WaTemplateBody> = {
  windchasers_generic_welcome_v3: {
    body: `Hi {{customer_name}}, Welcome to *Windchasers* - India's Top Pilot Training Academy\n\nwhat woul you like to explore?`,
    footer: 'Team Windchasers',
    buttons: ['Pilot Training', 'Flight Schools', 'Cabin Crew'],
  },
  windchasers_generic_welcome_v1: {
    body: `Hi {{customer_name}}, welcome to *Windchasers*. We are here to guide you with your Aviation Career.\n\nWhat are you looking to explore?`,
    buttons: ['Pilot Training', 'Cabin Crew', 'Other'],
  },
  windchasers_pilot_welcome_v3: {
    body: `Hi {{customer_name}}, thanks for sharing your details with us.\n\nOur team will call you shortly about the *Windchasers Pilot Training* program.\n\nMeanwhile, what would you like to check?`,
    footer: 'Team Windchasers',
    buttons: ['Course Details', 'Eligibility & Fees', 'Talk to a Counsellor'],
  },
  windchasers_pilot_welcome_v2: {
    body: `Hi {{customer_name}}, welcome to *Windchasers.*\n\nYou're one step closer to the cockpit. Where would you like to start?`,
    footer: 'Team Windchasers',
    buttons: ['Pilot Training Details', 'Visit Academy', 'Book a Demo Class'],
  },
  windchasers_pilot_welcome_v1: {
    body: `Hi {{customer_name}}, welcome to *Windchasers*,\n\nYou're one step closer to the cockpit. Where would you like to start?`,
    buttons: ['Training Options', 'Book a Demo'],
  },
  windchasers_pilot_parents_welcome_v1: {
    body: `Hi {{parent_name}}, welcome to *WindChasers.*\n\nThank you for contacting us about your child's career in aviation.\n\nWhere would you like to start?`,
    buttons: ['Pilot Training Details', 'Visit Academy', 'Book a Demo Class'],
  },
  windchasers_cabin_crew_welcome_v1: {
    body: `Hi {{customer_name}}, thanks for sharing your details with us.\n\nOur team will call you shortly about the *Windchasers Cabin Crew* program.\n\nMeanwhile, what would you like to check?`,
    footer: 'Team Windchasers',
    buttons: ['Course Details', 'Eligibility & Fees', 'Talk to a Counsellor'],
  },
  windchasers_webinar_confirmation_v1: {
    body: `Hi {{customer_name}}, your seat for the WindChasers Aviation Webinar is confirmed.\n\nTopic: *{{topic}}*\n\n📅 *{{date}}* | 🕐 *{{time}}*\n💻 Zoom\n\nJoin our WhatsApp group for event updates and session resources.\n\nSee you there.`,
    footer: 'Team WindChasers',
    buttons: ['Join WhatsApp Group'],
  },
  windchasers_demo_offline_v2: {
    body: `Hi {{customer_name}}, your *Windchasers* campus visit is confirmed.\n\nDate: *{{date}}*\nTime: *{{time}}*\nLocation: *Windchasers HQ, Bengaluru*\n\nYou'll get a walkthrough of the campus, meet the instructors, and get answers on your next step.\n\nSee you there.`,
    footer: 'Team Windchasers',
    buttons: ['Get Directions', 'Ask a Question'],
  },
  windchasers_demo_online_v2: {
    body: `Hi {{customer_name}}, your *Windchasers* online demo session is confirmed.\n\nDate: *{{date}}*\nTime: *{{time}}*\n\nYour session will cover program details, eligibility, and next steps. Meeting link will be shared 30 minutes before.\n\nSee you online.`,
    footer: 'Team Windchasers',
    buttons: ['View Session Details', 'Ask a Question'],
  },
  windchasers_pat_result_v2: {
    body: `Hi {{customer_name}}, your Pilot Aptitude Test result is ready.\n\nScore: *{{score}}/100*\nTier: *{{tier}}*\n\n{{tier_message}}\n\n_*Team Windchasers*_`,
    buttons: ['Book a Demo Class'],
  },
}

export type RenderedTemplate = {
  /** Body with params substituted — store this as the conversation `content`. */
  content: string
  footer?: string
  buttons?: string[]
  buttonType?: 'url' | 'quick_reply'
}

/**
 * Render an approved template body with its params filled, ready to log as the
 * conversation `content` (+ buttons/footer for the inbox). Returns null when the
 * template name isn't in the registry — callers fall back to their old stub so a
 * missing entry never breaks a send-log.
 *
 * A missing/blank param is replaced with an empty string; callers pass a real
 * first name for {{customer_name}}/{{parent_name}}, so bodies never read "Hi ,".
 */
export function renderWaTemplate(
  name: string,
  params: Record<string, string | number | null | undefined> = {},
): RenderedTemplate | null {
  const tpl = WA_TEMPLATE_BODIES[name]
  if (!tpl) return null
  const content = tpl.body
    .replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, key: string) => {
      const v = params[key]
      return v === undefined || v === null ? '' : String(v)
    })
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  return { content, footer: tpl.footer, buttons: tpl.buttons, buttonType: tpl.buttonType }
}
