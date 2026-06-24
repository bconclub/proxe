import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/services';
import { ensureOrUpdateLead } from '@/lib/services/leadManager';
import { BRAND_ID } from '@/configs';

// Outbound calls are ORIGINATED by Vapi (Vapi -> VoBiz BYO trunk -> PSTN), NOT by
// the VoBiz Call API. This is the only path that carries lead context: the old
// VoBiz->Vapi bridge drops all custom SIP headers, so the agent never saw the name.
// Originating from Vapi lets us pass name/business/industry as assistantOverrides
// variableValues -> the prompt's {{vh-contactname}} / {{vh-businessname}} /
// {{vh-industry}} -> the agent greets the lead by name with full context.
//
// Requires (Vercel env): VAPI_PRIVATE_API_KEY. The phone number + assistant ids
// default to the live BCON outbound number (on the VoBiz "Vapi Outbound" trunk
// credential, outboundLeadingPlusEnabled MUST be false) and the PROXe assistant.

const VAPI_OUTBOUND_PHONE_NUMBER_ID =
  process.env.VAPI_OUTBOUND_PHONE_NUMBER_ID || 'e03b4b96-a3ce-4b4f-91d3-de9ad5c70529';
const VAPI_ASSISTANT_ID =
  process.env.VAPI_ASSISTANT_ID || '999bf28c-6c2e-402d-8b05-a24899749a22';

export async function POST(req: NextRequest) {
  const { phone, leadName, contactName, businessName, industry } = await req.json();
  if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });

  const name = (contactName || leadName || '').trim();
  const business = (businessName || '').trim();
  // Greeting target: confirm the person if we have a name, else the company.
  // ("Hi, is this Thanzeel?" vs "Hi, is this AB Developers?"). When there's no
  // person, vh-contactname stays empty so the agent asks to be put through.
  const greetingName = name || business;
  if (!greetingName) {
    return NextResponse.json({ error: 'A contact name or business name is required' }, { status: 400 });
  }
  const vapiKey = process.env.VAPI_PRIVATE_API_KEY;
  if (!vapiKey) {
    return NextResponse.json(
      { success: false, error: 'VAPI_PRIVATE_API_KEY not set in environment' },
      { status: 500 },
    );
  }

  // Normalize the destination to E.164 India. Form may send a bare 10-digit number.
  const digits = String(phone).replace(/\D/g, '');
  const last10 = digits.slice(-10);
  const e164 = digits.length === 12 && digits.startsWith('91') ? `+${digits}` : `+91${last10}`;

  // Current India/IST time so the agent books realistic slots (11 AM–5 PM, not now,
  // after-hours -> next day). Passed as the {{vh-now}} prompt variable.
  const istNow = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date());

  try {
    const res = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vapiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId: VAPI_OUTBOUND_PHONE_NUMBER_ID,
        assistantId: VAPI_ASSISTANT_ID,
        assistantOverrides: {
          variableValues: {
            'vh-contactname': name,
            'vh-greetingname': greetingName,
            'vh-businessname': business,
            'vh-industry': industry || '',
            'vh-now': istNow,
          },
        },
        customer: { number: e164 },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: data?.message || data }, { status: res.status });
    }

    const callId: string | null = data?.id || null;

    // Persist the call NOW, at initiation — so it shows up in the Calls list with
    // the real contact (name + number) instead of "Unknown caller", and carries a
    // lead_id for the transcript/recording join. The Vapi webhook later ENRICHES
    // this same row (keyed on external_session_id) without clobbering these fields.
    // Soft-fail: a DB hiccup must never break the call that's already dialing.
    if (callId) {
      try {
        const supabase = getServiceClient();
        if (supabase) {
          // Create/link the lead with the name the user entered, so leadName
          // resolves (the agent already greets by this name on the call).
          const leadId = await ensureOrUpdateLead(
            name || business, null, e164, 'voice', undefined, supabase,
          );

          const sessionFields: Record<string, any> = {
            lead_id: leadId,
            customer_phone: e164,
            customer_phone_normalized: last10,
            call_direction: 'outbound',
            call_status: 'queued',
            brand: BRAND_ID,
            updated_at: new Date().toISOString(),
          };

          const { data: existing } = await supabase
            .from('voice_sessions')
            .select('id')
            .eq('external_session_id', callId)
            .maybeSingle();

          if (existing?.id) {
            await supabase.from('voice_sessions').update(sessionFields).eq('id', existing.id);
          } else {
            await supabase
              .from('voice_sessions')
              .insert({ external_session_id: callId, created_at: new Date().toISOString(), ...sessionFields });
          }
        }
      } catch (e: any) {
        console.error('[test-call] failed to persist lead/session (non-fatal):', e?.message);
      }
    }

    return NextResponse.json({ success: true, callId });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
