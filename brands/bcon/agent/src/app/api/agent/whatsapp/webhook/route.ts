/**
 * POST /api/agent/whatsapp/webhook — Incoming WhatsApp messages
 *
 * Phase 3 of the Unified Agent Architecture.
 * Refactored from dashboard/api/integrations/whatsapp/route.ts.
 * Uses services/ instead of inline Supabase operations.
 *
 * Request: { name, phone, message, sender, external_session_id, ... }
 * Response: { success, lead_id }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getServiceClient,
  ensureOrUpdateLead,
  ensureSession,
  logMessage,
  normalizePhone,
} from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Verify webhook API key
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== process.env.WHATSAPP_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const supabase = getServiceClient();

    if (!supabase) {
      return NextResponse.json(
        { error: 'Database connection unavailable' },
        { status: 503 },
      );
    }

    const {
      name,
      phone,
      email,
      message,
      sender = 'customer',
      message_type = 'text',
      external_session_id,
      whatsapp_id,
      brand = 'bcon',
      conversation_summary,
      conversation_context,
      user_inputs_summary,
      message_count,
      last_message_at,
      last_interaction,
      conversation_status,
      overall_sentiment,
      booking_status,
      booking_date,
      booking_time,
      metadata,
    } = body;

    if (!phone || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: phone and name' },
        { status: 400 },
      );
    }

    // Generate external_session_id if not provided
    const externalSessionId =
      external_session_id ||
      whatsapp_id ||
      `whatsapp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 1. Create/update lead using leadManager service
    const leadId = await ensureOrUpdateLead(
      name,
      email || null,
      phone,
      'whatsapp',
      externalSessionId,
      supabase,
    );

    if (!leadId) {
      console.error('[agent/whatsapp/webhook] Failed to create/update lead');
      return NextResponse.json(
        { error: 'Failed to process lead' },
        { status: 500 },
      );
    }

    // 2. Create/update whatsapp session
    const normalizedPhone = normalizePhone(phone);

    // Check if session exists
    const { data: existingSession } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('external_session_id', externalSessionId)
      .maybeSingle();

    if (existingSession?.id) {
      // Update existing session
      await supabase
        .from('whatsapp_sessions')
        .update({
          conversation_summary: conversation_summary || null,
          user_inputs_summary: user_inputs_summary || null,
          message_count: message_count || 0,
          last_message_at: last_message_at || new Date().toISOString(),
          conversation_status: conversation_status || null,
          overall_sentiment: overall_sentiment || null,
          booking_status: booking_status || null,
          booking_date: booking_date || null,
          booking_time: booking_time || null,
          channel_data: metadata || {},
        })
        .eq('id', existingSession.id);
    } else {
      // Create new session
      await supabase
        .from('whatsapp_sessions')
        .insert({
          lead_id: leadId,
          brand,
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          customer_phone_normalized: normalizedPhone,
          external_session_id: externalSessionId,
          conversation_summary: conversation_summary || null,
          user_inputs_summary: user_inputs_summary || null,
          message_count: message_count || 0,
          last_message_at: last_message_at || new Date().toISOString(),
          conversation_status: conversation_status || 'active',
          overall_sentiment: overall_sentiment || null,
          booking_status: booking_status || null,
          booking_date: booking_date || null,
          booking_time: booking_time || null,
          channel_data: metadata || {},
        })
        .select('id')
        .single();
    }

    // 3. Update unified_context.whatsapp in all_leads
    const { data: lead } = await supabase
      .from('all_leads')
      .select('unified_context')
      .eq('id', leadId)
      .maybeSingle();

    const existingCtx = lead?.unified_context || {};
    const existingWA = existingCtx.whatsapp || {};

    const updatedCtx = {
      ...existingCtx,
      whatsapp: {
        ...existingWA,
        conversation_summary: conversation_summary ?? existingWA.conversation_summary ?? null,
        conversation_context: conversation_context ?? existingWA.conversation_context ?? null,
        user_inputs_summary: user_inputs_summary ?? existingWA.user_inputs_summary ?? null,
        message_count: message_count ?? existingWA.message_count ?? 0,
        last_interaction: last_interaction || last_message_at || new Date().toISOString(),
        booking_status: booking_status ?? existingWA.booking_status ?? null,
        booking_date: booking_date ?? existingWA.booking_date ?? null,
        booking_time: booking_time ?? existingWA.booking_time ?? null,
      },
    };

    await supabase
      .from('all_leads')
      .update({
        unified_context: updatedCtx,
        last_touchpoint: 'whatsapp',
        last_interaction_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    // 4. Log message to conversations table
    const messageContent = message || body.content || 'WhatsApp message';
    const messageResult = await logMessage(
      leadId,
      'whatsapp',
      sender,
      messageContent,
      message_type,
      {
        whatsapp_id,
        external_session_id: externalSessionId,
        ...(metadata || {}),
      },
      supabase,
    );

    // 5. Fire-and-forget: trigger AI scoring
    if (messageResult) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      fetch(`${appUrl}/api/webhooks/message-created`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      }).catch(err => console.error('[agent/whatsapp/webhook] Scoring trigger failed:', err));
    }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      message: 'WhatsApp lead processed successfully',
    });
  } catch (error) {
    console.error('[agent/whatsapp/webhook] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process webhook' },
      { status: 500 },
    );
  }
}
