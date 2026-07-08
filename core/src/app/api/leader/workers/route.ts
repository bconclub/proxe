// LEADER API — ground-team (d2d_workers) lookup, for the grievance assignment
// picker in the leader app. Read-only, minimal fields (no phone by default —
// the leader assigns by name; phone stays internal to the D2D surfaces).
// Auth: x-api-key = LEADER_API_KEY.

import { NextRequest } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { leaderAuthGate, corsJson, leaderOptions } from '@/lib/server/leaderAuth';

export const dynamic = 'force-dynamic';
export const OPTIONS = leaderOptions;

export async function GET(req: NextRequest) {
  const denied = leaderAuthGate(req);
  if (denied) return denied;
  const sb: any = getServiceClient();
  if (!sb) return corsJson({ error: 'database unavailable' }, { status: 500 });

  try {
    const constituency = req.nextUrl.searchParams.get('constituency') || undefined;
    const district = req.nextUrl.searchParams.get('district') || undefined;

    let q = sb
      .from('d2d_workers')
      .select('id, name, constituency, district, booth_assignments')
      .eq('status', 'active')
      .order('name')
      .limit(200);
    if (constituency) q = q.eq('constituency', constituency);
    else if (district) q = q.eq('district', district);

    const { data: workers, error } = await q;
    if (error) throw error;

    return corsJson({ workers: workers || [] });
  } catch (e) {
    console.error('[leader/workers]', (e as Error).message);
    return corsJson({ error: 'query failed' }, { status: 500 });
  }
}
