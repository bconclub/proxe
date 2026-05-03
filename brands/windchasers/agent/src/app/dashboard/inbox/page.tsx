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
} from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'
import LoadingOverlay from '@/components/dashboard/LoadingOverlay'
import LeadDetailsModal from '@/components/dashboard/LeadDetailsModal'
import { calculateLeadScore } from '@/lib/leadScoreCalculator'

// Channel Icons using custom SVGs with colored backgrounds
const ChannelIcon = ({ channel, size = 16, active = false }: { channel: string; size?: number; active?: boolean }) => {
  const containerStyle: React.CSSProperties = {
    width: size + 4,
    height: size + 4,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: active ? 1 : 0.4,
  };

  switch (channel) {
    case 'web':
      return (
        <div style={{ ...containerStyle, backgroundColor: '#3B82F6' }}>
          <img src="/browser-stroke-rounded.svg" alt="Web" width={size} height={size} style={{ filter: 'invert(1)' }} title="Website" />
        </div>
      );
    case 'whatsapp':
      return (
        <div style={{ ...containerStyle, backgroundColor: '#25D366' }}>
          <img src="/whatsapp-business-stroke-rounded.svg" alt="WhatsApp" width={size} height={size} style={{ filter: 'invert(1)' }} title="WhatsApp" />
        </div>
      );
    case 'voice':
      return (
        <div style={{ ...containerStyle, backgroundColor: '#8B5CF6' }}>
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" title="Voice">
            <path
              d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.24 1.01l-2.2 2.2z"
              stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            />
            <path
              d="M18 2l.6 1.4L20 4l-1.4.6L18 6l-.6-1.4L16 4l1.4-.6L18 2z"
              fill="#fff" stroke="#fff" strokeWidth="0.5"
            />
          </svg>
        </div>
      );
    case 'social':
      return (
        <div style={{ ...containerStyle, backgroundColor: '#F59E0B' }}>
          <img src="/video-ai-stroke-rounded.svg" alt="Social" width={size} height={size} style={{ filter: 'invert(1)' }} title="Social" />
        </div>
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


function cleanMessageContent(text: string): string {
  if (!text) return '';

  // Remove [User's name is ...] metadata
  return text.replace(/\[User's name is [^\]]+\]\s*/g, '').trim();
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

/** Parse form submission data from a message into structured fields */
function parseFormFields(content: string): { intro: string; fields: { key: string; value: string }[] } | null {
  if (!content) return null;
  const fieldPattern = /\b(\w+(?:_\w+)+\??)\s*:\s*/g;
  const matches = [...content.matchAll(fieldPattern)];
  if (matches.length < 3) return null;

  const intro = content.substring(0, matches[0].index!).trim();
  const fields: { key: string; value: string }[] = [];

  for (let i = 0; i < matches.length; i++) {
    const rawKey = matches[i][1];
    const valueStart = matches[i].index! + matches[i][0].length;
    const valueEnd = i < matches.length - 1 ? matches[i + 1].index! : content.length;
    const value = content.substring(valueStart, valueEnd).trim();
    const cleanKey = rawKey
      .replace(/\?$/, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    fields.push({ key: cleanKey, value });
  }
  return { intro, fields };
}

/** Extract a short label for a form field */
function getFormFieldLabel(key: string): string {
  const k = key.toLowerCase();
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
  return key.length > 15 ? key.substring(0, 15) + '…' : key;
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


function DeliveryStatusIcon({ deliveredAt, readAt, createdAt }: { deliveredAt?: string | null; readAt?: string | null; createdAt?: string }) {
  // Check for failed state: no delivery confirmation after 10 minutes
  const isFailed = !deliveredAt && !readAt && createdAt && 
    (Date.now() - new Date(createdAt).getTime()) > 10 * 60 * 1000;

  if (isFailed) {
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
  const [calculatedLeadScore, setCalculatedLeadScore] = useState<number | null>(null)
  // Map of lead_id → calculated score for the conversation list. The DB
  // lead_score is often null/0; this lets the list reflect real engagement.
  const [calculatedConvScores, setCalculatedConvScores] = useState<Record<string, number>>({})
  const [messageChannelFilter, setMessageChannelFilter] = useState<string>('all')

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

  // Auto-select first conversation when loaded (if none selected via URL)
  useEffect(() => {
    if (conversations.length > 0 && !selectedLeadId && !searchParams.get('lead')) {
      const first = conversations[0]
      setSelectedLeadId(first.lead_id)
      if (first.channels && first.channels.length > 0) {
        setSelectedChannel(first.channels[0])
      }
    }
  }, [conversations, selectedLeadId, searchParams])

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

  // Fetch lead details for right panel
  useEffect(() => {
    if (!selectedLeadId) { setLeadDetails(null); return }
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

      // Fetch conversations with valid lead_id
      let query = supabase
        .from('conversations')
        .select('lead_id, channel, content, sender, created_at')
        .not('lead_id', 'is', null)
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
      }>
      console.log('Sample message:', messages[0])

      // Group by lead_id and collect ALL channels per lead
      const conversationMap = new Map<string, any>()

      for (const msg of messages) {
        if (!msg.lead_id) continue

        if (!conversationMap.has(msg.lead_id)) {
          conversationMap.set(msg.lead_id, {
            lead_id: msg.lead_id,
            channels: new Set([msg.channel]),
            last_message: msg.content || '(No content)',
            last_message_at: msg.created_at,
            message_count: 1
          })
        } else {
          const conv = conversationMap.get(msg.lead_id)
          conv.channels.add(msg.channel)
          // Update to most recent message
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

      // Get lead details for all conversations
      const leadIds = Array.from(conversationMap.keys())

      if (leadIds.length === 0) {
        setConversations([])
        setLoading(false)
        return
      }

      console.log('Looking up lead IDs:', leadIds.length, 'leads')

      const { data: leadsData, error: leadsError } = await supabase
        .from('all_leads')
        .select('id, customer_name, email, phone, unified_context, lead_stage, lead_score, first_touchpoint')
        .in('id', leadIds)

      if (leadsError) {
        console.error('Error fetching leads:', leadsError)
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
        // Find matching lead - ensure we're comparing strings
        const lead = typedLeads.find((l) => String(l.id) === String(leadId))

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
        const resolvedName =
          uc?.whatsapp?.profile?.full_name ||
          uc?.web?.profile?.full_name ||
          lead?.customer_name ||
          lead?.phone ||
          'Unknown';

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

      // Always fetch ALL messages for this lead (channel filtering is done client-side)
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching messages:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        throw error
      }

      const messagesData = (data ?? []).map((msg: any): Message => ({
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
      `}</style>
      {/* Loading Overlay */}
      <LoadingOverlay
        isLoading={loading || messagesLoading}
        message={loading ? "Loading conversations..." : "Loading messages..."}
      />

      {/* Left Panel - Conversations List */}
      <div
        className="w-[320px] flex flex-col border-r flex-shrink-0 overflow-hidden"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-primary)',
          minWidth: '280px',
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
            {['all', 'web', 'whatsapp'].map((ch) => (
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

                    <div className="px-3 py-2 pl-4">
                      {/* Line 1: Score Ring + Channel icons + Name + Timestamp + Open */}
                      <div className="flex items-center gap-2.5">
                        <ScoreRing score={displayScore} size={28} />
                        <span className="inline-flex items-center gap-0.5 flex-shrink-0">
                          {conv.channels.map((ch) => (
                            <ChannelIcon key={ch} channel={ch} size={14} active={true} />
                          ))}
                        </span>
                        <span className="text-sm font-semibold truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                          {conv.lead_name || conv.lead_phone || 'Unknown'}
                        </span>
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
                  <div className="px-3 py-2.5">
                    {/* Line 1: Channel icons + Name + Timestamp
                        (Per design: only the SELECTED row shows a ScoreRing —
                        unselected rows just show the name to keep the list
                        scannable.) */}
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-0.5 flex-shrink-0">
                        {conv.channels.map((ch) => (
                          <ChannelIcon key={ch} channel={ch} size={13} active={true} />
                        ))}
                      </span>
                      <span className="text-[12px] font-semibold truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                        {conv.lead_name || conv.lead_phone || 'Unknown'}
                      </span>
                      <span className="text-[9px] flex-shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>
                        {timeAgo(conv.last_message_at)}
                      </span>
                    </div>
                    {/* Line 2: Last message preview + EVENT badge */}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-[11px] truncate flex-1" style={{ color: 'var(--text-muted)' }}>
                        {conv.last_message || '\u00A0'}
                      </p>
                      {conv.booking_status && (
                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                          style={{
                            background: '#22c55e',
                            color: '#fff',
                          }}>
                          EVENT
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Right Panel - Messages */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        {!selectedLeadId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MdInbox size={48} style={{ color: 'var(--text-secondary)', margin: '0 auto 8px' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Select a conversation</p>
            </div>
          </div>
        ) : (
          <>
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
                      <div className="max-w-[90%] rounded-lg px-3 py-2 border" style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(24,119,242,0.3)' }}>
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

                  if (formData) {
                    // Render as compact form data card
                    const priorityFields = formData.fields.filter(f => {
                      const k = f.key.toLowerCase();
                      return k.includes('brand') || k.includes('full name') || k.includes('email') ||
                             k.includes('phone') || k.includes('city') || k.includes('how fast') ||
                             k.includes('business type');
                    });
                    const otherFields = formData.fields.filter(f => !priorityFields.includes(f));

                    const formGapMs = msgIdx > 0 ? new Date(msg.created_at).getTime() - new Date(filteredMessages[msgIdx - 1].created_at).getTime() : 0;

                    return (
                      <React.Fragment key={msg.id}>
                      {dateSeparator}
                      {msgIdx > 0 && formGapMs > 60000 && !showDateSeparator && (
                        <div className="flex justify-center my-0.5">
                          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full" style={{ color: gapColor(formGapMs), background: 'rgba(255,255,255,0.03)' }}>
                            {formatGap(formGapMs)} gap
                          </span>
                        </div>
                      )}
                      <div className="flex justify-start">
                        <div
                          className="max-w-[90%] rounded-lg px-3 py-2 border"
                          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
                        >
                          {/* Header */}
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <ChannelIcon channel={msg.channel} size={10} active={true} />
                              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                                {selectedConversation?.lead_name || 'Customer'}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                                Form Submission
                              </span>
                            </div>
                            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{formatTime(msg.created_at)}</span>
                          </div>
                          {/* Compact fields grid */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {priorityFields.map((f, i) => (
                              <div key={i} className="flex items-baseline gap-1">
                                <span className="text-[9px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>{getFormFieldLabel(f.key)}:</span>
                                <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{f.value}</span>
                              </div>
                            ))}
                          </div>
                          {otherFields.length > 0 && (
                            <details className="mt-1">
                              <summary className="text-[9px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>+{otherFields.length} more fields</summary>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                {otherFields.map((f, i) => (
                                  <div key={i} className="flex items-baseline gap-1">
                                    <span className="text-[9px] font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>{getFormFieldLabel(f.key)}:</span>
                                    <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{f.value}</span>
                                  </div>
                                ))}
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

                  return (
                    <React.Fragment key={msg.id}>
                    {dateSeparator}
                    {msgIdx > 0 && gapMs > 60000 && !showDateSeparator && (
                      <div className="flex justify-center my-0.5">
                        <span className="text-[9px] font-medium px-2 py-0.5 rounded-full" style={{ color: gapColor(gapMs), background: 'rgba(255,255,255,0.03)' }}>
                          {formatGap(gapMs)} gap
                        </span>
                      </div>
                    )}
                    <div
                      className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className="max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm border"
                        style={{
                          background: isCustomer
                            ? 'rgba(255,255,255,0.10)'
                            : 'rgba(99,102,241,0.28)',
                          borderColor: isCustomer
                            ? 'rgba(255,255,255,0.18)'
                            : 'rgba(99,102,241,0.45)',
                          borderWidth: '1px',
                          ...(msg.metadata?.template_name
                            ? { borderLeft: `3px solid ${getDeliveryStatusStyle(msg.metadata?.delivery_status).color}` }
                            : taskTag
                            ? { borderLeft: `3px solid ${taskTag.color}` }
                            : {}),
                        }}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <div className="flex items-center gap-1">
                            <ChannelIcon channel={msg.channel} size={11} active={true} />
                            <span
                              className="text-[9px] font-bold uppercase tracking-wider"
                              style={{ color: isCustomer ? 'var(--text-secondary)' : 'var(--accent-primary)' }}
                            >
                              {isCustomer ? selectedConversation?.lead_name || 'Customer' : 'PROXe AI'}
                            </span>
                            <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.10)', color: 'var(--text-secondary)' }}>
                              {msg.channel === 'whatsapp' ? 'WA' : msg.channel === 'web' ? 'Web' : msg.channel === 'voice' ? 'Voice' : msg.channel}
                            </span>
                          </div>
                          <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                        <div className="text-[13px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                          {renderMarkdown(msg.content)}
                        </div>
                        {msg.metadata?.template_name && (() => {
                          const ds = msg.metadata?.delivery_status
                          const statusStyle = getDeliveryStatusStyle(ds)
                          const tooltip = getDeliveryTooltip(ds, msg.metadata?.delivery_error)
                          return (
                            <div className="flex items-center gap-1.5 mt-1.5 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                              <span
                                className="template-status-tag text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded relative cursor-default"
                                style={{ background: statusStyle.bg, color: statusStyle.color }}
                                data-tooltip={tooltip}
                              >
                                Template
                              </span>
                              <span className="text-[9px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                                {msg.metadata.template_name}
                              </span>
                              <span className="flex items-center" title={ds || 'pending'}>
                                <DeliveryStatusIcon deliveredAt={msg.delivered_at} readAt={msg.read_at} createdAt={msg.created_at} />
                              </span>
                            </div>
                          )
                        })()}
                        {msg.metadata?.template_buttons && Array.isArray(msg.metadata.template_buttons) && msg.metadata.template_buttons.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {msg.metadata.template_buttons.map((btn: string, btnIdx: number) => (
                              <span
                                key={btnIdx}
                                className="inline-block text-[10px] font-medium px-2.5 py-1 rounded-full border"
                                style={{ borderColor: 'rgba(99,102,241,0.3)', color: 'rgba(139,142,255,0.9)', background: 'rgba(99,102,241,0.08)' }}
                              >
                                {btn}
                              </span>
                            ))}
                          </div>
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
                        {!isCustomer && msg.channel === 'whatsapp' && (
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
                            <span title={getDeliveryTooltip(msg.metadata?.delivery_status, msg.metadata?.delivery_error)}>
                              <DeliveryStatusIcon deliveredAt={msg.delivered_at} readAt={msg.read_at} createdAt={msg.created_at} />
                            </span>
                          </div>
                        )}
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

      {/* Right Panel - Lead Details Sidebar */}
      {selectedLeadId && (
        <div
          className="flex w-[380px] flex-col border-l overflow-y-auto flex-shrink-0"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
        >
          {!leadDetails ? (
            <div className="p-4 text-center">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Loading details...</p>
            </div>
          ) : (() => {
            const uc = leadDetails.unified_context || {}
            const wc = uc.windchasers || {}
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
              'Converted':    { bg: '#639922', text: '#EAF3DE' },
              'Closed Won':   { bg: '#639922', text: '#EAF3DE' },
              'Closed Lost':  { bg: '#993C1D', text: '#FAECE7' },
              'Cold':         { bg: '#993C1D', text: '#FAECE7' },
            }
            const stageAvatarColors: Record<string, string> = {
              'Converted': '#22c55e', 'Booking Made': '#60a5fa', 'High Intent': '#f59e0b',
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
            const responseRate = customerMsgs > 0 ? Math.round((agentMsgs / customerMsgs) * 100) : null

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
                {/* Avatar row */}
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: avatarBg, color: '#fff' }}
                  >
                    {initials}
                  </div>
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
                      {leadDetails.lead_stage && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: sc.bg, color: sc.text }}>
                          {leadDetails.lead_stage}
                        </span>
                      )}
                      {selectedConversation?.channels?.map(ch => (
                        <ChannelIcon key={ch} channel={ch} size={12} active={true} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Score bar */}
                {(leadDetails.lead_score != null || calculatedLeadScore != null) && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Lead Score</span>
                      <span className="text-[11px] font-bold" style={{ color: scoreColor }}>
                        {score} <span className="font-normal text-[10px]">{scoreLabel}</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${score}%`, background: scoreColor }}
                      />
                    </div>
                  </div>
                )}
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
                    {/* Only count customer-sent messages, not agent/PROXe replies */}
                    <p className="text-base font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{customerMsgs}</p>
                    <p className="text-[9px] mt-0.5 font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Messages</p>
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
    </div>
  )
}
