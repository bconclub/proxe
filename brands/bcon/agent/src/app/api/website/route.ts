import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, normalizePhone, ensureOrUpdateLead } from '@/lib/services';

// Auth check
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // Skip if not configured
  
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;
  
  const token = authHeader.replace('Bearer ', '');
  return token === secret;
}

// Template functions for auto-responder
function getWelcomeTemplate(formType: string, name: string): string {
  if (formType === 'newsletter') {
    return `Hi ${name}, thanks for subscribing to BCON insights. Expect AI-powered business growth tips weekly. Want to chat about your specific challenges? Reply here.`;
  }
  return `Hi ${name}, got your message from our website. I'm BCON's AI assistant. While our team reviews your inquiry, can you tell me: What's your biggest business challenge right now?`;
}

function getEmailTemplate(formType: string, name: string): string {
  return `Hi ${name},\n\nThanks for reaching out via our website. We've received your ${formType === 'newsletter' ? 'subscription' : 'message'}.\n\nOur team will review and get back to you within 24 hours.\n\nBest,\nBCON Team`;
}

// GET /api/website - Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/website',
    methods: ['POST'],
    description: 'Website form submission endpoint'
  });
}

export async function POST(req: NextRequest) {
  try {
    // Auth
    if (!isAuthorized(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get Supabase client (runtime, not build-time)
    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 500 });
    }

    // Parse body
    const body = await req.json();
    const { name, email, phone, message, form_type, page_url, brand, utm_source, utm_medium, utm_campaign } = body;

    // Validation
    if (!name || (!email && !phone) || !brand) {
      return NextResponse.json({ 
        success: false, 
        error: 'Required: name + (email or phone) + brand' 
      }, { status: 400 });
    }

    // Normalize identifiers
    const normalizedPhone = normalizePhone(phone || '');
    const normalizedBrand = brand.toString().toLowerCase().trim();
    
    // Build unified_context
    const unifiedContext = {
      web: {
        form_submission: {
          form_type: form_type || 'contact',
          message: message || '',
          page_url: page_url || '',
          submitted_at: new Date().toISOString()
        },
        profile: {
          full_name: name,
          email: email || null,
          phone: phone || null
        },
        utm: {
          source: utm_source || null,
          medium: utm_medium || null,
          campaign: utm_campaign || null
        }
      },
      admin_notes: []
    };

    // Check for an existing lead BEFORE writing, so we know created vs updated
    // and (email-only path) so we can merge unified_context manually.
    let existingLead: { id: string; lead_stage?: string | null; unified_context?: any } | null = null;

    if (normalizedPhone) {
      const { data: phoneMatch } = await supabase
        .from('all_leads')
        .select('id, lead_stage, unified_context')
        .eq('customer_phone_normalized', normalizedPhone)
        .eq('brand', normalizedBrand)
        .maybeSingle();
      if (phoneMatch) existingLead = phoneMatch;
    }

    if (!existingLead && email) {
      const { data: emailMatch } = await supabase
        .from('all_leads')
        .select('id, lead_stage, unified_context')
        .eq('email', email)
        .eq('brand', normalizedBrand)
        .maybeSingle();
      if (emailMatch) existingLead = emailMatch;
    }

    let leadId: string;
    let action: 'created' | 'updated';

    if (normalizedPhone) {
      // Phone present: route through the SAME dedup path WhatsApp + web chat
      // use (ensureOrUpdateLead — phone-first match, race-safe on concurrent
      // inserts). This is the fix for the bug where a person who messaged on
      // WhatsApp and later filled the web form (or vice versa) got a SECOND
      // lead row instead of converging onto the one they already have.
      const sharedLeadId = await ensureOrUpdateLead(name, email || null, phone, 'web', undefined, supabase, {
        formType: form_type || null,
        utm: { source: utm_source || null, medium: utm_medium || null, campaign: utm_campaign || null },
        pageUrl: page_url || null,
      });
      if (!sharedLeadId) {
        return NextResponse.json({ success: false, error: 'Failed to create/update lead' }, { status: 500 });
      }
      leadId = sharedLeadId;
      action = existingLead ? 'updated' : 'created';

      // ensureOrUpdateLead doesn't know about this route's form-submission
      // history tracking — merge it on top of whatever it just wrote.
      const { data: fresh } = await supabase.from('all_leads').select('unified_context').eq('id', leadId).maybeSingle();
      const ctx = fresh?.unified_context || {};
      const existingSubs = Array.isArray(ctx.web?.form_submission)
        ? ctx.web.form_submission
        : (ctx.web?.form_submission ? [ctx.web.form_submission] : []);
      const mergedWeb = {
        ...(ctx.web || {}),
        profile: unifiedContext.web.profile,
        utm: unifiedContext.web.utm,
        form_submission: [...existingSubs, unifiedContext.web.form_submission].slice(-5),
      };
      await supabase.from('all_leads').update({ unified_context: { ...ctx, web: mergedWeb } }).eq('id', leadId);
    } else if (existingLead) {
      // No phone on this submission, but matched by email — keep the
      // original manual update path (ensureOrUpdateLead hard-requires phone).
      const updatedContext = {
        ...existingLead.unified_context,
        web: {
          ...existingLead.unified_context?.web,
          ...unifiedContext.web,
          form_submission: [
            ...(Array.isArray(existingLead.unified_context?.web?.form_submission)
              ? existingLead.unified_context.web.form_submission
              : existingLead.unified_context?.web?.form_submission
                ? [existingLead.unified_context.web.form_submission]
                : []),
            unifiedContext.web.form_submission
          ].slice(-5) // Keep last 5 submissions
        }
      };

      const { data, error } = await supabase
        .from('all_leads')
        .update({
          customer_name: name,
          email: email || existingLead.unified_context?.web?.profile?.email,
          phone: phone || existingLead.unified_context?.web?.profile?.phone,
          last_interaction_at: new Date().toISOString(),
          last_touchpoint: 'web',
          unified_context: updatedContext,
        })
        .eq('id', existingLead.id)
        .select('id')
        .single();

      if (error) throw error;
      leadId = data.id;
      action = 'updated';
    } else {
      // No phone, no existing email match — create (email-only lead, e.g.
      // newsletter signup). ensureOrUpdateLead can't be used here since it
      // hard-requires a phone number.
      const { data, error } = await supabase
        .from('all_leads')
        .insert({
          customer_name: name,
          email: email || null,
          phone: phone || null,
          customer_phone_normalized: normalizedPhone || null,
          first_touchpoint: 'web',
          last_touchpoint: 'web',
          last_interaction_at: new Date().toISOString(),
          brand: normalizedBrand,
          unified_context: unifiedContext,
          lead_stage: 'New',
        })
        .select('id')
        .single();

      if (error) throw error;
      leadId = data.id;
      action = 'created';
    }

    // Auto-responder for new web leads.
    // IMPORTANT: must be AWAITED. A fire-and-forget IIFE is dropped when the
    // Vercel lambda freezes right after the response returns, so the welcome
    // template never actually fires (the bug that left web leads with 0 msgs).
    if (action === 'created' && (normalizedPhone || email)) {
      await (async () => {
        try {
          if (normalizedPhone) {
            // The interest the lead actually selected/typed drives the probe.
            const selectedInterest = (body.service_interest || '').toString().trim();
            let probeQuestion: string;
            if (selectedInterest === 'AI in Marketing') {
              probeQuestion = 'Ready to plug an AI system into your marketing?';
            } else if (selectedInterest === 'Brand Marketing') {
              probeQuestion = 'Starting from scratch or scaling what\'s working?';
            } else if (selectedInterest === 'Business Apps') {
              probeQuestion = 'Got something built already or starting fresh?';
            } else {
              probeQuestion = 'What\'s the one thing you want to fix first?';
            }
            // What goes in "got your enquiry about ___": their selection first,
            // else the actual message they typed, else a safe brand-appropriate
            // label. NEVER the empty "General Inquiry".
            const interestParam =
              selectedInterest ||
              (message ? String(message).replace(/\s+/g, ' ').trim().slice(0, 80) : '') ||
              'AI marketing';

            // Route the welcome by source page. A lead from the AI Lead Machine
            // landing page came in FOR the AI Lead Machine, so it gets the Lead
            // Machine welcome (not the generic "got your inquiry about General
            // Inquiry" one). Everything else keeps the general web welcome.
            const isLeadMachine = /lead.?machine/i.test(
              String(page_url || body.form_source || body.form_name || form_type || '')
            );
            const brandName = body.company || body.brand_name || body.business_name || 'your brand';
            const welcomeTemplate = isLeadMachine
              ? {
                  name: 'bcon_lead_machine_meta_welcome_v1_',
                  language: { code: 'en' },
                  components: [{
                    type: 'body',
                    parameters: [
                      { type: 'text', parameter_name: 'customer_name', text: name },
                      { type: 'text', parameter_name: 'brand_name', text: brandName },
                    ],
                  }],
                }
              : {
                  name: 'bcon_welcome_web_v1',
                  language: { code: 'en' },
                  components: [{
                    type: 'body',
                    parameters: [
                      { type: 'text', parameter_name: 'customer_name', text: name },
                      { type: 'text', parameter_name: 'service_interest', text: interestParam },
                      { type: 'text', parameter_name: 'brand_name', text: brandName },
                      { type: 'text', parameter_name: 'probe_question', text: probeQuestion },
                    ],
                  }],
                };

            // Send WhatsApp Template for new web leads (routed by source above)
            const response = await fetch(
              `https://graph.facebook.com/v21.0/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: normalizedPhone.replace(/^\+/, ''),
                  type: 'template',
                  template: welcomeTemplate,
                })
              }
            );
            console.log(`[website] Welcome sent to ${normalizedPhone}: ${welcomeTemplate.name} (leadMachine=${isLeadMachine})`);

            if (!response.ok) {
              console.error('Template send failed:', await response.text());
            } else {
              // Record the outgoing welcome so the dashboard timeline shows it.
              const renderedBody = isLeadMachine
                ? `Hi ${name}, thanks for your interest in AI Lead Machine for ${brandName}. We help businesses like yours capture, qualify and convert more leads on autopilot. Want to see it in action?`
                : `Hey ${name}, got your enquiry about ${interestParam} for ${brandName}.\n\n${probeQuestion}, Lets get on call to discuss this.`;
              let wamid: string | null = null;
              try { wamid = (await response.clone().json())?.messages?.[0]?.id || null; } catch { /* ignore */ }
              const { error: logErr } = await supabase.from('conversations').insert({
                lead_id: leadId,
                channel: 'whatsapp',
                sender: 'agent',
                content: renderedBody,
                message_type: 'text',
                metadata: {
                  template_name: welcomeTemplate.name,
                  source: 'web_welcome',
                  ...(wamid ? { whatsapp_message_id: wamid, wa_message_id: wamid } : {}),
                },
              });
              if (logErr) console.error('[website] welcome conversation log failed:', logErr.message);
            }
          } else if (email) {
            // Optional: Send email auto-responder via existing /api/send-email
            await fetch('https://bconclub.com/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'lead',
                email: email,
                name: name,
                subject: 'We received your message - BCON',
                message: getEmailTemplate(form_type || 'contact', name)
              })
            });
          }
        } catch (e) {
          console.error('Auto-responder failed:', e);
          // Silent fail - don't break lead creation
        }
      })();
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      action: action,
      lead_stage: existingLead?.lead_stage || 'New'
    });

  } catch (error) {
    console.error('Website form error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
