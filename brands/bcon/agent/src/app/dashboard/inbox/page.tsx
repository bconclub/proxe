'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { useSearchParams } from 'next/navigation'
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
} from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'
import LoadingOverlay from '@/components/dashboard/LoadingOverlay'
import LeadDetailsModal from '@/components/dashboard/LeadDetailsModal'

// Channel Icons using custom SVGs
const ChannelIcon = ({ channel, size = 16, active = false }: { channel: string; size?: number; active?: boolean }) => {
  const style = {
    opacity: active ? 1 : 0.3,
    filter: 'invert(1) brightness(2)', // Inverts black to white for dark mode
  };

  switch (channel) {
    case 'web':
      return <img src="/browser-stroke-rounded.svg" alt="Web" width={size} height={size} style={style} title="Website" />;
    case 'whatsapp':
      return <img src="/whatsapp-business-stroke-rounded.svg" alt="WhatsApp" width={size} height={size} style={style} title="WhatsApp" />;
    case 'voice':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity: active ? 1 : 0.3 }} title="Voice">
          <path
            d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.24 1.01l-2.2 2.2z"
            stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          />
          <path
            d="M18 2l.6 1.4L20 4l-1.4.6L18 6l-.6-1.4L16 4l1.4-.6L18 2z"
            fill="var(--accent-primary, #818cf8)" stroke="var(--accent-primary, #818cf8)" strokeWidth="0.5"
          />
        </svg>
      );
    case 'social':
      return <img src="/video-ai-stroke-rounded.svg" alt="Social" width={size} height={size} style={style} title="Social" />;
    default:
      return null;
  }
};

const ALL_CHANNELS = ['web', 'whatsapp'];

// Score Ring - circular progress indicator with score inside
const ScoreRing = ({ score, size = 28 }: { score: number | null; size?: number }) => {
  const s = score ?? 0;
  const color = s >= 70 ? '#22c55e' : s >= 40 ? '#f59e0b' : s >= 20 ? '#3b82f6' : '#ef4444';
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


function DeliveryStatusIcon({ status }: { status: string | undefined }) {
  if (!status || status === 'sent' || status === 'pending') {
    return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  }
  if (status === 'delivered') {
    return <svg width="12" height="10" viewBox="0 0 20 16" fill="none"><path d="M1 8l3 3 7-7" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 8l3 3 7-7" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  }
  if (status === 'read') {
    return <svg width="12" height="10" viewBox="0 0 20 16" fill="none"><path d="M1 8l3 3 7-7" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 8l3 3 7-7" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  }
  if (status === 'failed') {
    return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3l-10 10" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"/></svg>
  }
  return null
}

export default function InboxPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
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
          .select('id, customer_name, email, phone, last_interaction_at, first_touchpoint, last_touchpoint, unified_context, lead_score, lead_stage, booking_date, booking_time')
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
              booking_date: lead.booking_date ?? null,
              booking_time: lead.booking_time ?? null,
              next_touchpoint: fbUc?.next_touchpoint || fbUc?.sequence?.next_step || null,
              form_data: fbUc?.form_data || null,
              first_touchpoint: lead.first_touchpoint || null,
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
        .select('id, customer_name, email, phone, unified_context, booking_date, booking_time, lead_stage, lead_score, first_touchpoint')
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
        booking_date?: string | null
        booking_time?: string | null
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

        // Extract booking status: check direct columns first, then unified_context
        const ctx = lead?.unified_context || {};
        const bookingStatus = (lead?.booking_date ? 'Call Booked' : null)
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
          booking_date: lead?.booking_date ?? null,
          booking_time: lead?.booking_time ?? null,
          next_touchpoint: nextTouchpoint,
          form_data: uc?.form_data || null,
          first_touchpoint: (lead as any)?.first_touchpoint || null,
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
          borderColor: 'var(--border-primary)'
        }}
      >
        {/* Search + Filters - flush at top */}
        <div className="px-3 pt-2 pb-2 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <div
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-transparent transition-all focus-within:border-amber-500/50 mb-2"
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
              className="bg-transparent border-none outline-none flex-1 text-xs"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
          <div className="flex gap-1">
            {['all', 'web', 'whatsapp'].map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all"
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

              // Temperature helpers
              const scoreColor = conv.lead_score != null
                ? (conv.lead_score >= 70 ? '#22c55e' : conv.lead_score >= 40 ? '#f59e0b' : conv.lead_score >= 20 ? '#3b82f6' : '#ef4444')
                : null;

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
                        <ScoreRing score={conv.lead_score} size={28} />
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
                          className="p-1 rounded transition-colors flex-shrink-0 hover:opacity-80"
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
                    {/* Line 1: Channel icons + Name + Timestamp */}
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
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative"
              style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, var(--bg-tertiary) 1px, transparent 0)',
                backgroundSize: '24px 24px'
              }}
            >
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
                            ? 'rgba(255,255,255,0.08)'
                            : 'rgba(99,102,241,0.15)',
                          borderColor: isCustomer
                            ? 'rgba(255,255,255,0.12)'
                            : 'rgba(99,102,241,0.30)',
                          borderWidth: '1px',
                          ...(msg.metadata?.template_name ? { borderLeft: `3px solid ${getDeliveryStatusStyle(msg.metadata?.delivery_status).color}` } : {}),
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
                                <DeliveryStatusIcon status={ds} />
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
                        {!isCustomer && msg.channel === 'whatsapp' && (
                          <div className="flex justify-end items-center gap-1 mt-1 -mb-0.5" title={getDeliveryTooltip(msg.metadata?.delivery_status, msg.metadata?.delivery_error)}>
                            <DeliveryStatusIcon status={msg.metadata?.delivery_status} />
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
          className="flex w-[300px] flex-col border-l overflow-y-auto flex-shrink-0"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}
        >
          {!leadDetails ? (
            <div className="p-4 text-center">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Loading details...</p>
            </div>
          ) : (
          <>
          {/* 1. Header - Avatar, Name, Company, City + Channel */}
          {(() => {
            const ctx = leadDetails.unified_context?.bcon || leadDetails.unified_context?.windchasers || {}
            const city = ctx.city || ctx.location || ''
            const brand = ctx.brand || ctx.brand_name || ctx.company || ''
            const initials = (leadDetails.customer_name || leadDetails.phone || 'U').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
            const stageAvatarColors: Record<string, string> = {
              'Converted': '#22c55e',
              'Booking Made': '#60a5fa',
              'High Intent': '#f59e0b',
              'Qualified': '#a855f7',
              'Engaged': '#6b7280',
              'In Sequence': '#8b5cf6',
            }
            const avatarBg = stageAvatarColors[leadDetails.lead_stage] || 'var(--accent-primary)'
            const channelLabel = selectedChannel === 'whatsapp' ? 'WhatsApp' : selectedChannel === 'web' ? 'Web' : selectedChannel === 'voice' ? 'Voice' : selectedChannel || ''
            return (
              <div className="p-4 pt-5 border-b flex flex-col items-center text-center" style={{ borderColor: 'var(--border-primary)' }}>
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mb-3"
                  style={{ background: avatarBg, color: 'var(--text-button, #000)' }}
                >
                  {initials}
                </div>
                <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                  {leadDetails.customer_name || leadDetails.phone || 'Unknown'}
                </p>
                {brand && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{brand}</p>
                )}
                {(city || channelLabel) && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {city && <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{city}</span>}
                    {city && channelLabel && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>·</span>}
                    {channelLabel && (
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {selectedChannel === 'whatsapp' ? <FaWhatsapp size={10} style={{ color: '#25D366' }} /> :
                         selectedChannel === 'web' ? <MdLanguage size={11} style={{ color: 'var(--text-muted)' }} /> :
                         selectedChannel === 'voice' ? <MdPhone size={11} style={{ color: 'var(--text-muted)' }} /> : null}
                        {channelLabel}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* 2. Score + Stage + Last Active */}
          {(leadDetails.lead_score != null || leadDetails.lead_stage) && (
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-primary)' }}>
              {leadDetails.lead_score != null && (
                <span className="text-sm font-bold px-2 py-0.5 rounded-md" style={{
                  background: leadDetails.lead_score >= 60 ? 'rgba(34,197,94,0.15)' : leadDetails.lead_score >= 30 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                  color: leadDetails.lead_score >= 60 ? '#22C55E' : leadDetails.lead_score >= 30 ? '#F59E0B' : '#EF4444',
                }}>
                  {leadDetails.lead_score}
                </span>
              )}
              {leadDetails.lead_stage && (() => {
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
                const sc = stageColors[leadDetails.lead_stage] || { bg: '#5F5E5A', text: '#F1EFE8' }
                return (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                    style={{ background: sc.bg, color: sc.text }}>
                    {leadDetails.lead_stage}
                  </span>
                )
              })()}
              {leadDetails.last_message_at && (
                <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>
                  {(() => {
                    const diff = Date.now() - new Date(leadDetails.last_message_at || leadDetails.updated_at || '').getTime()
                    const mins = Math.floor(diff / 60000)
                    if (mins < 1) return 'Just now'
                    if (mins < 60) return `${mins}m ago`
                    const hrs = Math.floor(mins / 60)
                    if (hrs < 24) return `${hrs}h ago`
                    const days = Math.floor(hrs / 24)
                    return `${days}d ago`
                  })()}
                </span>
              )}
            </div>
          )}

          {/* 3. Quick Action Buttons - Call, WhatsApp, Email */}
          <div className="px-4 py-3 border-b flex gap-2" style={{ borderColor: 'var(--border-primary)' }}>
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
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-opacity disabled:opacity-40"
              style={{
                background: leadDetails.phone ? 'rgba(34,197,94,0.12)' : 'var(--bg-tertiary)',
                color: leadDetails.phone ? '#22c55e' : 'var(--text-muted)',
              }}
            >
              <MdPhone size={14} /> {callingLeadId === leadDetails.id ? 'Calling...' : 'Call'}
            </button>
            <a
              href={leadDetails.phone ? `https://wa.me/${leadDetails.phone.replace(/[^0-9]/g, '')}` : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-opacity"
              style={{
                background: leadDetails.phone ? 'rgba(37,211,102,0.12)' : 'var(--bg-tertiary)',
                color: leadDetails.phone ? '#25D366' : 'var(--text-muted)',
                opacity: leadDetails.phone ? 1 : 0.4,
                pointerEvents: leadDetails.phone ? 'auto' : 'none',
              }}
            >
              <FaWhatsapp size={14} /> WhatsApp
            </a>
            <a
              href={leadDetails.email ? `mailto:${leadDetails.email}` : undefined}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium transition-opacity"
              style={{
                background: leadDetails.email ? 'rgba(168,85,247,0.12)' : 'var(--bg-tertiary)',
                color: leadDetails.email ? '#a855f7' : 'var(--text-muted)',
                opacity: leadDetails.email ? 1 : 0.4,
                pointerEvents: leadDetails.email ? 'auto' : 'none',
              }}
            >
              <MdEmail size={14} /> Email
            </a>
          </div>

          {/* 4. Business Info - label: value pairs */}
          {(() => {
            const ctx = leadDetails.unified_context?.bcon || leadDetails.unified_context?.windchasers || {}
            const fields: { label: string; value: string | undefined }[] = [
              { label: 'Business Type', value: ctx.type || ctx.business_type },
              { label: 'Urgency', value: ctx.urgency || ctx.timeline },
              { label: 'Volume', value: ctx.volume || ctx.team_size || ctx.scale },
              { label: 'Website', value: ctx.website || ctx.url },
              { label: 'AI Systems', value: ctx.ai_systems || ctx.current_tools || ctx.existing_ai },
            ].filter(f => f.value)
            if (fields.length === 0) return null
            return (
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Business Info</p>
                <div className="space-y-1.5">
                  {fields.map(f => (
                    <div key={f.label} className="flex justify-between items-baseline gap-2">
                      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{f.label}</span>
                      <span className="text-[11px] text-right truncate" style={{ color: 'var(--text-secondary)' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* 5. Upcoming Events */}
          {(() => {
            const bd = leadDetails.booking_date
              || leadDetails.unified_context?.web?.booking_date
              || leadDetails.unified_context?.whatsapp?.booking_date
            const bt = leadDetails.booking_time
              || leadDetails.unified_context?.web?.booking_time
              || leadDetails.unified_context?.whatsapp?.booking_time
            const ml = leadDetails.unified_context?.web?.booking_meet_link
              || leadDetails.unified_context?.whatsapp?.booking_meet_link
            // Filter: only show if booking date is today or in the future
            const today = new Date().toISOString().split('T')[0]
            const isUpcoming = bd && bd >= today
            return (
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Upcoming Events</p>
                {isUpcoming ? (
                  <div className="rounded-lg p-2.5" style={{ background: 'var(--bg-secondary)', borderLeft: '3px solid #22c55e' }}>
                    <div className="flex items-center gap-1.5">
                      <MdEvent size={14} style={{ color: '#22c55e' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {new Date(bd).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    {bt && (
                      <p className="text-[11px] mt-1 pl-5" style={{ color: 'var(--text-secondary)' }}>
                        {(() => {
                          const tp = bt.toString().split(':')
                          if (tp.length < 2) return bt
                          const h = parseInt(tp[0], 10), m = parseInt(tp[1], 10)
                          if (isNaN(h) || isNaN(m)) return bt
                          return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
                        })()}
                      </p>
                    )}
                    {ml && (
                      <a href={ml} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] mt-1.5 pl-5 inline-block hover:underline" style={{ color: 'var(--accent-primary)' }}>
                        Join Meeting →
                      </a>
                    )}
                  </div>
                ) : bd ? (
                  <div className="rounded-lg p-2.5" style={{ background: 'var(--bg-secondary)', borderLeft: '3px solid var(--text-muted)', opacity: 0.6 }}>
                    <div className="flex items-center gap-1.5">
                      <MdEvent size={14} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                        {new Date(bd).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} (past)
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No upcoming events</p>
                )}
              </div>
            )
          })()}

          {/* 6. View Full Details - prominent button */}
          <div className="px-4 py-3 mt-auto">
            <button
              onClick={() => openLeadModal(selectedLeadId)}
              className="w-full text-xs font-semibold py-2.5 rounded-lg transition-opacity flex items-center justify-center gap-1.5 hover:opacity-90"
              style={{ background: 'var(--button-bg, #fff)', color: 'var(--text-button, #000)' }}
            >
              <MdOpenInNew size={14} /> View Full Details
            </button>
          </div>
          </>
          )}
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
