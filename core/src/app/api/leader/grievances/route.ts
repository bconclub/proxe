// LEADER API - individual grievances (not category rollups - leader/issues
// already covers that). Lets the leader app list actionable grievance rows
// (id, text, seat, loop_status) so a specific one - "contaminated drinking
// water" - can be routed to a ground-team worker via
// POST /api/leader/grievances/:id.
// Auth: x-api-key = LEADER_API_KEY.

import { NextRequest } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { leaderAuthGate, corsJson, leaderOptions } from '@/lib/server/leaderAuth';

export const dynamic = 'force-dynamic';
export const OPTIONS = leaderOptions;

const STATUSES = ['raised', 'routed', 'resolved'];

export async function GET(req: NextRequest) {
  const denied = leaderAuthGate(req);
  if (denied) return denied;
  const sb: any = getServiceClient();
  if (!sb) return corsJson({ error: 'database unavailable' }, { status: 500 });

  try {
    const constituency = req.nextUrl.searchParams.get('constituency') || undefined;
    const status = req.nextUrl.searchParams.get('status') || undefined;
    const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10) || 50);

    let q = sb
      .from('vw_war_room_base')
      .select('id, name, constituency, district, grievance_category, grievance_text, salience, loop_status, assigned_worker_id, routed_at, resolved_at, created_at')
      .not('grievance_category', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (constituency) q = q.eq('constituency', constituency);
    if (status && STATUSES.includes(status)) q = q.eq('loop_status', status);

    const { data: rows, error } = await q;
    if (error) throw error;

    // Small secondary lookup so the list can show who a grievance is assigned
    // to, without relying on PostgREST embeds through a view.
    const workerIds = Array.from(new Set((rows || []).map((r: any) => r.assigned_worker_id).filter(Boolean)));
    let workersById: Record<string, { name: string; phone: string }> = {};
    if (workerIds.length) {
      const { data: workers } = await sb.from('d2d_workers').select('id, name, phone').in('id', workerIds);
      workersById = Object.fromEntries((workers || []).map((w: any) => [w.id, { name: w.name, phone: w.phone }]));
    }

    const grievances = (rows || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      constituency: r.constituency,
      district: r.district,
      category: r.grievance_category,
      text: r.grievance_text,
      salience: r.salience,
      status: r.loop_status,
      assignedWorker: r.assigned_worker_id ? { id: r.assigned_worker_id, ...workersById[r.assigned_worker_id] } : null,
      routedAt: r.routed_at,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
    }));

    return corsJson({ grievances });
  } catch (e) {
    console.error('[leader/grievances]', (e as Error).message);
    return corsJson({ error: 'query failed' }, { status: 500 });
  }
}
