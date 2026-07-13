'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  MdInbox,
  MdSend,
  MdSearch,
  MdAutoAwesome,
  MdEvent,
  MdEventAvailable,
  MdOpenInNew,
  MdPhone,
  MdEmail,
  MdLocationOn,
  MdBusiness,
  MdNotes,
  MdLanguage,
  MdPerson,
  MdFlightTakeoff,
  MdMessage,
  MdSchedule,
  MdArrowBack,
  MdInfoOutline,
  MdClose,
} from 'react-icons/md'
import { useIsMobile } from '@/hooks/useIsMobile'
import { FaWhatsapp } from 'react-icons/fa'
import LoadingOverlay from '@/components/dashboard/LoadingOverlay'
import LeadDetailsModal from '@/components/dashboard/LeadDetailsModal'
import WhatsAppTemplatePicker from '@/components/dashboard/WhatsAppTemplatePicker'
import { calculateLeadScore } from '@/lib/leadScoreCalculator'
import { getCurrentBrandId } from '@/configs'

// One brand per build — resolves statically. bcon's inbox carries extra
// fork-specific UI (full Meta-form card, planned follow-ups timeline) and a
// form parser tuned to its question-sentence Meta forms.
const IS_BCON = getCurrentBrandId() === 'bcon'
// The owner / scout / brand "audience" taxonomy is Lokazen's model. Gate any UI
// that renders those labels to Lokazen so a BCON business "owner" never shows
// as the Lokazen "Property Owner", etc.
const IS_LOKAZEN = getCurrentBrandId() === 'lokazen'

// Channel icons — plain SVG, no container. Tinted with the channel brand
// colour via CSS filter (for img tags) or stroke (for inline SVG). The old
// version wrapped each icon in a coloured square which looked busy in the
// conversation list; this version is just the icon at the channel colour.
const ChannelIcon = ({ channel, size = 16, active = false }: { channel: string; size?: number; active?: boolean }) => {
  const opacity = active ? 1 : 0.45;

  // We tint white SVG line-art assets to the brand colour using a precomputed
  // CSS filter. (`filter:invert(1)` on its own only makes them white — not the
  // channel colour we want.) Each filter below was generated to map a black
  // source SVG to the listed hex; ok-ish approximation, fine at 16px.
  const TINT: Record<string, string> = {
    web:      'invert(46%) sepia(86%) saturate(2074%) hue-rotate(206deg) brightness(98%) contrast(94%)',   // #3B82F6
    whatsapp: 'invert(67%) sepia(78%) saturate(396%) hue-rotate(89deg) brightness(96%) contrast(89%)',     // #25D366
    social:   'invert(72%) sepia(64%) saturate(539%) hue-rotate(0deg) brightness(99%) contrast(94%)',       // #F59E0B
  };

  switch (channel) {
    case 'web':
      return (
        <img
          src="/browser-stroke-rounded.svg"
          alt="Web" title="Website"
          width={size} height={size}
          style={{ opacity, filter: TINT.web, display: 'inline-block', flexShrink: 0 }}
        />
      );
    case 'whatsapp':
      return (
        <img
          src="/whatsapp-business-stroke-rounded.svg"
          alt="WhatsApp" title="WhatsApp"
          width={size} height={size}
          style={{ opacity, filter: TINT.whatsapp, display: 'inline-block', flexShrink: 0 }}
        />
      );
    case 'voice':
      return (
        <svg
          width={size} height={size} viewBox="0 0 24 24" fill="none"
          style={{ opacity, flexShrink: 0 }}
          aria-label="Voice"
        >
          <title>Voice</title>
          <path
            d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.24 1.01l-2.2 2.2z"
            stroke="#8B5CF6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      );
    case 'social':
      return (
        <img
          src="/video-ai-stroke-rounded.svg"
          alt="Social" title="Social"
          width={size} height={size}
          style={{ opacity, filter: TINT.social, display: 'inline-block', flexShrink: 0 }}
        />
      );
    default:
      return null;
  }
};

const ALL_CHANNELS = ['web', 'whatsapp'];

// Score Ring - circular progress indicator with score inside
// Score color/label scheme — kept in sync with LeadDetailsModal.getHealthColor
// so a "Warm" lead reads the same color everywhere in the dashboard.
//   90+   Hot   green
//   70-89 Warm  orange
//   0-69  Cold  blue
const scoreVisual = (score: number | null) => {
  const s = score ?? 0;
  if (s >= 90) return { color: '#22C55E', label: 'Hot' };
  if (s >= 70) return { color: '#F97316', label: 'Warm' };
  return { color: '#3B82F6', label: 'Cold' };
};

const ScoreRing = ({ score, size = 28 }: { score: number | null; size?: number }) => {
  const s = score ?? 0;
  const { color } = scoreVisual(score);
  const r = (size / 2) - 2.5;
  const circumference = 2 * Math.PI * r;
  const dashLen = (s / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray={`${dashLen} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.3s ease' }}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill="var(--text-primary)" fontSize="10" fontWeight="bold">{s}</text>
    </svg>
  );
};

// WhatsApp-style contact avatar — a colored circle of initials (we don't
// capture real profile photos yet), with a tiny channel badge tucked into the
// bottom-right corner (WhatsApp/web/voice), so the row reads like a WA chat.
// Background hue is derived from the name so each contact keeps a stable color.
const AVATAR_HUES = [4, 24, 45, 140, 175, 200, 260, 300, 330]
const WaAvatar = ({ name, phone, channel, size = 46 }: { name?: string | null; phone?: string | null; channel?: string; size?: number }) => {
  const label = (name || phone || 'U').trim()
  const initials = label.split(/\s+/).map((n) => n[0]).join('').substring(0, 2).toUpperCase() || 'U'
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) & 0xffff
  const hue = AVATAR_HUES[hash % AVATAR_HUES.length]
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full flex items-center justify-center font-semibold select-none"
        style={{
          width: size, height: size,
          background: `hsl(${hue}, 46%, 42%)`,
          color: '#fff',
          fontSize: size * 0.36,
          letterSpacing: 0.3,
        }}
      >
        {initials}
      </div>
      {channel && (
        <span
          className="absolute rounded-full flex items-center justify-center"
          style={{
            right: -1, bottom: -1,
            width: size * 0.42, height: size * 0.42,
            background: 'var(--bg-primary)',
            boxShadow: '0 0 0 1.5px var(--bg-primary)',
          }}
        >
          <ChannelIcon channel={channel} size={size * 0.28} active={true} />
        </span>
      )}
    </div>
  )
}

// Types
interface Conversation {
  lead_id: string
  lead_name: string
  lead_email: string
  lead_phone: string
  channels: string[] // Array of all channels: ['web', 'whatsapp', 'voice', 'social']
  last_message: string
  last_message_at: string
  unread_count: number
  booking_status: string | null
  brand_name: string | null
  lead_score: number | null
  lead_stage: string | null
  city: string | null
  booking_date: string | null
  booking_time: string | null
  next_touchpoint: string | null
  form_data: Record<string, any> | null
  first_touchpoint: string | null
  // Carried so the conversation list can re-calculate the lead score
  // client-side (the DB lead_score is often stale or 0).
  unified_context?: Record<string, any> | null
  last_interaction_at?: string | null
  timestamp?: string | null
}

interface Message {
  id: string
  lead_id: string
  channel: string
  sender: 'customer' | 'agent' | 'system'
  content: string
  message_type: string
  metadata: any
  created_at: string
  delivered_at?: string | null
  read_at?: string | null
}


// Audience type badge for a conversation (Lokazen: owner / scout / brand).
// Same resolution order as the right-panel badge — brand-namespaced context
// first, windchasers fallback for legacy rows, then channel contexts. Shown in
// the conversation list so the agent knows who each chat is with at a glance.
function audienceOf(uc: Record<string, any> | null | undefined): { label: string; color: string } | null {
  if (!uc) return null
  const bc = { ...(uc.windchasers || {}), ...(uc[getCurrentBrandId()] || {}) }
  const profile = uc.web?.profile || uc.whatsapp?.profile || {}
  const ut = String(bc.user_type || uc.web?.user_type || uc.whatsapp?.user_type || profile.user_type || '').toLowerCase()
  if (ut.includes('owner')) return { label: 'Owner', color: '#0EA5E9' }
  if (ut.includes('scout')) return { label: 'Scout', color: '#F59E0B' }
  if (ut.includes('brand')) return { label: 'Brand', color: '#A855F7' }
  return null
}

function cleanMessageContent(text: string): string {
  if (!text) return '';

  // Strip the system annotations the agent prepends to a button click before
  // sending it to the LLM ([User's name is X], [Button intent: ...]) so the
  // inbox shows the clean label the customer actually tapped.
  return text
    .replace(/\[User's name is [^\]]+\]\s*/g, '')
    .replace(/\[Button intent:[^\]]*\]\s*/gi, '')
    .trim();
}

function renderMarkdown(text: string) {
  if (!text) return null;

  // Clean the text first
  const cleanedText = cleanMessageContent(text);

  // Simple regex to handle **bold** text
  const parts = cleanedText.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-bold" style={{ color: 'inherit' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

/**
 * Render WhatsApp-style markdown — what Meta's templates use natively:
 *   *text*  → bold
 *   _text_  → italic
 *   ~text~  → strikethrough
 * Newlines preserved as <br/>. Used for template messages so the inbox shows
 * what the customer actually sees on WhatsApp (not raw asterisks).
 */
function renderWhatsAppMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  const cleanedText = cleanMessageContent(text);
  // Handles both **double** (Markdown) and *single* (WhatsApp) bold, _italic_,
  // ~strike~, and newlines — so messages render identically on every channel.
  const re = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|_[^_\n]+?_|~[^~\n]+?~|\n)/g;
  const segments = cleanedText.split(re).filter((s) => s !== undefined && s !== '');
  return segments.map((seg, i) => {
    if (seg === '\n') return <br key={i} />;
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
      return <strong key={i} className="font-semibold">{seg.slice(2, -2)}</strong>;
    }
    if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2) {
      return <strong key={i} className="font-semibold">{seg.slice(1, -1)}</strong>;
    }
    if (seg.startsWith('_') && seg.endsWith('_') && seg.length > 2) {
      return <em key={i} className="italic">{seg.slice(1, -1)}</em>;
    }
    if (seg.startsWith('~') && seg.endsWith('~') && seg.length > 2) {
      return <s key={i}>{seg.slice(1, -1)}</s>;
    }
    return <span key={i}>{seg}</span>;
  });
}

/** Parse form submission data from a message into structured fields */
function parseFormFields(content: string): { intro: string; fields: { key: string; value: string }[] } | null {
  if (!content) return null;
  // Meta lead forms arrive flattened as "<label>: <value> <label>: <value> …".
  // Labels are either snake_case question keys (what_is_your_…?, which may contain
  // an apostrophe such as child's) OR simple labels Meta appends (first name, phone,
  // email, city). The old pattern only matched snake_case keys, so the simple labels
  // mashed into the previous value and an apostrophe split one key into two.
  // Trailing [?_]* handles Meta's "what_is_your_age?_:" shape (question mark AND
  // a stray underscore before the colon) — otherwise that field mashed into the
  // previous value.
  // bcon: Meta "click to WhatsApp" forms arrive as ONE run-on line of English
  // question sentences ("How are you managing leads?: answer ..."). A key is
  // EITHER a question that STARTS with a question-word and ends in "?", OR a
  // known plain label, OR a snake_case (Pabbly) key — anchoring questions to a
  // leading question-word lets the parser skip over multi-word answers.
  // Other brands keep the snake_case-first pattern their forms produce.
  const fieldPattern = IS_BCON
    ? /((?:Who|What|When|Where|Why|Which|How|Do|Does|Are|Is)\b[^:?]*\?|Full name|First name|Last name|Company name|Brand name|Business name|Phone number|Phone|Email|City|State|Location|Name|\w+(?:_\w+)+)\s*:\s*/gi
    : /\b(first name|last name|full name|phone|email|city|location|state|[a-z][a-z0-9]*(?:[_'’][a-z0-9]+)+[?_]*)\s*:\s*/gi;
  const matches = [...content.matchAll(fieldPattern)];
  if (matches.length < 3) return null;

  const intro = content.substring(0, matches[0].index!).trim();
  const fields: { key: string; value: string }[] = [];

  for (let i = 0; i < matches.length; i++) {
    const rawKey = matches[i][1];
    const valueStart = matches[i].index! + matches[i][0].length;
    const valueEnd = i < matches.length - 1 ? matches[i + 1].index! : content.length;
    const value = content.substring(valueStart, valueEnd).trim();
    let cleanKey: string;
    if (IS_BCON) {
      // Preserve the EXACT form question (original casing + "?") so the inbox
      // card shows the real form verbatim. Only snake_case keys (e.g. Pabbly
      // "full_name") get title-cased.
      const trimmedKey = rawKey.trim();
      const isSnake = /_/.test(trimmedKey) && !/\s/.test(trimmedKey);
      cleanKey = isSnake
        ? trimmedKey.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : trimmedKey;
    } else {
      cleanKey = rawKey
        .replace(/[?_]+$/, '')
        .replace(/_/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
    fields.push({ key: cleanKey, value });
  }
  return { intro, fields };
}

/** Extract a short label for a form field */
function getFormFieldLabel(key: string): string {
  const k = key.toLowerCase();
  if (IS_BCON) {
    // bcon's agency-business form questions (fork-exact label set).
    if (k.includes('brand name') || k.includes('business name') || k.includes('company name')) return 'Brand';
    if (k.includes('full name') || k === 'name' || k === 'first name') return 'Name';
    if (k.includes('email')) return 'Email';
    if (k.includes('phone')) return 'Phone';
    if (k.includes('city') || k.includes('location')) return 'City';
    if (k.includes('how fast') || k.includes('how soon') || k.includes('want to start') || k.includes('urgency')) return 'Urgency';
    if (k.includes('who are your customers') || k.includes('customers')) return 'Customers';
    if (k.includes('what does your business') || k.includes('business do') || k.includes('business type') || k.includes('choose business')) return 'Business';
    if (k.includes('managing leads') || k.includes('currently managing') || k.includes('current system')) return 'Current System';
    if (k.includes('marketing spend') || k.includes('marketing budget') || k.includes('spend')) return 'Spend';
    if (k.includes('website')) return 'Website';
    if (k.includes('leads') || k.includes('handle')) return 'Volume';
    if (k.includes('ai system')) return 'AI Systems';
    return key.length > 48 ? key.substring(0, 48) + '…' : key;
  }
  if (k.includes('brand name') || k.includes('business name')) return 'Brand';
  if (k.includes('full name') || k === 'name') return 'Name';
  if (k.includes('email')) return 'Email';
  if (k.includes('phone')) return 'Phone';
  if (k.includes('city') || k.includes('location')) return 'City';
  if (k.includes('how fast') || k.includes('urgency')) return 'Urgency';
  if (k.includes('business type') || k.includes('choose business')) return 'Type';
  if (k.includes('website')) return 'Website';
  if (k.includes('leads') || k.includes('handle')) return 'Volume';
  if (k.includes('ai system')) return 'AI Systems';
  // Windchasers Meta lead-form questions
  if (k.includes('concern')) return 'Concern';
  if (k.includes('timeline') || k.includes('planning') || k.includes('start the flight') ||
      k.includes('when are you') || k.includes('looking to start')) return 'Timeline';
  if (k.includes('age')) return 'Age';
  if (k.includes('education')) return 'Education';
  if (k.includes('child')) return 'Child';
  if (k.includes('name')) return 'Name';
  // Fallback: show the full label (don't hard-truncate to 15 chars — that's what
  // produced unreadable "WHAT IS YOUR PR…" labels). Cap generously instead.
  return key.length > 48 ? key.substring(0, 48) + '…' : key;
}

/** Date + time for a planned follow-up, IST, e.g. "Fri 27 Jun, 9:00 AM". */
function fmtPlannedWhen(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
  return `${date}, ${time}`
}

/** Short human label for a task type shown on the planned-follow-up timeline. */
function humanizeTaskType(t: string): string {
  const map: Record<string, string> = {
    follow_up_24h: 'Follow-up', follow_up_day1: 'Day 1', follow_up_day3: 'Day 3',
    follow_up_day5: 'Day 5', follow_up_day7: 'Day 7', follow_up_day30: 'Day 30', follow_up_day90: 'Day 90',
    re_engage: 'Re-engage', nudge_waiting: 'Nudge', push_to_book: 'Push to book',
    booking_reminder_24h: 'Reminder 24h', booking_reminder_30m: 'Reminder 30m',
    try_voice_call: 'Voice call', human_callback: 'Callback', human_followup: 'Your task',
    missed_call_followup: 'Missed-call', first_outreach: 'Welcome',
  }
  return map[t] || (t || 'task').replace(/_/g, ' ')
}

/** Format a time gap in ms to a human-readable short string */
function formatGap(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hrs < 24) return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

/** Color for gap: green < 5min, yellow 5-30min, red > 30min */
function gapColor(ms: number): string {
  const mins = ms / 60000;
  if (mins < 5) return '#22c55e';
  if (mins <= 30) return '#f59e0b';
  return '#ef4444';
}


function getDeliveryStatusStyle(status: string | undefined): { bg: string; color: string } {
  if (!status) return { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' }
  switch (status) {
    case 'read': return { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6' }
    case 'delivered': return { bg: 'rgba(34,197,94,0.15)', color: '#22C55E' }
    case 'failed': return { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' }
    default: return { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' }
  }
}

function getTaskTypeTag(taskType: string | undefined): { label: string; bg: string; color: string } | null {
  if (!taskType) return null
  const t = taskType.toLowerCase()
  if (t.includes('nudge')) return { label: 'Nudge', bg: 'rgba(249,115,22,0.15)', color: '#F97316' }
  if (t.includes('push_to_book')) return { label: 'Push to Book', bg: 'rgba(239,68,68,0.15)', color: '#EF4444' }
  if (t.includes('follow_up') || t.includes('followup')) return { label: 'Follow-up', bg: 'rgba(34,197,94,0.15)', color: '#22C55E' }
  if (t.includes('re_engage') || t.includes('reengage')) return { label: 'Re-engage', bg: 'rgba(239,68,68,0.15)', color: '#EF4444' }
  if (t.includes('first_outreach')) return { label: 'First Outreach', bg: 'rgba(99,102,241,0.15)', color: '#818CF8' }
  if (t.includes('reminder')) return { label: 'Reminder', bg: 'rgba(59,130,246,0.15)', color: '#3B82F6' }
  return null
}

function getDeliveryTooltip(status: string | undefined, error?: string): string {
  if (!status) return 'Status: Pending \u2013 awaiting delivery confirmation'
  switch (status) {
    case 'sent': return 'Status: Sent \u2013 waiting for delivery'
    case 'delivered': return 'Status: Delivered'
    case 'read': return 'Status: Read by customer'
    case 'failed': return `Status: Failed \u2013 ${error || 'unknown error'}`
    default: return 'Status: Pending \u2013 awaiting delivery confirmation'
  }
}


function DeliveryStatusIcon({ deliveredAt, readAt, failed }: { deliveredAt?: string | null; readAt?: string | null; failed?: boolean }) {
  // Red warning icon ONLY for a REAL, confirmed send/delivery failure (caller
  // passes this from metadata.send_succeeded===false or delivery_status===
  // 'failed'). This used to be inferred from "no delivery/read confirmation
  // within 10 minutes" — but Meta's status webhook not calling back yet is
  // normal and common (batched receipts, recipient hasn't opened WhatsApp,
  // etc.), NOT evidence the message failed to send. That false positive
  // painted plenty of genuinely-sent messages with a scary red icon.
  if (failed) {
    // Warning icon
    return (
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
        <path d="M8 1v10M8 13v2" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    );
  }
  if (readAt) {
    // Double green tick = read by recipient
    return <svg width="12" height="10" viewBox="0 0 20 16" fill="none"><path d="M1 8l3 3 7-7" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 8l3 3 7-7" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  }
  if (deliveredAt) {
    // Double amber tick = delivered
    return <svg width="12" height="10" viewBox="0 0 20 16" fill="none"><path d="M1 8l3 3 7-7" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 8l3 3 7-7" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  }
  // Single amber tick = sent (no delivery confirmation)
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export default function InboxPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [selectedChannel, setSelectedChannel] = useState<string>('')
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [conversationSummary, setConversationSummary] = useState<string | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [leadDetails, setLeadDetails] = useState<any>(null)
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; email: string | null }>>([])
  const [calculatedLeadScore, setCalculatedLeadScore] = useState<number | null>(null)
  // Map of lead_id → calculated score for the conversation list. The DB
  // lead_score is often null/0; this lets the list reflect real engagement.
  const [calculatedConvScores, setCalculatedConvScores] = useState<Record<string, number>>({})
  const [messageChannelFilter, setMessageChannelFilter] = useState<string>('all')
  // bcon: Meta-form card expand/collapse + planned follow-ups timeline
  const [formCardExpanded, setFormCardExpanded] = useState(false)
  const [plannedActions, setPlannedActions] = useState<any[]>([])
  const [loadingPlanned, setLoadingPlanned] = useState(false)
  // Mobile: WhatsApp-style stack — list full-screen until a chat is picked,
  // then the thread takes over. The details sidebar becomes an overlay.
  const isMobile = useIsMobile()
  const [showDetailsMobile, setShowDetailsMobile] = useState(false)

  // Handle URL parameters to open specific conversation
  useEffect(() => {
    const leadParam = searchParams.get('lead')
    const channelParam = searchParams.get('channel')

    if (leadParam) {
      setSelectedLeadId(leadParam)
      if (channelParam) {
        setSelectedChannel(channelParam)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Fetch conversations (grouped by lead_id)
  useEffect(() => {
    console.log('useEffect triggered - fetching conversations, channelFilter:', channelFilter)
    fetchConversations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelFilter])

  // Auto-select first conversation when loaded (if none selected via URL).
  // On mobile the list IS the landing view — auto-selecting would skip
  // straight into a thread, so only deep links (?lead=) open one there.
  useEffect(() => {
    if (isMobile) return
    if (conversations.length > 0 && !selectedLeadId && !searchParams.get('lead')) {
      const first = conversations[0]
      setSelectedLeadId(first.lead_id)
      if (first.channels && first.channels.length > 0) {
        setSelectedChannel(first.channels[0])
      }
    }
  }, [conversations, selectedLeadId, searchParams, isMobile])

  // Mobile: close the details overlay whenever the thread changes
  useEffect(() => { setShowDetailsMobile(false) }, [selectedLeadId])

  // bcon: collapse the form card again whenever a different lead is opened.
  useEffect(() => { setFormCardExpanded(false) }, [selectedLeadId])

  // bcon: load this lead's planned follow-ups (the sequence they're in) for the
  // right-panel timeline — every upcoming agent_task with its message preview,
  // date-wise. Reuses the tasks board API (already resolves the template body).
  useEffect(() => {
    if (!IS_BCON) return
    if (!selectedLeadId) { setPlannedActions([]); return }
    let alive = true
    setLoadingPlanned(true)
    fetch(`/api/dashboard/tasks?lead_id=${selectedLeadId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive) return
        const b = d?.board
        if (!b) { setPlannedActions([]); return }
        const flat = [
          ...(b.nextToFire || []),
          ...(b.upcoming?.soon || []),
          ...(b.upcoming?.today || []),
          ...(b.upcoming?.tomorrow || []),
          ...(b.upcoming?.later || []),
          ...((b.needsAttention || []).filter((t: any) => t.action === 'approve')),
        ]
        const seen = new Set<string>()
        const dedup = flat.filter((t: any) => t?.scheduled_at && !seen.has(t.id) && seen.add(t.id))
        dedup.sort((a: any, x: any) => new Date(a.scheduled_at).getTime() - new Date(x.scheduled_at).getTime())
        setPlannedActions(dedup)
      })
      .catch(() => { if (alive) setPlannedActions([]) })
      .finally(() => { if (alive) setLoadingPlanned(false) })
    return () => { alive = false }
  }, [selectedLeadId])

  // Set default channel when conversation is selected
  useEffect(() => {
    if (selectedLeadId && !selectedChannel) {
      const conversation = conversations.find(c => c.lead_id === selectedLeadId)
      if (conversation && conversation.channels.length > 0) {
        // Check if channel is specified in URL, otherwise use first channel
        const channelParam = searchParams.get('channel')
        if (channelParam && conversation.channels.includes(channelParam)) {
          setSelectedChannel(channelParam)
        } else {
          setSelectedChannel(conversation.channels[0])
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId, conversations, searchParams])

  // Reset summary when changing conversations
  useEffect(() => {
    setConversationSummary(null)
    setShowSummary(false)
  }, [selectedLeadId])

  // Anonymous-web-visitor right-panel state. true = no all_leads row to
  // fetch (synthetic 'session:*' key). Distinct from `leadDetails === null`
  // which the right pane treats as "still loading."
  const [isAnonymousSession, setIsAnonymousSession] = useState(false)

  // Fetch lead details for right panel
  useEffect(() => {
    if (!selectedLeadId) { setLeadDetails(null); setIsAnonymousSession(false); return }

    // Anonymous web visitor: no all_leads row exists, so skip the fetch
    // and flag the panel to render a stub instead of the loading spinner.
    if (selectedLeadId.startsWith('session:')) {
      setLeadDetails(null)
      setIsAnonymousSession(true)
      return
    }
    setIsAnonymousSession(false)

    async function fetchLeadDetails() {
      try {
        console.log('[RIGHT PANEL] Fetching lead details for:', selectedLeadId)
        const { data, error } = await supabase
          .from('all_leads')
          .select('*')
          .eq('id', selectedLeadId)
          .maybeSingle()
        console.log('[RIGHT PANEL] Result:', data ? 'found' : 'null', error ? `Error: ${error.message}` : 'no error')
        if (error || !data) {
          // Try lead_id as fallback
          console.log('[RIGHT PANEL] Trying lead_id fallback...')
          const { data: data2, error: error2 } = await supabase
            .from('all_leads')
            .select('*')
            .eq('lead_id', selectedLeadId)
            .maybeSingle()
          console.log('[RIGHT PANEL] Fallback result:', data2 ? 'found' : 'null', error2 ? `Error: ${error2.message}` : 'no error')
          setLeadDetails(data2 || null)
          return
        }
        setLeadDetails(data)
      } catch (err) { console.error('[RIGHT PANEL] Exception:', err); setLeadDetails(null) }
    }
    fetchLeadDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId])

  // Team members for the lead-owner dropdown (fetched once).
  useEffect(() => {
    let cancelled = false
    fetch('/api/dashboard/team-members')
      .then((r) => r.json())
      .then((d) => { if (!cancelled && Array.isArray(d.members)) setTeamMembers(d.members) })
      .catch(() => { /* non-fatal */ })
    return () => { cancelled = true }
  }, [])

  // Assign / clear the owner of the currently open lead.
  const setLeadOwner = async (ownerId: string) => {
    if (!selectedLeadId) return
    const member = teamMembers.find((m) => m.id === ownerId) || null
    const owner = member ? { id: member.id, name: member.name, email: member.email } : null
    // Optimistic update
    setLeadDetails((prev: any) => prev ? { ...prev, unified_context: { ...(prev.unified_context || {}), owner: owner ? { ...owner } : null } } : prev)
    try {
      await fetch(`/api/dashboard/leads/${selectedLeadId}/owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner }),
      })
    } catch { /* non-fatal; optimistic value stays */ }
  }

  // Recalculate lead score client-side whenever lead details change
  // (DB lead_score is often stale/0 — calculator looks at messages + context)
  useEffect(() => {
    if (!leadDetails?.id) { setCalculatedLeadScore(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const result = await calculateLeadScore(leadDetails)
        if (!cancelled) setCalculatedLeadScore(result.score)
      } catch (err) {
        console.error('[RIGHT PANEL] calculateLeadScore failed:', err)
        if (!cancelled) setCalculatedLeadScore(null)
      }
    })()
    return () => { cancelled = true }
  }, [leadDetails])

  // Calculate scores for every conversation in the list. The DB lead_score
  // is often null or stale (set to 0 when never recomputed) — without this
  // the conversation list shows missing or zero scores even for engaged
  // leads. Runs once per conversations refresh.
  useEffect(() => {
    if (!conversations || conversations.length === 0) {
      setCalculatedConvScores({})
      return
    }
    let cancelled = false
    ;(async () => {
      const next: Record<string, number> = {}
      // Run in parallel — each call queries conversations for the lead.
      // For dozens of leads this is acceptable; if it grows, batch later.
      await Promise.all(conversations.map(async (conv) => {
        try {
          const leadShape: any = {
            id: conv.lead_id,
            email: conv.lead_email,
            phone: conv.lead_phone,
            unified_context: conv.unified_context || {},
            last_interaction_at: conv.last_interaction_at || conv.last_message_at,
            booking_date: conv.booking_date,
            booking_time: conv.booking_time,
            timestamp: conv.timestamp || conv.last_message_at,
            lead_score: conv.lead_score,
          }
          const result = await calculateLeadScore(leadShape)
          next[conv.lead_id] = result.score
        } catch {
          // Fall back to whatever the DB has on failure.
          next[conv.lead_id] = conv.lead_score ?? 0
        }
      }))
      if (!cancelled) setCalculatedConvScores(next)
    })()
    return () => { cancelled = true }
  }, [conversations])

  // Fetch messages when conversation selected or channel changes
  useEffect(() => {
    if (selectedLeadId) {
      // Fetch messages even if channel isn't set yet - will show all messages
      fetchMessages(selectedLeadId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId, selectedChannel])

  // Real-time subscription for new messages
  useEffect(() => {
    const channel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        (payload) => {
          // Refresh conversations list
          fetchConversations()
          // If viewing this conversation, add message
          if (payload.new.lead_id === selectedLeadId) {
            setMessages(prev => [...prev, payload.new as Message])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId])

  async function fetchConversations() {
    setLoading(true)
    try {
      console.log('Fetching conversations...')

      // First, try a simple count to see if messages exist
      const { count: messageCount, error: countError } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })

      console.log('Total messages in database:', messageCount, countError ? `Error: ${countError.message}` : '')

      // If we get an RLS error, log it clearly
      if (countError) {
        console.error('❌ RLS Error - Conversations table may be blocked:', countError.message)
        if (countError.message.includes('permission') || countError.message.includes('policy')) {
          console.error('⚠️  RLS Policy Error: Make sure migration 018_disable_auth_requirements.sql has been run!')
        }
      } else if (messageCount === 0) {
        // No RLS error but 0 messages - check if we can actually query the table
        console.log('⚠️  No messages found. Testing RLS access...')
        const { data: testData, error: testError } = await supabase
          .from('messages')
          .select('id')
          .limit(1)

        if (testError) {
          console.error('❌ RLS Test Failed - Cannot query conversations table:', testError.message)
        } else {
          console.log('✅ RLS Test Passed - Can query conversations table (it\'s just empty)')
        }
      }

      // Fetch ALL conversations — including anonymous web chats (lead_id=null).
      // Anonymous web visitors are grouped below by their session_id (in
      // metadata) so they surface in the inbox even before they share
      // phone/email. Without this, 100+ web chats can be active and the
      // inbox stays empty.
      let query = supabase
        .from('conversations')
        .select('lead_id, channel, content, sender, created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(1000) // Limit to prevent performance issues

      // Apply channel filter if not "all"
      if (channelFilter !== 'all') {
        query = query.eq('channel', channelFilter)
      }

      const { data: messagesData, error: messagesError } = await query

      if (messagesError) {
        console.error('Error fetching messages:', messagesError)
        console.error('Error details:', JSON.stringify(messagesError, null, 2))
        setConversations([])
        setLoading(false)
        return
      }

      console.log('Fetched messages:', messagesData?.length || 0)

      if (!messagesData || messagesData.length === 0) {
        console.log('No messages found - checking if this is a data issue or query issue')
        // Try fetching without filters to see if any messages exist
        const { data: allMessages, error: allError } = await supabase
          .from('conversations')
          .select('id, lead_id')
          .limit(10)

        console.log('Sample messages (any):', allMessages?.length || 0, allError ? `Error: ${allError.message}` : '')

        // Fallback: Try to show leads with recent activity even without messages
        // This helps when messages haven't been created yet but leads exist
        console.log('Attempting fallback: fetching leads with recent activity...')
        const { data: activeLeads, error: leadsError } = await supabase
          .from('all_leads')
          .select('id, customer_name, email, phone, last_interaction_at, first_touchpoint, last_touchpoint, unified_context, lead_score, lead_stage')
          .not('last_interaction_at', 'is', null)
          .order('last_interaction_at', { ascending: false })
          .limit(50)

        if (!leadsError && activeLeads && activeLeads.length > 0) {
          console.log('Found active leads as fallback:', activeLeads.length)
          // Create conversations from leads (even without messages)
          const fallbackConversations: Conversation[] = activeLeads.map((lead: any) => {
            const channels: string[] = []
            if (lead.first_touchpoint) channels.push(lead.first_touchpoint)
            if (lead.last_touchpoint && !channels.includes(lead.last_touchpoint)) {
              channels.push(lead.last_touchpoint)
            }
            const fbUc = lead.unified_context || {};
            const fbName =
              fbUc?.whatsapp?.profile?.full_name ||
              fbUc?.web?.profile?.full_name ||
              lead.customer_name ||
              lead.phone ||
              'Unknown';
            const fbBrand =
              fbUc?.web?.what_is_your_brand_name ||
              fbUc?.whatsapp?.what_is_your_brand_name ||
              fbUc?.bcon?.brand_name ||
              fbUc?.whatsapp?.profile?.company ||
              fbUc?.web?.profile?.company ||
              null;

            return {
              lead_id: lead.id,
              lead_name: fbName,
              lead_email: lead.email || '',
              lead_phone: lead.phone || '',
              channels: channels.length > 0 ? channels : ['web'],
              last_message: 'No messages yet',
              last_message_at: lead.last_interaction_at ? new Date(lead.last_interaction_at).toISOString() : new Date().toISOString(),
              unread_count: 0,
              booking_status: null,
              brand_name: fbBrand,
              lead_score: lead.lead_score ?? null,
              lead_stage: lead.lead_stage ?? null,
              city: fbUc?.whatsapp?.profile?.city || fbUc?.web?.profile?.city || null,
              booking_date: fbUc?.web?.booking_date || fbUc?.whatsapp?.booking_date || null,
              booking_time: fbUc?.web?.booking_time || fbUc?.whatsapp?.booking_time || null,
              next_touchpoint: fbUc?.next_touchpoint || fbUc?.sequence?.next_step || null,
              form_data: fbUc?.form_data || null,
              first_touchpoint: lead.first_touchpoint || null,
              unified_context: fbUc || null,
              last_interaction_at: lead.last_interaction_at || null,
              timestamp: lead.last_interaction_at || null,
            }
          })

          setConversations(fallbackConversations)
          setLoading(false)
          return
        }

        setConversations([])
        setLoading(false)
        return
      }

      const messages = (messagesData ?? []) as Array<{
        lead_id: string | null
        channel?: string | null
        content?: string | null
        created_at?: string | null
        sender?: string | null
        metadata?: any
      }>
      console.log('Sample message:', messages[0])

      // Group by lead_id. For anonymous rows (lead_id=null), use a synthetic
      // key based on session_id from metadata so each unique web session
      // shows as its own conversation row.
      const conversationMap = new Map<string, any>()
      // Track which keys are anonymous so the render path knows to skip the
      // lead lookup and render a placeholder name.
      const anonymousKeys = new Set<string>()

      for (const msg of messages) {
        // Determine the grouping key
        let key: string
        let isAnonymous = false
        if (msg.lead_id) {
          key = String(msg.lead_id)
        } else {
          const sessionId = msg.metadata?.session_id
          if (!sessionId) continue // Can't group an anonymous row without a session
          key = `session:${sessionId}`
          isAnonymous = true
          anonymousKeys.add(key)
        }

        if (!conversationMap.has(key)) {
          conversationMap.set(key, {
            lead_id: key,
            is_anonymous: isAnonymous,
            session_id: isAnonymous ? msg.metadata?.session_id : null,
            channels: new Set([msg.channel]),
            last_message: msg.content || '(No content)',
            last_message_at: msg.created_at,
            message_count: 1,
          })
        } else {
          const conv = conversationMap.get(key)
          conv.channels.add(msg.channel)
          const msgCreatedAt = msg.created_at ? new Date(msg.created_at) : null
          const convLastAt = conv.last_message_at ? new Date(conv.last_message_at) : null
          if (!convLastAt || (msgCreatedAt && msgCreatedAt > convLastAt)) {
            conv.last_message = msg.content || '(No content)'
            conv.last_message_at = msg.created_at || conv.last_message_at
          }
          conv.message_count++
        }
      }

      console.log('Unique conversations:', conversationMap.size)

      // Get lead details for all conversations — but exclude the synthetic
      // 'session:*' keys (those have no row in all_leads, they're anonymous
      // web visitors). Only query Supabase for real lead UUIDs.
      const leadIds = Array.from(conversationMap.keys()).filter((k) => !k.startsWith('session:'))

      if (conversationMap.size === 0) {
        setConversations([])
        setLoading(false)
        return
      }

      console.log('Looking up lead IDs:', leadIds.length, 'leads (plus', anonymousKeys.size, 'anonymous sessions)')

      // Only query Supabase when there are real lead IDs — empty .in() blows
      // up some Postgres queries. Anonymous sessions skip the lookup entirely.
      const { data: leadsData, error: leadsError } = leadIds.length > 0
        ? await supabase
            .from('all_leads')
            .select('id, customer_name, email, phone, unified_context, lead_stage, lead_score, first_touchpoint')
            .in('id', leadIds)
        : { data: [], error: null }

      if (leadsError) {
        console.error('Error fetching leads:', leadsError)
      }

      // Anonymous web sessions: the visitor has no all_leads row, but the agent
      // may have captured their NAME in chat (stored on web_sessions.customer_name).
      // Pull those so the inbox shows "Vivan" instead of "Anonymous Web Visitor".
      const anonSessionIds = Array.from(conversationMap.values())
        .filter((c: any) => c.is_anonymous && c.session_id)
        .map((c: any) => String(c.session_id))
      const anonNameBySession: Record<string, string> = {}
      if (anonSessionIds.length > 0) {
        const { data: sessRows } = await supabase
          .from('web_sessions')
          .select('external_session_id, customer_name')
          .in('external_session_id', anonSessionIds)
        for (const s of (sessRows || []) as Array<{ external_session_id: string; customer_name: string | null }>) {
          if (s.customer_name) anonNameBySession[s.external_session_id] = s.customer_name
        }
      }

      console.log('Leads data returned:', leadsData?.length || 0, 'leads')

      // Diagnostic: Check if messages exist for these specific leads
      if (leadIds.length > 0) {
        const { data: diagnosticMessages, error: diagError } = await supabase
          .from('conversations')
          .select('lead_id, id')
          .in('lead_id', leadIds.slice(0, 5)) // Check first 5 leads
          .limit(10)

        if (diagError) {
          console.error('❌ Diagnostic: Cannot query messages for leads:', diagError.message)
        } else {
          console.log('🔍 Diagnostic: Messages for sample leads:', diagnosticMessages?.length || 0)
          const diagMessages = (diagnosticMessages ?? []) as Array<{ lead_id?: string | null; id?: string | null }>
          if (diagMessages.length > 0) {
            console.log('   Sample message lead_ids:', diagMessages.map(m => m.lead_id))
          }
        }
      }

      // Build final conversations array
      const conversationsArray: Conversation[] = []

      const typedLeads = (leadsData ?? []) as Array<{
        id: string | number
        customer_name?: string | null
        email?: string | null
        phone?: string | null
        unified_context?: any
        lead_stage?: string | null
        lead_score?: number | null
      }>

      for (const [leadId, convData] of conversationMap) {
        // Anonymous web session: no all_leads row to match, render a
        // placeholder conversation so the operator can see it in the inbox.
        const isAnonymous = !!convData.is_anonymous
        const lead = isAnonymous
          ? undefined
          : typedLeads.find((l) => String(l.id) === String(leadId))

        // Clean the last message content
        const cleanedLastMessage = cleanMessageContent(convData.last_message || '');

        // Skip conversations with no actual message content (only metadata or empty)
        if (!cleanedLastMessage || cleanedLastMessage.length === 0) {
          console.log('Skipping conversation with no content:', leadId);
          continue;
        }

        // Extract booking status from unified_context (booking_date/time live there, not on all_leads)
        const ctx = lead?.unified_context || {};
        const bookingDateFromCtx = ctx?.web?.booking_date || ctx?.whatsapp?.booking_date || null;
        const bookingTimeFromCtx = ctx?.web?.booking_time || ctx?.whatsapp?.booking_time || null;
        const bookingStatus = (bookingDateFromCtx ? 'Call Booked' : null)
          || (lead?.lead_stage === 'Booking Made' ? 'Call Booked' : null)
          || ctx?.whatsapp?.booking_status
          || ctx?.web?.booking_status
          || null;

        // Extract brand name from unified_context or form data
        const uc = lead?.unified_context || {};
        const brandName =
          uc?.web?.what_is_your_brand_name ||
          uc?.whatsapp?.what_is_your_brand_name ||
          uc?.bcon?.brand_name ||
          uc?.web?.brand_name ||
          uc?.whatsapp?.brand_name ||
          uc?.whatsapp?.profile?.company ||
          uc?.web?.profile?.company ||
          null;

        // Extract city from unified_context profile
        const cityValue =
          uc?.whatsapp?.profile?.city ||
          uc?.web?.profile?.city ||
          uc?.bcon?.city ||
          null;

        // Extract next touchpoint / next action
        const nextTouchpoint =
          uc?.next_touchpoint ||
          uc?.sequence?.next_step ||
          null;

        // Prefer profile full_name (set by save_lead_profile tool) over customer_name
        // customer_name sometimes has the brand name instead of the person's name
        // Anonymous sessions show "Web visitor · <short session id>" so operators
        // can still distinguish multiple concurrent anonymous chats.
        const resolvedName = isAnonymous
          ? (anonNameBySession[String(convData.session_id || '')]
             || `Web visitor · ${String(convData.session_id || '').slice(0, 8)}`)
          : (uc?.whatsapp?.profile?.full_name ||
             uc?.web?.profile?.full_name ||
             lead?.customer_name ||
             lead?.phone ||
             'Unknown');

        const conversation: Conversation = {
          lead_id: leadId,
          lead_name: resolvedName,
          lead_email: lead?.email || '',
          lead_phone: lead?.phone || '',
          channels: Array.from(convData.channels),
          last_message: cleanedLastMessage,
          last_message_at: convData.last_message_at,
          unread_count: 0,
          booking_status: bookingStatus,
          brand_name: brandName,
          lead_score: lead?.lead_score ?? null,
          lead_stage: lead?.lead_stage ?? null,
          city: cityValue,
          booking_date: bookingDateFromCtx,
          booking_time: bookingTimeFromCtx,
          next_touchpoint: nextTouchpoint,
          form_data: uc?.form_data || null,
          first_touchpoint: (lead as any)?.first_touchpoint || null,
          unified_context: uc || null,
          last_interaction_at: (lead as any)?.last_interaction_at || null,
          timestamp: (lead as any)?.last_interaction_at || null,
        }

        console.log('Adding conversation:', {
          lead_id: conversation.lead_id,
          lead_name: conversation.lead_name,
          channels: conversation.channels,
          last_message: conversation.last_message?.substring(0, 50)
        })

        conversationsArray.push(conversation)
      }

      // Sort by most recent message first
      conversationsArray.sort((a, b) =>
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      )

      console.log('Final conversations array:', conversationsArray.length)
      console.log('Sample conversation:', conversationsArray[0])
      console.log('Setting conversations state...')
      setConversations(conversationsArray)
      console.log('Conversations state set. Array length:', conversationsArray.length)

    } catch (err) {
      console.error('Error in fetchConversations:', err)
      setConversations([])
      setLoading(false)
    } finally {
      // Always set loading to false, even if there was an error
      setLoading(false)
    }
  }

  async function fetchMessages(leadId: string) {
    setMessagesLoading(true)
    setMessageChannelFilter('all')
    try {
      console.log('Fetching all messages for lead:', leadId)

      // Anonymous web visitor path: the conversation list groups these by
      // `session:<sid>` synthetic keys because they have no all_leads row.
      // Skip the lead_id query (it'd be a Postgres UUID parse error on the
      // 'session:' prefix anyway) and fetch by session_id directly.
      if (leadId.startsWith('session:')) {
        const sid = leadId.slice('session:'.length)
        const { data: anonMsgs, error: anonErr } = await supabase
          .from('conversations')
          .select('*')
          .is('lead_id', null)
          .filter('metadata->>session_id', 'eq', sid)
          .order('created_at', { ascending: true })

        if (anonErr) {
          console.error('[fetchMessages] anonymous session fetch failed:', anonErr)
          setMessages([])
          return
        }

        const messagesData = (anonMsgs || []).map((msg: any): Message => ({
          id: String(msg?.id ?? ''),
          lead_id: String(msg?.lead_id ?? ''),
          channel: String(msg?.channel ?? ''),
          sender: (msg?.sender ?? 'system') as Message['sender'],
          content: String(msg?.content ?? ''),
          message_type: String(msg?.message_type ?? ''),
          metadata: msg?.metadata ?? null,
          created_at: String(msg?.created_at ?? ''),
          delivered_at: msg?.delivered_at ?? null,
          read_at: msg?.read_at ?? null,
        }))
        console.log(`[fetchMessages] anonymous session ${sid}: ${messagesData.length} messages`)
        if (!selectedChannel && messagesData[0]?.channel) {
          setSelectedChannel(messagesData[0].channel)
        }
        setMessages(messagesData)
        return
      }

      // 1. Fetch messages directly linked to this lead
      const { data: leadMessages, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching messages:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        throw error
      }

      let allRaw: any[] = leadMessages ?? []

      // 2. Also fetch anonymous messages that were logged before a lead was created.
      //    These rows have lead_id = null but carry session_id in their metadata.
      //    Look up every web_session linked to this lead and pull those rows too.
      try {
        const { data: sessions } = await supabase
          .from('web_sessions')
          .select('external_session_id')
          .eq('lead_id', leadId)

        const sessionIds = (sessions ?? [])
          .map((s: any) => s.external_session_id)
          .filter(Boolean)

        if (sessionIds.length > 0) {
          for (const sid of sessionIds) {
            const { data: anonMsgs } = await supabase
              .from('conversations')
              .select('*')
              .is('lead_id', null)
              .filter('metadata->>session_id', 'eq', sid)
              .order('created_at', { ascending: true })

            if (anonMsgs && anonMsgs.length > 0) {
              console.log(`[fetchMessages] Found ${anonMsgs.length} anonymous messages for session ${sid}`)
              allRaw = [...allRaw, ...anonMsgs]
            }
          }

          // Deduplicate by id and sort chronologically
          const seen = new Set<string>()
          allRaw = allRaw
            .filter((msg: any) => {
              const key = String(msg.id)
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            .sort((a: any, b: any) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
        }
      } catch (anonErr) {
        console.warn('[fetchMessages] Could not fetch anonymous messages:', anonErr)
        // Non-fatal — we still show the lead messages fetched above
      }

      const messagesData = allRaw.map((msg: any): Message => ({
        id: String(msg?.id ?? ''),
        lead_id: String(msg?.lead_id ?? ''),
        channel: String(msg?.channel ?? ''),
        sender: (msg?.sender ?? 'system') as Message['sender'],
        content: String(msg?.content ?? ''),
        message_type: String(msg?.message_type ?? ''),
        metadata: msg?.metadata ?? null,
        created_at: String(msg?.created_at ?? ''),
        delivered_at: msg?.delivered_at ?? null,
        read_at: msg?.read_at ?? null,
      }))
      console.log('Fetched messages:', messagesData.length, 'messages')
      if (messagesData.length > 0) {
        console.log('Sample message:', messagesData[0])
        // If we got messages but no channel was selected, set the channel from the first message
        if (!selectedChannel && messagesData[0].channel) {
          console.log('Setting channel from first message:', messagesData[0].channel)
          setSelectedChannel(messagesData[0].channel)
        }
      } else {
        console.log('No messages found for lead:', leadId)
      }

      setMessages(messagesData)
    } catch (err) {
      console.error('Error in fetchMessages:', err)
      setMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }

  async function openLeadModal(leadId: string) {
    try {
      // Fetch from all_leads
      const { data: lead, error } = await supabase
        .from('all_leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (error) {
        console.error('Error fetching lead:', error);
        return;
      }

      const typedLead = (lead ?? {}) as {
        id?: string
        customer_name?: string | null
        email?: string | null
        phone?: string | null
        first_touchpoint?: string | null
        last_touchpoint?: string | null
        created_at?: string | null
        timestamp?: string | null
        status?: string | null
        metadata?: any
        unified_context?: {
          web?: { booking_date?: any; booking_time?: any }
          whatsapp?: { booking_date?: any; booking_time?: any }
        }
      }

      // Fetch booking data from web_sessions (most recent booking)
      const { data: webSession } = await supabase
        .from('web_sessions')
        .select('booking_date, booking_time, booking_status')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const typedWebSession = (webSession ?? {}) as {
        booking_date?: string | null
        booking_time?: string | number | null
        booking_status?: string | null
      }

      // Also check unified_context for booking data
      const bookingFromContext = typedLead.unified_context?.web?.booking_date || typedLead.unified_context?.whatsapp?.booking_date;
      const bookingTimeFromContext = typedLead.unified_context?.web?.booking_time || typedLead.unified_context?.whatsapp?.booking_time;

      // Convert booking_time to string if it's a Time object
      let bookingTime = null;
      if (typedWebSession.booking_time) {
        bookingTime = typeof typedWebSession.booking_time === 'string'
          ? typedWebSession.booking_time
          : String(typedWebSession.booking_time);
      } else if (bookingTimeFromContext) {
        bookingTime = typeof bookingTimeFromContext === 'string'
          ? bookingTimeFromContext
          : String(bookingTimeFromContext);
      }

      // Transform to match the Lead interface expected by LeadDetailsModal
      const leadData = {
        id: typedLead.id,
        name: typedLead.customer_name || typedLead.phone || 'Unknown',
        email: typedLead.email || '',
        phone: typedLead.phone || '',
        source: typedLead.first_touchpoint || typedLead.last_touchpoint || 'web',
        first_touchpoint: typedLead.first_touchpoint || null,
        last_touchpoint: typedLead.last_touchpoint || null,
        timestamp: typedLead.created_at || typedLead.timestamp,
        status: typedLead.status || typedWebSession.booking_status || 'New Lead',
        booking_date: typedWebSession.booking_date || bookingFromContext || null,
        booking_time: bookingTime,
        unified_context: typedLead.unified_context || null,
        metadata: typedLead.metadata || {}
      };

      console.log('Lead modal data:', {
        booking_date: leadData.booking_date,
        booking_time: leadData.booking_time,
        webSession: typedWebSession,
        unified_context: typedLead.unified_context
      });

      setSelectedLead(leadData);
      setIsLeadModalOpen(true);
    } catch (err) {
      console.error('Error opening lead modal:', err);
    }
  }

  async function updateLeadStatus(leadId: string, newStatus: string) {
    try {
      const response = await fetch(`/api/dashboard/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update lead status');
      }

      // Update the selected lead's status if it's the same lead
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead({ ...selectedLead, status: newStatus });
      }

      // Refresh conversations to reflect status change
      fetchConversations();
    } catch (err) {
      console.error('Error updating lead status:', err);
      throw err;
    }
  }

  async function summarizeConversation() {
    if (!selectedLeadId || messages.length === 0) return;

    setSummaryLoading(true);
    setShowSummary(true);

    // Get the selected conversation for this function
    const currentConversation = conversations.find(c => c.lead_id === selectedLeadId);

    try {
      // Build conversation text from messages
      const conversationText = messages
        .map(msg => `${msg.sender === 'customer' ? currentConversation?.lead_name || 'Customer' : 'PROXe'}: ${msg.content}`)
        .join('\n');

      // Call Claude API to summarize (you can create a new API route or use existing)
      const response = await fetch('/api/dashboard/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: conversationText,
          leadName: currentConversation?.lead_name || 'Customer'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setConversationSummary(data.summary);
      } else {
        // Fallback: Generate a basic summary from messages
        const customerMessages = messages.filter(m => m.sender === 'customer').map(m => m.content);
        const topics = customerMessages.slice(0, 3).join(', ');
        setConversationSummary(`Customer discussed: ${topics.substring(0, 200)}...`);
      }
    } catch (err) {
      console.error('Error summarizing:', err);
      setConversationSummary('Unable to generate summary');
    }

    setSummaryLoading(false);
  }

  // Generate AI response for the current conversation
  async function generateAIResponse() {
    if (!selectedLeadId || !selectedChannel || messages.length === 0) return;

    setIsGenerating(true);
    try {
      const conversationHistory = messages.map(msg => ({
        sender: msg.sender,
        content: msg.content,
      }));

      const response = await fetch('/api/dashboard/inbox/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLeadId,
          channel: selectedChannel,
          action: 'generate',
          conversationHistory,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.generatedMessage) {
          setReplyText(data.generatedMessage);
        }
      } else {
        const err = await response.json();
        console.error('Failed to generate AI response:', err);
        alert(err.error || 'Failed to generate AI response');
      }
    } catch (err) {
      console.error('Error generating AI response:', err);
      alert('Failed to generate AI response');
    } finally {
      setIsGenerating(false);
    }
  }

  // Send reply to customer
  async function sendReply() {
    if (!selectedLeadId || !selectedChannel || !replyText.trim() || isSending) return;

    setIsSending(true);
    try {
      const response = await fetch('/api/dashboard/inbox/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLeadId,
          channel: selectedChannel,
          action: 'send',
          message: replyText.trim(),
        }),
      });

      if (response.ok) {
        setReplyText('');
        // Refresh messages to show the sent message
        fetchMessages(selectedLeadId);
        fetchConversations();
      } else {
        const err = await response.json();
        console.error('Failed to send reply:', err);
        alert(err.error || 'Failed to send message');
      }
    } catch (err) {
      console.error('Error sending reply:', err);
      alert('Failed to send message');
    } finally {
      setIsSending(false);
    }
  }

  // Time ago helper
  function timeAgo(timestamp: string) {
    const now = new Date()
    const then = new Date(timestamp)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  // Format timestamp for messages
  function formatTime(timestamp: string) {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  function formatDateSeparator(timestamp: string) {
    const date = new Date(timestamp)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 86400000)
    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    if (msgDate.getTime() === today.getTime()) return 'Today'
    if (msgDate.getTime() === yesterday.getTime()) return 'Yesterday'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function getDateKey(timestamp: string) {
    const d = new Date(timestamp)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }

  // Filter conversations by search
  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      conv.lead_name?.toLowerCase().includes(query) ||
      conv.lead_phone?.includes(query) ||
      conv.last_message?.toLowerCase().includes(query)
    )
  })

  const selectedConversation = conversations.find((c) => c.lead_id === selectedLeadId)

  // Filter messages by channel tab selection (client-side)
  const filteredMessages = messageChannelFilter === 'all'
    ? messages
    : messages.filter(m => m.channel === messageChannelFilter)

  // Render the inbox UI
  return (
    <div className="flex-1 flex overflow-hidden min-h-0" style={{ background: 'var(--bg-primary)', position: 'absolute', inset: 0 }}>
      <style>{`
        .template-status-tag { position: relative; }
        .template-status-tag::after {
          content: attr(data-tooltip);
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 0;
          text-transform: none;
          white-space: nowrap;
          background: #1a1a1a;
          color: #e0e0e0;
          border: 1px solid rgba(255,255,255,0.12);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s;
          z-index: 10;
        }
        .template-status-tag:hover::after { opacity: 1; }
        /* WhatsApp-style bubble tails — a small triangle at the top corner of
           the first bubble in a run. Incoming tail on the left, outgoing on
           the right, tinted to match the bubble background. */
        .wa-bubble { position: relative; }
        .wa-in::before, .wa-out::before {
          content: '';
          position: absolute;
          top: 0;
          width: 10px;
          height: 12px;
        }
        .wa-in::before {
          left: -7px;
          background: var(--wa-in-bg, var(--bg-secondary));
          clip-path: polygon(100% 0, 100% 100%, 0 0);
        }
        .wa-out::before {
          right: -7px;
          background: var(--wa-out-bg, rgba(37,211,102,0.14));
          clip-path: polygon(0 0, 0 100%, 100% 0);
        }
      `}</style>
      {/* Loading Overlay */}
      <LoadingOverlay
        isLoading={loading || messagesLoading}
        message={loading ? "Loading conversations..." : "Loading messages..."}
      />

      {/* Left Panel - Conversations List
          Widened 320 → 352 (~10%) for breathing room per user feedback.
          Mobile: full-screen list; hidden once a thread is open (stack). */}
      <div
        className={`${selectedLeadId ? 'hidden md:flex' : 'flex'} w-full md:w-[352px] md:min-w-[300px] flex-col border-r flex-shrink-0 overflow-hidden`}
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-primary)',
        }}
      >
        {/* Search + Filters - flush at top */}
        <div className="px-3 pt-2 pb-2 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-transparent transition-all focus-within:border-[var(--accent-primary)]/50 focus-within:ring-2 focus-within:ring-[var(--accent-primary)]/20 mb-2"
            style={{ background: 'var(--bg-tertiary)' }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>
              <MdSearch size={16} />
            </span>
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none focus:outline-none flex-1 text-xs"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
          <div className="flex gap-1">
            {['all', 'web', 'whatsapp', 'social'].map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                style={{
                  background: channelFilter === ch ? 'var(--button-bg, #fff)' : 'transparent',
                  color: channelFilter === ch ? 'var(--text-button, #000)' : 'var(--text-muted)',
                }}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-3 text-center space-y-1">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No conversations found</p>
              <button
                onClick={() => fetchConversations()}
                className="mt-1 px-3 py-1 text-[10px] rounded"
                style={{ background: 'var(--button-bg, #fff)', color: 'var(--text-button, #000)' }}
              >
                Refresh
              </button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-3 text-center">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No conversations match your search</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedLeadId === conv.lead_id;
              const initials = (conv.lead_name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

              // Prefer the live-calculated score over the DB value (which is
              // frequently null/0). Fall back to whichever is non-null.
              const calcScore = calculatedConvScores[conv.lead_id]
              const displayScore: number | null = calcScore != null
                ? Math.max(calcScore, conv.lead_score ?? 0)
                : conv.lead_score
              // Temperature helpers — use the shared scoreVisual so the
              // conversation list, the right panel, and the lead modal all
              // agree on what "Warm" looks like.
              const scoreColor = displayScore != null ? scoreVisual(displayScore).color : null;
              const aud = audienceOf(conv.unified_context);

              if (isSelected) {
                // ── SELECTED CARD (minimal) ──
                return (
                  <div
                    key={conv.lead_id}
                    onClick={() => {
                      setSelectedLeadId(conv.lead_id);
                      if (conv.channels && conv.channels.length > 0) {
                        setSelectedChannel(conv.channels[0]);
                      } else {
                        setSelectedChannel('');
                      }
                    }}
                    className="cursor-pointer border-b relative"
                    style={{
                      borderColor: 'var(--border-primary)',
                      background: 'var(--accent-subtle)',
                    }}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r" style={{ background: 'var(--accent-primary)' }} />

                    <div className="px-4 py-3 pl-5">
                      {/* Line 1: just the avatar — no score in the chat list (the
                          right panel already carries the score). */}
                      <div className="flex items-center gap-2.5">
                        <WaAvatar name={conv.lead_name} phone={conv.lead_phone} channel={conv.channels[0]} size={46} />
                        <span className="text-sm font-semibold truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                          {conv.lead_name || conv.lead_phone || 'Unknown'}
                        </span>
                        {aud && (
                          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: `${aud.color}22`, color: aud.color, border: `1px solid ${aud.color}55` }}>
                            {aud.label}
                          </span>
                        )}
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {timeAgo(conv.last_message_at)}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); openLeadModal(conv.lead_id); }}
                          className="p-1 rounded transition-colors flex-shrink-0 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                          style={{ color: 'var(--text-secondary)' }}
                          title="Open lead details"
                        >
                          <MdOpenInNew size={13} />
                        </button>
                      </div>

                      {/* Line 2: Brand · Location */}
                      {(conv.brand_name || conv.city) && (
                        <div className="text-xs truncate mt-1" style={{ color: 'var(--text-muted)', paddingLeft: '38px' }}>
                          {[conv.brand_name, conv.city].filter(Boolean).join(' · ')}
                        </div>
                      )}

                      {/* Line 3: Event pill (highlighted for upcoming, muted for past) */}
                      {conv.booking_date && (() => {
                        const isPast = conv.booking_date < new Date().toISOString().split('T')[0]
                        return (
                        <div className="mt-1.5" style={{ paddingLeft: '38px' }}>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full"
                            style={isPast
                              ? { background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-primary)', opacity: 0.6 }
                              : { background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                            <MdEvent size={11} />
                            {new Date(conv.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {conv.booking_time && (() => {
                              const tp = conv.booking_time.toString().split(':');
                              if (tp.length < 2) return `, ${conv.booking_time}`;
                              const h = parseInt(tp[0], 10), m = parseInt(tp[1], 10);
                              if (isNaN(h) || isNaN(m)) return `, ${conv.booking_time}`;
                              return `, ${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
                            })()}
                          </span>
                        </div>
                        )
                      })()}
                    </div>
                  </div>
                );
              }

              // ── UNSELECTED (compact, scannable) ──
              return (
                <div
                  key={conv.lead_id}
                  onClick={() => {
                    setSelectedLeadId(conv.lead_id);
                    if (conv.channels && conv.channels.length > 0) {
                      setSelectedChannel(conv.channels[0]);
                    } else {
                      setSelectedChannel('');
                    }
                  }}
                  className="cursor-pointer transition-colors duration-150 border-b relative hover:bg-[var(--bg-hover)]"
                  style={{
                    borderColor: 'var(--border-primary)',
                  }}
                >
                  <div className="px-3 py-2.5 flex items-center gap-3">
                    <WaAvatar name={conv.lead_name} phone={conv.lead_phone} channel={conv.channels[0]} size={46} />
                    <div className="flex-1 min-w-0">
                    {/* Line 1: Name + Timestamp (WhatsApp-style row) */}
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                        {conv.lead_name || conv.lead_phone || 'Unknown'}
                      </span>
                      {aud && (
                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: `${aud.color}22`, color: aud.color }}>
                          {aud.label}
                        </span>
                      )}
                      <span className="text-[10.5px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {timeAgo(conv.last_message_at)}
                      </span>
                    </div>
                    {/* Line 2: Last message preview + EVENT badge */}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-[12px] truncate flex-1" style={{ color: 'var(--text-muted)' }}>
                        {conv.last_message || '\u00A0'}
                      </p>
                      {conv.booking_status && (
                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                          style={{
                            background: 'rgba(34,197,94,0.15)',
                            color: '#16a34a',
                          }}>
                          EVENT
                        </span>
                      )}
                    </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Right Panel - Messages. Mobile: takes over full-screen when a thread
          is open (WhatsApp stack); hidden while browsing the list. */}
      <div className={`${selectedLeadId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 overflow-hidden`} style={{ background: 'var(--bg-primary)' }}>
        {!selectedLeadId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MdInbox size={48} style={{ color: 'var(--text-secondary)', margin: '0 auto 8px' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Select a conversation</p>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile thread header — back to list, lead name, details toggle.
                Desktop keeps its chrome-less thread (md:hidden). */}
            <div
              className="md:hidden flex items-center gap-2 px-2 border-b flex-shrink-0"
              style={{ height: '52px', background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
            >
              <button
                onClick={() => {
                  setSelectedLeadId(null)
                  setSelectedChannel('')
                  setMessageChannelFilter('all')
                  setShowDetailsMobile(false)
                  // Drop a stale ?lead= deep link so refresh lands on the list
                  if (searchParams.get('lead')) router.replace('/dashboard/inbox')
                }}
                className="touch-44 flex items-center justify-center rounded-md"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Back to conversations"
              >
                <MdArrowBack size={22} />
              </button>
              <span className="flex-1 min-w-0 truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {selectedConversation?.lead_name || selectedConversation?.lead_phone || 'Conversation'}
              </span>
              <button
                onClick={() => setShowDetailsMobile(true)}
                className="touch-44 flex items-center justify-center rounded-md"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Lead details"
              >
                <MdInfoOutline size={20} />
              </button>
            </div>

            {/* AI Summary Panel - compact */}
            {showSummary && (
              <div
                className="mx-3 mt-2 mb-1 p-3 rounded-lg border"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderColor: 'var(--accent-primary)',
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <MdAutoAwesome size={12} style={{ color: 'var(--accent-primary)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>AI Summary</span>
                  </div>
                  <button onClick={() => setShowSummary(false)} className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>✕</button>
                </div>
                {summaryLoading ? (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Generating...</p>
                ) : (
                  <div
                    className="text-xs whitespace-pre-wrap leading-relaxed"
                    style={{ color: 'var(--text-secondary)' }}
                    dangerouslySetInnerHTML={{
                      __html: conversationSummary
                        ?.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-primary); font-weight: 600;">$1</strong>')
                        .replace(/\n/g, '<br />') || ''
                    }}
                  />
                )}
              </div>
            )}

            {/* Channel filter tabs */}
            {selectedConversation && selectedConversation.channels.length > 0 && (
              <div className="px-4 pt-2 pb-1 border-b flex items-center gap-1" style={{ borderColor: 'var(--border-primary)' }}>
                {['all', ...selectedConversation.channels].map((ch) => {
                  const isActive = messageChannelFilter === ch
                  const label = ch === 'all' ? 'All' : ch === 'whatsapp' ? 'WhatsApp' : ch === 'web' ? 'Web' : ch === 'voice' ? 'Voice' : ch === 'social' ? 'Social' : ch
                  const count = ch === 'all' ? messages.length : messages.filter(m => m.channel === ch).length
                  return (
                    <button
                      key={ch}
                      onClick={() => setMessageChannelFilter(ch)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all"
                      style={{
                        background: isActive ? 'var(--accent-subtle)' : 'transparent',
                        color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                        borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                      }}
                    >
                      {ch !== 'all' && <ChannelIcon channel={ch} size={12} active={isActive} />}
                      {label}
                      <span className="text-[9px] opacity-60">({count})</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto px-6 py-3 relative"
              style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, var(--bg-tertiary) 1px, transparent 0)',
                backgroundSize: '24px 24px'
              }}
            >
            {/* Messages were capped at 700px — too narrow for the chat panel,
                producing dead space on both sides. Cap raised to 1100px and
                outer padding bumped to px-6 so messages breathe but don't
                stretch into long unreadable lines. */}
            <div className="max-w-[1100px] mx-auto space-y-3">
              {messagesLoading ? (
                <div className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>Loading messages...</div>
              ) : filteredMessages.length === 0 ? (
                <div className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {messageChannelFilter !== 'all' ? `No ${messageChannelFilter} messages` : 'No messages yet'}
                </div>
              ) : (
                <>
                {/* Show form data card at top if lead came via meta_forms and first message isn't already a parsed form */}
                {messageChannelFilter === 'all' && selectedConversation?.form_data && !parseFormFields(filteredMessages[0]?.content) && (() => {
                  const fd = selectedConversation.form_data!
                  const formFields: { label: string; value: string }[] = []
                  if (fd.brand_name) formFields.push({ label: 'Brand', value: fd.brand_name })
                  if (fd.has_website === true) formFields.push({ label: 'Website', value: 'Yes' })
                  else if (fd.has_website === false) formFields.push({ label: 'Website', value: 'No' })
                  if (fd.monthly_leads) formFields.push({ label: 'Volume', value: fd.monthly_leads })
                  if (fd.urgency) formFields.push({ label: 'Urgency', value: fd.urgency.replace(/_/g, ' ') })
                  if (fd.has_ai_systems === true) formFields.push({ label: 'AI Systems', value: 'Yes' })
                  else if (fd.has_ai_systems === false) formFields.push({ label: 'AI Systems', value: 'No' })
                  if (formFields.length === 0) return null
                  return (
                    <div className="flex justify-start mb-2">
                      <div className="max-w-[440px] rounded-lg px-3 py-2 border" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(24,119,242,0.3)' }}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                              {selectedConversation?.lead_name || 'Lead'}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(24,119,242,0.15)', color: '#1877F2' }}>
                              Meta Form Submission
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {formFields.map((f, i) => (
                            <div key={i} className="flex items-baseline gap-1">
                              <span className="text-[9px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>{f.label}:</span>
                              <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{f.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })()}
                {filteredMessages.map((msg, msgIdx) => {
                  // Date separator between messages from different days
                  const showDateSeparator = msgIdx === 0 ||
                    getDateKey(msg.created_at) !== getDateKey(filteredMessages[msgIdx - 1].created_at);

                  // Check if this is a form data message (first customer message with form fields)
                  const isCustomer = msg.sender === 'customer';
                  const formData = isCustomer ? parseFormFields(msg.content) : null;

                  const dateSeparator = showDateSeparator ? (
                    <div className="flex items-center gap-3 py-2" key={`date-${msg.id}`} style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-primary)' }}>
                      <div className="flex-1 h-px" style={{ background: 'var(--border-primary)' }} />
                      <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {formatDateSeparator(msg.created_at)}
                      </span>
                      <div className="flex-1 h-px" style={{ background: 'var(--border-primary)' }} />
                    </div>
                  ) : null;

                  if (formData && IS_BCON) {
                    // bcon Meta-form card — shows the form EXACTLY as submitted
                    // (real question text + answer, original order), merges in any
                    // raw_form_fields the message text dropped, collapsible past 6.
                    const withFields = formData.fields
                      .map(f => {
                        const kind = getFormFieldLabel(f.key);
                        let value = (f.value || '').trim();
                        if (kind === 'Name' && !value) value = (selectedConversation?.lead_name || '').trim();
                        if (kind === 'Phone' && value.replace(/\D/g, '').length < 7) value = (selectedConversation?.lead_phone || value).trim();
                        return { label: f.key, value };
                      })
                      .filter(f => f.value && f.value !== '+');

                    // The message text only carries the fields that got formatted
                    // into it — the FULL Meta submission (every question) is kept
                    // in unified_context.raw_form_fields. Merge in any of those not
                    // already shown so the card is the complete form, not half of it.
                    const rawFF = (selectedConversation?.unified_context?.raw_form_fields || {}) as Record<string, any>;
                    const shownValues = new Set(withFields.map(f => f.value.toLowerCase().trim()));
                    const shownKinds = new Set(withFields.map(f => getFormFieldLabel(f.label).toLowerCase()));
                    const humanizeKey = (k: string) =>
                      k.replace(/[_?]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\w/, c => c.toUpperCase());
                    const extraFields = Object.entries(rawFF)
                      .filter(([k, v]) => {
                        if (v == null) return false;
                        const val = String(v).trim();
                        if (!val || val === '+') return false;
                        if (shownValues.has(val.toLowerCase())) return false;      // same answer already shown
                        if (shownKinds.has(getFormFieldLabel(k).toLowerCase())) return false; // same field kind already shown
                        return true;
                      })
                      .map(([k, v]) => ({ label: humanizeKey(k), value: String(v).trim() }));

                    const allFields = [...withFields, ...extraFields];
                    const PRIMARY = 6;
                    const hasMore = allFields.length > PRIMARY;
                    const visibleFields = (hasMore && !formCardExpanded) ? allFields.slice(0, PRIMARY) : allFields;

                    const FieldRow = ({ f }: { f: { label: string; value: string } }) => (
                      <div className="flex flex-col gap-0.5 py-1 border-b last:border-b-0" style={{ borderColor: 'rgba(59,130,246,0.12)' }}>
                        <span className="text-[10px] leading-snug" style={{ color: 'var(--text-muted)' }}>{f.label}</span>
                        <span className="text-[12.5px] font-medium break-words" style={{ color: 'var(--text-primary)' }}>{f.value}</span>
                      </div>
                    );

                    return (
                      <React.Fragment key={msg.id}>
                      {dateSeparator}
                      <div className="flex justify-start">
                        <div
                          className="md:w-[500px] max-w-[88%] rounded-xl px-3.5 py-2.5 border"
                          style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.35)' }}
                        >
                          {/* Header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <ChannelIcon channel={msg.channel} size={10} active={true} />
                              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                                {selectedConversation?.lead_name || 'Customer'}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(59,130,246,0.18)', color: '#60a5fa' }}>
                                Meta Form
                              </span>
                            </div>
                            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{formatTime(msg.created_at)}</span>
                          </div>
                          {/* The complete form — every submitted field, collapsible */}
                          <div>
                            {visibleFields.map((f, i) => <FieldRow key={i} f={f} />)}
                          </div>
                          {hasMore && (
                            <button
                              type="button"
                              onClick={() => setFormCardExpanded(v => !v)}
                              className="mt-1.5 text-[10.5px] font-semibold"
                              style={{ color: '#60a5fa' }}
                            >
                              {formCardExpanded ? 'Show less' : `Show all ${allFields.length} fields`}
                            </button>
                          )}
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  }

                  if (formData) {
                    // Meta-form card — clean, ordered, blue-tinted (so it reads as
                    // "came from Meta" the way agent bubbles read green).
                    const withLabels = formData.fields.map(f => ({ value: f.value, label: getFormFieldLabel(f.key) }))
                    const ORDER = ['Name', 'Email', 'Phone', 'City', 'Timeline']
                    const seen = new Set<typeof withLabels[number]>()
                    const priorityOrdered = ORDER.flatMap(l => withLabels.filter(f => f.label === l && !seen.has(f) && (seen.add(f), true)))
                    const otherOrdered = withLabels.filter(f => !seen.has(f))
                    // Which form: parent forms ask about "your child"; otherwise student.
                    const formKind = formData.fields.some(f => f.key.toLowerCase().includes('child')) ? 'Parent' : 'Student'
                    const FieldRow = ({ f }: { f: { label: string; value: string } }) => (
                      <div className="flex items-baseline gap-2">
                        <span className="text-[9px] font-semibold uppercase tracking-wide w-[68px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{f.label}</span>
                        <span className="text-[12px] font-medium break-words" style={{ color: 'var(--text-primary)' }}>{f.value}</span>
                      </div>
                    )

                    return (
                      <React.Fragment key={msg.id}>
                      {dateSeparator}
                      <div className="flex justify-start">
                        <div
                          className="max-w-[440px] rounded-xl px-3.5 py-2.5 border"
                          style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.35)' }}
                        >
                          {/* Header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <ChannelIcon channel={msg.channel} size={10} active={true} />
                              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                                {selectedConversation?.lead_name || 'Customer'}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(59,130,246,0.18)', color: '#60a5fa' }}>
                                Meta Form
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(59,130,246,0.1)', color: '#93b4f5' }}>
                                {formKind}
                              </span>
                            </div>
                            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{formatTime(msg.created_at)}</span>
                          </div>
                          {/* Ordered fields — one per row */}
                          <div className="space-y-1">
                            {priorityOrdered.map((f, i) => <FieldRow key={i} f={f} />)}
                          </div>
                          {otherOrdered.length > 0 && (
                            <details className="mt-1.5">
                              <summary className="text-[10px] cursor-pointer" style={{ color: '#60a5fa' }}>+{otherOrdered.length} more fields</summary>
                              <div className="space-y-1 mt-1.5">
                                {otherOrdered.map((f, i) => <FieldRow key={i} f={f} />)}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  }

                  // Regular message bubble
                  const gapMs = msgIdx > 0 ? new Date(msg.created_at).getTime() - new Date(filteredMessages[msgIdx - 1].created_at).getTime() : 0;
                  const taskTag = !isCustomer ? getTaskTypeTag(msg.metadata?.task_type) : null;
                  // Template messages render in a compact "card" — narrower,
                  // smaller padding, distinct from the big chat bubbles. Matches
                  // the WhatsApp-style template feel (header strip + body + foot).
                  const isTemplate = !isCustomer && !!msg.metadata?.template_name
                  // A human on the dashboard sent this (inbox/reply sets human:true) —
                  // show a "Manual" badge so it's distinct from the bot's auto-replies.
                  const isManual = !isCustomer && msg.metadata?.human === true

                  return (
                    <React.Fragment key={msg.id}>
                    {dateSeparator}
                    <div
                      className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={isTemplate
                          ? 'max-w-[440px] rounded-xl shadow-sm border overflow-hidden'
                          : `max-w-[440px] rounded-2xl px-3 py-2 shadow-sm border wa-bubble ${isCustomer ? 'wa-in' : 'wa-out'}`}
                        style={{
                          // WhatsApp bubble tints — incoming (customer) neutral,
                          // outgoing (agent/template) WhatsApp-green. The tail
                          // pseudo-element reads --wa-in-bg / --wa-out-bg so its
                          // colour tracks the bubble. Reduced corner radius on
                          // the tail side gives the classic WA speech-bubble.
                          background: isCustomer
                            ? 'var(--bg-secondary)'
                            : isTemplate
                              ? 'rgba(37, 211, 102, 0.10)'
                              : 'rgba(37, 211, 102, 0.14)',
                          ['--wa-in-bg' as any]: 'var(--bg-secondary)',
                          ['--wa-out-bg' as any]: 'rgba(37, 211, 102, 0.14)',
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                          borderColor: isCustomer
                            ? 'var(--border-primary)'
                            : isTemplate
                              ? 'rgba(37, 211, 102, 0.45)'
                              : 'rgba(37, 211, 102, 0.30)',
                          borderWidth: '1px',
                          ...(isCustomer ? { borderTopLeftRadius: 4 } : { borderTopRightRadius: 4 }),
                          ...(!isTemplate && msg.metadata?.template_name
                            ? { borderLeft: `3px solid ${getDeliveryStatusStyle(msg.metadata?.delivery_status).color}` }
                            : !isTemplate && taskTag
                            ? { borderLeft: `3px solid ${taskTag.color}` }
                            : {}),
                        }}
                      >
                        {isTemplate && (
                          <>
                            {/* WA-green template header strip — uses the
                               WhatsApp dark-green header colour so the
                               bubble instantly reads as a Meta-approved
                               template (vs a free-form AI reply). */}
                            <div
                              className="flex items-center justify-between gap-2 px-2.5 py-1 border-b"
                              style={{
                                background: 'rgba(37, 211, 102, 0.18)',
                                borderColor: 'rgba(37, 211, 102, 0.35)',
                              }}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <ChannelIcon channel={msg.channel} size={10} active={true} />
                                <span className="text-[8px] font-bold uppercase tracking-wider shrink-0" style={{ color: '#22c55e' }}>
                                  Template · {msg.channel === 'whatsapp' ? 'WA' : msg.channel}
                                </span>
                                {msg.metadata?.template_name && (
                                  <span className="text-[8px] truncate" style={{ color: 'var(--text-muted)' }} title={msg.metadata.template_name}>
                                    · {msg.metadata.template_name}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Meta-approved template HEADER text (e.g. "PAT Result" / "Demo Session Booked") */}
                            {msg.metadata?.template_header && (
                              <div
                                className="px-2.5 pt-2 pb-1 text-[13px] font-bold"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {msg.metadata.template_header}
                              </div>
                            )}
                          </>
                        )}
                        {/* WhatsApp bubbles carry no per-message header — just the
                            text, with the time (and ticks) tucked bottom-right. */}
                        <div
                          className={isTemplate
                            ? 'text-[12px] leading-snug px-2.5 pt-1 pb-2 whitespace-pre-wrap'
                            : 'text-[13px] leading-relaxed'}
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {/* Pick the formatter by what the source platform actually
                             uses. WhatsApp (both templates AND free-form AI replies)
                             uses single-asterisk *bold*, _italic_, ~strike~. Web/dashboard
                             messages use Markdown's double-asterisk **bold**. Picking
                             solely on isTemplate left WA agent replies showing literal
                             asterisks ("All set, Punith. Your demo is locked in for
                             *Tuesday, May 26*."). */}
                          {(isTemplate || msg.channel === 'whatsapp')
                            ? renderWhatsAppMarkdown(msg.content)
                            : renderMarkdown(msg.content)}
                        </div>
                        {/* WhatsApp-style time, bottom-right of the bubble (ticks
                            for outbound WhatsApp render just below via their own
                            delivery block). Templates carry their own footer. */}
                        {!isTemplate && !msg.metadata?.template_name && (
                          <div className="flex justify-end items-center gap-1.5 mt-0.5 -mb-0.5">
                            {isManual && (
                              <span
                                className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(59,130,246,0.18)', color: '#93c5fd' }}
                                title="Sent manually by a team member"
                              >
                                Manual
                              </span>
                            )}
                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              {formatTime(msg.created_at)}
                            </span>
                          </div>
                        )}
                        {msg.metadata?.template_name && (() => {
                          const ds = msg.metadata?.delivery_status
                          const statusStyle = getDeliveryStatusStyle(ds)
                          const tooltip = getDeliveryTooltip(ds, msg.metadata?.delivery_error)
                          // Send-side failure (from inbound auto-templates):
                          //   metadata.send_succeeded === false + metadata.send_error
                          // Shows a red FAILED pill with the actual Meta error
                          // as a hover tooltip.
                          const sendFailed = msg.metadata?.send_succeeded === false
                          const sendError = typeof msg.metadata?.send_error === 'string'
                            ? msg.metadata.send_error
                            : (msg.metadata?.send_error ? JSON.stringify(msg.metadata.send_error) : null)
                          // Strip any verbose JSON envelope and pull out Meta's
                          // human-readable error message if present, else fall
                          // back to the raw string.
                          let prettyError: string | null = null
                          if (sendError) {
                            try {
                              const parsed = JSON.parse(sendError)
                              // Meta's `message` already begins with "(#code)",
                              // so use it as-is. Only synthesise the prefix when
                              // the message lacks one.
                              const msg = parsed?.error?.message
                              const code = parsed?.error?.code
                              if (typeof msg === 'string') {
                                prettyError = /^\(#\d+\)/.test(msg)
                                  ? msg
                                  : `(#${code || '?'}) ${msg}`
                              } else {
                                prettyError = sendError
                              }
                            } catch {
                              prettyError = sendError
                            }
                          }
                          const isTestSend = msg.metadata?.test_mode === true
                          const testRecipient = typeof msg.metadata?.test_recipient === 'string'
                            ? msg.metadata.test_recipient
                            : null
                          return (
                            <div
                              className={isTemplate
                                ? 'flex items-center justify-end gap-1.5 px-2.5 pb-1.5 -mt-1 flex-wrap'
                                : 'flex items-center gap-1.5 mt-1.5 pt-1 border-t flex-wrap'}
                              style={{ borderColor: 'var(--border-primary)' }}
                            >
                              {/* Footer pill carries delivery STATUS (Sent /
                                  Delivered / Read / Failed). Drop the
                                  redundant "Template" word — the template
                                  header strip already labels the bubble as
                                  a template, and the template_name shows
                                  right next to this pill. */}
                              {!isTemplate && (
                                <span
                                  className="template-status-tag text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded relative cursor-default"
                                  style={{ background: statusStyle.bg, color: statusStyle.color }}
                                  data-tooltip={tooltip}
                                >
                                  Template
                                </span>
                              )}
                              {!isTemplate && (
                                <span className="text-[9px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                                  {msg.metadata.template_name}
                                </span>
                              )}
                              {isTemplate && (
                                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                  {formatTime(msg.created_at)}
                                </span>
                              )}
                              {isTestSend && (
                                <span
                                  className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded cursor-help"
                                  style={{ background: 'rgba(245,158,11,0.20)', color: '#fbbf24' }}
                                  title={testRecipient ? `Test send — went to ${testRecipient}, NOT this lead` : 'Test send — did not go to this lead'}
                                >
                                  {testRecipient ? `TEST → ${testRecipient}` : 'TEST'}
                                </span>
                              )}
                              {sendFailed && prettyError && (
                                <span
                                  className="template-status-tag text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded relative cursor-help"
                                  style={{ background: 'rgba(239,68,68,0.18)', color: '#fca5a5' }}
                                  title={prettyError}
                                  data-tooltip={prettyError}
                                >
                                  Send failed — hover for reason
                                </span>
                              )}
                              {!sendFailed && (
                                <span className="template-status-tag flex items-center cursor-help" data-tooltip={tooltip}>
                                  <DeliveryStatusIcon deliveredAt={msg.delivered_at} readAt={msg.read_at} />
                                </span>
                              )}
                            </div>
                          )
                        })()}
                        {/* Meta-approved template FOOTER (e.g. "Team Windchasers") —
                            small grey line under the body, above the buttons, mirroring
                            how WhatsApp shows the real template. */}
                        {isTemplate && msg.metadata?.template_footer && (
                          <div className="px-2.5 pb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {msg.metadata.template_footer}
                          </div>
                        )}
                        {msg.metadata?.template_buttons && Array.isArray(msg.metadata.template_buttons) && msg.metadata.template_buttons.length > 0 && (
                          isTemplate ? (
                            // WhatsApp-style buttons — stacked, divided by hairlines.
                            // Theme-aware: uses var(--accent-primary) for label + var(--border-primary)
                            // for dividers so it renders correctly in light AND dark mode.
                            // A URL button (opens a link, no reply sent) gets an
                            // external-link icon instead of the quick-reply arrow —
                            // its destination is baked into the approved template on
                            // Meta's side, not something we send, so it's shown as a
                            // label only (no href) rather than guessing a link.
                            <div className="flex flex-col" style={{ borderTop: '1px solid var(--border-primary)' }}>
                              {msg.metadata.template_buttons.map((btn: string, btnIdx: number) => {
                                const isUrlButton = msg.metadata?.template_button_type === 'url'
                                return (
                                  <div
                                    key={btnIdx}
                                    className="flex items-center justify-center gap-1.5 text-[12px] font-medium py-2 px-2"
                                    style={{
                                      color: 'var(--accent-primary)',
                                      borderTop: btnIdx > 0 ? '1px solid var(--border-primary)' : undefined,
                                      background: 'var(--bg-primary)',
                                    }}
                                    title={isUrlButton ? `Opens a link: ${btn}` : `Quick Reply: ${btn}`}
                                  >
                                    {isUrlButton ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                      </svg>
                                    ) : (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                                        <polyline points="9 17 4 12 9 7" />
                                        <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                                      </svg>
                                    )}
                                    {btn}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {msg.metadata.template_buttons.map((btn: string, btnIdx: number) => (
                                <span
                                  key={btnIdx}
                                  className="inline-block text-[10px] font-medium px-2.5 py-1 rounded-full border"
                                  style={{
                                    borderColor: 'var(--border-primary)',
                                    color: 'var(--accent-primary)',
                                    background: 'var(--accent-subtle)',
                                  }}
                                >
                                  {btn}
                                </span>
                              ))}
                            </div>
                          )
                        )}
                        {!msg.metadata?.template_name && taskTag && (
                          <div className="flex items-center gap-1.5 mt-1.5 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                            <span
                              className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{ background: taskTag.bg, color: taskTag.color }}
                            >
                              {taskTag.label}
                            </span>
                            {msg.metadata?.autonomous && (
                              <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>Autonomous</span>
                            )}
                          </div>
                        )}
                        {/* Template messages already render their delivery tick in
                            the footer (next to the time), so skip this bottom block
                            for them — otherwise the receipt shows TWICE (one by the
                            time, one below the buttons). */}
                        {!isCustomer && msg.channel === 'whatsapp' && !msg.metadata?.template_name && (() => {
                          // Real failure = the send itself failed (no message ID ever
                          // existed, e.g. Graph API rejected it) OR Meta's own delivery
                          // webhook reported 'failed'. NOT "no delivery/read receipt yet" —
                          // that's Meta not having called back, which is normal and common.
                          const realSendFailed = msg.metadata?.send_succeeded === false || msg.metadata?.delivery_status === 'failed'
                          return (
                          <div className="flex justify-end items-center gap-1 mt-1 -mb-0.5">
                            {msg.metadata?.delivery_status === 'failed' && msg.metadata?.delivery_error && (
                              <div className="relative group flex items-center">
                                <span
                                  className="text-[8px] font-mono px-1 py-0.5 rounded cursor-default truncate max-w-[120px]"
                                  style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}
                                >
                                  {msg.metadata.delivery_error}
                                </span>
                                <div
                                  className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block z-50 pointer-events-none"
                                  style={{ minWidth: '200px', maxWidth: '280px' }}
                                >
                                  <div
                                    className="text-[10px] leading-relaxed px-2.5 py-2 rounded-lg shadow-lg"
                                    style={{ background: '#1a1a2e', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}
                                  >
                                    <div className="font-semibold mb-0.5" style={{ color: '#EF4444' }}>Delivery Failed</div>
                                    {msg.metadata.delivery_error}
                                  </div>
                                  <div className="flex justify-end pr-2">
                                    <div className="w-2 h-2 rotate-45 -mt-1" style={{ background: '#1a1a2e', borderRight: '1px solid rgba(239,68,68,0.4)', borderBottom: '1px solid rgba(239,68,68,0.4)' }} />
                                  </div>
                                </div>
                              </div>
                            )}
                            <span
                              className="template-status-tag cursor-help"
                              data-tooltip={getDeliveryTooltip(msg.metadata?.delivery_status, msg.metadata?.delivery_error)}
                            >
                              <DeliveryStatusIcon deliveredAt={msg.delivered_at} readAt={msg.read_at} failed={realSendFailed} />
                            </span>
                          </div>
                          )
                        })()}
                      </div>
                    </div>
                    </React.Fragment>
                  );
                })
                }
                </>
              )}
            </div>
            </div>

            {/* Message Input - compact */}
            <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border-primary)' }}>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <button
                  onClick={generateAIResponse}
                  disabled={isGenerating || messages.length === 0}
                  className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                  style={{
                    background: isGenerating ? 'var(--accent-primary)' : 'transparent',
                    color: isGenerating ? 'var(--text-button, #000)' : 'var(--text-secondary)',
                    opacity: messages.length === 0 ? 0.3 : 1,
                  }}
                  title="Generate AI Response"
                >
                  <MdAutoAwesome size={18} className={isGenerating ? 'animate-spin' : ''} />
                </button>
                {/* Approved-template picker — WhatsApp only. Lets the operator
                    bypass the 24h reply window by sending a Meta-approved
                    template when the auto-reply path is blocked. */}
                {selectedChannel === 'whatsapp' && (
                  <button
                    onClick={() => setTemplatePickerOpen(true)}
                    disabled={!selectedLeadId}
                    className="p-1.5 rounded-lg transition-colors flex-shrink-0"
                    style={{
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      opacity: !selectedLeadId ? 0.3 : 1,
                    }}
                    title="Send WhatsApp template"
                    aria-label="Send WhatsApp template"
                  >
                    <FaWhatsapp size={18} />
                  </button>
                )}
                <input
                  type="text"
                  placeholder={
                    isGenerating ? 'Generating AI response...'
                    : selectedChannel === 'whatsapp' ? 'Type a reply (24h window)...'
                    : 'Type a reply...'
                  }
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                  disabled={isSending || isGenerating}
                  className="bg-transparent border-none outline-none flex-1 text-xs"
                  style={{ color: 'var(--text-primary)' }}
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || isSending}
                  className="p-1.5 rounded-lg transition-opacity flex-shrink-0"
                  style={{
                    background: 'var(--button-bg, #fff)',
                    opacity: !replyText.trim() || isSending ? 0.4 : 1,
                  }}
                  title="Send Message"
                >
                  <MdSend size={18} style={{ color: 'var(--text-button, #000)' }} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right Panel - Lead Details Sidebar. Desktop: persistent 380px column.
          Mobile: full-screen overlay toggled from the thread header's ⓘ. */}
      {selectedLeadId && (
        <div
          className={`${showDetailsMobile ? 'flex fixed inset-0 z-[80] w-full' : 'hidden'} md:flex md:static md:inset-auto md:z-auto md:w-[380px] flex-col border-l overflow-y-auto flex-shrink-0`}
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
        >
          {/* Mobile overlay header */}
          <div
            className="md:hidden flex items-center justify-between px-3 border-b flex-shrink-0 sticky top-0 z-10"
            style={{ height: '52px', background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Lead details</span>
            <button
              onClick={() => setShowDetailsMobile(false)}
              className="touch-44 flex items-center justify-center rounded-md"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Close details"
            >
              <MdClose size={20} />
            </button>
          </div>
          {isAnonymousSession ? (
            // Anonymous web visitor — no all_leads row to render. Show a
            // tiny stub so the panel doesn't sit on "Loading details..."
            // forever. The session id is in selectedConversation.lead_id
            // (the synthetic 'session:<sid>' key the conversation list uses).
            <div className="p-4 space-y-3">
              {(() => {
                const nm = selectedConversation?.lead_name || ''
                const hasName = !!nm && !nm.startsWith('Web visitor ·')
                return (
                  <>
                    <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      {hasName ? nm : 'Anonymous web visitor'}
                    </p>
                    <p className="text-[12px]" style={{ color: 'var(--text-primary)' }}>
                      {hasName
                        ? `${nm} shared their name in chat but hasn't given a phone or email yet, so there's no full lead record.`
                        : "This visitor hasn't shared a phone or email yet, so there's no lead record to display."}
                    </p>
                  </>
                )
              })()}
              {selectedConversation?.lead_id?.startsWith('session:') && (
                <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  Session: {selectedConversation.lead_id.slice('session:'.length)}
                </p>
              )}
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Once they share contact info in chat, the session will be linked to a real lead automatically.
              </p>
            </div>
          ) : !leadDetails ? (
            <div className="p-4 text-center">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Loading details...</p>
            </div>
          ) : (() => {
            const uc = leadDetails.unified_context || {}
            // Brand-namespaced context (e.g. uc.lokazen / uc.windchasers). Was
            // hardcoded to `windchasers`, so Lokazen's owner/scout/brand audience
            // (uc.lokazen.user_type) never surfaced in the panel. Read the active
            // brand's namespace, then fall back to windchasers for legacy rows.
            const bc = uc[getCurrentBrandId()] || {}
            const wc = { ...(uc.windchasers || {}), ...bc }
            const webCtx = uc.web || {}
            const waCtx = uc.whatsapp || {}
            const profile = webCtx.profile || waCtx.profile || {}
            const initials = (leadDetails.customer_name || leadDetails.phone || 'U').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
            const stageColors: Record<string, { bg: string; text: string }> = {
              'New':          { bg: '#3266ad', text: '#E6F1FB' },
              'Engaged':      { bg: '#3d5fa0', text: '#E6F1FB' },
              'Qualified':    { bg: '#485693', text: '#F1EFE8' },
              'High Intent':  { bg: '#534AB7', text: '#EEEDFE' },
              'Booking Made': { bg: '#1D9E75', text: '#E1F5EE' },
              'In Sequence':  { bg: '#BA7517', text: '#FAEEDA' },
              'Closed Won':    { bg: '#639922', text: '#EAF3DE' },
              'Closed Won':   { bg: '#639922', text: '#EAF3DE' },
              'Closed Lost':  { bg: '#993C1D', text: '#FAECE7' },
              'Cold':         { bg: '#993C1D', text: '#FAECE7' },
            }
            const stageAvatarColors: Record<string, string> = {
              'Closed Won': '#22c55e', 'Booking Made': '#60a5fa', 'High Intent': '#f59e0b',
              'Qualified': '#a855f7', 'Engaged': '#6b7280', 'In Sequence': '#8b5cf6',
            }
            const avatarBg = stageAvatarColors[leadDetails.lead_stage] || 'var(--accent-primary)'
            const sc = stageColors[leadDetails.lead_stage] || { bg: '#5F5E5A', text: '#F1EFE8' }
            // Prefer client-calculated score (live signal from messages + context)
            // and fall back to the stored lead_score so we never show 0 when a
            // calculation is still in flight.
            const dbScore = leadDetails.lead_score ?? 0
            const score = calculatedLeadScore != null
              ? Math.max(calculatedLeadScore, dbScore)
              : dbScore
            // Same Hot/Warm/Cold scheme as the lead modal — Warm is orange,
            // not green, regardless of how high the score is below 90.
            const { color: scoreColor, label: scoreLabel } = scoreVisual(score)

            const lastActiveStr = (() => {
              const d = leadDetails.last_message_at || leadDetails.updated_at
              if (!d) return null
              const diff = Date.now() - new Date(d).getTime()
              const mins = Math.floor(diff / 60000)
              if (mins < 1) return 'Just now'
              if (mins < 60) return `${mins}m ago`
              const hrs = Math.floor(mins / 60)
              if (hrs < 24) return `${hrs}h ago`
              return `${Math.floor(hrs / 24)}d ago`
            })()

            const userType = wc.user_type || webCtx.user_type || waCtx.user_type || profile.user_type
            const courseInterest = wc.course_interest || webCtx.course_interest || waCtx.course_interest
            const age = wc.age || webCtx.age || waCtx.age || profile.age
            const city = wc.city || webCtx.city || waCtx.city || profile.city
            const source = leadDetails.first_touchpoint || leadDetails.last_touchpoint
            const intent = wc.student_intent || webCtx.student_intent || waCtx.student_intent
            const painPoint = wc.pain_point || webCtx.pain_point || waCtx.pain_point
            const examStatus = wc.exam_status || webCtx.exam_status || waCtx.exam_status
            const budget = wc.budget || webCtx.budget || waCtx.budget

            const daysInPipeline = leadDetails.created_at
              ? Math.floor((Date.now() - new Date(leadDetails.created_at).getTime()) / 86400000)
              : null
            const agentMsgs = messages.filter(m => m.sender === 'agent').length
            const customerMsgs = messages.filter(m => m.sender === 'customer').length
            // Response rate = share of customer messages that got an agent reply
            // before the customer spoke again (bounded 0–100%). The old formula was
            // agentMsgs / customerMsgs, which runs over 100% whenever the agent sends
            // more bubbles than the customer (greetings, follow-ups, split replies) —
            // a message ratio, not a real "rate".
            const responseRate = (() => {
              if (customerMsgs === 0) return null
              const ordered = [...messages].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              )
              let replied = 0
              for (let i = 0; i < ordered.length; i++) {
                if (ordered[i].sender !== 'customer') continue
                for (let j = i + 1; j < ordered.length; j++) {
                  if (ordered[j].sender === 'customer') break
                  if (ordered[j].sender === 'agent') { replied++; break }
                }
              }
              return Math.round((replied / customerMsgs) * 100)
            })()

            const profileRows: { label: string; value: string }[] = []
            if (userType) profileRows.push({ label: 'Type', value: String(userType) })
            if (courseInterest) profileRows.push({ label: 'Course', value: String(courseInterest) })
            if (age) profileRows.push({ label: 'Age', value: String(age) })
            if (city) profileRows.push({ label: 'City', value: String(city) })
            if (source) profileRows.push({ label: 'Source', value: String(source).replace(/_/g, ' ') })
            if (examStatus) profileRows.push({ label: 'Exams', value: String(examStatus) })
            if (budget) profileRows.push({ label: 'Budget', value: String(budget) })
            if (intent) profileRows.push({ label: 'Intent', value: String(intent) })
            if (painPoint) profileRows.push({ label: 'Pain point', value: String(painPoint) })

            // Booking is written to multiple shapes depending on the path that
            // created it: top-level columns (storeBooking), flat keys under the
            // channel (web.booking_date), or a nested booking object (web.booking.date,
            // used by the inbound demo form). Check all of them so a booked lead
            // never shows as "No upcoming events".
            const bd = leadDetails.booking_date
              || webCtx.booking_date || webCtx.booking?.date
              || waCtx.booking_date || waCtx.booking?.date
            const bt = leadDetails.booking_time
              || webCtx.booking_time || webCtx.booking?.time
              || waCtx.booking_time || waCtx.booking?.time
            const ml = webCtx.booking_meet_link || webCtx.booking?.meetLink
              || waCtx.booking_meet_link || waCtx.booking?.meetLink
            const today = new Date().toISOString().split('T')[0]
            const isUpcoming = bd && bd >= today

            return (
              <>
              {/* ── HERO HEADER ── */}
              <div className="px-5 pt-5 pb-4" style={{ background: 'var(--bg-primary)' }}>
                {/* Score ring + name row — the ring REPLACES the old initials-on-coloured-square avatar.
                    Lead score is shown as the ring fill + number inside; tier label sits with name. */}
                <div className="flex items-start gap-3 mb-3">
                  {(() => {
                    // SVG donut. Circumference = 2πr; arc length = circumference * score/100.
                    const size = 56
                    const stroke = 4
                    const r = (size - stroke) / 2
                    const c = 2 * Math.PI * r
                    const pct = Math.max(0, Math.min(100, score || 0))
                    const dash = (c * pct) / 100
                    const hasScore = (leadDetails.lead_score != null || calculatedLeadScore != null)
                    return (
                      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                        <svg width={size} height={size} className="-rotate-90">
                          <circle
                            cx={size / 2} cy={size / 2} r={r}
                            fill="none" stroke="var(--border-primary)" strokeWidth={stroke}
                          />
                          {hasScore && (
                            <circle
                              cx={size / 2} cy={size / 2} r={r}
                              fill="none" stroke={scoreColor} strokeWidth={stroke}
                              strokeDasharray={`${dash} ${c - dash}`}
                              strokeLinecap="round"
                              style={{ transition: 'stroke-dasharray 500ms ease' }}
                            />
                          )}
                        </svg>
                        <div
                          className="absolute inset-0 flex items-center justify-center text-[14px] font-bold"
                          style={{ color: hasScore ? scoreColor : 'var(--text-muted)' }}
                        >
                          {hasScore ? score : '—'}
                        </div>
                      </div>
                    )
                  })()}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                        {leadDetails.customer_name || leadDetails.phone || 'Unknown'}
                      </p>
                      {lastActiveStr && (
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{lastActiveStr}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {(leadDetails.lead_score != null || calculatedLeadScore != null) && (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: `${scoreColor}22`, color: scoreColor, border: `1px solid ${scoreColor}55` }}
                          title={`Lead Score: ${score}/100`}
                        >
                          {scoreLabel}
                        </span>
                      )}
                      {leadDetails.lead_stage && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: sc.bg, color: sc.text }}>
                          {leadDetails.lead_stage}
                        </span>
                      )}
                      {/* Audience badge — who we're talking to (Lokazen: owner /
                          scout / brand). So the agent knows the conversation type
                          at a glance instead of inferring it from the messages. */}
                      {(() => {
                        // Lokazen-only taxonomy — never render it for other brands
                        // (a BCON business "owner" is NOT a Lokazen "Property Owner").
                        if (!IS_LOKAZEN) return null
                        const ut = String(userType || '').toLowerCase()
                        const aud = ut.includes('owner') ? { label: 'Property Owner', color: '#0EA5E9' }
                          : ut.includes('scout') ? { label: 'Scout', color: '#F59E0B' }
                          : ut.includes('brand') ? { label: 'Brand', color: '#A855F7' }
                          : null
                        if (!aud) return null
                        return (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: `${aud.color}22`, color: aud.color, border: `1px solid ${aud.color}55` }}>
                            {aud.label}
                          </span>
                        )
                      })()}
                      {selectedConversation?.channels?.map(ch => (
                        <ChannelIcon key={ch} channel={ch} size={12} active={true} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── ACTION BUTTONS ── */}
              <div className="px-5 py-3 flex gap-2 border-b border-t" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}>
                <button
                  disabled={!leadDetails.phone || callingLeadId === leadDetails.id}
                  onClick={async () => {
                    if (!leadDetails.phone) return;
                    setCallingLeadId(leadDetails.id);
                    try {
                      const res = await fetch('/api/agent/voice/test-call', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: leadDetails.phone, leadName: leadDetails.customer_name }),
                      });
                      const data = await res.json();
                      if (data.success) alert(`Calling ${leadDetails.customer_name || leadDetails.phone}...`);
                      else alert(`Call failed: ${JSON.stringify(data.error)}`);
                    } catch (e: any) {
                      alert(`Error: ${e.message}`);
                    } finally {
                      setCallingLeadId(null);
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-30 hover:bg-[rgba(34,197,94,0.08)]"
                  style={{
                    borderColor: leadDetails.phone ? 'rgba(34,197,94,0.35)' : 'var(--border-primary)',
                    color: leadDetails.phone ? '#22C55E' : 'var(--text-muted)',
                    background: 'transparent',
                  }}
                >
                  <MdPhone size={14} className={callingLeadId === leadDetails.id ? 'animate-pulse' : ''} />
                  {callingLeadId === leadDetails.id ? 'Calling…' : 'Call'}
                </button>
                <a
                  href={leadDetails.phone ? `https://wa.me/${leadDetails.phone.replace(/[^0-9]/g, '')}` : undefined}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium border transition-all hover:bg-[rgba(37,211,102,0.08)]"
                  style={{
                    borderColor: leadDetails.phone ? 'rgba(37,211,102,0.35)' : 'var(--border-primary)',
                    color: leadDetails.phone ? '#25D366' : 'var(--text-muted)',
                    background: 'transparent',
                    opacity: leadDetails.phone ? 1 : 0.3,
                    pointerEvents: leadDetails.phone ? 'auto' : 'none',
                  }}
                >
                  <FaWhatsapp size={13} /> WhatsApp
                </a>
                <a
                  href={leadDetails.email ? `mailto:${leadDetails.email}` : undefined}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium border transition-all hover:bg-[rgba(139,92,246,0.08)]"
                  style={{
                    borderColor: leadDetails.email ? 'rgba(139,92,246,0.35)' : 'var(--border-primary)',
                    color: leadDetails.email ? '#8B5CF6' : 'var(--text-muted)',
                    background: 'transparent',
                    opacity: leadDetails.email ? 1 : 0.3,
                    pointerEvents: leadDetails.email ? 'auto' : 'none',
                  }}
                >
                  <MdEmail size={14} /> Email
                </a>
              </div>

              {/* ── CONTACT INFO ── */}
              {(leadDetails.email || leadDetails.phone) && (
                <div className="px-5 py-3 border-b space-y-2" style={{ borderColor: 'var(--border-primary)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Contact</p>
                  {leadDetails.email && (
                    <div className="flex items-center gap-2">
                      <MdEmail size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <a href={`mailto:${leadDetails.email}`} className="text-[12px] truncate hover:underline" style={{ color: 'var(--text-secondary)' }}>
                        {leadDetails.email}
                      </a>
                    </div>
                  )}
                  {leadDetails.phone && (
                    <div className="flex items-center gap-2">
                      <MdPhone size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <a href={`tel:${leadDetails.phone}`} className="text-[12px] hover:underline" style={{ color: 'var(--text-secondary)' }}>
                        {leadDetails.phone}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* ── QUICK STATS ── */}
              <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg px-3 py-2.5 text-center" style={{ background: 'var(--bg-primary)' }}>
                    {/* Count agent (PROXe) replies across ALL channels — web chat + whatsapp.
                        `agentMsgs` is derived from the full `messages` thread (both channels),
                        so every web-chat and whatsapp agent reply is included. */}
                    <p className="text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{agentMsgs}</p>
                    <p className="text-[9px] mt-0.5 font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Agent Msgs</p>
                  </div>
                  <div className="rounded-lg px-3 py-2.5 text-center" style={{ background: 'var(--bg-primary)' }}>
                    <p className="text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                      {responseRate !== null ? `${responseRate}%` : '—'}
                    </p>
                    <p className="text-[9px] mt-0.5 font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Response</p>
                  </div>
                  <div className="rounded-lg px-3 py-2.5 text-center" style={{ background: 'var(--bg-primary)' }}>
                    <p className="text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                      {daysInPipeline !== null ? `${daysInPipeline}d` : '—'}
                    </p>
                    <p className="text-[9px] mt-0.5 font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Pipeline</p>
                  </div>
                </div>
              </div>

              {/* ── LEAD PROFILE ── */}
              {profileRows.length > 0 && (
                <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Profile</p>
                  <div className="space-y-2">
                    {profileRows.map(r => (
                      <div key={r.label} className="flex items-start justify-between gap-3">
                        <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                        <span className="text-[12px] text-right capitalize font-medium" style={{ color: 'var(--text-primary)' }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── OWNER ── */}
              <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Owner</p>
                <select
                  value={leadDetails?.unified_context?.owner?.id || ''}
                  onChange={(e) => setLeadOwner(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-md border focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                  // colorScheme makes the native dropdown render dark in dark mode —
                  // without it the options were white-on-white (only the highlighted
                  // row showed), so the list looked empty. Options also get explicit
                  // bg/color for browsers that honour it.
                  style={{ borderColor: 'var(--border-primary)', color: 'var(--text-primary)', background: 'var(--bg-secondary)', colorScheme: 'light dark' }}
                >
                  <option value="" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Unassigned</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* ── UPCOMING / BOOKING ── */}
              <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Upcoming</p>
                {isUpcoming ? (
                  <div className="rounded-xl p-3 border" style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.25)' }}>
                    <div className="flex items-center gap-2">
                      <MdEvent size={15} style={{ color: '#22c55e' }} />
                      <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                        {new Date(bd).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                        {bt && (() => {
                          const tp = bt.toString().split(':')
                          if (tp.length < 2) return ` · ${bt}`
                          const h = parseInt(tp[0], 10), m = parseInt(tp[1], 10)
                          if (isNaN(h) || isNaN(m)) return ` · ${bt}`
                          return ` · ${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
                        })()}
                      </span>
                    </div>
                    {ml && (
                      <a href={ml} target="_blank" rel="noopener noreferrer"
                        className="mt-2 text-[11px] flex items-center gap-1 hover:underline" style={{ color: 'var(--accent-primary)' }}>
                        <MdOpenInNew size={11} /> Join Meeting
                      </a>
                    )}
                    <button
                      onClick={async () => {
                        if (!leadDetails?.id) return
                        if (!window.confirm('Cancel this booking? This removes the Google Calendar event and stops the reminder messages.')) return
                        try {
                          const r = await fetch(`/api/dashboard/leads/${leadDetails.id}/cancel-booking`, { method: 'POST' })
                          if (r.ok) window.location.reload()
                          else window.alert('Could not cancel the booking. Try again.')
                        } catch {
                          window.alert('Could not cancel the booking. Try again.')
                        }
                      }}
                      className="mt-2 text-[11px] hover:underline"
                      style={{ color: '#ef4444' }}
                    >
                      Cancel booking
                    </button>
                  </div>
                ) : bd ? (
                  <div className="rounded-xl p-3 border" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)', opacity: 0.6 }}>
                    <div className="flex items-center gap-2">
                      <MdEvent size={14} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {new Date(bd).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} (past)
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No upcoming events</p>
                )}
              </div>

              {/* ── PLANNED FOLLOW-UPS (bcon — the sequence this lead is in) ── */}
              {IS_BCON && (
                <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Planned follow-ups</p>
                    {plannedActions.length > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{plannedActions.length}</span>
                    )}
                  </div>
                  {loadingPlanned ? (
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Loading…</p>
                  ) : plannedActions.length === 0 ? (
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No follow-ups scheduled</p>
                  ) : (
                    <div className="flex flex-col">
                      {plannedActions.map((t, i) => (
                        <div key={t.id} className="relative pl-4 pb-3 last:pb-0">
                          {i < plannedActions.length - 1 && (
                            <span className="absolute top-3 bottom-0 w-px" style={{ left: '3px', background: 'var(--border-primary)' }} />
                          )}
                          <span className="absolute w-[7px] h-[7px] rounded-full" style={{ left: 0, top: '5px', background: 'var(--accent-primary)' }} />
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtPlannedWhen(t.scheduled_at)}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded uppercase font-medium tracking-wide" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{humanizeTaskType(t.task_type)}</span>
                            {t.sequence_label && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{t.sequence_label}</span>}
                          </div>
                          {t.preview && (
                            <p className="text-[11px] mt-0.5 leading-snug line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{t.preview.replace(/\[\[([^\]]+)\]\]/g, '$1')}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── VIEW FULL DETAILS ── */}
              <div className="px-5 py-4 mt-auto">
                <button
                  onClick={() => leadDetails?.id && openLeadModal(leadDetails.id)}
                  className="w-full text-xs font-semibold py-2.5 rounded-xl transition-opacity flex items-center justify-center gap-1.5 hover:opacity-90"
                  style={{ background: 'var(--button-bg, #fff)', color: 'var(--text-button, #000)' }}
                >
                  <MdOpenInNew size={14} /> View Full Details
                </button>
              </div>
              </>
            )
          })()}
        </div>
      )}

      {/* Lead Details Modal */}
      {selectedLead && (
        <LeadDetailsModal
          lead={selectedLead}
          isOpen={isLeadModalOpen}
          onClose={() => {
            setIsLeadModalOpen(false);
            setSelectedLead(null);
          }}
          onStatusUpdate={updateLeadStatus}
        />
      )}

      <WhatsAppTemplatePicker
        open={templatePickerOpen && !!selectedLeadId && selectedChannel === 'whatsapp'}
        onClose={() => setTemplatePickerOpen(false)}
        leadId={selectedLeadId || ''}
        leadName={leadDetails?.customer_name || null}
        onSent={() => {
          // Refresh thread + conversation list so the template appears immediately
          if (selectedLeadId) fetchMessages(selectedLeadId)
          fetchConversations()
        }}
      />
    </div>
  )
}
