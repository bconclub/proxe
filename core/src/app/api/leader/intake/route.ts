// LEADER API — citizen intake from the Pulse Punjab app (grievance / subscribe
// / volunteer / event signup). Single leader key for the whole app (avoids
// shipping the machine INBOUND_API_KEY in a public web bundle). Person-merges
// by phone and stamps POP campaign fields; the intensity trigger (026) then
// promotes the person automatically.
//
// Auth: x-api-key = LEADER_API_KEY (+ CORS, same as the leader GETs).

import { NextRequest } from 'next/server';
import { getServiceClient, ensureOrUpdateLead } from '@/lib/services';
import { leaderAuthGate, corsJson, leaderOptions } from '@/lib/server/leaderAuth';

export const dynamic = 'force-dynamic';
export const OPTIONS = leaderOptions;

const ENGAGEMENT = ['grievance', 'support', 'volunteer', 'event', 'info', 'outreach'];
const ACTION = ['vote', 'volunteer', 'rally', 'share', 'none'];
const CATEGORIES = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other'];

export async function POST(req: NextRequest) {
  const denied = leaderAuthGate(req);
  if (denied) return denied;
  const sb: any = getServiceClient();
  if (!sb) return corsJson({ error: 'database unavailable' }, { status: 500 });

  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      name, phone, constituency, district,
      grievance_category, grievance_text,
      engagement_type = 'info', action_intent, note,
    } = body || {};

    const normPhone = phone ? String(phone).replace(/\D/g, '').slice(-10) : null;
    // Anonymous subscribe/info with no phone still counts as a signal but can't
    // be a person row — record nothing merge-able, just accept.
    if (!normPhone || normPhone.length !== 10) {
      // Allow anonymous only for non-grievance info taps; grievances need contact.
      if (engagement_type === 'grievance') {
        return corsJson({ error: 'phone required for a grievance' }, { status: 400 });
      }
      return corsJson({ ok: true, leadId: null, anonymous: true });
    }

    const leadId = await ensureOrUpdateLead(name || null, null, normPhone, 'web', undefined, sb);
    if (!leadId) return corsJson({ error: 'merge failed' }, { status: 500 });

    // Stamp POP campaign fields (never clobber a stronger prior engagement).
    const cols: Record<string, any> = { magnet: 'pulse_app', first_touchpoint: 'web' };
    if (constituency) cols.constituency = constituency;
    if (district) cols.district = district;
    if (ENGAGEMENT.includes(engagement_type)) cols.engagement_type = engagement_type;
    if (action_intent && ACTION.includes(action_intent)) cols.action_intent = action_intent;
    if (grievance_category && CATEGORIES.includes(grievance_category)) cols.grievance_category = grievance_category;
    if (grievance_text) { cols.grievance_text = String(grievance_text).slice(0, 2000); cols.loop_status = 'raised'; cols.engagement_type = 'grievance'; }

    const { error: updErr } = await sb.from('all_leads').update(cols).eq('id', leadId);
    if (updErr) console.error('[leader/intake] lead update failed:', updErr.message);

    return corsJson({ ok: true, leadId });
  } catch (e) {
    console.error('[leader/intake]', (e as Error).message);
    return corsJson({ error: 'intake failed' }, { status: 500 });
  }
}
