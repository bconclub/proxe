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
  cleanDisplayName,
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
  type AttributionSignal,
  normalizePhone,
  ensureOrUpdateLead,
  updateLeadProfile,
} from './leadManager';

// Attribution (source / first-touch resolution)
export {
  type AttributionPayload,
  deriveSource,
  deriveFirstTouch,
  buildAttribution,
} from './attribution';

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
  type BookingSessionType,
  type ExistingBooking,
  type TimeSlot,
  getAvailableBookingSlotStarts,
  getBookableSlotStartsForDate,
  getGoogleCalendarAuth,
  checkExistingBooking,
  isAllowedBookingTime,
  normalizeBookingSessionType,
  storeBooking,
  getAvailableSlots,
  createCalendarEvent,
  deleteCalendarEvent,
  cancelBooking,
} from './bookingManager';

// WhatsApp messaging
export {
  sendWhatsAppText,
  sendWhatsAppTemplate,
  sendBookingConfirmation,
  sendBookingReminder,
  sendMissedCallMessage,
  sendWhatsAppInteractiveButtons,
} from './whatsappSender';

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

// Transactional email (Resend)
export {
  type SendResult,
  sendEmail,
  sendInvitationEmail,
} from './email';

// Note classification + action orchestrator (shared by admin-notes + log-call)
export {
  type CallOutcome,
  type NoteClassification,
  type ClassifyAndActInput,
  type OrchestratorResult,
  classifyNote,
  resolveBookingDate,
  classifyAndAct,
} from './noteOrchestrator';
