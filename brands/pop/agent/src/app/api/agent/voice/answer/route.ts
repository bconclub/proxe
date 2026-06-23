import { NextRequest, NextResponse } from 'next/server';

// VoBiz call -> Vapi voice agent bridge.
// VoBiz owns the number (+918046733388) and is the carrier; the agent
// ("PROXe Outbound Caller") lives on Vapi behind a SIP address. This route
// returns dial-XML that hands the VoBiz leg to that SIP address, so VoBiz
// bridges the caller <-> Vapi. Replaces the old custom voice-server stream
// (wss://voiceproxe.bconclub.com — Deepgram/ElevenLabs), now retired.
// Same XML serves both directions:
//   inbound  – caller dials the DID -> VoBiz fetches this URL -> bridged to Vapi
//   outbound – backend triggers a VoBiz call (voice/test-call) -> on answer
//              VoBiz fetches this URL -> bridged to Vapi
export async function POST(req: NextRequest) {
  // Trusted Vapi BYO-SIP-trunk URI: {number}@{credentialId}.sip.vapi.ai. Vapi
  // accepts the INVITE because VoBiz's gateway IP is allowlisted on the trunk
  // credential, then routes to the assistant bound to this BYO number.
  const vapiSipUri = process.env.VAPI_SIP_URI || 'sip:918046733388@98d57c1f-9133-4f15-a333-b9edff75f2f9.sip.vapi.ai';
  const callerId = process.env.VOBIZ_FROM_NUMBER || '';

  const urlParams = req.nextUrl.searchParams;
  const direction = urlParams.get('direction') || 'inbound';
  const leadName = urlParams.get('lead_name') || '';
  // For outbound/cold_intro: we pass lead_phone explicitly in the URL so we don't rely on Vobiz params
  const leadPhoneFromUrl = urlParams.get('lead_phone') || '';
  // Lead context for the Vapi agent (passed by voice/test-call). Forwarded to Vapi
  // as custom SIP headers; Vapi maps them to assistant template variables.
  const business = urlParams.get('business') || '';
  const industry = urlParams.get('industry') || '';

  const formData = await req.text();
  const params = new URLSearchParams(formData);
  // For inbound: From = lead's number. For outbound: use lead_phone from URL (reliable), fall back to To
  const callerPhone = direction === 'inbound'
    ? (params.get('From') || params.get('from') || '')
    : (leadPhoneFromUrl || params.get('To') || params.get('to') || params.get('From') || params.get('from') || '');
  const callUUID = params.get('CallUUID') || params.get('callUUID') || '';
  console.log('Vobiz answer POST params:', Object.fromEntries(params), { direction, leadName, leadPhoneFromUrl, callerPhone, callUUID });

  // Pass lead context to Vapi as custom SIP headers. Per VoBiz <Dial> docs the
  // `sipHeaders` attribute goes on the <User>/<Number> element (NOT on <Dial> —
  // that was silently dropped), VoBiz AUTO-PREFIXES every key with "X-VH-", and
  // only [A-Za-z0-9] is allowed in key names (values may be URL-encoded). So we
  // send PLAIN alphanumeric keys; on the wire VoBiz emits e.g. "X-VH-contactname",
  // and Vapi strips the leading "X-" + lowercases => template var {{vh-contactname}}
  // (likewise {{vh-businessname}}, {{vh-industry}}).
  const ctx: string[] = [];
  if (leadName) ctx.push(`contactname=${encodeURIComponent(leadName)}`);
  if (business) ctx.push(`businessname=${encodeURIComponent(business)}`);
  if (industry) ctx.push(`industry=${encodeURIComponent(industry)}`);
  const sipHeadersAttr = ctx.length ? ` sipHeaders="${ctx.join(',')}"` : '';

  // Retry-on-busy: VoBiz spreads outbound SIP across egress IPs; one of them
  // (3.111.255.163) is refused by Vapi with USER_BUSY, dropping ~half of calls.
  // <Dial action> re-invokes /dial-status after the bridge ends; on a busy/failed
  // result it re-dials, VoBiz re-rolls the egress IP, so a retry usually lands on
  // a good one. Context rides in the action URL so retries keep name/business.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://proxe.bconclub.com';
  const ctxQuery = `lead_name=${encodeURIComponent(leadName)}&business=${encodeURIComponent(business)}&industry=${encodeURIComponent(industry)}`;
  const actionUrl = `${baseUrl}/api/agent/voice/dial-status?attempt=2&${ctxQuery}`.replace(/&/g, '&amp;');

  // Bridge the call into the Vapi agent over SIP. VoBiz dials a SIP URI via a
  // <User> element nested in <Dial> (Plivo-style; VoBiz has no <Sip> noun).
  // callerId presents the BCON number on the Vapi leg; sipHeaders ride on <User>.
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial${callerId ? ` callerId="${callerId}"` : ''} timeout="30" action="${actionUrl}" method="POST"><User${sipHeadersAttr}>${vapiSipUri}</User></Dial></Response>`;

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
