import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, sendWhatsAppText, logMessage } from '@/lib/services';
import { verifySlackSignature, slackPostMessage } from '@/lib/services/slackApi';

export const dynamic = 'force-dynamic';

/**
 * POST /api/integrations/slack/events
 * Slack Events request URL. When the team REPLIES in the thread of a lead alert,
 * we send that text to the customer on WhatsApp - two-way from Slack.
 * Subscribe to `message.channels` (public) or `message.groups` (private) and set
 * this as the Events request URL in the Slack app.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  // Slack URL verification handshake (no signature yet on this one).
  if (body?.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (!verifySlackSignature(raw, req.headers.get('x-slack-request-timestamp'), req.headers.get('x-slack-signature'))) {
    return new NextResponse('bad signature', { status: 401 });
  }

  const event = body?.event;
  // Only real user messages that are REPLIES in a thread. Ignore the bot's own
  // posts (bot_id / app-authored), edits, joins, and top-level channel messages.
  const isThreadReply =
    event?.type === 'message' && !event.bot_id && !event.subtype &&
    event.thread_ts && event.thread_ts !== event.ts && typeof event.text === 'string' && event.text.trim();

  if (!isThreadReply) return NextResponse.json({ ok: true });

  // Ack fast; deliver in the background.
  (async () => {
    try {
      const supabase = getServiceClient();
      if (!supabase) return;
      // Find the lead whose alert this thread belongs to.
      const { data: lead } = await supabase
        .from('all_leads').select('id, phone, metadata')
        .filter('metadata->>slack_ts', 'eq', event.thread_ts)
        .maybeSingle();
      if (!lead?.phone) {
        console.warn('[slack/events] no lead for thread_ts', event.thread_ts);
        return;
      }
      const text = String(event.text).replace(/<@[^>]+>/g, '').trim(); // strip @mentions
      if (!text) return;
      const res = await sendWhatsAppText(lead.phone, text);
      if (res.success) {
        // Persist the wamid so delivered/read receipts attach to this reply, and
        // stamp human_takeover so the bot pauses and doesn't talk over the team.
        await logMessage(lead.id, 'whatsapp', 'agent', text, 'text', { source: 'slack_reply', slack_user: event.user, wa_message_id: res.messageId, human: true }).catch(() => {});
        await supabase.from('all_leads').update({
          metadata: { ...(lead.metadata || {}), human_takeover_at: new Date().toISOString(), human_takeover_by: `slack:${event.user}` },
        }).eq('id', lead.id);
        await slackPostMessage({ channel: event.channel, thread_ts: event.thread_ts, text: '✅ Sent to the customer on WhatsApp.' });
      } else {
        await slackPostMessage({ channel: event.channel, thread_ts: event.thread_ts, text: `⚠️ Could not send to WhatsApp: ${res.error || 'unknown error'}` });
      }
    } catch (e: any) {
      console.error('[slack/events] error:', e?.message || e);
    }
  })();

  return NextResponse.json({ ok: true });
}
