import { getServiceClient } from '@/lib/services'
import { BRAND_ID, getBrandConfig } from '@/configs'

/**
 * Answering questions asked in the group.
 *
 * "@proxe how many leads today from Facebook?" has to come back with a number,
 * not a menu. So this reads the question for three things - a PERIOD, a
 * METRIC and a FILTER - and runs the one query that answers it.
 *
 * Deliberately NOT an LLM call. The questions a sales group actually asks are
 * a small, closed set ("how many leads", "how many calls", "from Instagram",
 * "yesterday"), and a parser answers them in a hundred milliseconds for free,
 * with no chance of inventing a number. Anything it cannot read gets an honest
 * "I can answer these" rather than a confident guess.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

function istMidnight(daysAgo = 0): Date {
  const ist = new Date(Date.now() + IST_OFFSET_MS)
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysAgo) - IST_OFFSET_MS,
  )
}

type Period = { label: string; from: Date; to: Date }

function readPeriod(q: string): Period {
  if (/yesterday/.test(q)) {
    return { label: 'yesterday', from: istMidnight(1), to: istMidnight(0) }
  }
  if (/this week|last 7|past week|week/.test(q)) {
    return { label: 'the last 7 days', from: istMidnight(6), to: new Date() }
  }
  if (/this month|last 30|past month|month/.test(q)) {
    return { label: 'the last 30 days', from: istMidnight(29), to: new Date() }
  }
  return { label: 'today', from: istMidnight(0), to: new Date() }
}

/** Which platform, if the question names one. */
function readSource(q: string): { key: string; label: string } | null {
  if (/instagram|insta|\big\b/.test(q)) return { key: 'instagram', label: 'Instagram' }
  if (/facebook|\bfb\b|meta/.test(q)) return { key: 'facebook', label: 'Facebook' }
  if (/google|adwords|search/.test(q)) return { key: 'google', label: 'Google' }
  if (/whatsapp|\bwa\b/.test(q)) return { key: 'whatsapp', label: 'WhatsApp' }
  if (/website|\bweb\b|form/.test(q)) return { key: 'website', label: 'the website' }
  return null
}

/** Which kind of lead, if the question names one. */
function readCategory(q: string): { key: string; label: string } | null {
  if (/cabin|crew/.test(q)) return { key: 'cabin', label: 'cabin crew' }
  if (/pilot|dgca|cpl|flying/.test(q)) return { key: 'pilot', label: 'pilot / DGCA' }
  if (/scholarship/.test(q)) return { key: 'scholarship', label: 'scholarship' }
  if (/offline event|event|wings|freedom/.test(q)) return { key: 'event', label: 'the offline event' }
  if (/webinar|online event|zoom/.test(q)) return { key: 'webinar', label: 'the webinar' }
  return null
}

const sourceMatches = (row: any, key: string): boolean => {
  const both = `${row.attr_label || ''} ${row.attr_source || ''} ${row.first_touchpoint || ''} ${row.last_touchpoint || ''}`.toLowerCase()
  if (key === 'instagram') return /instagram|\big\b/.test(both)
  if (key === 'facebook') return /facebook|\bfb\b|meta/.test(both)
  if (key === 'google') return /google/.test(both)
  if (key === 'whatsapp') return /whatsapp|\bwa\b/.test(both)
  if (key === 'website') return /form|web|site|landing/.test(both)
  return false
}

const categoryMatches = (row: any, key: string): boolean => {
  const course = String(row.wc_course || '').toLowerCase()
  const type = String(row.wc_type || '').toLowerCase()
  if (key === 'cabin') return /cabin|crew|air ?host/.test(course)
  if (key === 'pilot') return /pilot|dgca|cpl|ppl|flight|aviation/.test(course)
  if (key === 'scholarship') return !!row.wc_applied
  if (key === 'event') return type === 'offline_event' || !!row.wc_event
  if (key === 'webinar') return type === 'webinar' || !!row.wc_web_reg
  return false
}

const HELP = [
  'Ask me things like:',
  '• how many leads today',
  '• leads from Instagram yesterday',
  '• cabin crew leads this week',
  '• how many calls today',
  '• how many booked today',
  '• how many demos taken',
  '• scholarship applications this week',
].join('\n')

/**
 * Answer a question. Returns HTML ready for Telegram, or null when the text
 * was not a question for us at all.
 */
export async function answerQuestion(raw: string): Promise<string | null> {
  const q = String(raw || '').toLowerCase().trim()
  if (!q) return null
  if (/^\/?help\b|what can you|commands/.test(q)) return HELP

  const supabase: any = getServiceClient()
  if (!supabase) return 'I cannot reach the database right now.'

  const period = readPeriod(q)
  const from = period.from.toISOString()
  const to = period.to.toISOString()

  // CALLS
  if (/\bcalls?\b|called|dial/.test(q) && !/booked|booking/.test(q)) {
    // 'note' counts too: one counsellor records every call as a note, so
    // counting only activity_type='call' reported her as idle while she owned
    // more leads than anyone.
    const { data } = await supabase
      .from('activities')
      .select('id, created_by')
      .in('activity_type', ['call', 'manual_call', 'note'])
      .gte('created_at', from)
      .lt('created_at', to)
    const rows = data || []
    const byUser = new Map<string, number>()
    for (const r of rows) if (r.created_by) byUser.set(r.created_by, (byUser.get(r.created_by) || 0) + 1)

    // Everyone active, zeros included - a zero says more than a missing name.
    const { data: us } = await supabase
      .from('dashboard_users')
      .select('id, full_name, email')
      .eq('is_active', true)
    // Only the people whose job is calling - see brandConfig.callers.
    const callerList = (getBrandConfig().callers || []).map((e: string) => e.toLowerCase())
    const who = (us || [])
      .filter((u: any) => !callerList.length || callerList.includes(String(u.email || '').toLowerCase()))
      .map((u: any) => ({
        name: u.full_name || (u.email || '').split('@')[0] || 'Someone',
        n: byUser.get(u.id) || 0,
      }))
      .sort((a: any, b: any) => b.n - a.n || a.name.localeCompare(b.name))
      .map((r: any) => `${r.name} - <b>${r.n}</b>`)
      .join('\n')
    return `<b>${rows.length}</b> calls logged ${period.label}.\n${who}`
  }

  // DEMOS TAKEN
  if (/demos? taken|demos? done|actual demo/.test(q)) {
    const { count } = await supabase
      .from('lead_stage_changes')
      .select('id', { count: 'exact', head: true })
      .in('new_stage', ['Demo Taken', 'Demo Done', 'Call Done'])
      .gte('created_at', from)
      .lt('created_at', to)
    return `<b>${count || 0}</b> demos taken ${period.label}.`
  }

  // BOOKINGS
  if (/book(ed|ing)/.test(q)) {
    const { data } = await supabase
      .from('all_leads')
      .select(`id,
               wa_d:unified_context->whatsapp->>booking_date,
               vo_d:unified_context->voice->>booking_date,
               web_d:unified_context->web->>booking_date,
               so_d:unified_context->social->>booking_date`)
      .eq('lead_stage', 'Booking Made')
      .limit(500)
    const day = new Date(period.from.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
    const n = (data || []).filter((l: any) => {
      const d = l.wa_d || l.vo_d || l.web_d || l.so_d
      return d && String(d).slice(0, 10) === day
    }).length
    return `<b>${n}</b> calls booked for ${period.label === 'today' ? 'today' : period.label}.`
  }

  // LEADS - the default, and the only one that takes a source or a category.
  const source = readSource(q)
  const category = readCategory(q)
  const { data: leads } = await supabase
    .from('all_leads')
    .select(`id, first_touchpoint, last_touchpoint,
             wc_type:unified_context->${BRAND_ID}->>lead_type,
             wc_course:unified_context->${BRAND_ID}->>course_interest,
             wc_event:unified_context->${BRAND_ID}->>offline_event_key,
             wc_applied:unified_context->${BRAND_ID}->>scholarship_applied_at,
             wc_web_reg:unified_context->${BRAND_ID}->>webinar_registered_at,
             attr_label:unified_context->attribution->>source_label,
             attr_source:unified_context->attribution->>source`)
    .gte('created_at', from)
    .lt('created_at', to)
    .limit(2000)

  let rows = leads || []
  const bits: string[] = []
  if (source) { rows = rows.filter((r: any) => sourceMatches(r, source.key)); bits.push(`from ${source.label}`) }
  if (category) { rows = rows.filter((r: any) => categoryMatches(r, category.key)); bits.push(category.label) }

  const what = bits.length ? `${bits.join(' ')} leads` : 'leads'
  return `<b>${rows.length}</b> ${what} ${period.label}.`
}

export { HELP }
