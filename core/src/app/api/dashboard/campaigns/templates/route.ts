/**
 * GET /api/dashboard/campaigns/templates — the Templates rail on the campaign
 * workspace. Approved = the brand's Meta-approved registry; Draft = template
 * drafts saved on planned campaigns. Each entry carries a `kind` derived from
 * its name (reminder / nudge / welcome / promo) so the rail's filter pills work.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { BRAND_ID } from '@/configs'
import { WA_TEMPLATE_BODIES } from '@/configs/whatsapp-template-bodies'

export const dynamic = 'force-dynamic'

function kindOf(name: string): 'reminder' | 'nudge' | 'welcome' | 'promo' {
  const n = name.toLowerCase()
  if (n.includes('reminder')) return 'reminder'
  if (n.includes('nudge') || n.includes('rnr')) return 'nudge'
  if (n.includes('welcome')) return 'welcome'
  return 'promo'
}

export async function GET() {
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Approved registry — windchasers content, gated by brand (other brands
    // start with drafts only).
    const approved = BRAND_ID === 'windchasers'
      ? Object.entries(WA_TEMPLATE_BODIES).map(([name, t]) => ({
          name,
          body: t.body,
          footer: t.footer || null,
          buttons: t.buttons || null,
          status: 'approved' as const,
          kind: kindOf(name),
        }))
      : []

    // Draft templates riding on planned campaigns (campaigns_v1 store).
    const drafts: any[] = []
    const service: any = getServiceClient()
    if (service) {
      const { data } = await service
        .from('dashboard_settings')
        .select('value')
        .eq('key', 'campaigns_v1')
        .maybeSingle()
      const campaigns = (data?.value as any)?.campaigns || []
      const seen = new Set<string>()
      for (const c of campaigns) {
        const t = c?.template
        if (t && t.status === 'draft' && t.name && !seen.has(t.name)) {
          seen.add(t.name)
          drafts.push({
            name: t.name,
            body: t.body || '',
            footer: t.footer || null,
            buttons: t.buttons || null,
            status: 'draft' as const,
            kind: kindOf(t.name),
          })
        }
      }
    }

    return NextResponse.json({ templates: [...approved, ...drafts] })
  } catch (error) {
    console.error('[campaigns/templates] failed:', error)
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  }
}
