/**
 * POST /api/agent/summarize — Conversation summary generation
 *
 * Phase 3 of the Unified Agent Architecture.
 * Moved from web-agent/api/chat/summarize/route.ts.
 *
 * Request: { messages: [{role, content}], sessionId?, previousSummary? }
 * Response: { summary: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateSummary } from '@/lib/agent-core/summarizer';
import { upsertSummary, getClient } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      messages = [],
      sessionId,
      previousSummary = '',
    } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 },
      );
    }

    // Generate summary using agent-core summarizer
    const summary = await generateSummary(previousSummary, messages);

    // Optionally persist to session
    if (sessionId && summary) {
      const supabase = getClient();
      if (supabase) {
        await upsertSummary(
          sessionId,
          summary,
          new Date().toISOString(),
          'web',
          supabase,
        );
      }
    }

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error('[agent/summarize] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate summary' },
      { status: 500 },
    );
  }
}
