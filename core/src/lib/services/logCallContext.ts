// Shared lead-context assembly for the log-call surfaces. Both the read-only
// `propose` route and the new `chat` route build the SAME snapshot from this
// helper, so PROXe's chat and the learning record can never drift apart. The
// server always rebuilds this itself; a client-sent snapshot is never trusted.

export interface CallContextSnapshot {
  stage: string | null
  score: number | null
  temperature: string | null
  response_count: number
  last_touchpoint: string | null
  days_since_first_touch: number | null
  service_interest: string | null
  business: string | null
  pain_point: string | null
  summary: string | null
}

// Build the "who is this lead right now" snapshot. Degrades to an all-null
// snapshot on any fetch hiccup so the caller always gets an object back.
export async function buildCallContextSnapshot(supabase: any, leadId: string): Promise<CallContextSnapshot> {
  // all_leads has NO response_count column, selecting it 400s the whole query.
  const { data: lead } = await supabase
    .from('all_leads')
    .select('lead_stage, lead_score, last_touchpoint, created_at, unified_context')
    .eq('id', leadId)
    .maybeSingle()

  const ctx = lead?.unified_context || {}
  const profile = ctx.web?.profile || ctx.profile || {}
  const daysSinceFirstTouch = lead?.created_at
    ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)
    : null

  // Reply count is not a stored column, count it live from conversations.
  const { count: responseCount } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('sender', 'customer')

  return {
    stage: lead?.lead_stage || null,
    score: lead?.lead_score ?? null,
    temperature: ctx.lead_temperature || null,
    response_count: responseCount ?? 0,
    last_touchpoint: lead?.last_touchpoint || null,
    days_since_first_touch: daysSinceFirstTouch,
    service_interest: profile.service_interest || ctx.service_interest || null,
    business: profile.company || profile.business || ctx.business || null,
    pain_point: profile.pain_point || ctx.pain_point || null,
    summary: ctx.unified_summary || null,
  }
}

// Last N messages of the conversation, oldest first, as compact role+text lines
// for the chat prompt. Best-effort: returns [] on any error.
export async function fetchRecentConversation(
  supabase: any,
  leadId: string,
  limit = 8,
): Promise<Array<{ role: 'lead' | 'agent'; text: string }>> {
  try {
    const { data } = await supabase
      .from('conversations')
      .select('sender, message, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(limit)
    const rows = (data || []).reverse()
    return rows
      .map((r: any) => ({
        role: (r.sender === 'customer' ? 'lead' : 'agent') as 'lead' | 'agent',
        text: String(r.message || '').slice(0, 400),
      }))
      .filter((m: any) => m.text)
  } catch {
    return []
  }
}
