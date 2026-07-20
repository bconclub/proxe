// Real, Meta-APPROVED WhatsApp template bodies (body + footer + buttons),
// keyed by the exact template name we send. Source of truth = what Meta stores
// (fetched from the WABA message_templates API). We log the RENDERED body +
// buttons to the conversation so the dashboard inbox shows the ACTUAL template
// the customer received - not a hand-written one-line mirror.
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
  /** 'url' for link buttons (shown with a link affordance), else quick-reply.
   *  Applies to every button when buttonTypes isn't given. */
  buttonType?: 'url' | 'quick_reply'
  /** Per-button type, when a template mixes URL and quick-reply buttons. Index
   *  aligns with `buttons`. Falls back to `buttonType` where absent. */
  buttonTypes?: ('url' | 'quick_reply')[]
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

  // Webinar day-of + follow-up templates (v3 = clean copy with a real button;
  // the join link lives in the button, never inline). The _v1 day-of names are
  // kept as aliases because our earliest sends logged that name even though the
  // v3 template is what actually went out - so the inbox renders them identically.
  windchasers_webinar_live_now_v3: {
    body: `Hi {{customer_name}}, we are live now. *{{webinar_name}}* has started.\n\nTap *Join webinar* below to come straight in.`,
    footer: 'Team WindChasers',
    buttons: ['Join webinar'],
    buttonType: 'url',
  },
  windchasers_webinar_live_now_v1: {
    body: `Hi {{customer_name}}, we are live now. *{{webinar_name}}* has started.\n\nTap *Join webinar* below to come straight in.`,
    footer: 'Team WindChasers',
    buttons: ['Join webinar'],
    buttonType: 'url',
  },
  windchasers_webinar_starting_soon_v3: {
    body: `Hi {{customer_name}}, your *{{webinar_name}}* webinar starts in 30 minutes.\n\nTap *Join webinar* below to come in. See you inside!`,
    footer: 'Team WindChasers',
    buttons: ['Join webinar'],
    buttonType: 'url',
  },
  windchasers_webinar_starting_soon_v1: {
    body: `Hi {{customer_name}}, your *{{webinar_name}}* webinar starts in 30 minutes.\n\nTap *Join webinar* below to come in. See you inside!`,
    footer: 'Team WindChasers',
    buttons: ['Join webinar'],
    buttonType: 'url',
  },
  windchasers_webinar_thankyou_v1: {
    body: `Hi {{customer_name}}, thank you for joining our Pilot Training webinar today. It was great having you there.\n\nReady for the next step? Book a free demo session with our team, online or on campus, and get all your questions answered one on one.\n\nTap below to pick your slot.`,
    footer: 'Team WindChasers',
    buttons: ['Book a demo'],
    buttonType: 'url',
  },
  windchasers_webinar_register_nudge_v2: {
    body: `Hi {{customer_name}}, you showed interest in our *{{webinar_name}}* webinar but haven't completed your registration yet.\n\nTap *Complete Registration* to secure your spot, or join our WhatsApp group for updates and the session link.`,
    footer: 'Team WindChasers',
    buttons: ['Complete Registration', 'Join WhatsApp Group'],
    buttonTypes: ['url', 'quick_reply'],
  },
  windchasers_webinar_reminder_v2: {
    body: `Hi {{customer_name}}, a quick reminder about the *{{webinar_name}}* webinar.\n\nIt starts *{{when}}*. Tap below to join our WhatsApp group for the join link and session updates, and see you there!`,
    footer: 'Team WindChasers',
    buttons: ['Join WhatsApp Group'],
    buttonType: 'quick_reply',
  },
  // ── Post-call thank-you templates (LogCallChat "Send a thank-you" picker) ──
  // Submitted to Meta as Utility (approval ~1 week out). The picker reads Meta's
  // live APPROVED list, so once approved these auto-appear and match a Connected
  // call by the 'postcall' name keyword (a missed call also matches _callback).
  // Bodies/buttons recorded here so the inbox renders the exact template on send.
  windchasers_postcall_thankyou_v1: {
    body: `Hi {{customer_name}}, thank you for your time on the call today.\n\nWhenever you're ready to move forward with your pilot training, we're here to help.`,
    footer: 'Team WindChasers',
    buttons: ['Book a Demo Class', 'Ask a Question'],
  },
  windchasers_postcall_callback_v1: {
    body: `Hi {{customer_name}}, thank you for your time. Looks like we caught you at a busy moment.\n\nWe'll call you back on {{callback_date}} at {{callback_time}}.`,
    footer: 'Team WindChasers',
    buttons: ['Reschedule', 'Ask a Question'],
  },
  windchasers_postcall_demo_booked_v1: {
    body: `Hi {{customer_name}}, thank you for your time on the call today. Your demo session is confirmed.\n\nDate: {{date}}\nTime: {{time}}\n{{link_or_location}}\n\nSee you there.`,
    footer: 'Team WindChasers',
    buttons: ['Add to Calendar', 'Ask a Question'],
  },
  windchasers_postcall_optout_v1: {
    body: `Hi {{customer_name}}, thank you for your time. We won't reach out further.\n\nIf your plans change, you're always welcome to contact us.`,
    footer: 'Team WindChasers',
    buttons: ['Ask a Question'],
  },
}

export type RenderedTemplate = {
  /** Body with params substituted - store this as the conversation `content`. */
  content: string
  footer?: string
  buttons?: string[]
  buttonType?: 'url' | 'quick_reply'
  buttonTypes?: ('url' | 'quick_reply')[]
}

/**
 * Render an approved template body with its params filled, ready to log as the
 * conversation `content` (+ buttons/footer for the inbox). Returns null when the
 * template name isn't in the registry - callers fall back to their old stub so a
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
  return { content, footer: tpl.footer, buttons: tpl.buttons, buttonType: tpl.buttonType, buttonTypes: tpl.buttonTypes }
}
