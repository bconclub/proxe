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

/**
 * Status model — FAILURE-DRIVEN, not idle-driven.
 *
 * Passive monitoring can't tell "service is down" from "service is up but
 * no traffic". So we only flag amber/red when we have a CONFIRMED failure
 * signal (failed Meta sends in last hour, DB slow, etc.). "No recent
 * activity" is reported as a hint, not a red status — quiet hours are
 * normal, not an outage.
 *
 * Service health rules:
 *   - inbound_*  (passive receive): always 'ok'. Show "last seen N min ago"
 *                as info. We can't tell with certainty until we add
 *                synthetic pings.
 *   - outbound_meta: 'down' if many failures in last hour, 'degraded' if
 *                some, else 'ok'.
 *   - anthropic_ai: derive from outbound_meta failures + age of last
 *                ai_generated message (only flag if BOTH stale AND failures
 *                exist — Anthropic is a downstream of every outbound).
 *   - supabase_db: latency-based.
 */
const FAILURE_RATE_RED = 5;      // ≥5 failures/hr on outbound → DOWN
const FAILURE_RATE_AMBER = 1;    // ≥1 failure/hr on outbound → DEGRADED
const DB_OK_MAX_MS = 800;
const DB_DEGRADED_MAX_MS = 2500;

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

    // Outbound is the ONE service where we have hard failure data — flag based on that.
    const failures1h = (recentSendFailures.data || []).length;
    let outboundStatus: Status = 'ok';
    if (failures1h >= FAILURE_RATE_RED) outboundStatus = 'down';
    else if (failures1h >= FAILURE_RATE_AMBER) outboundStatus = 'degraded';

    // DB: latency-based, since we measure it on every health call.
    const dbStatus: Status = dbRoundtripMs < DB_OK_MAX_MS
      ? 'ok'
      : dbRoundtripMs < DB_DEGRADED_MAX_MS ? 'degraded' : 'down';

    // AI: only flag if outbound has failures AND the failures look like Anthropic
    // errors. For now we just inherit outbound's status conservatively.
    const aiStatus: Status = outboundStatus === 'down' ? 'degraded' : 'ok';

    // Passive receive endpoints (inbound channels): we have NO active failure
    // signal — they're either receiving or they're not, and we can't tell
    // until traffic arrives. Default 'ok'. We surface last-seen as info so
    // the operator can spot suspicious quiet (e.g. usually busy at 11am
    // but suddenly nothing).
    const services = {
      inbound_meta: {
        label: 'WhatsApp Webhook (IN)',
        status: 'ok' as Status,
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
        status: 'ok' as Status,
        last_at: latestAnyLead.data?.created_at || null,
        minutes_since: inboundApiMin,
        hint: 'Website forms, PAT, demo bookings, Pabbly',
      },
      web_chat: {
        label: 'Web Chat Widget',
        status: 'ok' as Status,
        last_at: latestWebAgentMsg.data?.created_at || null,
        minutes_since: webChatMin,
        hint: 'Chat widget on windchasers.in',
      },
      anthropic_ai: {
        label: 'AI Generation (Claude)',
        status: aiStatus,
        last_at: latestAiMsg.data?.created_at || null,
        minutes_since: aiMin,
        hint: 'Anthropic API — agent replies',
      },
      google_calendar: {
        label: 'Google Calendar',
        status: 'ok' as Status,
        last_at: latestBookingLead.data?.updated_at || null,
        minutes_since: calendarMin,
        hint: 'Demo booking event creation',
      },
      supabase_db: {
        label: 'Database',
        status: dbStatus,
        roundtrip_ms: dbRoundtripMs,
        hint: 'Supabase read latency',
      },
    };

    return NextResponse.json({
      now: new Date().toISOString(),
      thresholds: {
        failure_rate_red: FAILURE_RATE_RED,
        failure_rate_amber: FAILURE_RATE_AMBER,
        db_ok_max_ms: DB_OK_MAX_MS,
        db_degraded_max_ms: DB_DEGRADED_MAX_MS,
      },
      services,
    });
  } catch (err: any) {
    console.error('[health] error:', err?.message || err);
    return NextResponse.json({ error: 'Health check failed', message: String(err?.message || err) }, { status: 500 });
  }
}
