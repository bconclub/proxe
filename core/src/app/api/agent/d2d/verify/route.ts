// D2D — QR badge verification. The field app (or anyone scanning a worker's
// badge) checks a verification_code and gets the worker's identity + booth
// assignments back. Auth: x-api-key = INBOUND_API_KEY (machine intake).

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { getCurrentBrandId } from '@/configs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (getCurrentBrandId() !== 'pop') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const expected = process.env.INBOUND_API_KEY;
  if (!expected || req.headers.get('x-api-key') !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb: any = getServiceClient();
  if (!sb) return NextResponse.json({ error: 'database unavailable' }, { status: 500 });

  try {
    const { code } = await req.json().catch(() => ({} as any));
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }

    const { data: worker, error } = await sb.from('d2d_workers')
      .select('name, constituency, district, booth_assignments, status')
      .eq('verification_code', code.trim().toUpperCase())
      .maybeSingle();
    if (error) throw error;

    if (!worker || worker.status !== 'active') {
      return NextResponse.json({ ok: false, error: 'no active worker for this code' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      worker: {
        name: worker.name,
        constituency: worker.constituency,
        district: worker.district,
        booth_assignments: worker.booth_assignments || [],
      },
    });
  } catch (e) {
    console.error('[d2d/verify]', (e as Error).message);
    return NextResponse.json({ error: 'verification failed' }, { status: 500 });
  }
}
