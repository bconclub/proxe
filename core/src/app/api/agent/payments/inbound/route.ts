/**
 * POST /api/agent/payments/inbound
 *
 * Payment events pushed from the Lokazen website (checkout / gateway webhook).
 *
 * Why this exists: a customer paid on the website, then asked the WhatsApp agent
 * "where is my receipt / I already paid" and the agent had NO visibility - it
 * answered "I don't have visibility into payment status on my end", which reads
 * terrible to someone who just paid. Payment facts now land on the lead and are
 * injected into every prompt via the KNOWN DETAILS block, so the agent can
 * confirm the plan, the amount and hand over the receipt link.
 *
 * Auth: x-api-key header must equal INBOUND_API_KEY (same secret the lead webhook
 * uses). Matching: normalized phone first, then email. Idempotent on payment_id.
 *
 * Body (only phone-or-email + status are required):
 * {
 *   "phone": "+919743800606",          // E.164 or local; matched on last 10 digits
 *   "email": "zamzeer@gmail.com",
 *   "name": "Zamzeer Ahamed",
 *   "event": "payment_succeeded",       // payment_succeeded | payment_failed | refunded
 *   "status": "paid",                   // paid | failed | refunded | pending
 *   "plan": "Starter",                  // Starter | Professional | Premium
 *   "amount": 4999, "currency": "INR",
 *   "payment_id": "pay_XXXX", "order_id": "order_XXXX",
 *   "receipt_url": "https://...", "invoice_url": "https://...",
 *   "paid_at": "2026-07-29T08:41:00Z",
 *   "gateway": "razorpay",
 *   "dashboard_status": "active",       // active | pending_activation
 *   "notes": "free text"
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/services'
import { notifySlackLead } from '@/lib/services/slackNotifier'
import { BRAND_ID, getBrandConfig } from '@/configs'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const key = request.headers.get('x-api-key')?.trim()
  if (!key || key !== process.env.INBOUND_API_KEY?.trim()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const phone = String(body?.phone || '').replace(/\D/g, '').slice(-10)
  const email = String(body?.email || '').trim().toLowerCase()
  if (!phone && !email) {
    return NextResponse.json({ error: 'phone or email is required to match the lead' }, { status: 400 })
  }

  const supabase = getServiceClient()
  if (!supabase) return NextResponse.json({ error: 'No DB' }, { status: 500 })

  // Match the lead: phone first (most reliable on WhatsApp), then email.
  let lead: any = null
  if (phone) {
    const { data } = await supabase.from('all_leads')
      .select('id, customer_name, unified_context, metadata')
      .eq('customer_phone_normalized', phone).maybeSingle()
    lead = data
  }
  if (!lead && email) {
    const { data } = await supabase.from('all_leads')
      .select('id, customer_name, unified_context, metadata')
      .ilike('email', email).maybeSingle()
    lead = data
  }
  if (!lead) {
    console.warn(`[payments/inbound] no lead matched phone=${phone || '-'} email=${email || '-'}`)
    return NextResponse.json({ ok: false, matched: false, reason: 'lead_not_found' }, { status: 202 })
  }

  const ctx = lead.unified_context || {}
  const bctx = ctx[BRAND_ID] || {}
  const paymentId = String(body?.payment_id || '').trim()

  // Idempotency: the same gateway event can be delivered more than once.
  if (paymentId && bctx.payment?.payment_id === paymentId && bctx.payment?.status === body?.status) {
    return NextResponse.json({ ok: true, matched: true, leadId: lead.id, duplicate: true })
  }

  const status = String(body?.status || body?.event || '').toLowerCase().includes('fail') ? 'failed'
    : String(body?.status || '').toLowerCase().includes('refund') ? 'refunded'
    : String(body?.status || body?.event || '').toLowerCase().includes('pend') ? 'pending'
    : 'paid'

  const payment = {
    status,
    plan: body?.plan || null,
    amount: body?.amount ?? null,
    currency: body?.currency || 'INR',
    payment_id: paymentId || null,
    order_id: body?.order_id || null,
    receipt_url: body?.receipt_url || body?.invoice_url || null,
    paid_at: body?.paid_at || new Date().toISOString(),
    gateway: body?.gateway || null,
    dashboard_status: body?.dashboard_status || null,
    notes: body?.notes || null,
    received_at: new Date().toISOString(),
  }

  // Flat mirrors so the KNOWN DETAILS block surfaces them to the agent verbatim.
  ctx[BRAND_ID] = {
    ...bctx,
    payment,
    payment_status: status,
    payment_plan: payment.plan,
    payment_amount: payment.amount ? `${payment.currency} ${payment.amount}` : null,
    payment_receipt_url: payment.receipt_url,
    dashboard_status: payment.dashboard_status,
  }

  await supabase.from('all_leads').update({
    unified_context: ctx,
    ...(status === 'paid' ? { lead_stage: 'Closed Won' } : {}),
  }).eq('id', lead.id)

  // Tell the team. A failed payment or a paid-but-not-activated account is the
  // exact situation that left a paying customer stranded before.
  try {
    const needsAttention = status === 'failed' || payment.dashboard_status === 'pending_activation'
    await notifySlackLead({
      brandLabel: getBrandConfig()?.name || 'Lokazen',
      title: status === 'paid'
        ? (needsAttention ? 'Payment received - ACTIVATION PENDING' : 'Payment received')
        : `Payment ${status}`,
      name: lead.customer_name || body?.name || 'Lead',
      phone: body?.phone || phone,
      email: email || null,
      leadType: String(bctx.user_type || '') || null,
      detail: [payment.plan, payment.amount ? `${payment.currency} ${payment.amount}` : null,
        payment.dashboard_status ? `dashboard: ${payment.dashboard_status}` : null].filter(Boolean).join(' · '),
      footer: 'payment',
      ...(payment.receipt_url ? { actions: [{ text: 'View receipt', url: payment.receipt_url }] } : {}),
    })
  } catch (e: any) {
    console.error('[payments/inbound] Slack notify failed:', e?.message || e)
  }

  console.log(`[payments/inbound] lead=${lead.id} status=${status} plan=${payment.plan} amount=${payment.amount}`)
  return NextResponse.json({ ok: true, matched: true, leadId: lead.id, status })
}
