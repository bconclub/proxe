// Brand-private (NOT in the shared manifest). Approved WhatsApp template bodies,
// keyed by Meta template name, so the Tasks board can show the outgoing-message
// preview per task. The route reads from here, so the route stays brand-neutral
// and each brand keeps its own copy. Keep in sync with this brand's worker.
export const TEMPLATE_BODIES: Record<string, string> = {
  bcon_lead_machine_meta_welcome_v1_: `Hi {{customer_name}}, thanks for your interest in AI Lead Machine for {{brand_name}}. We help businesses like yours capture, qualify and convert more leads on autopilot. Want to see it in action?`,
  bcon_proxe_followup_engaged: `Hi {{customer_name}}, we were talking about {{service_interest}} for your business. Let's continue where we left off?`,
  bcon_proxe_followup_noengage: `Hi {{customer_name}}, you reached out recently about {{service_interest}}. Would you like to know how we can help?`,
  bcon_proxe_booking_reminder_24h: `Hi {{customer_name}}, your call with the BCON Team is tomorrow at {{booking_time}}. We'll cover {{service_interest}} for your business.`,
  bcon_proxe_booking_reminder_30m: `Hi {{customer_name}}, 30 minutes to go. Your call with the BCON Team is at {{booking_time}}.`,
  bcon_proxe_reengagement_engaged: `Hi {{customer_name}}, you mentioned {{pain_point}} was a challenge. If that's still the case, we should chat.`,
  bcon_proxe_reengagement_noengage: `Hi {{customer_name}}, we connected a while back but didn't dig into details. Want to see how we help businesses like yours grow?`,
}
