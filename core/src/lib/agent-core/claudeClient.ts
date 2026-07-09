/**
 * Claude API Client - Streaming + Sync modes
 * Extracted from web-agent/api/chat/route.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import { recordTokenUsage, usageFrom, type TokenCategory } from '@/lib/token-usage';

let anthropicInstance: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicInstance) {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error('CLAUDE_API_KEY environment variable is not set');
    }
    anthropicInstance = new Anthropic({
      apiKey,
      defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
    });
  }
  return anthropicInstance;
}

function cacheable(text: string): any[] {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

// Models that have been retired by the API and now 404. If the deploy env still
// points CLAUDE_MODEL at one of these, silently remap to a current equivalent so
// chat keeps working without a dashboard env change. Keep this list updated as
// models retire.
const RETIRED_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-0': 'claude-sonnet-4-5-20250929',
  'claude-3-5-sonnet-20240620': 'claude-sonnet-4-5-20250929',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-4-5-20250929',
};

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

// Friendly / malformed aliases → canonical Anthropic model IDs. The dashboard
// env is hand-edited, so values like "sonnet_5", "sonnet 5", or a bare "opus"
// end up in CLAUDE_MODEL and 404 the API (the whole "Snapshot / re-score isn't
// working" symptom). Normalize them so a plausible name always resolves to a
// real model ID instead of silently failing. Keys are lowercased with spaces /
// underscores collapsed to hyphens before lookup.
const MODEL_ALIAS_MAP: Record<string, string> = {
  'sonnet': 'claude-sonnet-5',
  'sonnet-5': 'claude-sonnet-5',
  'sonnet5': 'claude-sonnet-5',
  'sonnet-4-6': 'claude-sonnet-4-6',
  'opus': 'claude-opus-4-8',
  'opus-4-8': 'claude-opus-4-8',
  'opus-4-7': 'claude-opus-4-7',
  'haiku': DEFAULT_MODEL,
  'haiku-4-5': DEFAULT_MODEL,
  'fable': 'claude-fable-5',
  'fable-5': 'claude-fable-5',
};

/**
 * Resolve a configured model string to a valid Anthropic model ID.
 * Order: retired-model remap → trust any explicit `claude-*` id → friendly-alias
 * normalization → last-resort `claude-`-prefix. Exported so the raw-fetch call
 * sites (lead scoring, voice webhook, call translation) share the same guard.
 */
export function resolveModel(configured?: string | null): string {
  const raw = (configured || '').trim();
  if (!raw) return DEFAULT_MODEL;
  if (RETIRED_MODEL_MAP[raw]) {
    console.warn(`[ClaudeClient] CLAUDE_MODEL="${raw}" is retired — using "${RETIRED_MODEL_MAP[raw]}". Update the env var.`);
    return RETIRED_MODEL_MAP[raw];
  }
  // Already a canonical id — trust it as-is.
  if (/^claude-/i.test(raw)) return raw;
  const norm = raw.toLowerCase().replace(/[\s_]+/g, '-');
  if (MODEL_ALIAS_MAP[norm]) {
    console.warn(`[ClaudeClient] CLAUDE_MODEL="${raw}" is not a valid model ID — using "${MODEL_ALIAS_MAP[norm]}". Set CLAUDE_MODEL to a canonical claude-* id.`);
    return MODEL_ALIAS_MAP[norm];
  }
  // Unknown alias: best-effort prefix so it at least reaches the API as a claude-* id.
  console.warn(`[ClaudeClient] CLAUDE_MODEL="${raw}" is not a recognized alias — trying "claude-${norm}".`);
  return `claude-${norm}`;
}

function getModel(): string {
  return resolveModel(process.env.CLAUDE_MODEL);
}

// Model for the actual CONVERSATION (the part that needs reasoning). Sonnet 5
// by default so chat replies reason well; override with CLAUDE_MODEL_REASONING.
// The cheap helpers — quick-reply buttons (generateShort), summaries, profile
// extraction — deliberately stay on getModel() (Haiku) to keep token spend down.
// Currently used only by the Lokazen-gated non-streaming web path in engine.ts.
export function getReasoningModel(): string {
  return resolveModel(process.env.CLAUDE_MODEL_REASONING || 'claude-sonnet-5');
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

      stream = await (anthropic.messages.stream as any)({
        model,
        max_tokens: maxTokens,
        system: cacheable(systemPrompt),
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

  // Capture token usage from the stream events so streaming chat is metered too
  // (it was previously the one un-metered path). input_tokens arrive on
  // message_start, output_tokens accumulate on message_delta.
  let tuInput = 0;
  let tuOutput = 0;
  try {
    for await (const chunk of stream) {
      if (chunk.type === 'message_start') {
        const u = chunk.message?.usage || {};
        tuInput = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      } else if (chunk.type === 'message_delta' && chunk.usage?.output_tokens != null) {
        tuOutput = chunk.usage.output_tokens;
      } else if (chunk.type === 'content_block_delta' &&
          'delta' in chunk &&
          chunk.delta?.type === 'text_delta') {
        const text = chunk.delta.text || '';
        if (text && typeof text === 'string') {
          yield text;
        }
      }
    }
  } finally {
    // Fires even if the consumer stops early — best-effort metering.
    await recordTokenUsage('chat', model, tuInput, tuOutput);
  }
}

/**
 * Generate a complete response from Claude (for WhatsApp, voice, etc.)
 * Returns the full text response
 */
export async function generateResponse(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 768,
  modelOverride?: string,
  category: TokenCategory = 'chat'
): Promise<string> {
  const anthropic = getClient();
  const model = modelOverride || getModel();

  // Retry logic
  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      const response = await (anthropic.messages.create as any)({
        model,
        max_tokens: maxTokens,
        system: cacheable(systemPrompt),
        messages: [{ role: 'user', content: userPrompt }],
      });

      const { input, output } = usageFrom(response);
      await recordTokenUsage(category, model, input, output);

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
  maxTokens: number = 1024,
  category: TokenCategory = 'chat'
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

        response = await (anthropic.messages.create as any)({
          model,
          max_tokens: maxTokens,
          system: cacheable(systemPrompt),
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

    const { input: tuIn, output: tuOut } = usageFrom(response);
    await recordTokenUsage(category, model, tuIn, tuOut);

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

    // Unexpected stop_reason - return whatever text we have
    return responseText;
  }

  console.warn('[ClaudeClient] Tool loop exhausted maxToolRounds');
  return 'Hey! Let me connect you with the team directly. They\'ll reach out to you shortly.';
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

// ─── Vision: extract structured data from an image ────────────────────────────

export type VisionMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

/**
 * Send an image + a system/user prompt to Claude and return the raw text reply.
 * Vision-capable models only (Haiku 4.5 / Sonnet / Opus all qualify). Used by
 * the "add lead from screenshot" flow to read WhatsApp chats. Shares the same
 * client + overloaded-retry logic as the text helpers above.
 */
export async function generateFromImage(
  systemPrompt: string,
  userPrompt: string,
  imageBase64: string,
  mediaType: VisionMediaType = 'image/png',
  maxTokens: number = 1024
): Promise<string> {
  const anthropic = getClient();
  const model = getModel();

  const maxRetries = 3;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }

      const response = await (anthropic.messages.create as any)({
        model,
        max_tokens: maxTokens,
        system: cacheable(systemPrompt),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: imageBase64 },
              },
              { type: 'text', text: userPrompt },
            ],
          },
        ],
      });

      const { input, output } = usageFrom(response);
      await recordTokenUsage('vision', model, input, output);

      const content = response.content?.[0];
      if (content && content.type === 'text') {
        return content.text.trim();
      }
      return '';
    } catch (error: any) {
      lastError = error;
      const isOverloaded =
        error?.error?.type === 'overloaded_error' ||
        error?.message?.includes('overloaded');
      if (!isOverloaded || attempt >= maxRetries) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Failed to generate from image after retries');
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
