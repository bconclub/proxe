'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import {
  MdInbox,
  MdSend,
  MdSearch,
  MdAutoAwesome
} from 'react-icons/md'
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
      return <img src="/ai-voice-stroke-rounded.svg" alt="Voice" width={size} height={size} style={style} title="Voice" />;
    case 'social':
      return <img src="/video-ai-stroke-rounded.svg" alt="Social" width={size} height={size} style={style} title="Social" />;
    default:
      return null;
  }
};

const ALL_CHANNELS = ['web', 'whatsapp'];

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

  // Debug: Log when conversations state changes
  useEffect(() => {
    console.log('Conversations state changed:', {
      count: conversations.length,
      conversations: conversations.map(c => ({
        id: c.lead_id,
        name: c.lead_name,
        message: c.last_message?.substring(0, 30)
      }))
    })
  }, [conversations])

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
          .select('id, customer_name, email, phone, last_interaction_at, first_touchpoint, last_touchpoint')
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

            return {
              lead_id: lead.id,
              lead_name: lead.customer_name || 'Unknown',
              lead_email: lead.email || '',
              lead_phone: lead.phone || '',
              channels: channels.length > 0 ? channels : ['web'],
              last_message: 'No messages yet',
              last_message_at: lead.last_interaction_at ? new Date(lead.last_interaction_at).toISOString() : new Date().toISOString(),
              unread_count: 0
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
        .select('id, customer_name, email, phone')
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

        const conversation: Conversation = {
          lead_id: leadId,
          lead_name: lead?.customer_name || 'Unknown',
          lead_email: lead?.email || '',
          lead_phone: lead?.phone || '',
          channels: Array.from(convData.channels),
          last_message: cleanedLastMessage,
          last_message_at: convData.last_message_at,
          unread_count: 0
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
    try {
      console.log('Fetching messages for lead:', leadId, 'channel:', selectedChannel)

      // First, try to fetch messages for the selected channel if one is set
      if (selectedChannel) {
        const { data: channelData, error: channelError } = await supabase
          .from('conversations')
          .select('*')
          .eq('lead_id', leadId)
          .eq('channel', selectedChannel)
          .order('created_at', { ascending: true })

        if (channelError) {
          console.error('Error fetching messages by channel:', channelError)
        } else if (channelData && channelData.length > 0) {
          console.log('Fetched messages for channel:', selectedChannel, 'count:', channelData.length)
          setMessages(channelData)
          setMessagesLoading(false)
          return
        }
      }

      // Fallback: Fetch all conversations for this lead (regardless of channel)
      console.log('Fetching all conversations for lead (no channel filter)')
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
        name: typedLead.customer_name || 'Unknown',
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

  // Render the inbox UI
  return (
    <div className="h-[calc(100vh-32px)] flex relative" style={{ background: 'var(--bg-primary)' }}>
      {/* Loading Overlay */}
      <LoadingOverlay
        isLoading={loading || messagesLoading}
        message={loading ? "Loading conversations..." : "Loading messages..."}
      />

      {/* Left Panel - Conversations List */}
      <div
        className="w-[350px] flex flex-col border-r"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-primary)'
        }}
      >
        {/* Header */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
          <h1 className="text-2xl font-black tracking-tight font-zen-dots mb-3" style={{ color: 'var(--accent-primary)' }}>
            INBOX
          </h1>

          {/* Search */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-transparent transition-all focus-within:border-amber-500/50 mb-4"
            style={{ background: 'var(--bg-tertiary)' }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>
              <MdSearch size={18} />
            </span>
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none flex-1 text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          {/* Channel Filter */}
          <div className="flex flex-wrap gap-2">
            {['all', 'web', 'whatsapp'].map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border`}
                style={{
                  background: channelFilter === ch ? 'var(--accent-primary)' : 'transparent',
                  borderColor: channelFilter === ch ? 'var(--accent-primary)' : 'var(--border-primary)',
                  color: channelFilter === ch ? 'white' : 'var(--text-secondary)',
                  boxShadow: channelFilter === ch ? '0 4px 14px 0 rgba(0,0,0,0.1)' : 'none'
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
            <div className="p-4 text-center" style={{ color: 'var(--text-secondary)' }}>
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center space-y-2">
              <p style={{ color: 'var(--text-secondary)' }}>
                No conversations found
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Messages will appear here once conversations start
              </p>
              <button
                onClick={() => fetchConversations()}
                className="mt-2 px-3 py-1.5 text-xs rounded-md"
                style={{
                  background: 'var(--accent-primary)',
                  color: 'white'
                }}
              >
                Refresh
              </button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center space-y-2">
              <p style={{ color: 'var(--text-secondary)' }}>
                No conversations match your search
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Try adjusting your search query
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedLeadId === conv.lead_id;
              const initials = (conv.lead_name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

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
                  className={`p-4 cursor-pointer transition-all duration-300 relative border-b ${isSelected ? '' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
                  style={{
                    borderColor: 'var(--border-primary)',
                    background: isSelected ? 'var(--accent-subtle)' : 'transparent'
                  }}
                >
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: 'var(--accent-primary)' }} />
                  )}

                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-transform duration-300 ${isSelected ? 'scale-110' : 'scale-100'
                        }`}
                      style={{
                        background: isSelected ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                        color: isSelected ? 'white' : 'var(--text-secondary)',
                      }}
                    >
                      {initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-[13px] font-bold truncate ${isSelected ? '' : 'text-gray-900 dark:text-gray-100'}`} style={{ color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                          {conv.lead_name || conv.lead_phone || 'Unknown'}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-0.5">
                            {['web', 'whatsapp', 'voice', 'social'].map((ch) => (
                              conv.channels.includes(ch) && (
                                <div key={ch} className="opacity-80">
                                  <ChannelIcon channel={ch} size={12} active={true} />
                                </div>
                              )
                            ))}
                          </div>
                          <span className="text-[10px] font-medium opacity-60 whitespace-nowrap">
                            {timeAgo(conv.last_message_at)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <p className="text-[12px] truncate opacity-60 flex-1">
                          {conv.last_message}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Right Panel - Messages */}
      <div className="flex-1 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
        {!selectedLeadId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4" style={{ color: 'var(--text-secondary)' }}>
                <MdInbox size={64} />
              </div>
              <p style={{ color: 'var(--text-secondary)' }}>Select a conversation to view messages</p>
            </div>
          </div>
        ) : (
          <>
            {/* Conversation Header with Channel Tabs */}
            <div
              className="border-b"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              {/* Lead Info - Clickable name */}
              <div className="p-4 flex items-center justify-between">
                <div>
                  <h2
                    className="font-semibold cursor-pointer hover:underline"
                    style={{ color: 'var(--accent-primary)' }}
                    onClick={() => openLeadModal(selectedLeadId!)}
                    title="Click to view lead details"
                  >
                    {selectedConversation?.lead_name || 'Unknown'}
                  </h2>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {selectedConversation?.lead_phone}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* AI Summary Button */}
                  <button
                    onClick={summarizeConversation}
                    disabled={summaryLoading || messages.length === 0}
                    className="p-2 rounded-md transition-colors flex items-center gap-1"
                    style={{
                      background: showSummary ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: showSummary ? 'white' : 'var(--text-secondary)',
                      opacity: messages.length === 0 ? 0.5 : 1
                    }}
                    title="Generate AI Summary"
                  >
                    <MdAutoAwesome size={18} className={summaryLoading ? 'animate-spin' : ''} />
                  </button>

                  {/* View Details Button */}
                  <button
                    onClick={() => openLeadModal(selectedLeadId!)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    View Details
                  </button>
                </div>
              </div>

              {/* Channel Tabs - Only show channels this customer has used */}
              <div className="flex items-center gap-1 px-4 pb-3">
                {selectedConversation?.channels.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setSelectedChannel(ch)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2"
                    style={{
                      background: selectedChannel === ch ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: selectedChannel === ch ? 'white' : 'var(--text-secondary)'
                    }}
                  >
                    <ChannelIcon channel={ch} size={14} active={true} />
                    <span className="capitalize">{ch}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* AI Summary Panel */}
            {showSummary && (
              <div
                className="mx-4 mb-4 p-4 rounded-lg border"
                style={{
                  background: 'var(--bg-tertiary)',
                  borderColor: 'var(--accent-primary)',
                  borderWidth: '1px'
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MdAutoAwesome size={16} style={{ color: 'var(--accent-primary)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      AI Summary
                    </span>
                  </div>
                  <button
                    onClick={() => setShowSummary(false)}
                    className="text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    ✕ Close
                  </button>
                </div>

                {summaryLoading ? (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Generating summary...
                  </p>
                ) : (
                  <div
                    className="text-sm whitespace-pre-wrap"
                    style={{
                      color: 'var(--text-secondary)',
                      lineHeight: '1.6'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: conversationSummary
                        ?.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-primary); font-weight: 600;">$1</strong>')
                        .replace(/\n/g, '<br />') || ''
                    }}
                  />
                )}
              </div>
            )}

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto p-6 space-y-6 relative"
              style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, var(--bg-tertiary) 1px, transparent 0)',
                backgroundSize: '24px 24px'
              }}
            >
              {messagesLoading ? (
                <div className="text-center" style={{ color: 'var(--text-secondary)' }}>
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center" style={{ color: 'var(--text-secondary)' }}>
                  No messages yet
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'customer' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${msg.sender === 'customer'
                        ? 'bg-white dark:bg-[#2A1F1A] border-gray-200 dark:border-[#3A2F2A]'
                        : ''
                        }`}
                      style={{
                        position: 'relative',
                        background: msg.sender === 'agent' || msg.sender === 'system' ? 'var(--accent-subtle)' : undefined,
                        borderColor: msg.sender === 'agent' || msg.sender === 'system' ? 'var(--accent-primary)' : undefined,
                        borderWidth: '1px'
                      }}
                    >
                      {/* Message header - show sender name and channel */}
                      <div className="flex items-center justify-between gap-4 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <ChannelIcon channel={msg.channel} size={10} active={true} />
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider"
                            style={{
                              color: msg.sender === 'customer' ? 'var(--text-secondary)' : 'var(--accent-primary)'
                            }}
                          >
                            {msg.sender === 'customer' ? selectedConversation?.lead_name || 'Customer' : 'PROXe AI'}
                          </span>
                        </div>
                        <span
                          className="text-[9px] font-medium"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {formatTime(msg.created_at)}
                        </span>
                      </div>

                      <div
                        className="text-sm leading-relaxed"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {renderMarkdown(msg.content)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Message Input (Read-only for now) */}
            <div
              className="p-4 border-t"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-lg"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                <input
                  type="text"
                  placeholder="Reply feature coming soon..."
                  disabled
                  className="bg-transparent border-none outline-none flex-1 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                />
                <button
                  disabled
                  className="p-2 rounded-lg opacity-50"
                  style={{ background: 'var(--accent-primary)' }}
                >
                  <MdSend size={20} color="white" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

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
