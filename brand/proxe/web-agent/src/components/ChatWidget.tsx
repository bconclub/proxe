'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useChat } from '@/hooks/useChat';
import type { Message } from '@/hooks/useChatStream';
import { InfinityLoader } from '@/components/shared/InfinityLoader';
import { BookingCalendarWidget, type BookingCalendarWidgetProps } from '@/components/shared/BookingCalendarWidget';
import { DeployFormInline } from '@/components/shared/DeployFormInline';
import type { BrandConfig } from '@/configs';
import { useDeployModal } from '@/contexts/DeployModalContext';
import styles from './ChatWidget.module.css';
import {
  ensureSession,
  updateSessionProfile,
  fetchSummary,
  upsertSummary,
  storeBooking,
  checkExistingBooking,
  fetchConversations,
  type SessionRecord,
} from '@/lib/chatSessions';
import {
  getStoredSessionId,
  storeSessionId,
  getStoredUser,
  storeUserProfile,
  type LocalUserProfile,
} from '@/lib/chatLocalStorage';
import { getSupabaseClient } from '@/lib/supabase';
import { proxeConfig } from '@/configs/proxe.config';

interface ChatWidgetProps {
  apiUrl?: string;
  widgetStyle?: 'searchbar' | 'bubble';
}

// PROXE Logo component (white icon version)
const PROXELogo = () => (
  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 643 643" style={{ width: '100%', height: '100%' }}>
    <path d="M0 0 C2.55518105 -0.00322395 5.11036192 -0.00658882 7.6655426 -0.01008606 C12.99993388 -0.01603919 18.33430821 -0.01797345 23.66870117 -0.01733398 C29.7556638 -0.01673585 35.84253706 -0.02725095 41.92947716 -0.04307765 C47.87319933 -0.05795756 53.81689546 -0.0613159 59.76063728 -0.06072426 C62.24751207 -0.06188581 64.73438789 -0.06620156 67.22125053 -0.07405663 C89.27651721 -0.13719172 111.50963207 0.39970382 133.25390625 4.41796875 C134.45168701 4.63267822 135.64946777 4.8473877 136.88354492 5.06860352 C147.60885456 7.06782473 158.02060533 9.75624396 168.37890625 13.16796875 C169.07161621 13.39033203 169.76432617 13.61269531 170.47802734 13.84179688 C191.49998952 20.69734064 211.08444408 32.02655021 227.1953125 47.16015625 C229.37705947 49.22309608 229.37705947 49.22309608 231.88671875 51.109375 C236.4059078 54.84231015 239.77832631 59.57161291 243.37890625 64.16796875 C244.02988281 64.96847656 244.68085937 65.76898438 245.3515625 66.59375 C261.74568838 87.70076627 270.32398638 114.04301497 274.37890625 140.16796875 C274.49459961 140.85906738 274.61029297 141.55016602 274.72949219 142.26220703 C282.29318243 189.02466583 276.19902808 244.9042784 249.0546875 284.67578125 C242.86549658 293.12246066 235.81558031 300.81162913 228.37890625 308.16796875 C227.6209375 308.92335938 226.86296875 309.67875 226.08203125 310.45703125 C183.60584066 350.90410446 121.23455315 356.3199838 65.62890625 356.3359375 C63.63650026 356.33834297 61.64409426 356.34075098 59.65168858 356.34339792 C53.40043889 356.35147619 47.14920354 356.35398837 40.89794922 356.35327148 C34.53035799 356.35267292 28.16285207 356.363196 21.79528236 356.37901515 C16.25824922 356.3922615 10.72124335 356.39744833 5.18419456 356.39681607 C1.90836564 356.39656594 -1.36737224 356.40012154 -4.64318848 356.40999413 C-26.38672218 356.46938784 -48.32070333 356.0589274 -69.74609375 351.98046875 C-71.47291382 351.65900879 -71.47291382 351.65900879 -73.23461914 351.33105469 C-105.21391229 345.11926535 -134.61598121 333.2708796 -159.62109375 312.16796875 C-160.48605469 311.44480469 -161.35101563 310.72164063 -162.2421875 309.9765625 C-167.1711856 305.72914592 -171.55937074 301.24923357 -175.62109375 296.16796875 C-176.44351563 295.14445312 -177.2659375 294.1209375 -178.11328125 293.06640625 C-203.72182995 260.22737116 -212.112449 219.37733841 -211.93359375 178.54296875 C-211.93177094 177.67255951 -211.92994812 176.80215027 -211.92807007 175.90536499 C-211.79053856 136.73576322 -204.02988251 95.33486431 -178.62109375 64.16796875 C-178.19634766 63.63397461 -177.77160156 63.09998047 -177.33398438 62.54980469 C-147.98305281 25.80939317 -103.87677367 9.67884258 -58.62109375 2.98046875 C-57.50653809 2.81329346 -56.39198242 2.64611816 -55.24365234 2.47387695 C-36.90877248 -0.10235019 -18.47621475 0.00554858 0 0 Z M-100.62109375 91.16796875 C-101.4615625 91.91691406 -102.30203125 92.66585937 -103.16796875 93.4375 C-117.16855627 106.56835405 -124.00505891 123.93954179 -128.62109375 142.16796875 C-128.62109375 143.15796875 -128.62109375 144.14796875 -128.62109375 145.16796875 C-22.36109375 145.16796875 83.89890625 145.16796875 193.37890625 145.16796875 C188.17784025 120.8963274 178.51473758 98.48989587 157.00390625 84.41796875 C155.14428381 83.30844612 153.26890815 82.22491196 151.37890625 81.16796875 C150.44304687 80.64460938 149.5071875 80.12125 148.54296875 79.58203125 C115.02122643 61.87751855 75.19191438 63.8227628 38.39355469 63.90722656 C33.38502202 63.91862023 28.37670188 63.91184575 23.36817646 63.90034962 C-42.92876378 62.5392535 -42.92876378 62.5392535 -100.62109375 91.16796875 Z M-128.62109375 210.16796875 C-125.15512694 229.23078619 -118.87165345 245.7767931 -105.62109375 260.16796875 C-105.08226562 260.79832031 -104.5434375 261.42867188 -103.98828125 262.078125 C-85.80274544 282.13704515 -54.52949136 289.03297211 -28.62109375 291.16796875 C-24.65424345 291.3166575 -20.69031115 291.33505996 -16.72094727 291.3449707 C-15.56170746 291.3515419 -14.40246765 291.3581131 -13.20809937 291.36488342 C-9.38873207 291.38451451 -5.56940411 291.39626245 -1.75 291.40625 C-0.43370039 291.41032553 0.88259922 291.41440105 2.2387867 291.41860008 C8.50187462 291.43762766 14.76495108 291.45185362 21.02806228 291.46021205 C28.1796475 291.46992108 35.33091798 291.49608268 42.48239273 291.53671294 C48.05745887 291.56726177 53.63243696 291.58171756 59.20758492 291.58499306 C62.51390939 291.58730356 65.81963419 291.59782163 69.12591362 291.62145424 C103.19356045 291.84963689 140.10551561 288.14765068 166.37890625 264.16796875 C167.10851562 263.51957031 167.838125 262.87117188 168.58984375 262.203125 C173.95691046 257.17535561 177.75339023 251.53934043 181.37890625 245.16796875 C181.97832031 244.11738281 182.57773437 243.06679688 183.1953125 241.984375 C188.18472261 232.66290687 193.37890625 220.92132356 193.37890625 210.16796875 C87.11890625 210.16796875 -19.14109375 210.16796875 -128.62109375 210.16796875 Z " fill="#FFFFFF" transform="translate(281.62109375,128.83203125)"/>
  </svg>
);

// Infinity symbol component (white)
const InfinitySymbol = () => (
  <svg xmlns="http://www.w3.org/2000/svg" enableBackground="new 0 0 32 32" viewBox="0 0 32 32" style={{ width: '100%', height: '100%' }}>
    <path d="M27.89453,10.09025c-2.22363-1.14404-4.86914-0.95166-6.9043,0.50146L16,14.15666l-4.99023-3.56494c-2.03516-1.45313-4.68262-1.64551-6.9043-0.50146C1.88184,11.23478,0.5,13.49894,0.5,15.99992s1.38184,4.76514,3.60547,5.90967c2.22461,1.14355,4.86914,0.95215,6.9043-0.50146L16,17.84318l4.99023,3.56494c1.15332,0.82373,2.50195,1.24219,3.85938,1.24219c1.03809,0,2.08203-0.24512,3.04492-0.74072C30.11816,20.76506,31.5,18.5009,31.5,15.99992S30.11816,11.23478,27.89453,10.09025z M9.26563,18.96672c-1.13281,0.80957-2.54688,0.91357-3.78809,0.27539C4.23926,18.60441,3.5,17.3925,3.5,15.99992s0.73926-2.60449,1.97754-3.24219c0.53906-0.27686,1.11133-0.41406,1.67871-0.41406c0.73828,0,1.46875,0.23193,2.10938,0.68945l4.15332,2.9668L9.26563,18.96672z M26.52246,19.24211c-1.24023,0.63818-2.6543,0.53418-3.78809-0.27539l-4.15332-2.9668l4.15332-2.9668c1.13379-0.80957,2.54785-0.91162,3.78809-0.27539C27.76074,13.39543,28.5,14.60734,28.5,15.99992S27.76074,18.60441,26.52246,19.24211z" fill="#ffffff"/>
  </svg>
);


const ICONS = {
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <path d="m21 21-4.35-4.35"></path>
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
    </svg>
  ),
  reset: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
      <path d="M3 21v-5h5"></path>
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  ),
  chevronDown: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="8" r="4"/>
      <path d="M12 14c-6 0-8 3-8 3v7h16v-7s-2-3-8-3z"/>
    </svg>
  ),
  ai: (brand: string, config?: BrandConfig) => {
    // Use brand config avatar if available
    if (config?.chatStructure?.avatar) {
      const avatarType = config.chatStructure.avatar.type;
      if (avatarType === 'logo' && brand === 'proxe') {
        return <PROXELogo />;
      }
      if (avatarType === 'image' && config.chatStructure.avatar.source) {
        return <img src={config.chatStructure.avatar.source} alt={config.name} style={{ width: '100%', height: '100%' }} />;
      }
    }
    // Fallback: Use PROXE logo for PROXe brand, infinity symbol for others
    if (brand === 'proxe') {
      return <PROXELogo />;
    }
    return <InfinitySymbol />;
  },
  infinity: <InfinitySymbol />,
};

// Helper function to clean metadata strings from conversation summary
const cleanSummary = (summary: string | null | undefined): string => {
  if (!summary) return '';
  return summary
    .replace(/\[User's name is[^\]]+\]/gi, '')
    .replace(/\[Booking Status:[^\]]+\]/gi, '')
    .replace(/\n\n+/g, '\n')
    .trim();
};

export function ChatWidget({ apiUrl, widgetStyle = 'searchbar' }: ChatWidgetProps) {
  const brand = 'proxe';
  const config = proxeConfig;
  const { openModal: openDeployModal, setOnFormSubmit } = useDeployModal();
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showQuickButtons, setShowQuickButtons] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isInputActive, setIsInputActive] = useState(false);
  const [isSearchbarHovered, setIsSearchbarHovered] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showCalendly, setShowCalendly] = useState<string | null>(null);
  const [calendarAnchorId, setCalendarAnchorId] = useState<string | null>(null);
  const [pendingCalendar, setPendingCalendar] = useState(false);
  const [showDeployForm, setShowDeployForm] = useState<string | null>(null);
  const [bookingCompleted, setBookingCompleted] = useState(false);
  const [usedButtons, setUsedButtons] = useState<string[]>([]);
  const [showVideo, setShowVideo] = useState<string | null>(null);
  const [videoAnchorId, setVideoAnchorId] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(null);
  const [externalSessionId, setExternalSessionId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<LocalUserProfile>({});
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const [emailPromptDismissed, setEmailPromptDismissed] = useState(false);
  const [phonePromptDismissed, setPhonePromptDismissed] = useState(false);
  const [namePromptDismissed, setNamePromptDismissed] = useState(false);
  const [hasAskedName, setHasAskedName] = useState(false);
  const [hasAskedEmail, setHasAskedEmail] = useState(false);
  const [hasAskedPhone, setHasAskedPhone] = useState(false);
  const [hasReceivedFirstResponse, setHasReceivedFirstResponse] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [pendingButtons, setPendingButtons] = useState<string[]>([]);
  const [pendingRequirement, setPendingRequirement] = useState<'name' | 'email' | 'phone' | null>(null);
  const [skipAddingUserMessage, setSkipAddingUserMessage] = useState(false);
  const [conversationSummary, setConversationSummary] = useState<string>('');
  const [recentHistory, setRecentHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [dynamicQuickButtons, setDynamicQuickButtons] = useState<string[] | null>(null);
  const [exploreButtons, setExploreButtons] = useState<string[] | null>(null);
  const [hasInteractedWithSearchbar, setHasInteractedWithSearchbar] = useState(false);
  const SEARCHBAR_BASE_OFFSET = 60;
  const SEARCHBAR_KEYBOARD_OFFSET = 20;
  const [isDockedBubble, setIsDockedBubble] = useState(false);
  const SEARCHBAR_KEYBOARD_GAP = 5;
  const EMAIL_PROMPT_THRESHOLD = 5;
  const PHONE_PROMPT_THRESHOLD = 7;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const quickButtonsRef = useRef<HTMLDivElement>(null);
  const hasEverOpenedRef = useRef(false);
  const chatboxContainerRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const searchbarWrapperRef = useRef<HTMLDivElement>(null);
  const namePromptInputRef = useRef<HTMLInputElement>(null);
  const emailPromptInputRef = useRef<HTMLInputElement>(null);
  const phonePromptInputRef = useRef<HTMLInputElement>(null);
  const dragStartX = useRef<number>(0);
  const dragStartScrollLeft = useRef<number>(0);
  const hasDraggedRef = useRef<boolean>(false);
  const interactionCountRef = useRef<number>(0);
  const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const deployFormScrolledRef = useRef<boolean>(false);
  const conversationsToRestoreRef = useRef<Array<{ id: string; type: 'user' | 'ai'; text: string; created_at: string }>>([]);
  const hasRestoredMessagesRef = useRef<boolean>(false);
  const hasShownWelcomeRef = useRef<boolean>(false);
  const brandKey: 'proxe' = 'proxe';
  const finalApiUrl = apiUrl || config.apiUrl || '/api/proxe/chat';

  const handleOpenChat = useCallback(() => {
    setShowCloseConfirm(false);
    setIsDockedBubble(true);
    setIsOpen(true);
    setIsExpanded(false);
    setShowQuickButtons(false);
    setIsInputActive(true);
  }, []);

  // Once chat opens, keep widget in docked bubble mode so it docks right as a bubble
  useEffect(() => {
    if (isOpen) {
      setIsDockedBubble(true);
    }
  }, [isOpen]);

  useEffect(() => {
    let cancelled = false;

    const initializeSession = async () => {
      try {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[ChatWidget PROXe] Initialising session', { brandKey });
        }

        let storedId = getStoredSessionId(brandKey);
        if (!storedId) {
          storedId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
          storeSessionId(storedId, brandKey);
          if (process.env.NODE_ENV !== 'production') {
            console.log('[ChatWidget] Generated new session id', { storedId, brandKey });
          }
        }
        if (cancelled) return;
        setExternalSessionId(storedId);

        const storedUser = getStoredUser(brandKey);
        if (storedUser && !cancelled) {
          setUserProfile(storedUser);
          if (typeof storedUser.emailSkipped === 'boolean') {
            setEmailPromptDismissed(storedUser.emailSkipped);
          }
          if (typeof storedUser.phoneSkipped === 'boolean') {
            setPhonePromptDismissed(storedUser.phoneSkipped);
          }
          if (typeof storedUser.promptedName === 'boolean') {
            setHasAskedName(storedUser.promptedName);
          }
          if (typeof storedUser.promptedEmail === 'boolean') {
            setHasAskedEmail(storedUser.promptedEmail);
          }
          if (typeof storedUser.promptedPhone === 'boolean') {
            setHasAskedPhone(storedUser.promptedPhone);
          }
        }

        // Always create session (even for incomplete leads) so we can track the conversation
        // But only populate with data when it becomes a complete lead
        const hasCompleteLead = storedUser && 
          storedUser.name?.trim() && 
          storedUser.email?.trim() && 
          storedUser.phone?.trim();

        let record: SessionRecord | null = null;
        
        // Create session regardless of lead completeness
        record = await ensureSession(storedId, 'web', brandKey);
        if (!record) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[ChatWidget] Unable to ensure session in Supabase', {
              storedId,
              brandKey,
              recordPresent: Boolean(record),
              cancelled,
            });
          }
          return;
        }
        
        // Only set session record if it's a complete lead
        // This ensures we only track complete leads in the UI state
        if (hasCompleteLead) {
          setSessionRecord(record);
        } else {
          if (process.env.NODE_ENV !== 'production') {
            console.log('[ChatWidget] Session created but incomplete lead - will populate when complete', {
              hasName: Boolean(storedUser?.name?.trim()),
              hasEmail: Boolean(storedUser?.email?.trim()),
              hasPhone: Boolean(storedUser?.phone?.trim()),
            });
          }
        }
        
        if (cancelled) return;

        // Sync profile differences back to Supabase/local storage
        const updates: LocalUserProfile = { ...storedUser };
        let needsUpdate = false;
        let needsSupabaseSync = false;
        
        // Sync from Supabase to localStorage
        if (record.userName && record.userName !== storedUser?.name) {
          updates.name = record.userName;
          needsUpdate = true;
        }
        if (record.email && record.email !== storedUser?.email) {
          updates.email = record.email;
          needsUpdate = true;
        }
        if (record.phone && record.phone !== storedUser?.phone) {
          updates.phone = record.phone;
          needsUpdate = true;
        }
        if (record.websiteUrl && record.websiteUrl !== storedUser?.websiteUrl) {
          updates.websiteUrl = record.websiteUrl;
          needsUpdate = true;
        }
        
        // Sync from localStorage to Supabase (if localStorage has data Supabase doesn't)
        if (storedUser?.name && !record.userName) {
          needsSupabaseSync = true;
        }
        if (storedUser?.email && !record.email) {
          needsSupabaseSync = true;
        }
        if (storedUser?.phone && !record.phone) {
          needsSupabaseSync = true;
        }
        if (storedUser?.websiteUrl && !record.websiteUrl) {
          needsSupabaseSync = true;
        }
        
        if (needsUpdate) {
          storeUserProfile(updates, brandKey);
          setUserProfile(updates);
          if (updates.name) {
            setHasAskedName(true);
          }
          if (updates.email) {
            setHasAskedEmail(true);
          }
          if (updates.phone) {
            setHasAskedPhone(true);
          }
        }
        
        // Sync localStorage data to Supabase if needed
        if (needsSupabaseSync && storedUser) {
          await updateSessionProfile(
            storedId,
            {
              userName: storedUser.name,
              email: storedUser.email ?? null,
              phone: storedUser.phone ?? null,
              websiteUrl: storedUser.websiteUrl ?? null,
            },
            brandKey
          );
        }

        const summaryRow = await fetchSummary(storedId, brandKey);

        if (!cancelled) {
          const cleanedSummary = cleanSummary(summaryRow?.summary);
          setConversationSummary(cleanedSummary);
          // Restore user inputs from session record if available
          if (record.userInputsSummary && record.userInputsSummary.length > 0) {
            // Convert user inputs to history format for context
            const history = record.userInputsSummary
              .slice(-6) // Last 6 user inputs
              .map((userInput) => ({
                role: 'user' as const,
                content: userInput.input,
              }));
            setRecentHistory(history);
            // Don't count restored messages towards email/phone prompts - start fresh each session
            interactionCountRef.current = 0;
            if (process.env.NODE_ENV !== 'production') {
              console.log('[ChatWidget] Restored user inputs', {
                inputsCount: record.userInputsSummary.length,
                hasSummary: Boolean(summaryRow?.summary),
                hasBooking: Boolean(record.bookingDate),
              });
            }
          } else if (process.env.NODE_ENV !== 'production') {
            console.log('[ChatWidget] No prior user inputs for session', { sessionId: record.id });
          }
          
          // Fetch and restore conversation messages if we have a lead_id
          // Get lead_id from web_sessions
          const supabase = getSupabaseClient();
          if (supabase && storedId) {
            try {
              const { data: sessionData, error: sessionError } = await supabase
                .from('web_sessions')
                .select('lead_id')
                .eq('external_session_id', storedId)
                .maybeSingle();
              
              if (!sessionError && sessionData?.lead_id) {
                const conversations = await fetchConversations(sessionData.lead_id, 'web', brandKey);
                if (conversations.length > 0 && !cancelled) {
                  // Store conversations to restore when chat opens
                  if (process.env.NODE_ENV !== 'production') {
                    console.log('[ChatWidget] Found conversations to restore', {
                      count: conversations.length,
                      leadId: sessionData.lead_id
                    });
                  }
                  // Convert to Message format and store in ref
                  conversationsToRestoreRef.current = conversations.map((conv) => ({
                    id: conv.id,
                    type: conv.sender === 'customer' ? 'user' as const : 'ai' as const,
                    text: conv.content,
                    created_at: conv.created_at
                  }));
                }
              }
            } catch (err) {
              console.error('[ChatWidget] Error fetching lead_id for conversation restoration:', err);
            }
          }
        }
      } catch (error) {
        console.error('[ChatWidget] Failed to initialise session', error);
      }
    };

    initializeSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (showNamePrompt) {
      setNameInput(userProfile.name || '');
    }
  }, [showNamePrompt, userProfile.name]);

  // Removed auto-focus to prevent keyboard from automatically opening
  // User will click on input to open keyboard, keeping full screen experience
  // useEffect(() => {
  //   if (showNamePrompt && namePromptInputRef.current) {
  //     namePromptInputRef.current.focus();
  //   }
  // }, [showNamePrompt]);

  useEffect(() => {
    if (showEmailPrompt) {
      setEmailInput(userProfile.email || '');
    }
  }, [showEmailPrompt, userProfile.email]);

  // Removed auto-focus to prevent keyboard from automatically opening
  // User will click on input to open keyboard, keeping full screen experience
  // useEffect(() => {
  //   if (showEmailPrompt && emailPromptInputRef.current) {
  //     emailPromptInputRef.current.focus();
  //   }
  // }, [showEmailPrompt]);

  useEffect(() => {
    if (showPhonePrompt) {
      // Remove +1 prefix if present
      const cleanPhone = userProfile.phone ? userProfile.phone.replace(/^\+1\s*/, '').trim() : '';
      setPhoneInput(cleanPhone);
    }
  }, [showPhonePrompt, userProfile.phone]);

  // Removed auto-focus to prevent keyboard from automatically opening
  // User will click on input to open keyboard, keeping full screen experience
  // useEffect(() => {
  //   if (showPhonePrompt && phonePromptInputRef.current) {
  //     phonePromptInputRef.current.focus();
  //   }
  // }, [showPhonePrompt]);

  const applyLocalProfile = useCallback((updates: LocalUserProfile) => {
    setUserProfile((prev) => {
      const merged: LocalUserProfile = { ...prev, ...updates };
      storeUserProfile(merged, brandKey);
      return merged;
    });

    if (typeof updates.emailSkipped === 'boolean') {
      setEmailPromptDismissed(updates.emailSkipped);
    }
    if (typeof updates.phoneSkipped === 'boolean') {
      setPhonePromptDismissed(updates.phoneSkipped);
    }
    if (typeof updates.promptedName === 'boolean') {
      setHasAskedName(updates.promptedName);
    }
    if (typeof updates.promptedEmail === 'boolean') {
      setHasAskedEmail(updates.promptedEmail);
    }
    if (typeof updates.promptedPhone === 'boolean') {
      setHasAskedPhone(updates.promptedPhone);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
      if (updates.name) {
        setHasAskedName(true);
        setNamePromptDismissed(false);
      }
      setShowNamePrompt(false);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
      if (updates.email) {
        setHasAskedEmail(true);
      }
      setShowEmailPrompt(false);
      if (updates.email) {
        setEmailPromptDismissed(false);
      }
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'phone')) {
      if (updates.phone) {
        setHasAskedPhone(true);
      }
      setShowPhonePrompt(false);
      if (updates.phone) {
        setPhonePromptDismissed(false);
      }
    }
  }, [brandKey]);

  const persistUserProfile = useCallback(async (updates: LocalUserProfile, options: { sync?: boolean } = {}) => {
    const { sync = true } = options;
    console.log('[persistUserProfile] Called', { updates, sync, externalSessionId, brandKey });
    
    applyLocalProfile(updates);

    if (!sync) {
      console.log('[persistUserProfile] Sync disabled, skipping Supabase update');
      return;
    }
    
    if (!externalSessionId) {
      console.warn('[persistUserProfile] No externalSessionId, cannot update Supabase', { updates });
      return;
    }

    const supabaseUpdates: { userName?: string; phone?: string | null; email?: string | null; websiteUrl?: string | null } = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'name') && updates.name !== undefined) {
      supabaseUpdates.userName = updates.name && updates.name.trim() ? updates.name.trim() : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'email') && updates.email !== undefined) {
      supabaseUpdates.email = updates.email && updates.email.trim() ? updates.email.trim() : null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'phone') && updates.phone !== undefined) {
      supabaseUpdates.phone = updates.phone && updates.phone.trim() ? updates.phone.trim() : null;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'websiteUrl') && updates.websiteUrl !== undefined) {
      supabaseUpdates.websiteUrl = updates.websiteUrl && updates.websiteUrl.trim() ? updates.websiteUrl.trim() : null;
    }
    
    console.log('[persistUserProfile] Prepared Supabase updates', { supabaseUpdates, updateCount: Object.keys(supabaseUpdates).length });
    
    if (Object.keys(supabaseUpdates).length > 0) {
      console.log('[persistUserProfile] Calling updateSessionProfile', { externalSessionId, supabaseUpdates, brandKey });
      await updateSessionProfile(externalSessionId, supabaseUpdates, brandKey);
      
      // After updating profile, check if we now have a complete lead and create session if needed
      const updatedProfile = { ...userProfile, ...updates };
      const hasCompleteLead = updatedProfile.name?.trim() && 
                              updatedProfile.email?.trim() && 
                              updatedProfile.phone?.trim();
      
      if (hasCompleteLead && !sessionRecord) {
        // Session was just created, fetch it to update state
        const newRecord = await ensureSession(externalSessionId, 'web', brandKey);
        if (newRecord) {
          setSessionRecord(newRecord);
        }
      }
    } else {
      console.warn('[persistUserProfile] No Supabase updates to apply', { updates });
    }
  }, [applyLocalProfile, externalSessionId, brandKey, userProfile, sessionRecord]);

  const handleContactDraft = useCallback((data: { name?: string; email?: string; phone?: string; websiteUrl?: string }) => {
    const updates: LocalUserProfile = {};
    if (data.name && data.name.trim()) {
      updates.name = data.name.trim();
      updates.promptedName = true;
    }
    if (data.email && data.email.trim()) {
      updates.email = data.email.trim();
      updates.promptedEmail = true;
    }
    if (data.phone && data.phone.trim()) {
      updates.phone = data.phone.trim();
      updates.promptedPhone = true;
    }
    if (data.websiteUrl && data.websiteUrl.trim()) {
      updates.websiteUrl = data.websiteUrl.trim();
    }
    if (Object.keys(updates).length > 0) {
      applyLocalProfile(updates);
    }
  }, [applyLocalProfile]);

  const handleContactPersist = useCallback(async (data: { name?: string; email?: string; phone?: string; websiteUrl?: string }) => {
    console.log('[handleContactPersist] Called', { data, externalSessionId });
    const updates: LocalUserProfile = {};
    if (data.name && data.name.trim()) {
      updates.name = data.name.trim();
      updates.promptedName = true;
    }
    if (data.email && data.email.trim()) {
      updates.email = data.email.trim();
      updates.promptedEmail = true;
    }
    if (data.phone && data.phone.trim()) {
      updates.phone = data.phone.trim();
      updates.promptedPhone = true;
    }
    if (data.websiteUrl && data.websiteUrl.trim()) {
      updates.websiteUrl = data.websiteUrl.trim();
    }
    console.log('[handleContactPersist] Prepared updates', { updates, updateCount: Object.keys(updates).length });
    if (Object.keys(updates).length > 0) {
      await persistUserProfile(updates);
    } else {
      console.warn('[handleContactPersist] No valid updates to persist', { data });
    }
  }, [persistUserProfile, externalSessionId]);

  const appendHistory = (entry: { role: 'user' | 'assistant'; content: string }) => {
    historyRef.current = [...historyRef.current, entry].slice(-6);
    setRecentHistory(historyRef.current);
  };


  const buildRequestPayload = () => ({
    session: {
      externalId: externalSessionId,
      supabaseId: sessionRecord?.id ?? null,
      brand: brandKey,
      user: {
        name: userProfile.name ?? null,
        email: userProfile.email ?? null,
        phone: userProfile.phone ?? null,
      },
    },
    memory: {
      summary: cleanSummary(conversationSummary),
      recentHistory: historyRef.current,
    },
  });

  const closeCalendarWidget = useCallback(() => {
    setShowCalendly(null);
    setPendingCalendar(false);
    setCalendarAnchorId(null);
  }, []);

  const deployFormRef = useRef<HTMLDivElement>(null);
  
  const closeDeployForm = useCallback(() => {
    setShowDeployForm(null);
    deployFormScrolledRef.current = false;
  }, []);

  const closeVideoWidget = useCallback(() => {
    setShowVideo(null);
    setVideoAnchorId(null);
  }, []);

  const handleCloseChat = useCallback(() => {
    setShowCloseConfirm(false);
    setIsOpen(false);
    setIsInputActive(false);
    setIsExpanded(false);
    setShowQuickButtons(false);
    setIsSearchbarHovered(false);
    setIsDockedBubble(false);
    closeCalendarWidget();
    closeVideoWidget();
    closeDeployForm();
    setDynamicQuickButtons(null);
    setExploreButtons(null);
    // Don't reset hasRestoredMessagesRef - we want to restore conversations when reopening
    // Only reset if user explicitly resets the chat
  }, [closeCalendarWidget, closeVideoWidget, closeDeployForm]);

  const handleRequestCloseChat = useCallback(() => {
    setShowCloseConfirm(true);
  }, []);

  const handleCancelCloseChat = useCallback(() => {
    setShowCloseConfirm(false);
  }, []);

  const handleConfirmCloseChat = useCallback(() => {
    setShowCloseConfirm(false);
    handleCloseChat();
  }, [handleCloseChat]);

  const queuePendingMessage = (message: string, buttons: string[], requirement: 'name' | 'email' | 'phone') => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ChatWidget] Queueing pending message', { message, buttons });
    }
    setPendingUserMessage(message);
    setPendingButtons(buttons);
    setPendingRequirement(requirement);
    // Ensure chat panel is visible while we collect required details
    setIsOpen(true);
    setIsInputActive(true);
    setIsExpanded(true);
    setShowQuickButtons(false);
  };

  const requestNameBeforeProceed = (message: string, buttons: string[]) => {
    // Ask for name on first message, before AI responds
    if (
      !userProfile.name &&
      !hasAskedName &&
      !namePromptDismissed &&
      !showNamePrompt &&
      messageCount === 0 // First message
    ) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[ChatWidget] Requesting name before first AI response');
      }
      setHasAskedName(true);
      
      // Add user's message to chat immediately so it shows before the name prompt
      addUserMessage(message);
      
      // Queue the message for AI response after name is provided
      queuePendingMessage(message, buttons, 'name');
      
      // Set flag to skip adding user message again when sending to AI
      setSkipAddingUserMessage(true);
      
      // Ensure chat is open to show the name prompt
      setIsOpen(true);
      setIsInputActive(true);
      setIsExpanded(false);
      setShowQuickButtons(false);
      
      setShowNamePrompt(true);
      return true;
    }
    return false;
  };

  const requestEmailBeforeProceed = (message: string, buttons: string[]) => {
    if (!userProfile.email && !emailPromptDismissed && !hasAskedEmail && interactionCountRef.current >= EMAIL_PROMPT_THRESHOLD) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[ChatWidget] Requesting email before proceeding');
      }
      queuePendingMessage(message, buttons, 'email');
      applyLocalProfile({ promptedEmail: true });
      setHasAskedEmail(true);
      setShowEmailPrompt(true);
      return true;
    }
    return false;
  };

  const requestPhoneBeforeProceed = (message: string, buttons: string[]) => {
    if (!userProfile.phone && !phonePromptDismissed && !hasAskedPhone && interactionCountRef.current >= PHONE_PROMPT_THRESHOLD) {
      queuePendingMessage(message, buttons, 'phone');
      applyLocalProfile({ promptedPhone: true });
      setHasAskedPhone(true);
      setShowPhonePrompt(true);
      return true;
    }
    return false;
  };

  const submitMessage = async (rawMessage: string, buttons: string[] = usedButtons) => {
    const trimmed = rawMessage.trim();
    if (!trimmed) return;

    if (showCalendly) {
      closeCalendarWidget();
    }

    // Close any open prompt cards when user sends a message
    if (showNamePrompt) {
      setShowNamePrompt(false);
      setNamePromptDismissed(true);
    }
    if (showEmailPrompt) {
      setShowEmailPrompt(false);
    }
    if (showPhonePrompt) {
      setShowPhonePrompt(false);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[ChatWidget] Submitting message', { trimmed, buttons });
    }

    const nextCount = messageCount + 1;
    let contextualMessage = trimmed;
    let displayMessage = trimmed; // Message to show in chat and store

    const isBookingRepeat = bookingCompleted && containsBookingKeywords(trimmed);
    if (isBookingRepeat) {
      contextualMessage = `[Booking already scheduled] ${trimmed}`;
      // Don't add prefix to display message for booking repeat
    }

    // Add name context to AI message only (not displayed to user)
    if (nextCount === 1 && userProfile.name) {
      contextualMessage = `[User's name is ${userProfile.name}] ${trimmed}`;
      // displayMessage stays as original trimmed message
    }

    setInputValue('');
    setMessageCount(nextCount);
    setExploreButtons(null);
    setDynamicQuickButtons(null);

    if (containsBookingKeywords(trimmed) && !bookingCompleted) {
      setPendingCalendar(true);
    }

    setIsOpen(true);
    setIsInputActive(true);
    setIsExpanded(false);
    setShowQuickButtons(false);

    // Store the display message (without context prefix) in history
    appendHistory({ role: 'user', content: displayMessage });
    // Note: User input is saved server-side in /api/chat route to avoid duplicates

    // Send contextual message (with name context) to AI, but display original message in chat
    sendMessage(contextualMessage, nextCount, buttons, buildRequestPayload(), skipAddingUserMessage, displayMessage);
    
    // Reset the flag after using it
    if (skipAddingUserMessage) {
      setSkipAddingUserMessage(false);
    }
  };

  useEffect(() => {
    if (!pendingUserMessage || !pendingRequirement) return;

    const hasName = Boolean(userProfile.name && userProfile.name.trim());
    const hasEmail = Boolean(userProfile.email && userProfile.email.trim());
    const hasPhone = Boolean(userProfile.phone && userProfile.phone.trim());

    const requirementSatisfied =
      (pendingRequirement === 'name' && hasName) ||
      (pendingRequirement === 'email' && (hasEmail || emailPromptDismissed)) ||
      (pendingRequirement === 'phone' && (hasPhone || phonePromptDismissed));

    if (requirementSatisfied) {
      const message = pendingUserMessage;
      const buttons = pendingButtons.length ? pendingButtons : usedButtons;
      setPendingUserMessage(null);
      setPendingButtons([]);
      setPendingRequirement(null);
      submitMessage(message, buttons);
    }
  }, [
    pendingUserMessage,
    pendingRequirement,
    pendingButtons,
    usedButtons,
    userProfile.name,
    userProfile.email,
    userProfile.phone,
    emailPromptDismissed,
    phonePromptDismissed,
    submitMessage,
  ]);

  const flushPendingMessage = () => {
    if (!pendingUserMessage) return;
    const message = pendingUserMessage;
    const buttons = pendingButtons.length ? pendingButtons : usedButtons;
    setPendingUserMessage(null);
    setPendingButtons([]);
    setPendingRequirement(null);
    submitMessage(message, buttons);
  };

  const handleNameSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!nameInput.trim()) return;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ChatWidget] Name submitted', { name: nameInput.trim() });
    }
    // Set flag immediately to prevent re-asking
    setHasAskedName(true);
    setNamePromptDismissed(false);
    setShowNamePrompt(false);
    
    await persistUserProfile({
      name: nameInput.trim(),
      phoneSkipped: userProfile.phoneSkipped,
      promptedName: true,
    });
    setNameInput('');
  };

  const handleNameDismiss = () => {
    setNamePromptDismissed(true);
    setShowNamePrompt(false);
    flushPendingMessage();
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!emailInput.trim()) return;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ChatWidget] Email submitted');
    }
    // Set flag immediately to prevent re-asking
    setHasAskedEmail(true);
    setShowEmailPrompt(false);
    
    await persistUserProfile({
      email: emailInput.trim(),
      emailSkipped: false,
      promptedEmail: true,
    });
    setEmailInput('');
  };

  const handleEmailSkip = () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ChatWidget] Email prompt skipped');
    }
    persistUserProfile({ emailSkipped: true, promptedEmail: true }, { sync: false });
    setEmailInput('');
    setShowEmailPrompt(false);
  };

  const handlePhoneSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!phoneInput.trim()) return;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ChatWidget] Phone submitted');
    }
    // Set flag immediately to prevent re-asking
    setHasAskedPhone(true);
    setShowPhonePrompt(false);
    
    await persistUserProfile({
      phone: phoneInput.trim(),
      phoneSkipped: false,
      promptedPhone: true,
    });
    setPhoneInput('');
  };

  const handlePhoneSkip = () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ChatWidget] Phone prompt skipped');
    }
    persistUserProfile({ phoneSkipped: true, promptedPhone: true }, { sync: false });
    setShowPhonePrompt(false);
  };

  const summarizeConversation = async (lastMessageTimestamp: string) => {
    if (!externalSessionId || historyRef.current.length === 0) return;
    try {
      const response = await fetch('/api/chat/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: cleanSummary(conversationSummary),
          history: historyRef.current,
          brand,
          session: {
            externalId: externalSessionId,
            supabaseId: sessionRecord?.id ?? null,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to summarize conversation (${response.status})`);
      }

      const data = await response.json();
      if (data.summary && typeof data.summary === 'string') {
        const cleanedSummary = cleanSummary(data.summary);
        setConversationSummary(cleanedSummary);
        if (externalSessionId) {
          await upsertSummary(externalSessionId, cleanedSummary, lastMessageTimestamp, brandKey);
        }
      }
    } catch (error) {
      console.error('[ChatWidget] Failed to summarize conversation', error);
    }
  };

  const handleAssistantMessageComplete = async (message: Message) => {
    if (message.text) {
      // Strip HTML tags before adding to history for summarization
      const plainText = message.text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      appendHistory({ role: 'assistant', content: plainText });
      // Don't store assistant messages - we focus on user inputs and summaries
    }

    if (!hasReceivedFirstResponse) {
      setHasReceivedFirstResponse(true);
    }

    interactionCountRef.current += 1;

    const lastMessageTimestamp = new Date().toISOString();

    const emailThresholdReached =
      !userProfile.email &&
      !emailPromptDismissed &&
      !hasAskedEmail &&
      interactionCountRef.current >= EMAIL_PROMPT_THRESHOLD;
    const phoneThresholdReached =
      !userProfile.phone &&
      !phonePromptDismissed &&
      !hasAskedPhone &&
      interactionCountRef.current >= PHONE_PROMPT_THRESHOLD;

    if (emailThresholdReached) {
      applyLocalProfile({ promptedEmail: true });
      setHasAskedEmail(true);
      setShowEmailPrompt(true);
    }

    if (phoneThresholdReached) {
      applyLocalProfile({ promptedPhone: true });
      setHasAskedPhone(true);
      setShowPhonePrompt(true);
    }

    const shouldSummarize = interactionCountRef.current > 0 && interactionCountRef.current % 5 === 0;
    if (shouldSummarize) {
      await summarizeConversation(lastMessageTimestamp);
    }
  };

  // Keep searchbarWrapper fixed at bottom at all times
  useEffect(() => {
    const fixSearchbarPosition = () => {
      if (!searchbarWrapperRef.current) return;
      if (keyboardHeight > 0) return; // let keyboard handler control position
      
      const isMobile = window.innerWidth < 769;
      
      if (isMobile) {
        // Mobile: Full width at bottom with consistent padding
        searchbarWrapperRef.current.style.setProperty('position', 'fixed', 'important');
        searchbarWrapperRef.current.style.setProperty('bottom', `${SEARCHBAR_BASE_OFFSET}px`, 'important');
        searchbarWrapperRef.current.style.setProperty('left', '20px', 'important');
        searchbarWrapperRef.current.style.setProperty('right', '20px', 'important');
        searchbarWrapperRef.current.style.setProperty('top', 'auto', 'important');
        searchbarWrapperRef.current.style.setProperty('transform', 'none', 'important');
        searchbarWrapperRef.current.style.setProperty('-webkit-transform', 'none', 'important');
        searchbarWrapperRef.current.style.setProperty('width', 'auto', 'important');
        searchbarWrapperRef.current.style.setProperty('z-index', '9999', 'important');
      } else {
        // Desktop: Centered at bottom
        searchbarWrapperRef.current.style.setProperty('position', 'fixed', 'important');
        searchbarWrapperRef.current.style.setProperty('bottom', `${SEARCHBAR_BASE_OFFSET}px`, 'important');
        searchbarWrapperRef.current.style.setProperty('top', 'auto', 'important');
        searchbarWrapperRef.current.style.setProperty('left', '50%', 'important');
        searchbarWrapperRef.current.style.setProperty('right', 'auto', 'important');
        searchbarWrapperRef.current.style.setProperty('transform', 'translateX(-50%)', 'important');
        searchbarWrapperRef.current.style.setProperty('-webkit-transform', 'translateX(-50%)', 'important');
        searchbarWrapperRef.current.style.setProperty('z-index', '9999', 'important');
      }
    };
    
    // Fix immediately
    fixSearchbarPosition();
    
    // Fix on resize
    window.addEventListener('resize', fixSearchbarPosition);
    
    // Fix periodically to prevent any CSS from overriding
    const interval = setInterval(fixSearchbarPosition, 200);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', fixSearchbarPosition);
    };
  }, [isOpen, isExpanded, showQuickButtons, isInputActive, keyboardHeight]); // Run when these states change

  // Track desktop/mobile for behavior; layout handled by CSS (docked)
  useEffect(() => {
    const applyDeviceStyles = () => {
      const desktop = window.innerWidth >= 769;
      setIsDesktop(desktop);
    };
    applyDeviceStyles();
    window.addEventListener('resize', applyDeviceStyles);
    return () => window.removeEventListener('resize', applyDeviceStyles);
  }, [isOpen]);

  // Force docked positioning (right, above bubble) when open
  useEffect(() => {
    if (!isOpen || !chatboxContainerRef.current) return;
    const el = chatboxContainerRef.current;
    const isMobile = window.innerWidth < 769;

    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('transform', 'none', 'important');
    el.style.setProperty('-webkit-transform', 'none', 'important');

    if (isMobile) {
      el.style.setProperty('top', '0', 'important');
      el.style.setProperty('left', '0', 'important');
      el.style.setProperty('right', '0', 'important');
      el.style.setProperty('bottom', '0', 'important');
      el.style.setProperty('width', '100%', 'important');
      el.style.setProperty('max-width', '100%', 'important');
      el.style.setProperty('height', '100vh', 'important');
      el.style.setProperty('max-height', '100vh', 'important');
    } else {
      el.style.setProperty('right', '24px', 'important');
      el.style.setProperty('bottom', '96px', 'important');
      el.style.setProperty('left', 'auto', 'important');
      el.style.setProperty('top', 'auto', 'important');
      el.style.setProperty('width', '420px', 'important');
      el.style.setProperty('max-width', '90vw', 'important');
      el.style.setProperty('height', '80vh', 'important');
      el.style.setProperty('max-height', '80vh', 'important');
    }
  }, [isOpen, isDesktop]);

  // Lock body scroll when interacting with the floating search bar (allow background interaction while chat is open)
  useEffect(() => {
    const shouldLock = (isSearchbarHovered || isInputActive) && !isOpen;
    if (!shouldLock) return;

    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    const originalOverflow = bodyStyle.overflow;
    const originalPosition = bodyStyle.position;
    const originalTop = bodyStyle.top;
    const originalWidth = bodyStyle.width;
    const originalLeft = bodyStyle.left;
    const originalRight = bodyStyle.right;
    const originalHtmlOverflow = htmlStyle.overflow;
    const originalHtmlOverscroll = htmlStyle.overscrollBehavior;
    const scrollY = window.scrollY;

    // Only apply aggressive position:fixed lock when chat is NOT fully open
    // When chat IS open, just prevent scrolling without shifting the page
    if (!isOpen) {
      // Searchbar expanded state - use position fixed to prevent background scroll
      bodyStyle.overflow = 'hidden';
      bodyStyle.position = 'fixed';
      bodyStyle.top = `-${scrollY}px`;
      bodyStyle.width = '100%';
      bodyStyle.left = '0';
      bodyStyle.right = '0';
    } else {
      // Chat is open - just hide overflow without position fixed to avoid cutting off bubbles
      bodyStyle.overflow = 'hidden';
    }
    htmlStyle.overflow = 'hidden';
    htmlStyle.overscrollBehavior = 'none';

    const scrollableContainers = new Set<HTMLElement>();
    const messagesContainer = messagesAreaRef.current;
    if (messagesContainer) scrollableContainers.add(messagesContainer);

    const dynamicallyMarkedScrollables = document.querySelectorAll<HTMLElement>('[data-scroll-lock="allow"]');
    dynamicallyMarkedScrollables.forEach((element) => {
      scrollableContainers.add(element);
    });

    const getScrollableContainer = (node: Node | null): HTMLElement | null => {
      if (!(node instanceof Element)) {
        return null;
      }

      const scrollable = node.closest<HTMLElement>('[data-scroll-lock="allow"]');
      if (scrollable && scrollableContainers.has(scrollable)) {
        return scrollable;
      }
      return null;
    };

    let lastTouchY = 0;
    let activeScrollable: HTMLElement | null = null;

    const handleTouchStart = (event: TouchEvent) => {
      const target = event.target;
      const targetNode = target instanceof Node ? target : null;
      activeScrollable = getScrollableContainer(targetNode);
      lastTouchY = event.touches[0]?.clientY ?? 0;

      // Allow tap interactions; scroll locking handled during touchmove
    };

    const handleTouchMove = (event: TouchEvent) => {
      const target = event.target;
      const targetNode = target instanceof Node ? target : null;
      const scrollable = activeScrollable ?? getScrollableContainer(targetNode);

      if (!scrollable) {
        event.preventDefault();
        return;
      }

      const currentY = event.touches[0]?.clientY ?? 0;
      const deltaY = lastTouchY - currentY;
      lastTouchY = currentY;

      const maxScrollTop = scrollable.scrollHeight - scrollable.clientHeight;
      const currentScrollTop = scrollable.scrollTop;

      const isScrollingDown = deltaY > 0;
      const isScrollingUp = deltaY < 0;

      const atTop = currentScrollTop <= 0;
      const atBottom = currentScrollTop >= maxScrollTop;

      if ((atTop && isScrollingUp) || (atBottom && isScrollingDown)) {
        const parentScrollable = messagesAreaRef.current;
        if (parentScrollable && parentScrollable !== scrollable) {
          activeScrollable = parentScrollable;
          parentScrollable.scrollTop += deltaY;
          return;
        }
        activeScrollable = null;
        return;
      }
    };

    const handleTouchEnd = () => {
      activeScrollable = null;
    };

    const preventWheel = (event: WheelEvent) => {
      if (window.innerWidth >= 769) return;

      const target = event.target;
      const targetNode = target instanceof Node ? target : null;
      const scrollable = getScrollableContainer(targetNode);

      if (!scrollable) {
        event.preventDefault();
        return;
      }

      const maxScrollTop = scrollable.scrollHeight - scrollable.clientHeight;
      const currentScrollTop = scrollable.scrollTop;

      if (
        (currentScrollTop <= 0 && event.deltaY < 0) ||
        (currentScrollTop >= maxScrollTop && event.deltaY > 0)
      ) {
        const parentScrollable = messagesAreaRef.current;
        if (parentScrollable && parentScrollable !== scrollable) {
          parentScrollable.scrollTop += event.deltaY;
        }
        return;
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    document.addEventListener('wheel', preventWheel, { passive: false, capture: true });

    return () => {
      bodyStyle.overflow = originalOverflow;
      bodyStyle.position = originalPosition;
      bodyStyle.top = originalTop;
      bodyStyle.width = originalWidth;
      bodyStyle.left = originalLeft;
      bodyStyle.right = originalRight;
      htmlStyle.overflow = originalHtmlOverflow;
      htmlStyle.overscrollBehavior = originalHtmlOverscroll;

      // Only restore scroll position if we used position fixed
      if (!isOpen) {
        window.scrollTo(0, scrollY);
      }

      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchmove', handleTouchMove, true);
      document.removeEventListener('touchend', handleTouchEnd, true);
      document.removeEventListener('wheel', preventWheel, true);
    };
  }, [isSearchbarHovered, isInputActive, isOpen, showCalendly]);

  // Handle keyboard appearance and adjust searchbar position
  useEffect(() => {
    if (!window.visualViewport) return;

    const viewport = window.visualViewport;

    const handleViewportChange = () => {
      if (!viewport) return;

      // Calculate keyboard height
      const windowHeight = window.innerHeight;
      const viewportHeight = viewport.height;
      const calculatedKeyboardHeight = windowHeight - viewportHeight;
      
      setKeyboardHeight(calculatedKeyboardHeight);

      // Adjust searchbar position when keyboard is visible
      if (searchbarWrapperRef.current && calculatedKeyboardHeight > 0) {
        const gapValue = `calc(${SEARCHBAR_KEYBOARD_GAP}px + env(safe-area-inset-bottom, 0px))`;
        searchbarWrapperRef.current.style.removeProperty('transform');
        searchbarWrapperRef.current.style.setProperty('bottom', gapValue, 'important');
      } else if (searchbarWrapperRef.current && calculatedKeyboardHeight === 0) {
        // Keyboard is hidden, restore original position
        searchbarWrapperRef.current.style.removeProperty('transform');
        searchbarWrapperRef.current.style.setProperty('bottom', `${SEARCHBAR_BASE_OFFSET}px`, 'important');
      }

      // Adjust input area and chat container when keyboard is visible (mobile only)
      if (isOpen && window.innerWidth < 769) {
        const inputAreaElement = chatboxContainerRef.current?.querySelector(`.${styles.inputArea}`) as HTMLElement;
        const footerElement = chatboxContainerRef.current?.querySelector(`.${styles.chatFooter}`) as HTMLElement;
        const messagesArea = messagesAreaRef.current;
        const mobileQuickActionsElement = chatboxContainerRef.current?.querySelector(`.${styles.mobileQuickActions}`) as HTMLElement;
        
        if (calculatedKeyboardHeight > 0) {
          // Keyboard is visible - adjust layout without cutting off top
          if (chatboxContainerRef.current) {
            // Keep container at full height but adjust its internal layout
            chatboxContainerRef.current.style.setProperty('height', '100vh', 'important');
            chatboxContainerRef.current.style.setProperty('height', '100dvh', 'important');
            chatboxContainerRef.current.style.setProperty('max-height', '100vh', 'important');
            chatboxContainerRef.current.style.setProperty('max-height', '100dvh', 'important');
            chatboxContainerRef.current.style.setProperty('overscroll-behavior', 'none', 'important');
          }
          
          if (inputAreaElement) {
            inputAreaElement.style.setProperty('position', 'fixed', 'important');
            inputAreaElement.style.setProperty('bottom', '0', 'important');
            inputAreaElement.style.setProperty('left', '0', 'important');
            inputAreaElement.style.setProperty('right', '0', 'important');
            inputAreaElement.style.setProperty('margin', '0', 'important');
            inputAreaElement.style.setProperty('margin-left', '0', 'important');
            inputAreaElement.style.setProperty('margin-right', '0', 'important');
            inputAreaElement.style.setProperty('margin-bottom', '0', 'important');
            inputAreaElement.style.setProperty('transform', 'translateZ(0)', 'important');
            inputAreaElement.style.setProperty('-webkit-transform', 'translateZ(0)', 'important');
            inputAreaElement.style.setProperty('z-index', '9999', 'important');
            // Add background to prevent scrolling content from showing through
            inputAreaElement.style.setProperty('background', 'rgba(8, 10, 22, 0.95)', 'important');
            inputAreaElement.style.setProperty('backdrop-filter', 'blur(20px) saturate(140%)', 'important');
            inputAreaElement.style.setProperty('-webkit-backdrop-filter', 'blur(20px) saturate(140%)', 'important');
            inputAreaElement.style.setProperty('padding-top', '12px', 'important');
            inputAreaElement.style.setProperty('padding-bottom', 'max(12px, env(safe-area-inset-bottom, 12px))', 'important');
            inputAreaElement.style.setProperty('padding-left', 'max(16px, env(safe-area-inset-left, 16px))', 'important');
            inputAreaElement.style.setProperty('padding-right', 'max(16px, env(safe-area-inset-right, 16px))', 'important');
            inputAreaElement.style.setProperty('width', '100%', 'important');
            inputAreaElement.style.setProperty('box-sizing', 'border-box', 'important');
          }
          
          // Position mobile quick actions and adjust messages area after input is positioned
          // Use requestAnimationFrame to ensure accurate measurements
          requestAnimationFrame(() => {
            if (mobileQuickActionsElement && inputAreaElement) {
              // Get full input area height (includes privacy notice if visible)
              const inputAreaHeight = inputAreaElement.offsetHeight || 60;
              // Position quick actions above the entire input area (0px bottom + full input area height + spacing)
              const bottomPosition = inputAreaHeight + 0 + 8; // 8px spacing between quick actions and input area
              mobileQuickActionsElement.style.setProperty('position', 'fixed', 'important');
              mobileQuickActionsElement.style.setProperty('bottom', `${bottomPosition}px`, 'important');
              mobileQuickActionsElement.style.setProperty('left', '0', 'important');
              mobileQuickActionsElement.style.setProperty('right', '0', 'important');
              mobileQuickActionsElement.style.setProperty('z-index', '9998', 'important');
              mobileQuickActionsElement.style.setProperty('padding-left', 'max(16px, env(safe-area-inset-left, 16px))', 'important');
              mobileQuickActionsElement.style.setProperty('padding-right', 'max(16px, env(safe-area-inset-right, 16px))', 'important');
              
              // Adjust messages area padding to account for both input area and quick actions
              if (messagesArea) {
                const quickActionsHeight = mobileQuickActionsElement.offsetHeight || 0;
                const footerHeight = footerElement?.offsetHeight || 0;
                messagesArea.style.setProperty('padding-bottom', `${inputAreaHeight + quickActionsHeight + footerHeight + 20}px`, 'important');
              }
            } else if (messagesArea && inputAreaElement) {
              // If quick actions not visible, just account for input area and footer
              const inputAreaHeight = inputAreaElement.offsetHeight || 60;
              const footerHeight = footerElement?.offsetHeight || 0;
              messagesArea.style.setProperty('padding-bottom', `${inputAreaHeight + footerHeight + 10}px`, 'important');
            }
          });
          
          // Keep footer visible but ensure it has background and proper positioning
          if (footerElement) {
            footerElement.style.removeProperty('display');
            footerElement.style.setProperty('position', 'fixed', 'important');
            footerElement.style.setProperty('bottom', '0', 'important');
            footerElement.style.setProperty('left', '0', 'important');
            footerElement.style.setProperty('right', '0', 'important');
            footerElement.style.setProperty('z-index', '9997', 'important');
            footerElement.style.setProperty('background', 'rgba(8, 10, 22, 0.95)', 'important');
            footerElement.style.setProperty('backdrop-filter', 'blur(20px) saturate(140%)', 'important');
            footerElement.style.setProperty('-webkit-backdrop-filter', 'blur(20px) saturate(140%)', 'important');
            footerElement.style.setProperty('margin', '0', 'important');
            footerElement.style.setProperty('width', '100%', 'important');
            footerElement.style.setProperty('box-sizing', 'border-box', 'important');
            // Position footer above input area
            requestAnimationFrame(() => {
              if (inputAreaElement && footerElement) {
                const inputAreaHeight = inputAreaElement.offsetHeight || 60;
                footerElement.style.setProperty('bottom', `${inputAreaHeight}px`, 'important');
              }
            });
          }
        } else {
          // Keyboard is hidden - restore normal position
          if (chatboxContainerRef.current) {
            chatboxContainerRef.current.style.setProperty('height', '100vh', 'important');
            chatboxContainerRef.current.style.setProperty('height', '100dvh', 'important');
            chatboxContainerRef.current.style.setProperty('max-height', '100vh', 'important');
            chatboxContainerRef.current.style.setProperty('max-height', '100dvh', 'important');
            chatboxContainerRef.current.style.setProperty('overscroll-behavior', 'none', 'important');
          }
          
          // Restore messages area padding
          if (messagesArea) {
            messagesArea.style.setProperty('padding-bottom', '100px', 'important');
          }
          
          if (inputAreaElement) {
            inputAreaElement.style.removeProperty('position');
            inputAreaElement.style.removeProperty('bottom');
            inputAreaElement.style.removeProperty('left');
            inputAreaElement.style.removeProperty('right');
            inputAreaElement.style.removeProperty('margin');
            inputAreaElement.style.removeProperty('margin-left');
            inputAreaElement.style.removeProperty('margin-right');
            inputAreaElement.style.removeProperty('margin-bottom');
            inputAreaElement.style.removeProperty('transform');
            inputAreaElement.style.removeProperty('-webkit-transform');
            inputAreaElement.style.removeProperty('z-index');
            inputAreaElement.style.removeProperty('background');
            inputAreaElement.style.removeProperty('backdrop-filter');
            inputAreaElement.style.removeProperty('-webkit-backdrop-filter');
            inputAreaElement.style.removeProperty('padding-top');
            inputAreaElement.style.removeProperty('padding-bottom');
            inputAreaElement.style.removeProperty('padding-left');
            inputAreaElement.style.removeProperty('padding-right');
            inputAreaElement.style.removeProperty('width');
            inputAreaElement.style.removeProperty('box-sizing');
          }
          
          // Restore mobile quick actions to normal sticky positioning
          if (mobileQuickActionsElement) {
            mobileQuickActionsElement.style.removeProperty('position');
            mobileQuickActionsElement.style.removeProperty('bottom');
            mobileQuickActionsElement.style.removeProperty('left');
            mobileQuickActionsElement.style.removeProperty('right');
            mobileQuickActionsElement.style.removeProperty('z-index');
            mobileQuickActionsElement.style.removeProperty('padding-left');
            mobileQuickActionsElement.style.removeProperty('padding-right');
          }
          
          // Restore footer to normal positioning when keyboard is hidden
          if (footerElement) {
            footerElement.style.removeProperty('display');
            footerElement.style.removeProperty('position');
            footerElement.style.removeProperty('bottom');
            footerElement.style.removeProperty('left');
            footerElement.style.removeProperty('right');
            footerElement.style.removeProperty('z-index');
            footerElement.style.removeProperty('background');
            footerElement.style.removeProperty('backdrop-filter');
            footerElement.style.removeProperty('-webkit-backdrop-filter');
          }
        }
      }
    };

    // Listen for viewport changes (keyboard show/hide)
    viewport.addEventListener('resize', handleViewportChange);
    viewport.addEventListener('scroll', handleViewportChange);
    
    // Initial check
    handleViewportChange();

    return () => {
      viewport.removeEventListener('resize', handleViewportChange);
      viewport.removeEventListener('scroll', handleViewportChange);
    };
  }, [isOpen]);


  const { messages, isLoading, sendMessage, clearMessages, addUserMessage, addAIMessage } = useChat({
    brand: 'proxe',
    apiUrl: finalApiUrl,
    onMessageComplete: handleAssistantMessageComplete,
  });

  const resetChatState = useCallback(() => {
    closeCalendarWidget();
    closeVideoWidget();
    closeDeployForm();
    setShowDeployForm(null);
    deployFormScrolledRef.current = false;
    setBookingCompleted(false);
    setUsedButtons([]);
    setMessageCount(0);
    clearMessages();
    historyRef.current = [];
    setRecentHistory([]);
    setConversationSummary('');
    interactionCountRef.current = 0;
    setPendingUserMessage(null);
    setPendingButtons([]);
    setPendingRequirement(null);
    setShowNamePrompt(false);
    setShowEmailPrompt(false);
    setShowPhonePrompt(false);
    setHasAskedName(false);
    setHasAskedEmail(false);
    setHasAskedPhone(false);
    setHasReceivedFirstResponse(false);
    setNamePromptDismissed(false);
    setEmailPromptDismissed(false);
    setPhonePromptDismissed(false);
    setInputValue('');
    setNameInput('');
    setEmailInput('');
    setPhoneInput('');
    setUserProfile({});
    storeUserProfile({}, brandKey);
    setDynamicQuickButtons(null);
    setExploreButtons(null);
    // Reset conversation restoration flags
    conversationsToRestoreRef.current = [];
    hasRestoredMessagesRef.current = false;
    hasShownWelcomeRef.current = false;
    // Close the chat
    setIsOpen(false);
    setIsInputActive(false);
    setIsExpanded(false);
    setShowQuickButtons(false);
    setIsSearchbarHovered(false);
    setIsDockedBubble(false);
    hasEverOpenedRef.current = false;
  }, [brandKey, clearMessages, closeCalendarWidget, closeVideoWidget, closeDeployForm]);

  const handleRequestResetChat = useCallback(() => {
    if (messages.length > 0) {
      setShowResetConfirm(true);
      return;
    }
    resetChatState();
  }, [messages.length, resetChatState]);

  const handleConfirmResetChat = useCallback(() => {
    setShowResetConfirm(false);
    resetChatState();
  }, [resetChatState]);

  const handleCancelResetChat = useCallback(() => {
    setShowResetConfirm(false);
  }, []);

  const isMobileViewport = typeof window !== 'undefined' ? window.innerWidth < 769 : !isDesktop;
  const isMobileNewChat = useMemo(
    () => isMobileViewport && messages.length === 0,
    [isMobileViewport, messages.length]
  );

  const mobileQuickActions = ["What's PROXe", 'Book a Demo', 'PROXe Pricing'];
  const defaultQuickButtons = dynamicQuickButtons ?? config?.quickButtons ?? [];
  const quickButtonOptions = isMobileNewChat ? mobileQuickActions : defaultQuickButtons;
  const hasQuickButtons = quickButtonOptions.length > 0;
  const showMobileQuickActions = isMobileViewport && isOpen && hasQuickButtons && messages.length <= 1;

  const isResponding = useMemo(
    () =>
      isLoading ||
      messages.some(
        (message) =>
          message.type === 'ai' && (message.isStreaming || !message.hasStreamed)
      ),
    [isLoading, messages]
  );

  // Register callback for when Deploy form is submitted
  useEffect(() => {
    const handleDeployFormSubmit = async () => {
      // Sync websiteUrl from localStorage to Supabase
      const storedUser = getStoredUser(brandKey);
      if (storedUser?.websiteUrl && externalSessionId) {
        await persistUserProfile({ websiteUrl: storedUser.websiteUrl });
      }
      
      // Add confirmation message to chat
      addAIMessage("Thanks! We've received your details. Our team will review them and get back to you within 24 hours. In the meantime, feel free to ask any questions about PROXe!");
      
      // Open chat to show the confirmation message
      setIsOpen(true);
      setIsInputActive(true);
      setIsExpanded(false);
      setShowQuickButtons(false);
    };

    setOnFormSubmit(handleDeployFormSubmit);

    // Clean up on unmount
    return () => {
      setOnFormSubmit(null);
    };
  }, [addAIMessage, setOnFormSubmit, externalSessionId, brandKey, persistUserProfile]);

  // Restore conversation messages when chat opens
  useEffect(() => {
    if (isOpen && conversationsToRestoreRef.current.length > 0 && !hasRestoredMessagesRef.current && messages.length === 0 && addUserMessage && addAIMessage) {
      // Restore messages from conversations table
      const conversations = conversationsToRestoreRef.current;
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('[ChatWidget] Restoring conversation messages', {
          count: conversations.length
        });
      }
      
      // Restore messages in order
      conversations.forEach((conv) => {
        if (conv.type === 'user') {
          addUserMessage(conv.text);
        } else {
          addAIMessage(conv.text);
        }
      });
      
      // Mark as restored so we don't restore again
      hasRestoredMessagesRef.current = true;
      hasShownWelcomeRef.current = true; // Don't show welcome if we restored messages
      
      // Scroll to bottom after restoring
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
        }
      }, 100);
    }
  }, [isOpen, messages.length, addUserMessage, addAIMessage]);

  // Re-fetch conversations when chat reopens (if not already restored)
  useEffect(() => {
    if (isOpen && messages.length === 0 && !hasRestoredMessagesRef.current && !hasShownWelcomeRef.current && externalSessionId) {
      // Re-fetch conversations when chat reopens
      const fetchConversationsOnReopen = async () => {
        try {
          const supabase = getSupabaseClient();
          if (supabase && externalSessionId) {
            const { data: sessionData, error: sessionError } = await supabase
              .from('web_sessions')
              .select('lead_id')
              .eq('external_session_id', externalSessionId)
              .maybeSingle();
            
            if (!sessionError && sessionData?.lead_id) {
              const conversations = await fetchConversations(sessionData.lead_id, 'web', brandKey);
              if (conversations.length > 0) {
                // Store conversations to restore
                conversationsToRestoreRef.current = conversations.map((conv) => ({
                  id: conv.id,
                  type: conv.sender === 'customer' ? 'user' as const : 'ai' as const,
                  text: conv.content,
                  created_at: conv.created_at
                }));
                
                // Trigger restoration
                if (addUserMessage && addAIMessage) {
                  conversations.forEach((conv) => {
                    if (conv.sender === 'customer') {
                      addUserMessage(conv.content);
                    } else {
                      addAIMessage(conv.content);
                    }
                  });
                  
                  hasRestoredMessagesRef.current = true;
                  hasShownWelcomeRef.current = true;
                  
                  // Scroll to bottom after restoring
                  setTimeout(() => {
                    if (messagesEndRef.current) {
                      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
                    }
                  }, 100);
                }
              }
            }
          }
        } catch (err) {
          console.error('[ChatWidget] Error fetching conversations on reopen:', err);
        }
      };
      
      fetchConversationsOnReopen();
    }
  }, [isOpen, externalSessionId, messages.length, addUserMessage, addAIMessage, brandKey]);

  // Re-fetch and restore conversations when chat reopens (if messages were cleared)
  useEffect(() => {
    if (isOpen && messages.length === 0 && !hasRestoredMessagesRef.current && !hasShownWelcomeRef.current && externalSessionId) {
      // Re-fetch conversations when chat reopens and there are no messages
      const fetchConversationsOnReopen = async () => {
        try {
          const supabase = getSupabaseClient();
          if (supabase && externalSessionId) {
            const { data: sessionData, error: sessionError } = await supabase
              .from('web_sessions')
              .select('lead_id')
              .eq('external_session_id', externalSessionId)
              .maybeSingle();
            
            if (!sessionError && sessionData?.lead_id) {
              const conversations = await fetchConversations(sessionData.lead_id, 'web', brandKey);
              if (conversations.length > 0 && addUserMessage && addAIMessage) {
                // Store conversations to restore
                conversationsToRestoreRef.current = conversations.map((conv) => ({
                  id: conv.id,
                  type: conv.sender === 'customer' ? 'user' as const : 'ai' as const,
                  text: conv.content,
                  created_at: conv.created_at
                }));
                
                // Restore messages
                conversations.forEach((conv) => {
                  if (conv.sender === 'customer') {
                    addUserMessage(conv.content);
                  } else {
                    addAIMessage(conv.content);
                  }
                });
                
                hasRestoredMessagesRef.current = true;
                hasShownWelcomeRef.current = true;
                
                // Scroll to bottom after restoring
                setTimeout(() => {
                  if (messagesEndRef.current) {
                    messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
                  }
                }, 100);
                
                return; // Don't show welcome message
              }
            }
          }
          
          // No conversations found, show welcome message
          if (addAIMessage) {
            addAIMessage("Hey!👋 I am PROXe, ask me anything");
            hasShownWelcomeRef.current = true;
          }
        } catch (err) {
          console.error('[ChatWidget] Error fetching conversations on reopen:', err);
          // On error, show welcome message
          if (addAIMessage) {
            addAIMessage("Hey!👋 I am PROXe, ask me anything");
            hasShownWelcomeRef.current = true;
          }
        }
      };
      
      fetchConversationsOnReopen();
    } else if (isOpen && messages.length === 0 && !hasShownWelcomeRef.current && conversationsToRestoreRef.current.length === 0 && addAIMessage) {
      // Show welcome message if no conversations to restore
      addAIMessage("Hey!👋 I am PROXe, ask me anything");
      hasShownWelcomeRef.current = true;
    }
  }, [isOpen, messages.length, externalSessionId, addAIMessage, addUserMessage, brandKey]);

  // Ensure viewport starts at absolute top when chat widget first opens
  useEffect(() => {
    if (isOpen && messagesAreaRef.current) {
      // Force scroll to absolute top when chat opens
      messagesAreaRef.current.scrollTop = 0;
      
      // Also ensure the container itself is at top
      if (chatboxContainerRef.current) {
        chatboxContainerRef.current.scrollTop = 0;
      }
    }
  }, [isOpen]);

  useEffect(() => {
    // Scroll behavior when messages update
    if (isOpen) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        // Check if last message is a booking confirmation
        const lastMessage = messages[messages.length - 1];
        const isBookingConfirmation = lastMessage && 
          lastMessage.type === 'ai' && 
          lastMessage.text && 
          lastMessage.text.includes('scheduled for') &&
          bookingCompleted;
        
        if (isBookingConfirmation) {
          // Find and scroll to the booking confirmation message
          const messageElement = document.querySelector(`[data-message-id="${lastMessage.id}"]`);
          if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else if (messagesEndRef.current) {
            // Fallback: scroll to bottom
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        } else if (messages.length <= 2 && messagesAreaRef.current) {
          // Scroll to top of messages area to show first question header
          messagesAreaRef.current.scrollTop = 0;
        } else if (messagesEndRef.current) {
          // Scroll to bottom for subsequent messages
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
    }
    
    // Check if we should show calendar widget after AI response completes
    if (pendingCalendar && messages.length > 0 && !bookingCompleted) {
      const lastMessage = messages[messages.length - 1];
      
      // Wait for AI message to be fully streamed and not currently streaming
      // Also check that message has text content (more reliable than just hasStreamed)
      if (lastMessage && lastMessage.type === 'ai' && !lastMessage.isStreaming && lastMessage.text && lastMessage.text.length > 0) {
        // Use setTimeout to ensure state updates properly
        const timer = setTimeout(async () => {
          setPendingCalendar(false);
          
          // Check for existing booking before showing calendar
          const phone = userProfile.phone;
          const email = userProfile.email;
          
          if (phone || email) {
            const existingBooking = await checkExistingBooking(phone, email, brandKey);
            
            if (existingBooking?.exists && existingBooking.bookingDate && existingBooking.bookingTime) {
              // Format date and time for display
              const date = new Date(existingBooking.bookingDate);
              const formattedDate = date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              });
              
              // Format time (assuming it's in "HH:MM AM/PM" format)
              const formattedTime = existingBooking.bookingTime;
              
              // Show message about existing booking
              const bookingMessage = `You already have a booking scheduled for ${formattedDate} at ${formattedTime}.`;
              
              // Add as AI message using addAIMessage from hook
              addAIMessage(bookingMessage);
              setBookingCompleted(true);
              return; // Don't show calendar
            }
          }
          
          // No existing booking, show calendar
          const calendarMessageId = `calendar-${Date.now()}`;
          setShowCalendly(calendarMessageId);
          if (lastMessage?.id) {
            setCalendarAnchorId(lastMessage.id);
          } else {
            setCalendarAnchorId(null);
          }
        }, 500);
        
        return () => clearTimeout(timer);
      }
    }
    
  }, [messages, isOpen, pendingCalendar, showCalendly, bookingCompleted, userProfile.phone, userProfile.email, brandKey]);

  // Handle booking completion
  const handleBookingComplete = useCallback(async (bookingData: any) => {
    setBookingCompleted(true);
    if (bookingData) {
      // Close any open prompts immediately
      if (bookingData.name) {
        setShowNamePrompt(false);
        setHasAskedName(true);
      }
      if (bookingData.email) {
        setShowEmailPrompt(false);
        setHasAskedEmail(true);
      }
      if (bookingData.phone) {
        setShowPhonePrompt(false);
        setHasAskedPhone(true);
      }
      
      // Persist the contact information
      await handleContactPersist({
        name: bookingData.name,
        email: bookingData.email,
        phone: bookingData.phone,
      });

      // Store booking details in Supabase (include contact info to ensure it's saved)
      if (externalSessionId && bookingData.date && bookingData.time) {
        await storeBooking(
          externalSessionId,
          {
            date: bookingData.date,
            time: bookingData.time,
            googleEventId: bookingData.googleEventId,
            status: 'Call Booked',
            name: bookingData.name,
            email: bookingData.email,
            phone: bookingData.phone,
          },
          brandKey
        );

        // Format date and time for display message
        const bookingDate = new Date(bookingData.date);
        const formattedDate = bookingDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        const formattedTime = bookingData.time; // Already in "11:00 AM" format

        // Add system message to chat
        const bookingMessage = `Your call is scheduled for ${formattedDate} at ${formattedTime}.`;
        addAIMessage(bookingMessage);

        // Note: Booking info will be naturally included in the summary when the AI processes the booking message
        // No need to manually append metadata strings - let the summarize API handle it naturally
      }
    }
  }, [handleContactPersist, externalSessionId, brandKey, addAIMessage, conversationSummary]);

  // Check for existing booking before showing calendar
  const checkAndShowBooking = useCallback(async () => {
    const phone = userProfile.phone;
    const email = userProfile.email;
    
    if (!phone && !email) {
      // No contact info yet, allow booking
      return true;
    }

    // checkExistingBooking is already imported at the top of the file
    const existingBooking = await checkExistingBooking(phone, email, brandKey);
    
    if (existingBooking?.exists && existingBooking.bookingDate && existingBooking.bookingTime) {
      // Format date and time for display
      const date = new Date(existingBooking.bookingDate);
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      
      // Format time (assuming it's in "HH:MM AM/PM" format)
      const formattedTime = existingBooking.bookingTime;
      
      // Show message about existing booking
      const bookingMessage = `You already have a booking scheduled for ${formattedDate} at ${formattedTime}.`;
      
      // Add as AI message using addAIMessage from hook
      addAIMessage(bookingMessage);
      setBookingCompleted(true);
      
      return false; // Don't show calendar
    }
    
    return true; // Allow booking
  }, [userProfile.phone, userProfile.email, brandKey, addAIMessage]);

  // Handle mobile keyboard appearance for chat input
  useEffect(() => {
    if (!isOpen || !chatInputRef.current) return;

    const handleViewportResize = () => {
      const input = chatInputRef.current;
      if (!input || document.activeElement !== input) return;

      // Use visual viewport if available
      if (window.visualViewport) {
        const viewport = window.visualViewport;
        const inputRect = input.getBoundingClientRect();
        const viewportHeight = viewport.height;
        const inputBottom = inputRect.bottom;

        // If input is hidden by keyboard, scroll it into view
        if (inputBottom > viewportHeight - 10) {
          requestAnimationFrame(() => {
            setTimeout(() => {
              input.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest' 
              });
            }, 150);
          });
        }
      }
    };

    // Listen for viewport resize (keyboard appearance/disappearance)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      return () => {
        window.visualViewport?.removeEventListener('resize', handleViewportResize);
      };
    }
  }, [isOpen]);

  // Listen for streaming updates to auto-scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleMessageUpdate = () => {
      // On first message, keep at top. For subsequent messages, scroll to bottom
      if (messages.length <= 2 && messagesAreaRef.current) {
        messagesAreaRef.current.scrollTop = 0;
      } else if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };

    window.addEventListener('message-updated', handleMessageUpdate);
    return () => {
      window.removeEventListener('message-updated', handleMessageUpdate);
    };
  }, [isOpen, messages.length]);

  // Scroll deploy form into view only once when it first appears
  useEffect(() => {
    if (showDeployForm && deployFormRef.current && !deployFormScrolledRef.current) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (deployFormRef.current) {
            deployFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            deployFormScrolledRef.current = true;
          }
        }, 200);
      });
    }
  }, [showDeployForm]);

  // Enable horizontal scrolling with mouse wheel and drag on desktop
  useEffect(() => {
    const quickButtonsElement = quickButtonsRef.current;
    if (!quickButtonsElement) return;

    const handleWheel = (e: WheelEvent) => {
      // Only handle wheel events if the element is scrollable horizontally
      if (quickButtonsElement.scrollWidth > quickButtonsElement.clientWidth) {
        // Check if scrolling horizontally (shift + wheel) or convert vertical to horizontal
        const isHorizontalScroll = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
        
        if (isHorizontalScroll || Math.abs(e.deltaX) > 0) {
          // Horizontal scroll - allow default behavior
          return;
        }
        
        // Convert vertical scroll to horizontal
        e.preventDefault();
        quickButtonsElement.scrollBy({
          left: e.deltaY,
          behavior: 'auto'
        });
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (quickButtonsElement.scrollWidth > quickButtonsElement.clientWidth) {
        setIsDragging(true);
        hasDraggedRef.current = false;
        dragStartX.current = e.pageX - quickButtonsElement.offsetLeft;
        dragStartScrollLeft.current = quickButtonsElement.scrollLeft;
        quickButtonsElement.style.cursor = 'grabbing';
        quickButtonsElement.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        // Don't prevent default yet - wait to see if user drags
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const x = e.pageX - quickButtonsElement.offsetLeft;
      const deltaX = Math.abs(x - dragStartX.current);
      
      // Only prevent default and scroll if user has moved more than 5px (to distinguish from clicks)
      if (deltaX > 5) {
        hasDraggedRef.current = true;
        e.preventDefault();
        const walk = (x - dragStartX.current) * 2; // Scroll speed multiplier
        quickButtonsElement.scrollLeft = dragStartScrollLeft.current - walk;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isDragging) {
        setIsDragging(false);
        quickButtonsElement.style.cursor = '';
        quickButtonsElement.style.userSelect = '';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // If user dragged, prevent click event on buttons
        if (hasDraggedRef.current) {
          e.preventDefault();
          e.stopPropagation();
        }
        hasDraggedRef.current = false;
      }
    };

    const handleMouseLeave = () => {
      if (isDragging) {
        setIsDragging(false);
        quickButtonsElement.style.cursor = '';
        quickButtonsElement.style.userSelect = '';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    // Only enable drag on desktop (not touch devices)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    quickButtonsElement.addEventListener('wheel', handleWheel, { passive: false });
    
    if (!isTouchDevice) {
      quickButtonsElement.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      quickButtonsElement.addEventListener('mouseleave', handleMouseLeave);
    }
    
    return () => {
      quickButtonsElement.removeEventListener('wheel', handleWheel);
      if (!isTouchDevice) {
        quickButtonsElement.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        quickButtonsElement.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [isExpanded, showQuickButtons, isDragging]);

  // Helper function to check if text contains booking keywords (call or demo)
  const containsBookingKeywords = (text: string): boolean => {
    const lowerText = text.toLowerCase().trim();
    // Check for booking-related keywords
    return lowerText.includes('call') || 
           lowerText.includes('demo') || 
           lowerText.includes('book') ||
           lowerText.includes('schedule') ||
           lowerText.includes('meeting') ||
           lowerText.includes('appointment');
  };

  const handleSend = () => {
    const message = inputValue.trim();
    if (!message) return;

    // Open the chat modal when user submits text from the search widget
    if (!isOpen) {
      setIsDockedBubble(true);
      setIsOpen(true);
      setIsExpanded(false);
      setShowQuickButtons(false);
      setIsInputActive(true);
    }

    // Close any open prompt cards when user sends a message from the input
    if (showNamePrompt) {
      setShowNamePrompt(false);
      setNamePromptDismissed(true);
    }
    if (showEmailPrompt) {
      setShowEmailPrompt(false);
    }
    if (showPhonePrompt) {
      setShowPhonePrompt(false);
    }

    if (requestNameBeforeProceed(message, usedButtons)) return;
    if (requestEmailBeforeProceed(message, usedButtons)) return;
    if (requestPhoneBeforeProceed(message, usedButtons)) return;

    submitMessage(message, usedButtons);
  };

  const openChatAndFocus = useCallback(() => {
    setIsDockedBubble(true);
    setIsOpen(true);
    setIsExpanded(false);
    setShowQuickButtons(false);
    setIsInputActive(true);
    if (!isMobileViewport) {
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 50);
    }
  }, [isMobileViewport]);

  const handleSearchWidgetPress = useCallback(() => {
    // Always open the chat modal when user interacts with search widget
    setIsDockedBubble(true);
    setIsOpen(true);
    setIsExpanded(false);
    setShowQuickButtons(false);
    setIsInputActive(true);
    if (!isMobileViewport) {
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 50);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [messages.length, conversationSummary, sessionRecord, isMobileViewport]);

  const handleQuickButtonClick = (buttonText: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const message = buttonText.trim();
    if (!message) return;

    setIsDockedBubble(true);
    setIsOpen(true);
    setIsExpanded(false);
    setShowQuickButtons(false);

    if (process.env.NODE_ENV !== 'production') {
      console.log('[ChatWidget] Quick button clicked', { buttonText, message });
    }

    // Handle Deploy PROXe button - show deploy form inline
    // Match variations: "Deploy PROXe", "Deploy Proxe", "deploy proxe", etc.
    const lowerMessage = message.toLowerCase().trim();
    if (lowerMessage.includes('deploy') && (lowerMessage.includes('proxe') || lowerMessage.includes('prox'))) {
      closeCalendarWidget();
      closeDeployForm();
      setPendingCalendar(false);
      if (showNamePrompt) {
        setShowNamePrompt(false);
      }
      if (showEmailPrompt) {
        setShowEmailPrompt(false);
      }
      if (showPhonePrompt) {
        setShowPhonePrompt(false);
      }
      
      setIsOpen(true);
      setIsExpanded(false);
      setShowQuickButtons(false);
      setIsInputActive(false);
      
      // Add user message to chat
      addUserMessage('Deploy PROXe');
      
      // Show deploy form after the user message is added
      // Use a longer timeout to ensure the message is in the array
      setTimeout(() => {
        const deployMessageId = `deploy-${Date.now()}`;
        setShowDeployForm(deployMessageId);
        deployFormScrolledRef.current = false;
        if (process.env.NODE_ENV !== 'production') {
          console.log('[ChatWidget] Deploy form opened', { 
            messagesCount: messages.length,
            deployMessageId
          });
        }
      }, 300);
      
      return;
    }

    // Handle Watch Video button - show video widget
    if (message.toLowerCase() === 'watch video') {
      closeCalendarWidget();
      closeDeployForm();
      setIsOpen(true);
      setIsExpanded(false);
      setShowQuickButtons(false);
      setIsInputActive(false);
      
      // Add user message to chat and get the message object
      const userMessage = addUserMessage('Watch Video');
      
      // Show video after the user message
      setTimeout(() => {
        const videoMessageId = `video-${Date.now()}`;
        setShowVideo(videoMessageId);
        setVideoAnchorId(userMessage.id);
      }, 100);
      
      return;
    }

    const nextButtons = [...usedButtons, buttonText];
    const isExploreRequest = message.toLowerCase() === 'explore proxe';
    const exploreOptions = config?.exploreButtons ?? [];

    if (isExploreRequest && exploreOptions.length > 0) {
      closeCalendarWidget();
      setIsOpen(true);
      setIsExpanded(false);
      setShowQuickButtons(false);
      setIsInputActive(false);
      setUsedButtons(nextButtons);
      setExploreButtons(exploreOptions);
      return;
    }

    setExploreButtons(null);
    setDynamicQuickButtons(null);

    if (requestNameBeforeProceed(message, nextButtons)) return;
    if (requestEmailBeforeProceed(message, nextButtons)) return;

    closeCalendarWidget();
    setIsOpen(true);
    setIsInputActive(true);
    setIsExpanded(false);
    setShowQuickButtons(false);
    setUsedButtons(nextButtons);

    if (requestPhoneBeforeProceed(message, nextButtons)) return;

    submitMessage(message, nextButtons);
  };

  const renderWelcomeButtons = useCallback(
    (wrapperClassName: string) => (
      <div className={wrapperClassName}>
        <div className={styles.welcomeQuickButtonsContainer}>
          <div className={styles.welcomeQuickButtonRow}>
            <button
              className={`${styles.quickBtn} ${styles['accent-0']}`}
              onClick={() => handleQuickButtonClick("What is PROXe?")}
            >
              What is PROXe?
            </button>
          </div>
          <div className={styles.welcomeQuickButtonRow}>
            <button
              className={`${styles.quickBtn} ${styles['accent-1']}`}
              onClick={() => handleQuickButtonClick("How does PROXe work?")}
            >
              How does PROXe work?
            </button>
            <button
              className={`${styles.quickBtn} ${styles['accent-2']}`}
              onClick={() => handleQuickButtonClick("Book a demo")}
            >
              Book a demo
            </button>
          </div>
          <div className={styles.welcomeQuickButtonRow}>
            <button
              className={`${styles.quickBtn} ${styles['accent-3']}`}
              onClick={() => handleQuickButtonClick("Deploy PROXe in my business")}
            >
              Deploy PROXe in my business
            </button>
          </div>
        </div>
      </div>
    ),
    [handleQuickButtonClick]
  );

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (showCalendly) {
      closeCalendarWidget();
    }
    if (showVideo) {
      closeVideoWidget();
    }
    setIsInputActive(true);
    if (!isOpen) {
      // Check if there's an existing conversation
      const hasExistingConversation = 
        messages.length > 0 || 
        conversationSummary.trim().length > 0 || 
        (sessionRecord?.userInputsSummary && sessionRecord.userInputsSummary.length > 0);
      
      // If there's an existing conversation, open the chat directly
      if (hasExistingConversation) {
        setIsDockedBubble(true);
        setIsOpen(true);
        setIsExpanded(false);
        setShowQuickButtons(false);
        if (!isMobileViewport) {
          setTimeout(() => {
            chatInputRef.current?.focus();
          }, 50);
        }
        return;
      }
      
      setIsExpanded(true);
      // Show quick buttons only when expanded and no existing conversation
      setShowQuickButtons(true);
    }
    
    // Scroll input into view above keyboard on mobile
    // Use Visual Viewport API if available for better keyboard handling
    const scrollInputIntoView = () => {
      const input = e.target;
      if (input) {
        // Use visual viewport if available (better for mobile keyboards)
        if (window.visualViewport) {
          const viewport = window.visualViewport;
          const inputRect = input.getBoundingClientRect();
          const viewportHeight = viewport.height;
          
          // Calculate if input is hidden by keyboard
          const inputBottom = inputRect.bottom;
          const visibleHeight = viewportHeight;
          
          if (inputBottom > visibleHeight) {
            // Scroll the input to be visible above keyboard
            input.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center',
              inline: 'nearest' 
            });
          }
        } else {
          // Fallback for browsers without Visual Viewport API
          input.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest' 
          });
        }
      }
    };
    
    // Use requestAnimationFrame for immediate execution, then small delay for keyboard
    requestAnimationFrame(() => {
      setTimeout(scrollInputIntoView, 150);
    });
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Don't hide if clicking on a quick button
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget && relatedTarget.closest(`.${styles.quickBtn}`)) {
      return;
    }
    
    setTimeout(() => {
      if (!inputValue.trim() && !isOpen) {
        setShowQuickButtons(false);
        setIsExpanded(false);
        setIsInputActive(false);
      }
    }, 200);
  };

  const formatText = (text: string): string => {
    if (!text) return '';
    // Remove button instruction patterns (e.g., "→ BUTTON: Schedule a Demo") before formatting
    // These are metadata instructions that shouldn't be displayed to users
    let cleanedText = text
      .replace(/→\s*BUTTON:\s*[^\n]*/gi, '') // Remove "→ BUTTON: ..." lines
      .replace(/BUTTON:\s*[^\n]*/gi, '') // Remove "BUTTON: ..." lines (without arrow)
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean up multiple empty lines
      .trim();
    
    // Basic markdown to HTML conversion
    // Convert double newlines to breaks
    // Preserve single newlines (they indicate intentional line breaks for formatting)
    // Preserve line breaks for bullet points (lines starting with •)
    // Convert <br> tags if already present
    return cleanedText
      .replace(/<br\s*\/?>/gi, '\n') // Normalize <br> tags to newlines first
      .replace(/\n\n+/g, '<br><br>') // Double newlines become double breaks
      .replace(/\n(?=\s*•)/g, '<br>') // Preserve line breaks before bullet points
      .replace(/\n/g, '<br>') // Single newlines become breaks (for sentence separation)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  };
  
  useEffect(() => {
    if (isOpen) {
      hasEverOpenedRef.current = true;
    }
  }, [isOpen]);
  
  const hasConversation = messages.length > 0;
  const hasExistingConversation = 
    hasConversation || 
    conversationSummary.trim().length > 0 || 
    (sessionRecord?.userInputsSummary && sessionRecord.userInputsSummary.length > 0);
  const searchbar = (
    <div 
      ref={searchbarWrapperRef} 
      className={styles.searchbarWrapper}
      aria-hidden={isOpen}
      style={isOpen ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
      onMouseEnter={() => {
        setIsSearchbarHovered(true);
      }}
      onMouseLeave={() => {
        setIsSearchbarHovered(false);
      }}
    >
      <div 
        className={`${styles.searchbar} ${isExpanded ? styles.searchbarExpanded : ''}`}
        onMouseDown={(e) => {
          // Don't prevent default - let click event fire
        }}
        onClick={(e) => {
          e.stopPropagation();
            handleSearchWidgetPress();
        }}
        onTouchStart={(e) => {
            handleSearchWidgetPress();
        }}
        style={{ cursor: 'pointer' }}
      >
        <div className={styles.searchIcon} onClick={(e) => {
          e.stopPropagation();
            handleSearchWidgetPress();
        }}>
          {ICONS.search}
        </div>
        <input
          ref={inputRef}
          type="text"
          className={styles.searchInput}
          placeholder={hasInteractedWithSearchbar ? "Ask me anything" : "see PROXe in action"}
          value={inputValue}
          autoComplete="off"
          data-form-type="other"
          data-lpignore="true"
          onChange={(e) => {
              const nextValue = e.target.value;
              setInputValue(nextValue);
              if (!isOpen && isMobileNewChat && nextValue.trim()) {
                openChatAndFocus();
              }
            // Close any open prompt cards when user starts typing in searchbar
              if (nextValue && (showNamePrompt || showEmailPrompt || showPhonePrompt)) {
              if (showNamePrompt) {
                setShowNamePrompt(false);
                setNamePromptDismissed(true);
              }
              if (showEmailPrompt) {
                setShowEmailPrompt(false);
              }
              if (showPhonePrompt) {
                setShowPhonePrompt(false);
              }
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            setHasInteractedWithSearchbar(true);
              handleSearchWidgetPress();
          }}
          onFocus={(e) => {
            setHasInteractedWithSearchbar(true);
            if (showDeployForm) {
              closeDeployForm();
            }
              handleSearchWidgetPress();
          }}
          onBlur={handleInputBlur}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && inputValue.trim()) {
              handleSend();
            }
          }}
        />
        {inputValue.trim() && (
          <button 
            className={styles.sendBtn} 
            onClick={(e) => {
              e.stopPropagation();
              handleSend();
            }}
          >
            {ICONS.send}
          </button>
        )}
      </div>
    </div>
  );

  if (!isOpen) {
    // Bubble widget style or docked bubble mode
    if (widgetStyle === 'bubble' || isDockedBubble) {
      return (
        <button
          className={styles.bubbleButton}
          data-brand={brand}
          onClick={handleOpenChat}
          aria-label="Open chat"
        >
          <div className={styles.bubbleIcon}>
            {brand === 'proxe' ? <PROXELogo /> : ICONS.ai(brand, config)}
          </div>
        </button>
      );
    }

    // Searchbar widget style (default)
    return searchbar;
  }

  return (
    <>
    {searchbar}
    <div 
      ref={chatboxContainerRef}
      className={`${styles.chatboxContainer} ${styles.chatboxDocked} ${isResponding ? styles.chatboxResponding : ''}`}
      data-brand={brand}
    >
          <div className={styles.chatContent}>
        {showResetConfirm && (
          <div className={styles.closeConfirmOverlay} role="dialog" aria-modal="true">
            <div className={styles.closeConfirmCard}>
              <p className={styles.closeConfirmMessage}>Chat history will be lost. Do you wish to continue?</p>
              <div className={styles.closeConfirmActions}>
                <button className={styles.closeConfirmEndBtn} onClick={handleConfirmResetChat}>
                  Reset Chat
                </button>
                <button className={styles.closeConfirmContinueBtn} onClick={handleCancelResetChat}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {showCloseConfirm && (
          <div className={styles.closeConfirmOverlay} role="dialog" aria-modal="true">
            <div className={styles.closeConfirmCard}>
              <p className={styles.closeConfirmMessage}>Do you want to end this chat?</p>
              <div className={styles.closeConfirmActions}>
                <button className={styles.closeConfirmEndBtn} onClick={handleConfirmCloseChat}>
                  End Chat
                </button>
                <button className={styles.closeConfirmContinueBtn} onClick={handleCancelCloseChat}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
        <div className={styles.chatHeader}>
        <div className={styles.brandName}>
          <div className={styles.avatar}>
            {brand === 'proxe' ? <PROXELogo /> : ICONS.ai(brand, config)}
          </div>
          <span>{config.name}</span>
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.resetBtn} 
            onClick={handleRequestResetChat}
            title="Reset chat"
          >
            {ICONS.reset}
          </button>
          <button
            className={styles.closeBtn}
            onClick={handleRequestCloseChat}
          >
            {ICONS.close}
          </button>
        </div>
      </div>
      <div 
        ref={messagesAreaRef}
        className={styles.messagesArea}
        data-scroll-lock="allow"
        onClick={(e) => {
          // Only close widgets if clicking directly on the messages area, not on messages or buttons
          const target = e.target as HTMLElement;
          const isClickOnMessage = target.closest(`.${styles.message}`);
          const isClickOnButton = target.closest(`.${styles.quickBtn}`) || target.closest(`.${styles.followUpBtn}`);
          const isClickOnCalendar = target.closest(`.${styles.calendarContainer}`);
          const isClickOnVideo = target.closest(`.${styles.videoContainer}`);
          
          if (!isClickOnMessage && !isClickOnButton && !isClickOnCalendar && !isClickOnVideo) {
            // Close widgets when clicking in empty messages area (clicking away)
            closeCalendarWidget();
            closeVideoWidget();
          }
        }}
      >
        {messages.map((message, index) => {
          // Rotate through accent colors (0-6 for 7 colors)
          const accentIndex = index % 7;
          const accentClass = `accent-${accentIndex}`;
          
          return (
          <React.Fragment key={message.id}>
            <div 
              className={`${styles.message} ${styles[message.type]} ${styles[accentClass]}`}
              data-message-id={message.id}
            >
              <div className={styles.messageContent}>
                <div className={styles.bubble}>
                  {message.isStreaming && !message.text ? (
                    <InfinityLoader />
                  ) : (
                    <div className={styles.bubbleContent}>
                      {/* Header with avatar and name inside the bubble */}
                      <div className={styles.bubbleHeader}>
                        <div className={styles.bubbleAvatar}>
                          {message.type === 'ai' ? ICONS.ai(brand, config) : ICONS.user}
                        </div>
                        <span className={styles.bubbleName}>
                          {message.type === 'ai' ? config.name : 'You'}
                        </span>
                      </div>
                      
                      {/* Message content */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap', gap: '8px', width: '100%' }}>
                        <div
                          className={styles.messageText}
                          style={{ flex: '1 1 auto', minWidth: 0 }}
                          dangerouslySetInnerHTML={{ __html: formatText(message.text) }}
                        />
                        {message.isStreaming && message.text && (
                          <span className={styles.streamingCursor}>▋</span>
                        )}
                      </div>
                      
                      {/* Follow-up buttons inside the bubble for AI messages */}
                      {message.type === 'ai' && message.followUps && message.followUps.length > 0 && !message.isStreaming && message.hasStreamed === true && !showCalendly && !showDeployForm && (
                        <div className={styles.followUpButtons}>
                          {message.followUps.map((followUp, followUpIndex) => {
                            // Rotate through accent colors for follow-up buttons
                            const buttonAccentIndex = (accentIndex + followUpIndex) % 7;
                            const buttonAccentClass = `accent-${buttonAccentIndex}`;
                            
                            return (
                            <button
                              key={followUpIndex}
                              className={`${styles.followUpBtn} ${styles[buttonAccentClass]}`}
                              onClick={() => handleQuickButtonClick(followUp)}
                            >
                              {followUp}
                            </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {showCalendly && calendarAnchorId === message.id && (
              <div 
                key={showCalendly}
                className={`${styles.message} ${styles.ai} ${styles['accent-0']}`}
                onClick={(e) => e.stopPropagation()}
                ref={(el) => {
                  if (el) {
                    requestAnimationFrame(() => {
                      setTimeout(() => {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }, 100);
                    });
                  }
                }}
              >
                <div className={styles.messageContent}>
                  <div className={styles.bubble}>
                    <div className={styles.bubbleContent}>
                      {/* Header with avatar and name inside the bubble */}
                  <div className={styles.bubbleHeader}>
                    <div className={styles.bubbleAvatar}>
                      {ICONS.ai(brand, config)}
                    </div>
                    <span className={styles.bubbleName}>
                      {config.name}
                    </span>
                    <button
                      type="button"
                      className={styles.calendarCloseBtn}
                      onClick={closeCalendarWidget}
                      aria-label="Close booking widget"
                    >
                      {ICONS.close}
                    </button>
                  </div>
                      
                      {/* Custom Google Calendar widget */}
                  <div
                    className={styles.calendarScrollArea}
                    data-scroll-lock="allow"
                  >
                        <BookingCalendarWidget
                          {...({
                            brand,
                            config,
                            sessionId: externalSessionId || undefined,
                            onBookingComplete: handleBookingComplete,
                            prefillName: userProfile.name || '',
                            prefillEmail: userProfile.email || '',
                            prefillPhone: userProfile.phone || '',
                            onContactDraft: handleContactDraft,
                            onContactSubmit: handleContactPersist,
                          } satisfies BookingCalendarWidgetProps)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}


            {showVideo && videoAnchorId === message.id && (
              <div 
                key={showVideo}
                className={`${styles.message} ${styles.ai} ${styles['accent-0']}`}
                onClick={(e) => e.stopPropagation()}
                ref={(el) => {
                  if (el) {
                    requestAnimationFrame(() => {
                      setTimeout(() => {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
                      }, 100);
                    });
                  }
                }}
              >
                <div className={styles.messageContent}>
                  <div className={styles.bubble}>
                    <div className={styles.bubbleContent}>
                      {/* Header with avatar and name inside the bubble */}
                      <div className={styles.bubbleHeader}>
                        <div className={styles.bubbleAvatar}>
                          {ICONS.ai(brand, config)}
                        </div>
                        <span className={styles.bubbleName}>
                          {config.name}
                        </span>
                        <button
                          type="button"
                          className={styles.calendarCloseBtn}
                          onClick={closeVideoWidget}
                          aria-label="Close video"
                        >
                          {ICONS.close}
                        </button>
                      </div>
                      
                      {/* Video player */}
                      <div
                        className={styles.videoContainer}
                        data-scroll-lock="allow"
                      >
                        <video
                          controls
                          autoPlay
                          playsInline
                          style={{
                            width: '100%',
                            maxHeight: '400px',
                            borderRadius: '8px',
                            backgroundColor: '#000',
                          }}
                        >
                          <source src="/assets/Markx.mp4" type="video/mp4" />
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </React.Fragment>
          );
        })}

        {showDeployForm && (
          <div 
            ref={deployFormRef}
            key={showDeployForm}
            className={`${styles.message} ${styles.ai} ${styles['accent-0']}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.messageContent}>
              <div className={styles.bubble}>
                <div className={styles.bubbleContent}>
                  {/* Header with avatar and name inside the bubble */}
                  <div className={styles.bubbleHeader}>
                    <div className={styles.bubbleAvatar}>
                      {ICONS.ai(brand, config)}
                    </div>
                    <span className={styles.bubbleName}>
                      {config.name}
                    </span>
                    <button
                      type="button"
                      className={styles.calendarCloseBtn}
                      onClick={closeDeployForm}
                      aria-label="Close deploy form"
                    >
                      {ICONS.close}
                    </button>
                  </div>
                  
                  {/* Deploy Form */}
                  <DeployFormInline
                    brand={brand}
                    config={config}
                    userProfile={userProfile}
                    onContactDraft={handleContactDraft}
                    onContactSubmit={handleContactPersist}
                    onFormSubmit={async () => {
                      // Sync websiteUrl from localStorage to Supabase
                      const storedUser = getStoredUser(brandKey);
                      if (storedUser?.websiteUrl && externalSessionId) {
                        await persistUserProfile({ websiteUrl: storedUser.websiteUrl });
                      }
                      
                      // Add confirmation message to chat
                      addAIMessage("Thanks! We've received your details. Our team will review them and get back to you within 24 hours. In the meantime, feel free to ask any questions about PROXe!");
                      
                      // Close the form
                      closeDeployForm();
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {exploreButtons && exploreButtons.length > 0 && (
          <div
            className={`${styles.message} ${styles.ai} ${styles['accent-0']}`}
            ref={(el) => {
              if (el) {
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 100);
                });
              }
            }}
          >
            <div className={styles.messageContent}>
              <div className={styles.bubble}>
                <div className={styles.bubbleContent}>
                  <div className={styles.bubbleHeader}>
                    <div className={styles.bubbleAvatar}>
                      {ICONS.ai(brand, config)}
                    </div>
                    <span className={styles.bubbleName}>
                      {config.name}
                    </span>
                  </div>
                  <p className={styles.exploreTitle}>Choose your PROXe</p>
                  <div className={styles.exploreButtonGroup}>
                    {exploreButtons.map((option, optionIndex) => {
                      // Map each PROXe type to its specific color class from "Meet Our PROXes" section
                      let proxeColorClass = '';
                      if (option.toLowerCase().includes('web')) {
                        proxeColorClass = styles.exploreWeb;
                      } else if (option.toLowerCase().includes('whatsapp')) {
                        proxeColorClass = styles.exploreWhatsapp;
                      } else if (option.toLowerCase().includes('voice')) {
                        proxeColorClass = styles.exploreVoice;
                      } else if (option.toLowerCase().includes('social')) {
                        proxeColorClass = styles.exploreSocial;
                      }
                      return (
                        <button
                          key={optionIndex}
                          className={`${styles.followUpBtn} ${proxeColorClass}`}
                          onClick={() => {
                            setExploreButtons(null);
                            // Send a message about the specific PROXe type
                            const proxeMessage = `Tell me more about ${option}`;
                            handleQuickButtonClick(proxeMessage);
                          }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inline Name Prompt Card */}
        {showNamePrompt && !showCalendly && !showDeployForm && (
          <div
            className={`${styles.message} ${styles.ai} ${styles['accent-0']}`}
            ref={(el) => {
              if (el) {
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 100);
                });
              }
            }}
          >
            <div className={styles.messageContent}>
              <div className={styles.bubble}>
                <div className={styles.bubbleContent}>
                  <div className={styles.bubbleHeader}>
                    <div className={styles.bubbleAvatar}>
                      {ICONS.ai(brand, config)}
                    </div>
                    <span className={styles.bubbleName}>
                      {config.name}
                    </span>
                    <button
                      type="button"
                      className={styles.inlinePromptClose}
                      onClick={handleNameDismiss}
                      aria-label="Close name prompt"
                    >
                      {ICONS.close}
                    </button>
                  </div>
                  <p className={styles.inlinePromptText}>What should we call you?</p>
                  <form onSubmit={handleNameSubmit} className={styles.inlinePromptForm}>
                    <div className={styles.inlinePromptInputWrapper}>
                      <input
                        ref={namePromptInputRef}
                        className={styles.inlinePromptInput}
                        placeholder="Your name"
                        value={nameInput}
                        onChange={(event) => setNameInput(event.target.value)}
                      />
                      <button type="submit" className={styles.inlinePromptSendBtn} disabled={!nameInput.trim()}>
                        {ICONS.send}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inline Email Prompt Card */}
        {showEmailPrompt && !showCalendly && !showDeployForm && (
          <div
            className={`${styles.message} ${styles.ai} ${styles['accent-0']}`}
            ref={(el) => {
              if (el) {
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 100);
                });
              }
            }}
          >
            <div className={styles.messageContent}>
              <div className={styles.bubble}>
                <div className={styles.bubbleContent}>
                  <div className={styles.bubbleHeader}>
                    <div className={styles.bubbleAvatar}>
                      {ICONS.ai(brand, config)}
                    </div>
                    <span className={styles.bubbleName}>
                      {config.name}
                    </span>
                    <button
                      type="button"
                      className={styles.inlinePromptClose}
                      onClick={handleEmailSkip}
                      aria-label="Close email prompt"
                    >
                      {ICONS.close}
                    </button>
                  </div>
                  <p className={styles.inlinePromptText}>Where can we reach you?</p>
                  <form onSubmit={handleEmailSubmit} className={styles.inlinePromptForm}>
                    <div className={styles.inlinePromptInputWrapper}>
                      <input
                        ref={emailPromptInputRef}
                        className={styles.inlinePromptInput}
                        placeholder="name@example.com"
                        type="email"
                        value={emailInput}
                        onChange={(event) => setEmailInput(event.target.value)}
                      />
                      <button type="submit" className={styles.inlinePromptSendBtn} disabled={!emailInput.trim()}>
                        {ICONS.send}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inline Phone Prompt Card */}
        {showPhonePrompt && !showCalendly && !showDeployForm && (
          <div
            className={`${styles.message} ${styles.ai} ${styles['accent-0']}`}
            ref={(el) => {
              if (el) {
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 100);
                });
              }
            }}
          >
            <div className={styles.messageContent}>
              <div className={styles.bubble}>
                <div className={styles.bubbleContent}>
                  <div className={styles.bubbleHeader}>
                    <div className={styles.bubbleAvatar}>
                      {ICONS.ai(brand, config)}
                    </div>
                    <span className={styles.bubbleName}>
                      {config.name}
                    </span>
                    <button
                      type="button"
                      className={styles.inlinePromptClose}
                      onClick={handlePhoneSkip}
                      aria-label="Close phone prompt"
                    >
                      {ICONS.close}
                    </button>
                  </div>
                  <p className={styles.inlinePromptText}>Share your phone number so we can follow up</p>
                  <form onSubmit={handlePhoneSubmit} className={styles.inlinePromptForm}>
                    <div className={styles.inlinePromptInputWrapper}>
                      <input
                        ref={phonePromptInputRef}
                        className={styles.inlinePromptInput}
                        type="tel"
                        placeholder="Enter your phone number"
                        value={phoneInput}
                        onChange={(event) => setPhoneInput(event.target.value)}
                      />
                      <button type="submit" className={styles.inlinePromptSendBtn} disabled={!phoneInput.trim()}>
                        {ICONS.send}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {/* Mobile: keep quick actions docked near the bottom, same layout as desktop */}
      {showMobileQuickActions && renderWelcomeButtons(styles.mobileQuickActions)}

      {/* Desktop: quick buttons near input when showing welcome message */}
      {(!isMobileViewport) && isOpen && hasShownWelcomeRef.current && messages.length === 1 && messages[0].type === 'ai' && !messages[0].isStreaming && conversationsToRestoreRef.current.length === 0 && renderWelcomeButtons(styles.welcomeQuickButtons)}

      <div className={styles.inputArea}>
        {isOpen && showPrivacyNotice && (
          <div className={styles.privacyNotice}>
            <span className={styles.privacyPoweredIcon}>
              <PROXELogo />
            </span>
            <span>Powered by PROXe</span>
          </div>
        )}
        <div className={styles.chatInputRow}>
          <div className={styles.chatInputWrapper}>
            <input
              ref={chatInputRef}
              type="text"
              className={styles.chatInput}
              placeholder="Type your message..."
              value={inputValue}
              autoComplete="off"
              data-form-type="other"
              data-lpignore="true"
              onChange={(e) => {
                setInputValue(e.target.value);
                // Close any open prompt cards when user starts typing
                if (e.target.value && (showNamePrompt || showEmailPrompt || showPhonePrompt)) {
                  if (showNamePrompt) {
                    setShowNamePrompt(false);
                    setNamePromptDismissed(true);
                  }
                  if (showEmailPrompt) {
                    setShowEmailPrompt(false);
                  }
                  if (showPhonePrompt) {
                    setShowPhonePrompt(false);
                  }
                }
              }}
              onFocus={(e) => {
                if (showCalendly) {
                  closeCalendarWidget();
                }
                if (showVideo) {
                  closeVideoWidget();
                }
                if (showDeployForm) {
                  closeDeployForm();
                }
                // Scroll input into view above keyboard on mobile
    const scrollInputIntoView = () => {
                const input = e.target;
                if (input) {
                  if (window.visualViewport) {
          return; // rely on visual viewport adjustments
        } else {
          input.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
            inline: 'nearest'
          });
                  }
                }
              };
              requestAnimationFrame(() => {
                setTimeout(scrollInputIntoView, 150);
              });
            }}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && inputValue.trim()) {
                handleSend();
              }
            }}
          />
        </div>
        <button className={styles.sendBtn} onClick={handleSend} disabled={!inputValue.trim() || isLoading}>
          {ICONS.send}
        </button>
        </div>
      </div>
      </div>
    </div>
    {isDesktop && (
      <button
        className={styles.bubbleButton}
        onClick={isOpen ? handleCloseChat : handleOpenChat}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        style={{ zIndex: 10001 }}
      >
        <div className={styles.bubbleIcon}>
          {isOpen ? ICONS.chevronDown : (brand === 'proxe' ? <PROXELogo /> : ICONS.ai(brand, config))}
        </div>
      </button>
    )}
  </>
  );
}


