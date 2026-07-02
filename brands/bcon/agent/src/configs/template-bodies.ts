// Brand-private (NOT in the shared manifest). Approved WhatsApp template bodies,
// keyed by Meta template name, so the Tasks board + inbox timeline can show the
// outgoing-message preview per task. The route reads from here, so the route
// stays brand-neutral and each brand keeps its own copy.
// KEEP IN SYNC with this brand's worker (task-worker.js TEMPLATE_BODIES +
// getTemplatePreview routing).
export const TEMPLATE_BODIES: Record<string, string> = {
  bcon_lead_machine_meta_welcome_v1_: `Hi {{customer_name}}, thanks for your interest in AI Lead Machine for {{brand_name}}. We help businesses like yours capture, qualify and convert more leads on autopilot. Want to see it in action?`,
  bcon_proxe_followup_engaged: `Hi {{customer_name}}, we were talking about {{service_interest}} for your business. Let's continue where we left off?`,
  bcon_proxe_followup_noengage: `Hi {{customer_name}}, you reached out recently about {{service_interest}}. Would you like to know how we can help?`,
  bcon_proxe_booking_reminder_24h: `Hi {{customer_name}}, your call with the BCON Team is tomorrow at {{booking_time}}. We'll cover {{service_interest}} for your business.`,
  bcon_proxe_booking_reminder_30m: `Hi {{customer_name}}, 30 minutes to go. Your call with the BCON Team is at {{booking_time}}.`,
  bcon_proxe_reengagement_engaged: `Hi {{customer_name}}, you mentioned {{pain_point}} was a challenge. If that's still the case, we should chat.`,
  bcon_proxe_reengagement_noengage: `Hi {{customer_name}}, we connected a while back but didn't dig into details. Want to see how we help businesses like yours grow?`,
  // Purpose-built cadence templates (approved on Meta, wired into the worker).
  bcon_onetouch_d1_v1: `Hi {{customer_name}}, saw {{business_name}} looking into {{service_interest}}. Quick question - what's the daily headache you're trying to fix? Getting more leads, managing follow-ups, creating content, or something else?`,
  bcon_onetouch_d3_v1: `Hi {{customer_name}}, saw {{business_name}} checked out our {{service_interest}} a couple days back. Still trying to figure it out or did you find what you needed?`,
  bcon_onetouch_d7_v1: `Hi {{customer_name}}, it's been a week since you enquired about {{service_interest}}. Are you still dealing with {{pain_point}} or did you sort it out?`,
  bcon_onetouch_d30_v1: `Hi {{customer_name}}, it's been a month. Seems like {{service_interest}} isn't a priority for you now. I'll stop messaging for now. You can reach back here anytime.`,
  bcon_lowtouch_d1_v1: `Hi {{customer_name}}, we spoke yesterday about {{service_interest}}. Wanted to follow up on what you mentioned about {{pain_point}}. Are you still looking to start fixing these this week?`,
  bcon_lowtouch_d3_v1: `Hi {{customer_name}}, checking in since we spoke about {{service_interest}}. You mentioned setting this up for {{business_name}}. Is this still a priority? I'd like to take you on a demo.`,
  bcon_lowtouch_d7_v1: `Hi {{customer_name}}, last week you were looking at {{service_interest}} for {{business_name}}. We helped a similar business fix {{pain_point}} in 48 hours, I'd like to show you how.`,
}

/**
 * Resolve the WhatsApp template a follow-up task will send, mirroring the
 * worker's getTemplatePreview routing (task_type + metadata.bucket). Used to
 * preview the actual outgoing message per planned action. Returns null when the
 * task type doesn't map to a fixed template (e.g. AI-dynamic / voice tasks).
 * We don't know the engaged/noengage rotation or the send-time window here, so
 * we pick the most representative variant for a preview.
 */
// Friendly labels for each Meta template variable, used to render variable
// SLOTS as chips in the preview (so the operator sees "that's a variable").
export const VAR_LABELS: Record<string, string> = {
  customer_name: 'Name',
  service_interest: 'goal',
  brand_name: 'brand',
  business_name: 'brand',
  booking_time: 'time',
  pain_point: 'challenge',
}

// Wrap a variable slot in the [[label]] sentinel the UI turns into a chip.
const chip = (key: string) => `[[${VAR_LABELS[key] || key}]]`

/**
 * Fill a template body but keep variables VISIBLE as [[label]] chips instead of
 * substituting real values, so the preview shows exactly which parts are dynamic.
 */
export function fillTemplateWithChips(body: string): string {
  return body
    .replace(/\{\{\s*customer_name\s*\}\}/g, chip('customer_name'))
    .replace(/\{\{\s*brand_name\s*\}\}/g, chip('brand_name'))
    .replace(/\{\{\s*business_name\s*\}\}/g, chip('business_name'))
    .replace(/\{\{\s*service_interest\s*\}\}/g, chip('service_interest'))
    .replace(/\{\{\s*booking_time\s*\}\}/g, chip('booking_time'))
    .replace(/\{\{\s*pain_point\s*\}\}/g, chip('pain_point'))
}

/**
 * Tiered free-form nudge preview — MIRRORS the worker's buildTieredNudge
 * (task-worker.js). Tiers on what the task metadata knows; variables render as
 * [[label]] chips. KEEP IN SYNC with the worker.
 */
export function buildNudgePreview(md: Record<string, any>): string {
  const goal = md?.service_interest || null
  const brand = md?.brand_name || md?.business_name || null
  const pain = md?.pain_point || null
  const src = String(md?.bucket || md?.source || md?.channel || '')
  const cameFromForm = /form|meta|pabbly|facebook|lead[_ -]?machine/i.test(src)

  // Tier 3 — form lead, goal + brand known.
  if (cameFromForm && goal && brand) {
    return `Hey ${chip('customer_name')}, saw you reached out about ${chip('service_interest')} for ${chip('brand_name')}. Want me to map out how we'd get you there? I can set up a quick call.`
  }
  // Tier 2 — some concrete detail (goal, challenge, or brand).
  if (goal || pain || brand) {
    const detailChip = goal ? chip('service_interest') : pain ? chip('pain_point') : chip('brand_name')
    return `Hey ${chip('customer_name')}, you mentioned ${detailChip} earlier. Want me to show you how we'd fix that with AI? Takes 2 mins.`
  }
  // Tier 1 — nothing known yet.
  return `Hey ${chip('customer_name')}, you dropped in earlier but we didn't get to chat. What are you working on right now, more leads, better content, or better ads?`
}

export function resolveTaskTemplate(taskType: string, bucket?: string | null): string | null {
  const t = taskType || ''
  if (t === 'booking_reminder_24h' || t === 'reminder_24h') return 'bcon_proxe_booking_reminder_24h'
  if (t === 'booking_reminder_30m' || t === 'reminder_30m') return 'bcon_proxe_booking_reminder_30m'
  if (t === 'first_outreach') return 'bcon_lead_machine_meta_welcome_v1_'
  if (t === 're_engage') return 'bcon_proxe_reengagement_noengage'

  // ONE_TOUCH (ghost, never replied) → purpose-built day-N ladder.
  if (bucket === 'ONE_TOUCH') {
    if (t === 'follow_up_24h') return 'bcon_onetouch_d1_v1'
    if (t === 'follow_up_day3') return 'bcon_onetouch_d3_v1'
    if (t === 'follow_up_day7') return 'bcon_onetouch_d7_v1'
    if (t === 'follow_up_day30') return 'bcon_onetouch_d30_v1'
    if (t === 'follow_up_day90') return 'bcon_proxe_reengagement_noengage'
  }
  // Post-demo / post-proposal ladders → low-touch day-N.
  if (bucket === 'DEMO_TAKEN' || bucket === 'PROPOSAL_SENT') {
    if (t === 'follow_up_day1') return 'bcon_lowtouch_d1_v1'
    if (t === 'follow_up_day3') return 'bcon_lowtouch_d3_v1'
    if (t === 'follow_up_day5') return 'bcon_lowtouch_d7_v1'
  }
  // Everything else (singleton nudges, ungrouped follow-ups) → generic followup.
  if (t.startsWith('follow_up_') || t === 'nudge_waiting' || t === 'push_to_book' || t === 'missed_call_followup' || t === 'human_callback') {
    return 'bcon_proxe_followup_noengage'
  }
  return null
}
