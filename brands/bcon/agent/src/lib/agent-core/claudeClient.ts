/**
 * Claude API Client — Streaming + Sync modes
 * Extracted from web-agent/api/chat/route.ts
 */

import Anthropic from '@anthropic-ai/sdk';

let anthropicInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicInstance) {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error('CLAUDE_API_KEY environment variable is not set');
    }
    anthropicInstance = new Anthropic({ apiKey });
  }
  return anthropicInstance;
}

function getModel(): string {
  return process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
}

/**
 * Stream a response from Claude (for web chat SSE)
 * Returns an AsyncGenerator that yields text chunks
 */
export async function* streamResponse(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 768
): AsyncGenerator<string> {
  const anthropic = getClient();
  const model = getModel();

  // Retry logic for overloaded errors
  const maxRetries = 3;
  let lastError: any = null;
  let stream: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[ClaudeClient] Retry attempt ${attempt}/${maxRetries} after ${retryDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      stream = await anthropic.messages.stream({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      break; // Success
    } catch (error: any) {
      lastError = error;
      const isOverloaded = error?.error?.type === 'overloaded_error' ||
        error?.message?.includes('overloaded');

      if (!isOverloaded || attempt >= maxRetries) {
        throw error;
      }
    }
  }

  if (!stream) {
    throw lastError || new Error('Failed to create stream after retries');
  }

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' &&
        'delta' in chunk &&
        chunk.delta?.type === 'text_delta') {
      const text = chunk.delta.text || '';
      if (text && typeof text === 'string') {
        yield text;
      }
    }
  }
}

/**
 * Generate a complete response from Claude (for WhatsApp, voice, etc.)
 * Returns the full text response
 */
export async function generateResponse(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 768
): Promise<string> {
  const anthropic = getClient();
  const model = getModel();

  // Retry logic
  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const content = response.content?.[0];
      if (content && content.type === 'text') {
        return content.text.trim();
      }
      return '';
    } catch (error: any) {
      lastError = error;
      const isOverloaded = error?.error?.type === 'overloaded_error' ||
        error?.message?.includes('overloaded');

      if (!isOverloaded || attempt >= maxRetries) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Failed to generate response after retries');
}

/**
 * Generate a short response (for buttons, summaries, etc.)
 */
export async function generateShort(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 60
): Promise<string> {
  return generateResponse(systemPrompt, userPrompt, maxTokens);
}

/**
 * Check if Claude API is configured
 */
export function isConfigured(): boolean {
  return !!process.env.CLAUDE_API_KEY;
}

/**
 * Convert a Claude API error to a user-friendly message
 */
export function getErrorMessage(error: any): string {
  let claudeErrorType = error?.error?.type;
  let claudeErrorMessage = error?.error?.message;
  const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';

  // Try to parse JSON error
  if (!claudeErrorType && errorMessage?.includes('"type":"error"')) {
    try {
      const parsed = JSON.parse(errorMessage);
      if (parsed.error) {
        claudeErrorType = parsed.error.type;
        claudeErrorMessage = parsed.error.message;
      }
    } catch { /* Not JSON */ }
  }

  const errorType = claudeErrorType || error?.type || 'unknown_error';

  if (errorType === 'overloaded_error' || errorMessage?.toLowerCase().includes('overloaded')) {
    const retryAfter = error?.headers?.get?.('retry-after');
    const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 6;
    return `The service is currently overloaded. Please try again in ${retrySeconds} seconds.`;
  }
  if (errorType === 'rate_limit_error' || error?.status_code === 429) {
    return 'Rate limit exceeded. Please wait a moment and try again.';
  }
  if (errorMessage?.toLowerCase().includes('api key') || error?.status_code === 401) {
    return 'Authentication error. Please check API configuration.';
  }
  if (errorMessage?.toLowerCase().includes('network') || errorMessage?.toLowerCase().includes('fetch')) {
    return 'Network error. Please check your connection and try again.';
  }
  if (error?.status_code === 500 || error?.status_code === 503) {
    return 'The service is currently unavailable. Please try again in a moment.';
  }

  return claudeErrorMessage || errorMessage;
}
