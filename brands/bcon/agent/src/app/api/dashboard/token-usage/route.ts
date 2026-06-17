/**
 * GET  /api/dashboard/token-usage → the running token-usage aggregate (TEST).
 * POST /api/dashboard/token-usage → { action: 'reset' } clears it.
 *
 * Experimental — see lib/token-usage.ts for the storage caveats.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTokenUsage, resetTokenUsage, CATEGORY_LABELS, type TokenCategory } from '@/lib/token-usage'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const doc = await getTokenUsage()
    const byCategory = doc?.byCategory || {}

    const rows = (Object.keys(byCategory) as TokenCategory[]).map((cat) => {
      const b = byCategory[cat]!
      return {
        category: cat,
        label: CATEGORY_LABELS[cat] || cat,
        input_tokens: b.input_tokens,
        output_tokens: b.output_tokens,
        total_tokens: b.input_tokens + b.output_tokens,
        calls: b.calls,
        cost_usd: b.cost_usd,
      }
    }).sort((a, b) => b.cost_usd - a.cost_usd)

    const totals = rows.reduce(
      (acc, r) => ({
        input_tokens: acc.input_tokens + r.input_tokens,
        output_tokens: acc.output_tokens + r.output_tokens,
        total_tokens: acc.total_tokens + r.total_tokens,
        calls: acc.calls + r.calls,
        cost_usd: acc.cost_usd + r.cost_usd,
      }),
      { input_tokens: 0, output_tokens: 0, total_tokens: 0, calls: 0, cost_usd: 0 },
    )

    return NextResponse.json({
      rows,
      totals,
      since: doc?.since || null,
      updatedAt: doc?.updatedAt || null,
    })
  } catch (error) {
    console.error('[token-usage] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch token usage' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    if (body?.action === 'reset') {
      await resetTokenUsage()
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('[token-usage] POST error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
