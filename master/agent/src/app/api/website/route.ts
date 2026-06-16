import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient, normalizePhone } from '@/lib/services';

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

    // Check for existing lead (phone优先, then email)
    let existingLead = null;
    
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

    if (existingLead) {
      // Update existing lead
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
      // Create new lead
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

    // Auto-responder for new web leads
    if (action === 'created' && (normalizedPhone || email)) {
      // Fire-and-forget: don't await, don't block response
      (async () => {
        try {
          if (normalizedPhone) {
            // Determine probe_question based on service_interest
            const serviceInterest = body.service_interest || '';
            let probeQuestion: string;
            if (serviceInterest === 'AI in Marketing') {
              probeQuestion = 'Ready to plug an AI system into your marketing?';
            } else if (serviceInterest === 'Brand Marketing') {
              probeQuestion = 'Starting from scratch or scaling what\'s working?';
            } else if (serviceInterest === 'Business Apps') {
              probeQuestion = 'Got something built already or starting fresh?';
            } else {
              probeQuestion = 'What\'s the one thing you want to fix first?';
            }

            // Send WhatsApp Template for new web leads
            const response = await fetch(
              `https://graph.facebook.com/v18.0/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`,
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
                  template: {
                    name: 'bcon_welcome_web_v1',
                    language: { code: 'en' },
                    components: [{
                      type: 'body',
                      parameters: [
                        { type: 'text', parameter_name: 'customer_name', text: name },
                        { type: 'text', parameter_name: 'service_interest', text: serviceInterest || 'General Inquiry' },
                        { type: 'text', parameter_name: 'brand_name', text: 'BCON' },
                        { type: 'text', parameter_name: 'probe_question', text: probeQuestion },
                      ]
                    }]
                  }
                })
              }
            );

            if (!response.ok) {
              console.error('Template send failed:', await response.text());
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
