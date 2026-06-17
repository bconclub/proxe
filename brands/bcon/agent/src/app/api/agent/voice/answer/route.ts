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

  const formData = await req.text();
  const params = new URLSearchParams(formData);
  // For inbound: From = lead's number. For outbound: use lead_phone from URL (reliable), fall back to To
  const callerPhone = direction === 'inbound'
    ? (params.get('From') || params.get('from') || '')
    : (leadPhoneFromUrl || params.get('To') || params.get('to') || params.get('From') || params.get('from') || '');
  const callUUID = params.get('CallUUID') || params.get('callUUID') || '';
  console.log('Vobiz answer POST params:', Object.fromEntries(params), { direction, leadName, leadPhoneFromUrl, callerPhone, callUUID });

  // Bridge the call into the Vapi agent over SIP. VoBiz dials a SIP URI via a
  // <User> element nested in <Dial> (Plivo-style; VoBiz has no <Sip> noun).
  // callerId presents the BCON number on the Vapi leg.
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial${callerId ? ` callerId="${callerId}"` : ''} timeout="30"><User>${vapiSipUri}</User></Dial></Response>`;

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
