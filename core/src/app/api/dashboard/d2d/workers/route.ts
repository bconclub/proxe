// D2D CADRE REGISTRY - the tier-4 people. Dashboard-side management.
//
//   GET  → { workers: [...+knock counts] }                      (cookie auth)
//   POST { name, phone, ... } → { ok, id, verification_code }   (cookie auth)
//
// Registering a worker: person-merges them into all_leads (phone = merge key)
// and links lead_id - the DB trigger (026) promotes that person to intensity 4.
// verification_code goes on the worker's QR badge; the field app verifies it
// via POST /api/agent/d2d/verify.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceClient, ensureOrUpdateLead } from '@/lib/services';
import { BRAND_ID } from '@/configs';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb: any = getServiceClient() || authClient;
    const { data: workers, error } = await sb.from('d2d_workers')
      .select('id, created_at, name, phone, lead_id, constituency, district, booth_assignments, verification_code, status')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    // Knock counts per worker (worker_phone joins visits to the registry).
    const phones = (workers || []).map((w: any) => w.phone).filter(Boolean);
    const knockCount = new Map<string, { visits: number; met: number }>();
    if (phones.length) {
      const { data: visits } = await sb.from('d2d_visits')
        .select('worker_phone, outcome')
        .in('worker_phone', phones)
        .limit(10000);
      (visits || []).forEach((v: any) => {
        const a = knockCount.get(v.worker_phone) || { visits: 0, met: 0 };
        a.visits++; if (v.outcome === 'met') a.met++;
        knockCount.set(v.worker_phone, a);
      });
    }

    return NextResponse.json({
      workers: (workers || []).map((w: any) => ({
        ...w,
        knocks: knockCount.get(w.phone)?.visits || 0,
        met: knockCount.get(w.phone)?.met || 0,
      })),
    });
  } catch (e) {
    console.error('[d2d/workers] GET:', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb: any = getServiceClient();
    if (!sb) return NextResponse.json({ error: 'database unavailable' }, { status: 500 });

    const body = await req.json().catch(() => ({} as any));
    const { name, phone, constituency, district, booth_assignments } = body || {};
    if (!name || typeof name !== 'string') return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const normPhone = phone ? String(phone).replace(/\D/g, '').slice(-10) : '';
    if (normPhone.length !== 10) return NextResponse.json({ error: 'a valid 10-digit phone is required' }, { status: 400 });

    // A cadre IS a person - merge into all_leads first (trigger promotes to
    // tier 4 once the worker row lands with this lead_id).
    const leadId = await ensureOrUpdateLead(name, null, normPhone, 'web', undefined, sb);
    if (leadId && (constituency || district)) {
      const cols: Record<string, any> = { engagement_type: 'volunteer' };
      if (constituency) cols.constituency = constituency;
      if (district) cols.district = district;
      await sb.from('all_leads').update(cols).eq('id', leadId);
    }

    // Short, badge-friendly verification code (e.g. POP-8F3K2C).
    const code = 'POP-' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

    const { data, error } = await sb.from('d2d_workers')
      .upsert({
        name,
        phone: normPhone,
        lead_id: leadId,
        constituency: constituency || null,
        district: district || null,
        booth_assignments: Array.isArray(booth_assignments) ? booth_assignments : [],
        verification_code: code,
        status: 'active',
        brand: BRAND_ID,
      }, { onConflict: 'phone' })
      .select('id, verification_code')
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, id: data.id, verification_code: data.verification_code, leadId });
  } catch (e) {
    console.error('[d2d/workers] POST:', e);
    return NextResponse.json({ error: 'failed to register worker' }, { status: 500 });
  }
}
