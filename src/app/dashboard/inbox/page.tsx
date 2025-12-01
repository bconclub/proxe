'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
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

const ALL_CHANNELS = ['web', 'whatsapp', 'voice', 'social'];

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
    fetchConversations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelFilter])

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
    if (selectedLeadId && selectedChannel) {
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
        { event: 'INSERT', schema: 'public', table: 'messages' },
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
      // Fetch all messages ordered by most recent
      let query = supabase
        .from('messages')
        .select('lead_id, channel, content, sender, created_at')
        .order('created_at', { ascending: false })

      // Apply channel filter if not "all"
      if (channelFilter !== 'all') {
        query = query.eq('channel', channelFilter)
      }

      const { data: messagesData, error: messagesError } = await query

      if (messagesError) {
        console.error('Error fetching messages:', messagesError)
        setLoading(false)
        return
      }

      if (!messagesData || messagesData.length === 0) {
        console.log('No messages found')
        setConversations([])
        setLoading(false)
        return
      }

      console.log('Fetched messages:', messagesData.length)

      // Group by lead_id and collect ALL channels per lead
      const conversationMap = new Map<string, any>()
      
      for (const msg of messagesData) {
        if (!msg.lead_id) continue;
        
        if (!conversationMap.has(msg.lead_id)) {
          conversationMap.set(msg.lead_id, {
            lead_id: msg.lead_id,
            channels: new Set([msg.channel]),
            last_message: msg.content || '(No content)',
            last_message_at: msg.created_at,
            message_count: 1
          });
        } else {
          const conv = conversationMap.get(msg.lead_id);
          conv.channels.add(msg.channel);
          conv.message_count++;
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

      console.log('Looking up lead IDs:', leadIds)

      const { data: leadsData, error: leadsError } = await supabase
        .from('all_leads')
        .select('id, customer_name, email, phone')
        .in('id', leadIds)

      if (leadsError) {
        console.error('Error fetching leads:', leadsError)
      }

      console.log('Leads data returned:', leadsData)

      // Build final conversations array
      const conversationsArray: Conversation[] = []

      for (const [leadId, convData] of conversationMap) {
        // Find matching lead - ensure we're comparing strings
        const lead = leadsData?.find((l: any) => String(l.id) === String(leadId))
        
        console.log(`Lead ${leadId}:`, lead ? `Found - ${lead.customer_name}` : 'Not found')
        
        conversationsArray.push({
          lead_id: leadId,
          lead_name: lead?.customer_name || 'Unknown',
          lead_email: lead?.email || '',
          lead_phone: lead?.phone || '',
          channels: Array.from(convData.channels), // Convert Set to Array
          last_message: convData.last_message,
          last_message_at: convData.last_message_at,
          unread_count: 0
        })
      }

      // Sort by most recent message first
      conversationsArray.sort((a, b) =>
        new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      )

      console.log('Final conversations:', conversationsArray)
      setConversations(conversationsArray)

    } catch (err) {
      console.error('Error in fetchConversations:', err)
    }
    setLoading(false)
  }

  async function fetchMessages(leadId: string) {
    setMessagesLoading(true)
    try {
      let query = supabase
        .from('messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
      
      // Filter by selected channel if one is selected
      if (selectedChannel) {
        query = query.eq('channel', selectedChannel)
      }

      const { data, error } = await query

      if (error) throw error
      setMessages(data || [])
    } catch (err) {
      console.error('Error fetching messages:', err)
      setMessages([])
    }
    setMessagesLoading(false)
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
      
      // Fetch booking data from web_sessions (most recent booking)
      const { data: webSession } = await supabase
        .from('web_sessions')
        .select('booking_date, booking_time, booking_status')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Also check unified_context for booking data
      const bookingFromContext = lead.unified_context?.web?.booking_date || lead.unified_context?.whatsapp?.booking_date;
      const bookingTimeFromContext = lead.unified_context?.web?.booking_time || lead.unified_context?.whatsapp?.booking_time;
      
      // Convert booking_time to string if it's a Time object
      let bookingTime = null;
      if (webSession?.booking_time) {
        bookingTime = typeof webSession.booking_time === 'string' 
          ? webSession.booking_time 
          : String(webSession.booking_time);
      } else if (bookingTimeFromContext) {
        bookingTime = typeof bookingTimeFromContext === 'string'
          ? bookingTimeFromContext
          : String(bookingTimeFromContext);
      }
      
      // Transform to match the Lead interface expected by LeadDetailsModal
      const leadData = {
        id: lead.id,
        name: lead.customer_name || 'Unknown',
        email: lead.email || '',
        phone: lead.phone || '',
        source: lead.first_touchpoint || lead.last_touchpoint || 'web',
        first_touchpoint: lead.first_touchpoint || null,
        last_touchpoint: lead.last_touchpoint || null,
        timestamp: lead.created_at || lead.timestamp,
        status: lead.status || webSession?.booking_status || 'New Lead',
        booking_date: webSession?.booking_date || bookingFromContext || null,
        booking_time: bookingTime,
        unified_context: lead.unified_context || null,
        metadata: lead.metadata || {}
      };
      
      console.log('Lead modal data:', {
        booking_date: leadData.booking_date,
        booking_time: leadData.booking_time,
        webSession,
        unified_context: lead.unified_context
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
    
    try {
      // Build conversation text from messages
      const conversationText = messages
        .map(msg => `${msg.sender === 'customer' ? selectedConversation?.lead_name || 'Customer' : 'PROXe'}: ${msg.content}`)
        .join('\n');
      
      // Call Claude API to summarize (you can create a new API route or use existing)
      const response = await fetch('/api/dashboard/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: conversationText,
          leadName: selectedConversation?.lead_name || 'Customer'
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
  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      conv.lead_name?.toLowerCase().includes(query) ||
      conv.lead_phone?.includes(query) ||
      conv.last_message?.toLowerCase().includes(query)
    )
  })

  const selectedConversation = conversations.find(c => c.lead_id === selectedLeadId)

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
          <h1 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Inbox
          </h1>
          
          {/* Search */}
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-tertiary)' }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>
              <MdSearch size={20} />
            </span>
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none flex-1 text-sm"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          {/* Channel Filter */}
          <div className="flex gap-2 mt-3">
            {['all', 'web', 'whatsapp', 'voice', 'social'].map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  background: channelFilter === ch ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                  color: channelFilter === ch ? 'white' : 'var(--text-secondary)'
                }}
              >
                {ch === 'all' ? 'All' : ch.charAt(0).toUpperCase() + ch.slice(1)}
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
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center" style={{ color: 'var(--text-secondary)' }}>
              No conversations yet
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.lead_id}
                onClick={() => {
                  setSelectedLeadId(conv.lead_id);
                  setSelectedChannel(conv.channels[0] || 'whatsapp'); // Default to first channel
                }}
                className="p-4 cursor-pointer border-b transition-colors"
                style={{
                  background: selectedLeadId === conv.lead_id ? 'var(--bg-tertiary)' : 'transparent',
                  borderColor: 'var(--border-primary)'
                }}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                      {conv.lead_name || conv.lead_phone || 'Unknown'}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {timeAgo(conv.last_message_at)}
                  </span>
                </div>
                
                {/* Channel icons row */}
                <div className="flex items-center gap-1 mb-2">
                  {ALL_CHANNELS.map((ch) => (
                    <ChannelIcon 
                      key={ch} 
                      channel={ch} 
                      size={14} 
                      active={conv.channels.includes(ch)} 
                    />
                  ))}
                </div>
                
                <p 
                  className="text-sm truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {conv.last_message}
                </p>
              </div>
            ))
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
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                      className="max-w-[70%] rounded-lg px-4 py-2"
                      style={{
                        background: msg.sender === 'customer' ? 'var(--bg-tertiary)' : 'var(--accent-primary)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      {/* Message header - show sender name and channel */}
                      <div className="flex items-center gap-2 mb-1">
                        <ChannelIcon channel={msg.channel} size={12} active={true} />
                        <span className="text-xs font-medium" style={{ color: msg.sender === 'customer' ? 'var(--text-secondary)' : 'rgba(255,255,255,0.8)' }}>
                          {msg.sender === 'customer' ? selectedConversation?.lead_name || 'Customer' : 'PROXe'}
                        </span>
                      </div>
                      
                      <p className="text-sm">{msg.content}</p>
                      
                      <p 
                        className="text-xs mt-1 text-right"
                        style={{ color: msg.sender === 'customer' ? 'var(--text-muted)' : 'rgba(255,255,255,0.7)' }}
                      >
                        {formatTime(msg.created_at)}
                      </p>
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
