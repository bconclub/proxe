/**
 * GET /api/dashboard/leads/[id]/online-results  (Lokazen, brand leads)
 *
 * Fetches REAL online info about the brand using Claude's web search tool (uses
 * the existing CLAUDE_API_KEY — no new key). Returns a short summary of what the
 * brand is + the actual source URLs found, so the lead modal can SHOW results
 * instead of just linking out. Degrades gracefully (200 with an error reason)
 * when the key or web search is unavailable, so the UI can fall back to links.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { BRAND_ID } from '@/configs'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    if (BRAND_ID !== 'lokazen') {
      return NextResponse.json({ error: 'Lokazen only' }, { status: 400 })
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: lead } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', params.id)
      .single() as { data: any }

    const lkz = lead?.unified_context?.lokazen || {}
    const brand = String(lkz.brand_name || '').trim()
    const category = String(lkz.brand_category || '').trim()
    if (!brand) return NextResponse.json({ error: 'No brand name' }, { status: 400 })

    const apiKey = process.env.CLAUDE_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, reason: 'no_key' })

    const anthropic = new Anthropic({ apiKey })
    const prompt = `Search the web for the brand "${brand}"${category ? `, a ${category} business` : ''} in Bangalore, India. In 2-3 short sentences, say what this brand is (category, what they do, notable outlets or scale). Then, only from what you actually find, note its official website and any social or listing pages as real URLs. If you cannot confidently find this specific brand, say so plainly. Never invent URLs or details.`

    let text = ''
    const sources: { title: string; url: string }[] = []
    try {
      const resp: any = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as any],
        messages: [{ role: 'user', content: prompt }],
      })
      for (const block of (resp.content || [])) {
        if (block.type === 'text') {
          text += block.text
          for (const c of (block.citations || [])) {
            if (c?.url) sources.push({ title: String(c.title || c.url), url: String(c.url) })
          }
        } else if (block.type === 'web_search_tool_result') {
          for (const r of (block.content || [])) {
            if (r?.url) sources.push({ title: String(r.title || r.url), url: String(r.url) })
          }
        }
      }
    } catch (e: any) {
      // Web search not enabled on the account, model issue, etc. — let the UI
      // fall back to the launcher links.
      return NextResponse.json({ ok: false, reason: e?.message || 'search_failed' })
    }

    const seen = new Set<string>()
    const uniqueSources = sources
      .filter((s) => { if (!s.url || seen.has(s.url)) return false; seen.add(s.url); return true })
      .slice(0, 6)

    return NextResponse.json({ ok: true, brand, category, summary: text.trim(), sources: uniqueSources })
  } catch (e: any) {
    return NextResponse.json({ ok: false, reason: e?.message || 'server_error' }, { status: 200 })
  }
}
