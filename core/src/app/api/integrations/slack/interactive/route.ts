import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { verifySlackSignature, slackUpdateMessage, slackUserName, leadAlertBlocks } from '@/lib/services/slackApi';
import { getBrandConfig } from '@/configs';

export const dynamic = 'force-dynamic';

/**
 * POST /api/integrations/slack/interactive
 * Slack Interactivity request URL. Handles the Resolved / Reopen buttons on a
 * lead alert. Body is application/x-www-form-urlencoded: payload=<json>.
 * Set this URL in the Slack app → Interactivity & Shortcuts.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySlackSignature(raw, req.headers.get('x-slack-request-timestamp'), req.headers.get('x-slack-signature'))) {
    return new NextResponse('bad signature', { status: 401 });
  }
  let payload: any;
  try {
    const params = new URLSearchParams(raw);
    payload = JSON.parse(params.get('payload') || '{}');
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const action = payload?.actions?.[0];
  const actionId: string = action?.action_id || '';
  const leadId: string = action?.value || '';
  const channel: string = payload?.channel?.id || '';
  const ts: string = payload?.message?.ts || '';
  const slackUser: string = payload?.user?.id || '';

  if ((actionId !== 'lead_resolve' && actionId !== 'lead_reopen') || !leadId) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Do the DB work + message update in the background; ack Slack within 3s.
  (async () => {
    try {
      const supabase = getServiceClient();
      if (!supabase) return;
      const who = await slackUserName(slackUser);
      const { data: lead } = await supabase.from('all_leads').select('id, customer_name, phone, metadata, unified_context').eq('id', leadId).maybeSingle();
      const brandLabel = (() => { try { return getBrandConfig().name; } catch { return 'PROXe'; } })();

      if (actionId === 'lead_resolve') {
        await supabase.from('all_leads').update({ needs_human_followup: false, metadata: { ...(lead?.metadata || {}), resolved_by: who, resolved_at: new Date().toISOString() } }).eq('id', leadId);
        await supabase.from('agent_tasks').update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('lead_id', leadId).in('status', ['pending', 'queued', 'awaiting_approval']);
        if (channel && ts) {
          await slackUpdateMessage({
            channel, ts, text: `Resolved by ${who}`,
            blocks: leadAlertBlocks({ brandLabel, leadId, title: 'Resolved', name: lead?.customer_name, phone: lead?.phone }, { resolved: who }),
          });
        }
      } else {
        await supabase.from('all_leads').update({ needs_human_followup: true, metadata: { ...(lead?.metadata || {}), reopened_by: who, reopened_at: new Date().toISOString() } }).eq('id', leadId);
        if (channel && ts) {
          await slackUpdateMessage({
            channel, ts, text: `Reopened by ${who}`,
            blocks: leadAlertBlocks({ brandLabel, leadId, title: 'Needs human follow-up', name: lead?.customer_name, phone: lead?.phone, footer: `reopened by ${who}`, dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://proxe.lokazen.in'}/dashboard/inbox?lead=${leadId}`, reply: true }),
          });
        }
      }
    } catch (e: any) {
      console.error('[slack/interactive] error:', e?.message || e);
    }
  })();

  return NextResponse.json({ ok: true }, { status: 200 });
}
