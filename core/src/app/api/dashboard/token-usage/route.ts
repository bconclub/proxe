/**
 * GET  /api/dashboard/token-usage → the running token-usage aggregate (TEST).
 * POST /api/dashboard/token-usage → { action: 'reset' } clears it.
 *
 * Experimental - see lib/token-usage.ts for the storage caveats.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTokenUsage, resetTokenUsage, CATEGORY_LABELS, type TokenCategory, type UsageBucket } from '@/lib/token-usage'

export const dynamic = 'force-dynamic'

// Range → number of IST calendar days to sum (null = all-time / cumulative).
const RANGE_DAYS: Record<string, number | null> = { Today: 1, '7D': 7, '14D': 14, '30D': 30, All: null }

// The last N IST day-keys ('YYYY-MM-DD'), newest first.
function lastNDayKeys(n: number): string[] {
  const keys: string[] = []
  for (let i = 0; i < n; i++) {
    keys.push(new Date(Date.now() - i * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  }
  return keys
}

// Sum a single day's category buckets into one daily totals point.
function sumDay(day: Partial<Record<TokenCategory, UsageBucket>> | undefined) {
  const acc = { input_tokens: 0, output_tokens: 0, total_tokens: 0, calls: 0, cost_usd: 0 }
  if (!day) return acc
  for (const cat of Object.keys(day) as TokenCategory[]) {
    const b = day[cat]!
    acc.input_tokens += b.input_tokens
    acc.output_tokens += b.output_tokens
    acc.total_tokens += b.input_tokens + b.output_tokens
    acc.calls += b.calls
    acc.cost_usd += b.cost_usd
  }
  return acc
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const range = new URL(request.url).searchParams.get('range') || 'All'
    const rangeDays = range in RANGE_DAYS ? RANGE_DAYS[range] : null

    const doc = await getTokenUsage()

    // All-time → cumulative byCategory. A window → sum the per-day buckets.
    let byCategory: Partial<Record<TokenCategory, UsageBucket>>
    if (rangeDays == null) {
      byCategory = doc?.byCategory || {}
    } else {
      const byDay = doc?.byDay || {}
      const keys = new Set(lastNDayKeys(rangeDays))
      byCategory = {}
      for (const dayKey of Object.keys(byDay)) {
        if (!keys.has(dayKey)) continue
        for (const cat of Object.keys(byDay[dayKey]) as TokenCategory[]) {
          const src = byDay[dayKey][cat]!
          const dst = byCategory[cat] || { input_tokens: 0, output_tokens: 0, calls: 0, cost_usd: 0 }
          dst.input_tokens += src.input_tokens
          dst.output_tokens += src.output_tokens
          dst.calls += src.calls
          dst.cost_usd += src.cost_usd
          byCategory[cat] = dst
        }
      }
    }

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

    // Daily series for the trend chart. For a window, show exactly that many
    // days (oldest→newest, zero-filling days with no spend so gaps are visible).
    // For "All", show every recorded day in order.
    const byDay = doc?.byDay || {}
    let dayKeys: string[]
    if (rangeDays == null) {
      dayKeys = Object.keys(byDay).sort()
    } else {
      dayKeys = lastNDayKeys(rangeDays).reverse()
    }
    const daily = dayKeys.map((date) => ({ date, ...sumDay(byDay[date]) }))

    return NextResponse.json({
      rows,
      totals,
      daily,
      range,
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
