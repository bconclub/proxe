/**
 * Unified PROXe Agent — Core Types
 * Channel-agnostic interfaces for the AI engine
 */

export type Channel = 'web' | 'whatsapp' | 'voice' | 'social';

export interface AgentInput {
  channel: Channel;
  message: string;
  messageCount: number;
  sessionId: string;
  userProfile: {
    name?: string;
    email?: string;
    phone?: string;
    websiteUrl?: string;
  };
  conversationHistory: HistoryEntry[];
  summary: string;
  usedButtons?: string[];
  metadata?: Record<string, any>;
}

export interface AgentOutput {
  response: string;
  followUps: string[];
  updatedSummary?: string;
  intent: ExtractedIntent;
  leadId?: string | null;
}

export interface ExtractedIntent {
  userType?: string;       // 'student' | 'parent' | 'professional'
  courseInterest?: string;  // 'pilot' | 'helicopter' | 'drone' | 'cabin'
  timeline?: string;        // 'asap' | '1-3mo' | '6+mo' | '1yr+'
  questionsAsked?: string[]; // 'cost' | 'eligibility' | 'timeline' | 'course'
  buttonClicks?: string[];
}

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface KnowledgeResult {
  id: string;
  content: string;
  metadata: {
    table: string;
    brand?: string;
    source_type?: string;
    chunk_index?: number;
    search_method?: string;
    relevance?: number;
  };
}

export interface StreamChunk {
  type: 'chunk' | 'followUps' | 'done' | 'error';
  text?: string;
  followUps?: string[];
  error?: string;
}
