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

// ─── Tool Use Types ──────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

export type ToolHandler = (input: Record<string, any>) => Promise<string>;

export interface ToolUseOptions {
  tools: ToolDefinition[];
  toolHandlers: Record<string, ToolHandler>;
  maxToolRounds?: number;
}

// ─── Tool Use Response ───────────────────────────────────────────────────────

/**
 * Generate a response with tool use support (for WhatsApp booking, etc.)
 * Implements the Anthropic tool_use message loop.
 */
export async function generateResponseWithTools(
  systemPrompt: string,
  userPrompt: string,
  toolOptions: ToolUseOptions,
  maxTokens: number = 1024
): Promise<string> {
  const anthropic = getClient();
  const model = getModel();
  const { tools, toolHandlers, maxToolRounds = 5 } = toolOptions;

  const messages: Array<{ role: 'user' | 'assistant'; content: any }> = [
    { role: 'user', content: userPrompt },
  ];

  const maxRetries = 3;

  for (let round = 0; round < maxToolRounds; round++) {
    let lastError: any = null;
    let response: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`[ClaudeClient] Tool round ${round}, retry ${attempt}/${maxRetries} after ${retryDelay}ms`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        response = await anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
          tools: tools as any,
        });
        break;
      } catch (error: any) {
        lastError = error;
        const isOverloaded = error?.error?.type === 'overloaded_error' ||
          error?.message?.includes('overloaded');
        if (!isOverloaded || attempt >= maxRetries) throw error;
      }
    }

    if (!response) throw lastError || new Error('Failed after retries');

    // Extract text from this response (may accompany tool_use blocks)
    const textBlocks = response.content.filter((b: any) => b.type === 'text');
    const responseText = textBlocks.map((b: any) => b.text).join('').trim();

    // If Claude is done (no tool calls), return the text
    if (response.stop_reason === 'end_turn') {
      return responseText;
    }

    // If Claude wants to use tools
    if (response.stop_reason === 'tool_use') {
      // Add Claude's full response as assistant message
      messages.push({ role: 'assistant', content: response.content });

      // Process each tool_use block
      const toolResults: Array<{
        type: 'tool_result';
        tool_use_id: string;
        content: string;
      }> = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const handler = toolHandlers[block.name];
          if (!handler) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
            });
            continue;
          }

          try {
            console.log(`[ClaudeClient] Executing tool: ${block.name}`, JSON.stringify(block.input));
            const result = await handler(block.input);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result,
            });
            console.log(`[ClaudeClient] Tool ${block.name} completed`);
          } catch (err: any) {
            console.error(`[ClaudeClient] Tool ${block.name} failed:`, err);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({ error: err.message || 'Tool execution failed' }),
            });
          }
        }
      }

      // Send tool results back to Claude
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop_reason — return whatever text we have
    return responseText;
  }

  console.warn('[ClaudeClient] Tool loop exhausted maxToolRounds');
  return 'I apologize, I encountered an issue processing your request. Please try again or contact us directly.';
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
