import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: NextRequest) {
  const { phone } = await req.json();
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });

  try {
    const authId = process.env.VOBIZ_AUTH_ID;
    const authToken = process.env.VOBIZ_AUTH_TOKEN;
    const fromNumber = process.env.VOBIZ_PHONE_NUMBER;
    const answerUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/agent/voice/answer`;

    const res = await axios.post(
      `https://api.vobiz.ai/api/v1/Account/${authId}/Call/`,
      { from: fromNumber, to: phone, answer_url: answerUrl, answer_method: 'POST' },
      {
        headers: {
          'X-Auth-ID': authId,
          'X-Auth-Token': authToken,
          'Content-Type': 'application/json',
        },
      }
    );

    return NextResponse.json({ success: true, callId: res.data?.CallUUID });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
