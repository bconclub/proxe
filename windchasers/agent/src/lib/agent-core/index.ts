/**
 * Unified PROXe Agent Core — Public API
 */

// Engine (main entry point)
export { process, processStream, isConfigured, getErrorMessage } from './engine';

// Types
export type {
  AgentInput,
  AgentOutput,
  Channel,
  ExtractedIntent,
  HistoryEntry,
  KnowledgeResult,
  StreamChunk,
} from './types';

// Individual modules (for direct access if needed)
export { searchKnowledgeBase } from './knowledgeSearch';
export { buildPrompt } from './promptBuilder';
export { streamResponse, generateResponse, generateShort } from './claudeClient';
export { extractIntent, isBookingIntent } from './intentExtractor';
export { generateFollowUps } from './followUpGenerator';
export { generateSummary } from './summarizer';
