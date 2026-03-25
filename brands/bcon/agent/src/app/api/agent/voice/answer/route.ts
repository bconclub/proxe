import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const voiceServerUrl = process.env.VOICE_SERVER_WSS_URL || 'wss://voiceproxe.bconclub.com';

  const urlParams = req.nextUrl.searchParams;
  const direction = urlParams.get('direction') || 'inbound';
  const leadName = urlParams.get('lead_name') || '';

  const formData = await req.text();
  const params = new URLSearchParams(formData);
  const callerPhone = params.get('From') || params.get('from') || '';
  const callUUID = params.get('CallUUID') || params.get('callUUID') || '';
  console.log('Vobiz answer POST params:', Object.fromEntries(params), { direction, leadName });

  const extraHeaders = `callerPhone=${callerPhone},callUUID=${callUUID},direction=${direction},leadName=${encodeURIComponent(leadName)}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" extraHeaders="${extraHeaders}">${voiceServerUrl}/ws</Stream></Response>`;

  return new NextResponse(xml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
