/**
 * services/ — Shared business logic for the unified PROXe agent
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

// Cross-channel context
export {
  type CustomerContext,
  type WindchasersUserProfile,
  extractTopics,
  formatBookingInfo,
  fetchCustomerContext,
  updateBrandProfile,
} from './contextBuilder';
