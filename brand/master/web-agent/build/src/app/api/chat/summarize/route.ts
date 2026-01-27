import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

const claudeApiKey = process.env.CLAUDE_API_KEY;
const anthropic = claudeApiKey ? new Anthropic({ apiKey: claudeApiKey }) : null;

interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!anthropic) {
      return Response.json({ error: 'Claude API key missing' }, { status: 500 });
    }

    const body = await request.json();
    let previousSummary: string = body.summary || '';
    const history: HistoryItem[] = Array.isArray(body.history) ? body.history : [];
    const brand: string = body.brand || 'proxe';

    // Clean metadata strings from previous summary (remove [User's name is...] and [Booking Status:...] patterns)
    previousSummary = previousSummary
      .replace(/\[User's name is[^\]]+\]/gi, '')
      .replace(/\[Booking Status:[^\]]+\]/gi, '')
      .replace(/\n\n+/g, '\n')
      .trim();

    if (history.length === 0) {
      return Response.json({ summary: previousSummary }, { status: 200 });
    }

    // Filter out metadata strings from history before formatting
    const cleanedHistory = history.map(entry => ({
      ...entry,
      content: entry.content
        .replace(/\[User's name is[^\]]+\]/gi, '')
        .replace(/\[Booking Status:[^\]]+\]/gi, '')
        .trim()
    })).filter(entry => entry.content.length > 0);

    const formattedHistory = cleanedHistory
      .map((entry) => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`)
      .join('\n');

    const systemPrompt = `You are an AI conversation summarizer. Create a CRISP, concise summary (1-2 sentences, max ~80 tokens) focusing ONLY on:
- User's intent/pain point (what they want and why)
- Key user data (industry, business size, timeline if mentioned)
- Important decisions/actions (bookings scheduled, information shared)

Be BRIEF and to the point. Preserve key context from previous summary and merge with new info. Do NOT explain products. Focus on USER behavior only. Strip all filler words.`;

    const prompt = `Previous summary:
${previousSummary || '(none)'}

New conversation:
${formattedHistory}

Create a crisp, concise summary (1-2 sentences max). Preserve key context from previous summary, add new important info. Focus on: user intent, key data points, decisions made. Be brief and to the point.`;

    const summaryResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = summaryResponse.content?.[0];
    const updatedSummary =
      content && content.type === 'text' ? content.text.trim() : previousSummary;

    return Response.json(
      { summary: updatedSummary, brand }, 
      { 
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      }
    );
  } catch (error: any) {
    console.error('[chat/summarize] Failed to compress memory', error);
    return Response.json(
      { error: error?.message || 'Failed to summarize conversation' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

