/**
 * Meta Instagram Webhook
 * GET  /api/agent/instagram/meta - Webhook verification (hub.challenge)
 * POST /api/agent/instagram/meta - Incoming Instagram DMs + comments
 *
 * Bridges Meta's Instagram webhook into the PROXe unified agent engine, the
 * same way the WhatsApp meta route does — Instagram leads use channel 'social'
 * and are identified by their IGSID (Instagram-scoped ID), since IG users have
 * no phone/email.
 *
 * Env:
 *   META_IG_VERIFY_TOKEN          - custom string set in Meta webhook config
 *   META_IG_APP_SECRET            - for X-Hub-Signature-256 verification (optional)
 *   META_IG_ACCESS_TOKEN          - send token (see instagramSender)
 *   META_IG_BUSINESS_ACCOUNT_ID   - our IG account id (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { process as processMessage } from '@/lib/agent-core/engine';
import { AgentInput } from '@/lib/agent-core/types';
import { getServiceClient, getClient, logMessage } from '@/lib/services';
import {
  sendInstagramDM,
  sendInstagramCommentReply,
  sendInstagramPrivateReply,
  fetchInstagramUsername,
} from '@/lib/services/instagramSender';
import { getCurrentBrandId } from '@/configs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_VERIFY_TOKEN = 'proxe-instagram-verify-token';

// In-memory dedup — Meta re-delivers webhooks.
const processedIds = new Set<string>();
function seen(id: string): boolean {
  if (!id) return false;
  if (processedIds.has(id)) return true;
  processedIds.add(id);
  setTimeout(() => processedIds.delete(id), 60_000);
  return false;
}

// ── Verification ────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const mode = sp.get('hub.mode');
  const token = sp.get('hub.verify_token');
  const challenge = sp.get('hub.challenge');
  const verifyToken = process.env.META_IG_VERIFY_TOKEN || DEFAULT_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('[instagram/webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }
  console.warn('[instagram/webhook] Verification failed', { mode, tokenMatch: token === verifyToken });
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ── Signature check (optional but recommended) ──────────────────────────────
function signatureOk(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_IG_APP_SECRET;
  if (!secret) return true; // not configured → don't block (dev)
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
  } catch {
    return false;
  }
}

// ── Lead resolution by IGSID ────────────────────────────────────────────────
async function ensureInstagramLead(igsid: string, username: string | null, supabase: any): Promise<string | null> {
  const now = new Date().toISOString();
  try {
    const { data: existing } = await supabase
      .from('all_leads')
      .select('id, unified_context')
      .eq('unified_context->social->>igsid', igsid)
      .maybeSingle();

    if (existing?.id) {
      const uc = existing.unified_context || {};
      await supabase
        .from('all_leads')
        .update({
          ...(username ? { customer_name: username } : {}),
          last_touchpoint: 'instagram',
          last_interaction_at: now,
          unified_context: {
            ...uc,
            social: { ...(uc.social || {}), igsid, platform: 'instagram', ...(username ? { username } : {}) },
          },
        })
        .eq('id', existing.id);
      return existing.id;
    }

    const { data: created, error } = await supabase
      .from('all_leads')
      .insert({
        customer_name: username || 'Instagram User',
        brand: getCurrentBrandId(),
        first_touchpoint: 'instagram',
        last_touchpoint: 'instagram',
        last_interaction_at: now,
        unified_context: {
          social: { igsid, platform: 'instagram', ...(username ? { username } : {}) },
          attribution: { source: 'instagram', source_label: 'Instagram', first_touchpoint: 'instagram', first_touchpoint_label: 'Instagram' },
        },
      })
      .select('id')
      .single();
    if (error) {
      console.error('[instagram/webhook] lead insert failed:', error.message);
      return null;
    }
    return created.id;
  } catch (e: any) {
    console.error('[instagram/webhook] ensureInstagramLead error:', e?.message || e);
    return null;
  }
}

async function fetchHistory(leadId: string, supabase: any): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  try {
    const { data } = await supabase
      .from('conversations')
      .select('sender, content')
      .eq('lead_id', leadId)
      .eq('channel', 'social')
      .order('created_at', { ascending: true })
      .limit(20);
    return (data || []).map((r: any) => ({ role: r.sender === 'customer' ? 'user' as const : 'assistant' as const, content: r.content }));
  } catch {
    return [];
  }
}

// ── DM handler ──────────────────────────────────────────────────────────────
async function handleDM(igsid: string, text: string, mid: string, supabase: any): Promise<void> {
  const username = await fetchInstagramUsername(igsid);
  const leadId = await ensureInstagramLead(igsid, username, supabase);
  if (!leadId) return;

  await logMessage(leadId, 'social', 'customer', text, 'text', { source: 'instagram', igsid, ig_message_id: mid }, supabase);

  const history = await fetchHistory(leadId, supabase);
  const input: AgentInput = {
    channel: 'social',
    message: text,
    messageCount: history.length,
    sessionId: `ig_${igsid}`,
    userProfile: { name: username || undefined },
    conversationHistory: history,
    summary: '',
    metadata: { platform: 'instagram', igsid },
  };

  let reply = '';
  try {
    const result = await processMessage(input, supabase);
    reply = (result?.response || '').trim();
  } catch (e: any) {
    console.error('[instagram/webhook] engine error:', e?.message || e);
  }
  if (!reply) reply = "Thanks for reaching out! Our team will get back to you shortly.";

  const sent = await sendInstagramDM(igsid, reply);
  if (sent.success) {
    await logMessage(leadId, 'social', 'agent', reply, 'text', { source: 'instagram', igsid, ai_generated: true, ig_message_id: sent.messageId }, supabase);
  } else {
    console.error('[instagram/webhook] DM send failed:', sent.error);
  }
}

// ── Comment handler ─────────────────────────────────────────────────────────
async function handleComment(value: any, ourIgId: string, supabase: any): Promise<void> {
  const commentId: string = value?.id;
  const text: string = value?.text || '';
  const fromId: string = value?.from?.id || '';
  const fromUsername: string | null = value?.from?.username || null;
  const mediaId: string = value?.media?.id || '';
  if (!commentId || !fromId) return;
  if (fromId === ourIgId) return; // our own reply — ignore

  const leadId = await ensureInstagramLead(fromId, fromUsername, supabase);
  if (leadId) {
    await logMessage(leadId, 'social', 'customer', text, 'text', { source: 'instagram_comment', kind: 'comment', igsid: fromId, comment_id: commentId, media_id: mediaId }, supabase);
  }

  // Generate a tailored reply to the comment, deliver it privately (comment → DM)
  // — the lead-capture move — and post a short public reply pointing to the DM.
  let dmReply = '';
  try {
    const input: AgentInput = {
      channel: 'social',
      message: text || 'Hi, I saw your post and I would like to know more.',
      messageCount: 0,
      sessionId: `ig_${fromId}`,
      userProfile: { name: fromUsername || undefined },
      conversationHistory: [],
      summary: '',
      metadata: { platform: 'instagram', igsid: fromId, from_comment: true },
    };
    const result = await processMessage(input, supabase);
    dmReply = (result?.response || '').trim();
  } catch (e: any) {
    console.error('[instagram/webhook] comment engine error:', e?.message || e);
  }
  if (!dmReply) dmReply = "Thanks for reaching out! Tell me a bit about what you're looking for and I'll help right away.";

  const priv = await sendInstagramPrivateReply(commentId, dmReply);
  if (priv.success && leadId) {
    await logMessage(leadId, 'social', 'agent', dmReply, 'text', { source: 'instagram_comment_dm', igsid: fromId, comment_id: commentId, ai_generated: true }, supabase);
  } else if (!priv.success) {
    console.error('[instagram/webhook] private reply failed:', priv.error);
  }

  await sendInstagramCommentReply(commentId, "Thanks for reaching out! Just sent you a DM 💬").catch(() => {});
}

// ── Webhook receiver ─────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (!signatureOk(raw, request.headers.get('x-hub-signature-256'))) {
      console.warn('[instagram/webhook] bad signature');
      return NextResponse.json({ status: 'bad_signature' }, { status: 403 });
    }
    const body = JSON.parse(raw);
    if (body?.object !== 'instagram' && body?.object !== 'page') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const supabase = getServiceClient() || getClient();
    if (!supabase) {
      console.error('[instagram/webhook] no supabase client');
      return NextResponse.json({ status: 'no_db' }, { status: 200 });
    }

    for (const entry of (body.entry || [])) {
      const ourIgId: string = entry?.id || '';

      // DMs
      for (const m of (entry.messaging || [])) {
        const mid = m?.message?.mid || '';
        if (m?.message?.is_echo) continue;            // our own outbound echo
        const senderId = m?.sender?.id;
        const text = m?.message?.text;
        if (!senderId || senderId === ourIgId) continue;
        if (!text) continue;                          // skip attachments-only for now
        if (seen(mid)) continue;
        await handleDM(senderId, text, mid, supabase);
      }

      // Comments
      for (const change of (entry.changes || [])) {
        if (change?.field !== 'comments') continue;
        const cid = change?.value?.id || '';
        if (seen(cid)) continue;
        await handleComment(change.value, ourIgId, supabase);
      }
    }

    return NextResponse.json({ status: 'processed' }, { status: 200 });
  } catch (error) {
    console.error('[instagram/webhook] Error:', error);
    return NextResponse.json({ status: 'error_logged' }, { status: 200 });
  }
}
