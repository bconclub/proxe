/**
 * services/ - Shared business logic for the unified PROXe agent
 *
 * Phase 2 of the Unified Agent Architecture.
 * These modules are channel-agnostic and used by both web and WhatsApp adapters.
 *
 * Extracted from:
 *   - web-agent/src/lib/chatSessions.ts (2174 lines)
 *   - web-agent/src/app/api/calendar/book/route.ts
 *   - web-agent/src/app/api/calendar/availability/route.ts
 *   - dashboard/api/integrations/whatsapp/system-prompt/route.ts
 */

// Shared utilities
export {
  getISTTimestamp,
  cleanSummary,
  stripHTML,
  formatTimeForDisplay,
  formatDate,
  isLikelyRealPersonName,
} from './utils';

// Supabase clients
export {
  getServiceClient,
  getAnonClient,
  getClient,
} from './supabase';

// Session management
export {
  type Channel,
  type SessionRecord,
  type UserInput,
  getChannelTable,
  mapSession,
  initializeSession,
  ensureSession,
  updateChannelData,
} from './sessionManager';

// Lead management
export {
  normalizePhone,
  ensureOrUpdateLead,
  updateLeadProfile,
} from './leadManager';

// Conversation logging
export {
  type SessionSummary,
  type ConversationMessage,
  addUserInput,
  upsertSummary,
  fetchSummary,
  logMessage,
  fetchConversations,
} from './conversationLogger';

// Booking management
export {
  type BookingData,
  type ExistingBooking,
  type TimeSlot,
  getGoogleCalendarAuth,
  checkExistingBooking,
  storeBooking,
  getAvailableSlots,
  createCalendarEvent,
} from './bookingManager';

// WhatsApp messaging
export {
  sendWhatsAppText,
  sendWhatsAppTemplate,
  sendBookingConfirmation,
  sendBookingReminder,
  sendMissedCallMessage,
  renderPATResultBody,
  renderDemoOnlineBody,
  renderDemoOfflineBody,
  TIER_LABELS,
  TIER_MESSAGES,
  TEMPLATE_HEADERS,
  TEMPLATE_BUTTONS,
  sendDemoBookedConfirmation, // @deprecated — use sendDemoConfirmation
  sendDemoConfirmation,
  type DemoFormat,
  sendPATResult,
  sendFacebookLeadWelcome,
  sendWhatsAppInteractiveButtons,
} from './whatsappSender';

// Quick-reply (interactive button) triggers + LLM button extraction
export {
  findQuickReplyFor,
  extractButtonsFromLLMResponse,
  type QuickReplyConfig,
} from './quickReplyMap';

// Cross-channel context
export {
  type CustomerContext,
  type BrandUserProfile,
  type WindchasersUserProfile,
  extractTopics,
  formatBookingInfo,
  fetchCustomerContext,
  updateBrandProfile,
} from './contextBuilder';

// Attribution (Source / First Touch / Last Touch)
export {
  type AttributionPayload,
  deriveSource,
  deriveFirstTouch,
  buildAttribution,
} from './attribution';

// Note orchestrator (classify + act)
export {
  type CallOutcome,
  type NoteClassification,
  type ClassifyAndActInput,
  type OrchestratorResult,
  classifyAndAct,
  classifyNote,
} from './noteOrchestrator';
