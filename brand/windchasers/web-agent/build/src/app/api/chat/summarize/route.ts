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

    const systemPrompt = `You are an AI conversation summarizer. Create a SHORT, focused summary (1 sentence, max ~50 tokens) focusing ONLY on:
- User's intent (what they want)
- Next steps (what action is needed or in progress)
- Booking status (if they have booked something: date/time/status)
- Topic/question category (what the question is related to)

Do NOT explain what the bot said or what the user said back. Do NOT describe the conversation flow. Just state: intent, next steps, booking status (if any), and topic. Be extremely concise.`;

    const prompt = `Previous summary:
${previousSummary || '(none)'}

New conversation:
${formattedHistory}

Create a very short summary (1 sentence max). Focus ONLY on: intent, next steps, booking status (if booked), and what the question relates to. Do NOT explain the conversation flow or what was said.`;

    const summaryResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 60,
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

