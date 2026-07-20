import { NextRequest, NextResponse } from 'next/server';

// Called by VoBiz (via <Dial action>) after the Vapi bridge leg ends. VoBiz spreads
// outbound SIP across egress IPs and one (3.111.255.163) is refused by Vapi with
// USER_BUSY -> DialStatus "busy"/"failed". On those we re-dial: VoBiz re-selects an
// egress IP, so a retry usually lands on a working one. The bridge XML mirrors the
// answer route (sipHeaders on <User>, plain keys -> Vapi {{vh-*}}). Context rides in
// the query string so each retry keeps the lead's name/business/industry.

const MAX_ATTEMPTS = 3;
const RETRY_STATUSES = new Set(['busy', 'failed', 'timeout', 'no-answer', 'noanswer']);

function xmlResponse(body: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const attempt = parseInt(sp.get('attempt') || '2', 10);
  const leadName = sp.get('lead_name') || '';
  const business = sp.get('business') || '';
  const industry = sp.get('industry') || '';

  const form = new URLSearchParams(await req.text().catch(() => ''));
  const dialStatus = (form.get('DialStatus') || form.get('dialStatus') || '').toLowerCase();
  console.log('[dial-status] attempt', attempt, 'DialStatus', dialStatus, Object.fromEntries(form));

  // Bridge succeeded, caller hung up, or we've exhausted retries - end the call.
  if (!RETRY_STATUSES.has(dialStatus) || attempt > MAX_ATTEMPTS) {
    return xmlResponse('<Response></Response>');
  }

  // Re-dial the Vapi agent - VoBiz re-rolls the egress IP on a fresh attempt.
  const vapiSipUri = process.env.VAPI_SIP_URI || 'sip:918046733388@98d57c1f-9133-4f15-a333-b9edff75f2f9.sip.vapi.ai';
  const callerId = process.env.VOBIZ_FROM_NUMBER || '';

  const ctx: string[] = [];
  if (leadName) ctx.push(`contactname=${encodeURIComponent(leadName)}`);
  if (business) ctx.push(`businessname=${encodeURIComponent(business)}`);
  if (industry) ctx.push(`industry=${encodeURIComponent(industry)}`);
  const sipHeadersAttr = ctx.length ? ` sipHeaders="${ctx.join(',')}"` : '';

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const ctxQuery = `lead_name=${encodeURIComponent(leadName)}&business=${encodeURIComponent(business)}&industry=${encodeURIComponent(industry)}`;
  const actionUrl = `${baseUrl}/api/agent/voice/dial-status?attempt=${attempt + 1}&${ctxQuery}`.replace(/&/g, '&amp;');

  const xml = `<Response><Dial${callerId ? ` callerId="${callerId}"` : ''} timeout="30" action="${actionUrl}" method="POST"><User${sipHeadersAttr}>${vapiSipUri}</User></Dial></Response>`;
  return xmlResponse(xml);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
