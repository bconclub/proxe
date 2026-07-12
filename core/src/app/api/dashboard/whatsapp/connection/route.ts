/**
 * WhatsApp Connection — Embedded Signup backend (admin only).
 *
 * GET    /api/dashboard/whatsapp/connection → current connection status
 *        (DB connection, or legacy env wiring, or nothing) + whether the
 *        embedded-signup frontend is configured (app id / config id present).
 * POST   /api/dashboard/whatsapp/connection → complete an embedded signup:
 *        { code, wabaId, phoneNumberId } from the Meta popup →
 *        exchange code for a business token, subscribe our app to the WABA
 *        (webhook override to THIS deployment), register the number, store
 *        the connection in whatsapp_connections.
 * DELETE /api/dashboard/whatsapp/connection → disconnect (row → 'disconnected',
 *        sends fall back to env creds if present).
 *
 * Env:
 *   NEXT_PUBLIC_META_APP_ID      — Meta app id (public)
 *   META_APP_SECRET              — Meta app secret (server only)
 *   NEXT_PUBLIC_META_ES_CONFIG_ID— Embedded Signup configuration id (public)
 *   META_WHATSAPP_VERIFY_TOKEN   — webhook verify token (reused for override)
 *   NEXT_PUBLIC_APP_URL          — optional; webhook callback origin override
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/services';
import { getWhatsAppCreds, invalidateWhatsAppCreds } from '@/lib/services/whatsappCreds';
import { getCurrentBrandId } from '@/configs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const GRAPH = 'https://graph.facebook.com/v21.0';

async function requireAdmin() {
  const userSupabase = await createClient();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const service = getServiceClient();
  if (!service) return { error: 'Service client unavailable', status: 500 as const };
  const { data: dashboardUser } = await service
    .from('dashboard_users')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!dashboardUser) return { error: 'Account not provisioned in dashboard_users', status: 403 as const };
  if (dashboardUser.is_active === false) return { error: 'Account deactivated', status: 403 as const };
  if (dashboardUser.role !== 'admin') return { error: 'Admins only', status: 403 as const };
  return { user, service, status: 200 as const };
}

async function graphGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${GRAPH}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Graph GET ${path} → ${res.status}`);
  return body;
}

async function graphPost(path: string, token: string, payload: Record<string, any>): Promise<any> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Graph POST ${path} → ${res.status}`);
  return body;
}

// ── GET: connection status ───────────────────────────────────────────────────
export async function GET() {
  const auth = await requireAdmin();
  if (auth.status !== 200) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const embeddedSignupReady =
    !!process.env.NEXT_PUBLIC_META_APP_ID &&
    !!process.env.META_APP_SECRET &&
    !!process.env.NEXT_PUBLIC_META_ES_CONFIG_ID;

  const creds = await getWhatsAppCreds();
  if (!creds) {
    return NextResponse.json({ connected: false, source: null, embeddedSignupReady });
  }

  // Enrich with live number info (name/quality) — best-effort.
  let info: any = null;
  try {
    info = await graphGet(
      `${creds.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      creds.accessToken,
    );
  } catch { /* stale/invalid token still reports connected:true with source */ }

  return NextResponse.json({
    connected: true,
    source: creds.source,
    phoneNumberId: creds.phoneNumberId,
    wabaId: creds.wabaId,
    displayPhoneNumber: info?.display_phone_number || null,
    verifiedName: info?.verified_name || null,
    qualityRating: info?.quality_rating || null,
    tokenValid: !!info,
    embeddedSignupReady,
  });
}

// ── POST: complete embedded signup ───────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.status !== 200) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: 'Embedded signup not configured: set NEXT_PUBLIC_META_APP_ID and META_APP_SECRET' },
      { status: 500 },
    );
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { code, wabaId, phoneNumberId } = body || {};
  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json({ error: 'code, wabaId and phoneNumberId are required' }, { status: 400 });
  }

  const steps: Record<string, string> = {};
  try {
    // 1. Exchange the signup code for a business token scoped to the WABA.
    const tokenRes = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`,
    );
    const tokenBody = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenBody?.access_token) {
      throw new Error(tokenBody?.error?.message || 'Token exchange failed');
    }
    const accessToken: string = tokenBody.access_token;
    steps.tokenExchange = 'ok';

    // 2. Subscribe our app to the WABA — webhooks for this WABA route to THIS
    //    deployment (override), so multiple brands can share one Meta app.
    const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN;
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
      new URL(request.url).origin;
    const callbackUri = `${origin}/api/agent/whatsapp/meta`;
    try {
      await graphPost(`${wabaId}/subscribed_apps`, accessToken, verifyToken ? {
        override_callback_uri: callbackUri,
        verify_token: verifyToken,
      } : {});
      steps.subscribe = verifyToken ? `ok (override → ${callbackUri})` : 'ok (app-level webhook)';
    } catch (err: any) {
      // Override needs a publicly reachable URL (fails on localhost) — fall
      // back to a plain subscription so the connection still completes.
      await graphPost(`${wabaId}/subscribed_apps`, accessToken, {});
      steps.subscribe = `ok (plain — override failed: ${err?.message})`;
    }

    // 3. Register the number on Cloud API (sets the two-step PIN). A number
    //    already registered elsewhere returns an error — treat as non-fatal.
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    let registeredPin: string | null = pin;
    try {
      await graphPost(`${phoneNumberId}/register`, accessToken, {
        messaging_product: 'whatsapp',
        pin,
      });
      steps.register = 'ok';
    } catch (err: any) {
      registeredPin = null;
      steps.register = `skipped: ${err?.message}`;
    }

    // 4. Fetch number details for display.
    let info: any = null;
    try {
      info = await graphGet(
        `${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        accessToken,
      );
    } catch { /* non-fatal */ }

    // 5. Persist: retire any previous active connection, insert the new one.
    const brand = getCurrentBrandId();
    await auth.service
      .from('whatsapp_connections')
      .update({ status: 'disconnected', updated_at: new Date().toISOString() })
      .eq('brand', brand)
      .eq('status', 'active');
    const { error: insertError } = await auth.service.from('whatsapp_connections').insert({
      brand,
      waba_id: String(wabaId),
      phone_number_id: String(phoneNumberId),
      display_phone_number: info?.display_phone_number || null,
      verified_name: info?.verified_name || null,
      quality_rating: info?.quality_rating || null,
      access_token: accessToken,
      pin: registeredPin,
      status: 'active',
      connected_by: auth.user.id,
    });
    if (insertError) throw new Error(`DB insert failed: ${insertError.message} (is the whatsapp_connections migration applied?)`);
    steps.store = 'ok';

    invalidateWhatsAppCreds();
    return NextResponse.json({
      success: true,
      steps,
      displayPhoneNumber: info?.display_phone_number || null,
      verifiedName: info?.verified_name || null,
    });
  } catch (err: any) {
    console.error('[whatsapp/connection] connect failed:', err?.message, steps);
    return NextResponse.json({ error: err?.message || 'Connect failed', steps }, { status: 500 });
  }
}

// ── DELETE: disconnect ───────────────────────────────────────────────────────
export async function DELETE() {
  const auth = await requireAdmin();
  if (auth.status !== 200) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.service
    .from('whatsapp_connections')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('brand', getCurrentBrandId())
    .eq('status', 'active');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateWhatsAppCreds();
  return NextResponse.json({ success: true });
}
