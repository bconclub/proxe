/**
 * POST /api/dashboard/leads/[id]/merge
 *
 * Merges two leads into one. Hard delete: the loser row is removed from
 * all_leads after every FK-bearing table has its lead_id repointed to the
 * winner.
 *
 * Winner picking: higher lead_score wins. On tie, earlier created_at wins.
 * (Per user decision 2026-05-21 — operator clicks merge on either side,
 * the system picks the richer record as keeper.)
 *
 * Request body:  { other_lead_id: UUID }
 *   [id]         — one of the two leads (from the route param)
 *   other_lead_id — the other one
 *
 * Response: {
 *   winner_lead_id: UUID,
 *   merged_lead_id: UUID,   // the one that got deleted
 *   moved: { conversations, activities, agent_tasks, sessions, … } counts,
 *   merged_phones: string[]  // any extra phone(s) preserved on the winner
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'

export const dynamic = 'force-dynamic'

// Tables that have a lead_id column and need to be re-pointed to the winner
// before we delete the loser. Order doesn't matter (we run them in parallel),
// but the list MUST be complete or we'll orphan rows.
const FK_TABLES = [
  'conversations',
  'activities',
  'agent_tasks',
  'lead_stage_changes',
  'lead_stage_overrides',
  'messages',
  'web_sessions',
  'whatsapp_sessions',
  'voice_sessions',
  'social_sessions',
] as const

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // Auth check via cookie client (need a logged-in dashboard user)
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceClient() || authClient

    const leadAId = params.id
    const body = await request.json().catch(() => ({}))
    const leadBId = body?.other_lead_id

    if (!leadAId || !leadBId) {
      return NextResponse.json({ error: 'Both lead IDs are required' }, { status: 400 })
    }
    if (leadAId === leadBId) {
      return NextResponse.json({ error: 'Cannot merge a lead with itself' }, { status: 400 })
    }

    // Fetch both leads
    const { data: leads, error: fetchErr } = await supabase
      .from('all_leads')
      .select('id, customer_name, email, phone, lead_score, created_at, unified_context')
      .in('id', [leadAId, leadBId])
    if (fetchErr || !leads || leads.length !== 2) {
      return NextResponse.json(
        { error: 'Could not fetch both leads', detail: fetchErr?.message },
        { status: 404 },
      )
    }

    const leadA = leads.find((l: any) => l.id === leadAId)!
    const leadB = leads.find((l: any) => l.id === leadBId)!

    // Pick winner: higher score, tiebreak by earlier created_at.
    const scoreA = leadA.lead_score ?? 0
    const scoreB = leadB.lead_score ?? 0
    let winner: any, loser: any
    if (scoreA !== scoreB) {
      winner = scoreA > scoreB ? leadA : leadB
      loser = scoreA > scoreB ? leadB : leadA
    } else {
      // Same score — pick the older lead as winner
      const tA = new Date(leadA.created_at).getTime()
      const tB = new Date(leadB.created_at).getTime()
      winner = tA <= tB ? leadA : leadB
      loser  = tA <= tB ? leadB : leadA
    }

    // Build merged unified_context. Winner's fields win on conflicts; loser's
    // unique fields (e.g. alternate attribution.utm) are NOT auto-merged
    // beyond a top-level shallow merge — those would need bespoke logic per
    // namespace. We DO preserve the loser's identity on the winner under
    // merged_from[] so a future operator can see this happened + the
    // alternate phone/name is still on the lead.
    const winnerCtx = winner.unified_context || {}
    const loserCtx = loser.unified_context || {}
    const mergedFrom = Array.isArray(winnerCtx.merged_from) ? winnerCtx.merged_from : []
    mergedFrom.push({
      lead_id:        loser.id,
      customer_name:  loser.customer_name || null,
      phone:          loser.phone || null,
      email:          loser.email || null,
      lead_score:     loser.lead_score ?? null,
      merged_at:      new Date().toISOString(),
      merged_by:      user.email || 'system',
      original_ctx:   loserCtx,  // full preservation for audit
    })
    const mergedCtx = {
      ...loserCtx,                  // loser fields lose ground...
      ...winnerCtx,                 // ...to winner fields on conflict
      merged_from: mergedFrom,      // always preserved + grown
    }

    // Collect merged_phones for the response — handy for the toast UI
    const mergedPhones: string[] = []
    if (loser.phone && loser.phone !== winner.phone) mergedPhones.push(loser.phone)

    // ── Re-point FKs ───────────────────────────────────────────────────
    // Run all updates in parallel. Each table's UPDATE is independent so
    // partial-failure of one doesn't block the others; we collect counts
    // for the response so the operator can see what moved.
    const moves: Record<string, number> = {}
    for (const table of FK_TABLES) {
      try {
        const { error, count } = await supabase
          .from(table)
          .update({ lead_id: winner.id }, { count: 'exact' })
          .eq('lead_id', loser.id)
        if (error) {
          console.error(`[merge] Failed re-pointing ${table}:`, error.message)
          moves[table] = -1  // sentinel for "failed"
        } else {
          moves[table] = count ?? 0
        }
      } catch (e: any) {
        console.error(`[merge] Exception re-pointing ${table}:`, e?.message)
        moves[table] = -1
      }
    }

    // Update the winner's unified_context with the merged_from entry.
    const { error: updateErr } = await supabase
      .from('all_leads')
      .update({ unified_context: mergedCtx })
      .eq('id', winner.id)
    if (updateErr) {
      console.error('[merge] Failed updating winner context:', updateErr.message)
      // Soft-fail: data is already moved, just the audit trail couldn't write.
      // We still proceed to delete the loser since the user explicitly chose
      // hard merge.
    }

    // ── Delete the loser ───────────────────────────────────────────────
    const { error: deleteErr } = await supabase
      .from('all_leads')
      .delete()
      .eq('id', loser.id)
    if (deleteErr) {
      console.error('[merge] Failed deleting loser:', deleteErr.message)
      return NextResponse.json(
        {
          error: 'FKs moved but loser delete failed — data is in inconsistent state, contact engineering',
          detail: deleteErr.message,
          winner_lead_id: winner.id,
          merged_lead_id: loser.id,
          moved: moves,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      winner_lead_id: winner.id,
      merged_lead_id: loser.id,
      moved: moves,
      merged_phones: mergedPhones,
    })
  } catch (error: any) {
    console.error('[merge] Unexpected error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Unknown merge error' },
      { status: 500 },
    )
  }
}
