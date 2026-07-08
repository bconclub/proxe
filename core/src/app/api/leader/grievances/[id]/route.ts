// LEADER API — grievance routing. Moves a grievance's loop_status forward
// (raised -> routed -> resolved) and optionally assigns it to a d2d_workers
// ground-team member. This is the write path that never existed: every intake
// path (022) only ever wrote loop_status='raised'.
//
// POST not PATCH — the leader app's CORS allowlist (leaderAuth.ts) only opens
// GET/POST, matching the existing leader/intake convention.
// Auth: x-api-key = LEADER_API_KEY.

import { NextRequest } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { leaderAuthGate, corsJson, leaderOptions } from '@/lib/server/leaderAuth';

export const dynamic = 'force-dynamic';
export const OPTIONS = leaderOptions;

const STATUSES = ['routed', 'resolved'];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = leaderAuthGate(req);
  if (denied) return denied;
  const sb: any = getServiceClient();
  if (!sb) return corsJson({ error: 'database unavailable' }, { status: 500 });

  const id = params.id;
  if (!id) return corsJson({ error: 'missing id' }, { status: 400 });

  try {
    const body = await req.json().catch(() => ({} as any));
    const { status, worker_id } = body || {};
    if (!STATUSES.includes(status)) {
      return corsJson({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
    }

    if (worker_id) {
      const { data: worker, error: workerErr } = await sb
        .from('d2d_workers')
        .select('id')
        .eq('id', worker_id)
        .eq('status', 'active')
        .maybeSingle();
      if (workerErr || !worker) return corsJson({ error: 'worker not found or inactive' }, { status: 400 });
    }

    const cols: Record<string, any> = { loop_status: status };
    if (worker_id) cols.assigned_worker_id = worker_id;
    if (status === 'routed') cols.routed_at = new Date().toISOString();
    if (status === 'resolved') cols.resolved_at = new Date().toISOString();

    const { data, error } = await sb
      .from('all_leads')
      .update(cols)
      .eq('id', id)
      .eq('brand', 'pop')
      .select('id, loop_status, assigned_worker_id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return corsJson({ error: 'grievance not found' }, { status: 404 });

    return corsJson({ ok: true, id: data.id, status: data.loop_status, assignedWorkerId: data.assigned_worker_id });
  } catch (e) {
    console.error('[leader/grievances/:id]', (e as Error).message);
    return corsJson({ error: 'update failed' }, { status: 500 });
  }
}
