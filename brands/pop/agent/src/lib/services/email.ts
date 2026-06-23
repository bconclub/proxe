/**
 * services/email.ts — Resend transactional email helpers
 *
 * Single entry point for any dashboard-side email send. Today only used by
 * the user invitation flow (/api/auth/invite + /api/dashboard/users); easy
 * to extend.
 *
 * Env:
 *   RESEND_API_KEY        required for sends to actually go out
 *   RESEND_FROM_EMAIL     e.g. "team@send.bconclub.com" (defaults to Resend sandbox)
 *   RESEND_FROM_NAME      friendly sender name, e.g. "BCON PROXe"
 *
 * The Resend sandbox FROM (`onboarding@resend.dev`) only delivers to the
 * Resend account owner's verified email — fine for the first test loop,
 * not fine for inviting customers. Swap to a verified subdomain before
 * onboarding real users.
 *
 * SOFT-FAIL: if RESEND_API_KEY is unset, sends are skipped and callers fall
 * back to sharing the inviteUrl by hand. Nothing throws.
 */

import { Resend } from 'resend'

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
const FROM_NAME = process.env.RESEND_FROM_NAME || 'BCON PROXe'

let _client: Resend | null = null
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!_client) _client = new Resend(key)
  return _client
}

export interface SendResult {
  sent: boolean
  id?: string
  error?: string
}

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
  /** Optional reply-to so the invitee can hit reply and reach a real human. */
  replyTo?: string
}): Promise<SendResult> {
  const client = getClient()
  if (!client) {
    console.warn('[email] RESEND_API_KEY not set — skipping send')
    return { sent: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const { data, error } = await client.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo: opts.replyTo,
    })
    if (error) {
      console.error('[email] Resend send failed:', error)
      return { sent: false, error: error.message || 'Resend error' }
    }
    return { sent: true, id: data?.id }
  } catch (err: any) {
    console.error('[email] Unexpected send error:', err?.message || err)
    return { sent: false, error: err?.message || 'unknown' }
  }
}

/**
 * Dashboard invitation email. Plain, branded, includes the accept link +
 * 7-day expiry note.
 */
export async function sendInvitationEmail(opts: {
  to: string
  inviteUrl: string
  invitedByEmail?: string | null
  role?: string
}): Promise<SendResult> {
  const role = opts.role || 'viewer'
  const invitedBy = opts.invitedByEmail || 'a teammate'
  const subject = `You're invited to the BCON PROXe dashboard`

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;line-height:1.6">
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700">You've been invited 👋</h2>
    <p style="margin:0 0 16px">
      ${escapeHtml(invitedBy)} has invited you to join the
      <strong>BCON PROXe</strong> dashboard as a <strong>${escapeHtml(role)}</strong>.
    </p>
    <p style="margin:0 0 24px">
      Click the button below to set up your account. This invitation expires in 7 days.
    </p>
    <p style="margin:0 0 24px">
      <a href="${opts.inviteUrl}"
         style="display:inline-block;padding:12px 24px;background:#8B5CF6;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
        Accept invitation
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#555">
      Or paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all">
      <a href="${opts.inviteUrl}" style="color:#8B5CF6">${opts.inviteUrl}</a>
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
    <p style="margin:0;font-size:12px;color:#888">
      If you weren't expecting this invitation, you can safely ignore this email.
    </p>
  </div>`

  const text = [
    `You've been invited to the BCON PROXe dashboard.`,
    ``,
    `${invitedBy} invited you as a ${role}.`,
    ``,
    `Accept the invitation here (expires in 7 days):`,
    opts.inviteUrl,
    ``,
    `If you weren't expecting this, ignore the email.`,
  ].join('\n')

  return sendEmail({
    to: opts.to,
    subject,
    html,
    text,
    replyTo: opts.invitedByEmail || undefined,
  })
}

// Minimal HTML escaper for values we inject into the template.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
