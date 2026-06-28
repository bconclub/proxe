import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { phone, leadName, direction = 'outbound' } = await req.json();
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });

  try {
    const authId = process.env.VOBIZ_AUTH_ID;
    const authToken = process.env.VOBIZ_AUTH_TOKEN;
    const fromNumber = process.env.VOBIZ_FROM_NUMBER;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://proxe.bconclub.com';
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const answerUrl = `${baseUrl}/api/agent/voice/answer?direction=${direction}&lead_name=${encodeURIComponent(leadName || '')}&lead_phone=${cleanPhone}`;

    const res = await fetch(
      `https://api.vobiz.ai/api/v1/Account/${authId}/Call/`,
      {
        method: 'POST',
        headers: {
          'X-Auth-ID': authId || '',
          'X-Auth-Token': authToken || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: fromNumber, to: phone, answer_url: answerUrl, answer_method: 'POST', caller_name: 'BCON Club' }),
      }
    );

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ success: false, error: data }, { status: res.status });
    return NextResponse.json({ success: true, callId: data?.request_uuid });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
