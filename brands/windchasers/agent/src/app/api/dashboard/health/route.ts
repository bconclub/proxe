/**
 * GET /api/dashboard/health
 *
 * Passive endpoint-health summary derived from real traffic. No synthetic
 * pings — we read existing tables and infer "is this thing working?" from
 * the latest successful event per service.
 *
 * Thresholds (founder-chosen — aggressive):
 *   >15 min idle = degraded (amber)
 *   >45 min idle = down     (red)
 *   plus: >5 send failures in last hour on outbound_meta = degraded regardless
 *
 * Response shape:
 * {
 *   now: ISO,
 *   services: {
 *     inbound_meta:    { status, last_at, minutes_since, hint }
 *     outbound_meta:   { status, last_success_at, recent_failures_1h, recent_failure_samples: [{phone, error, at}] }
 *     inbound_api:     { status, last_at, minutes_since }
 *     web_chat:        { status, last_at, minutes_since }
 *     anthropic_ai:    { status, last_at, minutes_since }
 *     google_calendar: { status, last_at, minutes_since }
 *     supabase_db:     { status, roundtrip_ms }
 *   }
 * }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/services';

export const dynamic = 'force-dynamic';

type Status = 'ok' | 'degraded' | 'down' | 'unknown';

const AMBER_AFTER_MIN = 15;
const RED_AFTER_MIN = 45;
const FAILURE_RATE_THRESHOLD = 5; // failures/hour to flip outbound_meta to degraded

function statusFromIdleMinutes(min: number | null): Status {
  if (min == null) return 'unknown';
  if (min < AMBER_AFTER_MIN) return 'ok';
  if (min < RED_AFTER_MIN) return 'degraded';
  return 'down';
}

function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 60_000);
}

export async function GET() {
  try {
    // Auth: require dashboard user
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const dbStart = Date.now();
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

    // Fire all the queries in parallel — these are cheap, indexed reads.
    const [
      latestCustomerWA,
      latestAgentWASuccess,
      recentSendFailures,
      latestAnyLead,
      latestWebAgentMsg,
      latestAiMsg,
      latestBookingLead,
    ] = await Promise.all([
      // inbound_meta: most recent customer WA message
      supabase
        .from('conversations')
        .select('created_at')
        .eq('channel', 'whatsapp')
        .eq('sender', 'customer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // outbound_meta: most recent agent WA send that captured a wa_message_id
      supabase
        .from('conversations')
        .select('created_at, metadata')
        .eq('channel', 'whatsapp')
        .eq('sender', 'agent')
        .not('metadata->>wa_message_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // outbound_meta: recent failures in last hour (with samples)
      supabase
        .from('conversations')
        .select('created_at, metadata, lead_id')
        .eq('channel', 'whatsapp')
        .eq('sender', 'agent')
        .gte('created_at', oneHourAgo)
        .eq('metadata->>send_succeeded', 'false')
        .order('created_at', { ascending: false })
        .limit(10),
      // inbound_api: most recent lead created (any source — form / api / pabbly)
      supabase
        .from('all_leads')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // web_chat: most recent web agent message
      supabase
        .from('conversations')
        .select('created_at')
        .eq('channel', 'web')
        .eq('sender', 'agent')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // anthropic_ai: most recent AI-generated agent message (any channel)
      supabase
        .from('conversations')
        .select('created_at')
        .eq('sender', 'agent')
        .eq('metadata->>ai_generated', 'true')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // google_calendar: most recent lead with a booking event id
      supabase
        .from('all_leads')
        .select('unified_context, updated_at')
        .not('unified_context->web->booking->>eventId', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const dbRoundtripMs = Date.now() - dbStart;

    // ── Build per-service status ─────────────────────────────────────────
    const inboundMetaMin = minutesSince(latestCustomerWA.data?.created_at);
    const outboundMetaMin = minutesSince(latestAgentWASuccess.data?.created_at);
    const inboundApiMin = minutesSince(latestAnyLead.data?.created_at);
    const webChatMin = minutesSince(latestWebAgentMsg.data?.created_at);
    const aiMin = minutesSince(latestAiMsg.data?.created_at);
    const calendarMin = minutesSince(latestBookingLead.data?.updated_at);

    // outbound_meta has an extra failure-rate condition
    const failures1h = (recentSendFailures.data || []).length;
    let outboundStatus: Status = statusFromIdleMinutes(outboundMetaMin);
    if (failures1h >= FAILURE_RATE_THRESHOLD && outboundStatus === 'ok') {
      outboundStatus = 'degraded';
    }

    const services = {
      inbound_meta: {
        label: 'WhatsApp Webhook (IN)',
        status: statusFromIdleMinutes(inboundMetaMin),
        last_at: latestCustomerWA.data?.created_at || null,
        minutes_since: inboundMetaMin,
        hint: 'Customer messages reaching us via Meta',
      },
      outbound_meta: {
        label: 'WhatsApp Send (OUT)',
        status: outboundStatus,
        last_success_at: latestAgentWASuccess.data?.created_at || null,
        minutes_since: outboundMetaMin,
        recent_failures_1h: failures1h,
        recent_failure_samples: (recentSendFailures.data || []).slice(0, 5).map((r: any) => ({
          at: r.created_at,
          lead_id: r.lead_id,
          template: r.metadata?.template_name || null,
          error: r.metadata?.send_error || 'unknown',
        })),
        hint: 'Templates + replies going out via Meta Graph API',
      },
      inbound_api: {
        label: 'Inbound API (Forms / Pabbly)',
        status: statusFromIdleMinutes(inboundApiMin),
        last_at: latestAnyLead.data?.created_at || null,
        minutes_since: inboundApiMin,
        hint: 'Website forms, PAT, demo bookings, Pabbly',
      },
      web_chat: {
        label: 'Web Chat Widget',
        status: statusFromIdleMinutes(webChatMin),
        last_at: latestWebAgentMsg.data?.created_at || null,
        minutes_since: webChatMin,
        hint: 'Chat widget on windchasers.in',
      },
      anthropic_ai: {
        label: 'AI Generation (Claude)',
        status: statusFromIdleMinutes(aiMin),
        last_at: latestAiMsg.data?.created_at || null,
        minutes_since: aiMin,
        hint: 'Anthropic API — agent replies',
      },
      google_calendar: {
        label: 'Google Calendar',
        status: statusFromIdleMinutes(calendarMin),
        last_at: latestBookingLead.data?.updated_at || null,
        minutes_since: calendarMin,
        hint: 'Demo booking event creation',
      },
      supabase_db: {
        label: 'Database',
        // If we got here, DB roundtripped — categorise on latency.
        status: (dbRoundtripMs < 800 ? 'ok' : dbRoundtripMs < 2500 ? 'degraded' : 'down') as Status,
        roundtrip_ms: dbRoundtripMs,
        hint: 'Supabase read latency',
      },
    };

    return NextResponse.json({
      now: new Date().toISOString(),
      thresholds: { amber_after_min: AMBER_AFTER_MIN, red_after_min: RED_AFTER_MIN, failure_rate_per_hour: FAILURE_RATE_THRESHOLD },
      services,
    });
  } catch (err: any) {
    console.error('[health] error:', err?.message || err);
    return NextResponse.json({ error: 'Health check failed', message: String(err?.message || err) }, { status: 500 });
  }
}
