import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('Summarize API called');
  
  try {
    const body = await request.json();
    const { conversation, leadName } = body;
    
    console.log('Conversation length:', conversation?.length);
    console.log('Lead name:', leadName);

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation text is required' },
        { status: 400 }
      );
    }

    // Check if API key exists
    const apiKey = process.env.CLAUDE_API_KEY;
    console.log('API Key exists:', !!apiKey);
    
    if (!apiKey) {
      console.error('CLAUDE_API_KEY is not set');
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Call Claude API directly with fetch (no SDK needed)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: `Summarize this customer conversation concisely. Use this exact format:

**Customer Summary - [Customer Name]**
[1-2 sentences: what they want, key questions, important details like pricing/demos]

**Readiness:** [Hot/Warm/Cold] - [One sentence why]

**Recommended Next Action:** [One specific action]

Customer: ${leadName || 'Unknown'}

Conversation:
${conversation}

Keep it brief and actionable:`
          }
        ]
      })
    });

    console.log('Claude API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      return NextResponse.json(
        { error: 'Failed to call Claude API' },
        { status: 500 }
      );
    }

    const data = await response.json();
    console.log('Claude response received');
    
    const summary = data.content?.[0]?.text || 'Unable to generate summary';

    return NextResponse.json({ summary });

  } catch (error) {
    console.error('Summary API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary', details: String(error) },
      { status: 500 }
    );
  }
}

