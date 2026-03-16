import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, Send, Plus, Search, X, Users, Phone,
  ChevronLeft, Clock, CheckCheck, AlertCircle, RefreshCw,
  Briefcase, MessageCircle, Mail, Loader2, Hash, Info
} from 'lucide-react';

interface Participant {
  contact_id: string | null;
  name: string;
  phone: string;
}

interface Conversation {
  id: string;
  name: string;
  deal_id: string | null;
  type: 'direct' | 'broadcast' | 'group';
  channel: 'sms' | 'email' | 'whatsapp';
  participants: Participant[];
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  deals?: { property_address: string; city: string; state: string; pipeline_stage: string } | null;
}

interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  channel: 'sms' | 'email' | 'whatsapp';
  body: string;
  status: string;
  from_number: string | null;
  to_number: string | null;
  sent_at: string;
  auto_created_task_id: string | null;
  contacts?: { first_name: string; last_name: string; phone: string; role: string } | null;
}

interface DBContact {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  role: string;
  company: string | null;
}

interface Deal {
  id: string;
  property_address: string;
  city: string;
  state: string;
}

interface InboxProps {
  onSelectDeal?: (id: string) => void;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ChannelBadge({ channel }: { channel: 'sms' | 'email' | 'whatsapp' }) {
  if (channel === 'whatsapp') return (
    <span className="badge badge-xs text-white font-bold" style={{ backgroundColor: '#25D366' }}>WA</span>
  );
  if (channel === 'sms') return <span className="badge badge-xs badge-info">SMS</span>;
  return <span className="badge badge-xs badge-success">EMAIL</span>;
}

function ChannelAvatar({ channel, name }: { channel: 'sms' | 'email' | 'whatsapp'; name: string }) {
  const letter = name.charAt(0).toUpperCase();
  if (channel === 'whatsapp') return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-none text-sm font-bold text-white" style={{ backgroundColor: '#25D366' }}>
      {letter}
    </div>
  );
  if (channel === 'sms') return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-none text-sm font-bold bg-blue-100 text-blue-600">{letter}</div>
  );
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-none text-sm font-bold bg-green-100 text-green-600">{letter}</div>
  );
}

export const Inbox: React.FC<InboxProps> = ({ onSelectDeal }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<'all' | 'sms' | 'whatsapp' | 'email'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<NodeJS.Timeout>();

  // Compose modal state
  const [composeContacts, setComposeContacts] = useState<DBContact[]>([]);
  const [composeDeals, setComposeDeals] = useState<Deal[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<DBContact[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [composeBody, setComposeBody] = useState('');
  const [composeChannel, setComposeChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [groupType, setGroupType] = useState<'direct' | 'broadcast' | 'group'>('direct');
  const [contactSearch, setContactSearch] = useState('');
  const [composeSending, setComposeSending] = useState(false);
  const [composeError, setComposeError] = useState('');
  const [showWaSandboxInfo, setShowWaSandboxInfo] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const resp = await fetch('/api/sms/conversations');
      if (resp.ok) {
        const data = await resp.json();
        setConversations(data.conversations || []);
      }
    } catch (e) {
      console.error('Failed to load conversations:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
    refreshRef.current = setInterval(loadConversations, 30000);
    return () => clearInterval(refreshRef.current);
  }, [loadConversations]);

  const loadMessages = useCallback(async (convId: string) => {
    setMsgLoading(true);
    try {
      const resp = await fetch(`/api/sms/conversations?conversation_id=${convId}`);
      if (resp.ok) {
        const data = await resp.json();
        setMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Failed to load messages:', e);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConv) {
      loadMessages(selectedConv.id);
      setConversations(prev => prev.map(c =>
        c.id === selectedConv.id ? { ...c, unread_count: 0 } : c
      ));
    }
  }, [selectedConv, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectConv = (conv: Conversation) => {
    setSelectedConv(conv);
    setMobileShowThread(true);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConv || sending) return;
    setSending(true);
    try {
      const resp = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selectedConv.id,
          deal_id: selectedConv.deal_id,
          recipients: selectedConv.participants,
          body: replyText,
          type: selectedConv.type,
          channel: selectedConv.channel,
        }),
      });
      if (resp.ok) {
        setReplyText('');
        await loadMessages(selectedConv.id);
        await loadConversations();
      }
    } catch (e) {
      console.error('Send failed:', e);
    } finally {
      setSending(false);
    }
  };

  const loadComposeData = async () => {
    try {
      const sbUrl = import.meta.env.VITE_SUPABASE_URL;
      const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const [cResp, dResp] = await Promise.all([
        fetch(`${sbUrl}/rest/v1/contacts?select=id,first_name,last_name,phone,email,role,company&phone=not.is.null&order=first_name`, {
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
        }),
        fetch(`${sbUrl}/rest/v1/deals?select=id,property_address,city,state&status=eq.active&order=property_address`, {
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
        }),
      ]);
      if (cResp.ok) setComposeContacts(await cResp.json());
      if (dResp.ok) setComposeDeals(await dResp.json());
    } catch (e) {
      console.error('Failed to load compose data:', e);
    }
  };

  const openCompose = () => {
    setShowCompose(true);
    setSelectedRecipients([]);
    setSelectedDeal(null);
    setComposeBody('');
    setComposeChannel('sms');
    setGroupType('direct');
    setContactSearch('');
    setComposeError('');
    setShowWaSandboxInfo(false);
    loadComposeData();
  };

  const handleComposeSend = async () => {
    if (!selectedRecipients.length || !composeBody.trim()) {
      setComposeError('Please select at least one recipient and enter a message.');
      return;
    }
    setComposeSending(true);
    setComposeError('');
    try {
      const resp = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal_id: selectedDeal?.id || null,
          recipients: selectedRecipients.map(c => ({
            contact_id: c.id,
            name: `${c.first_name} ${c.last_name}`,
            phone: c.phone!,
          })),
          body: composeBody,
          type: selectedRecipients.length === 1 ? 'direct' : groupType,
          channel: composeChannel,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setShowCompose(false);
        await loadConversations();
        const newConv = conversations.find(c => c.id === data.conversation_id);
        if (newConv) setSelectedConv(newConv);
      } else {
        const err = await resp.json();
        setComposeError(err.error || 'Failed to send message');
      }
    } catch (e: any) {
      setComposeError(e.message || 'Failed to send');
    } finally {
      setComposeSending(false);
    }
  };

  const filtered = conversations.filter(c => {
    if (tab !== 'all' && c.channel !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.last_message_preview?.toLowerCase().includes(q) ||
      c.deals?.property_address?.toLowerCase().includes(q)
    );
  });

  const totalUnread = conversations.reduce((a, c) => a + (c.unread_count || 0), 0);
  const waCount = conversations.filter(c => c.channel === 'whatsapp' && c.unread_count > 0).length;

  const filteredContacts = composeContacts.filter(c => {
    if (!contactSearch) return true;
    const q = contactSearch.toLowerCase();
    return `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) || c.role.toLowerCase().includes(q);
  });

  const typeIcon = (type: string) => {
    if (type === 'group') return <Hash size={11} />;
    if (type === 'broadcast') return <Users size={11} />;
    return null;
  };

  // ── Conversation List Panel ──────────────────────────────────────────────────
  const ConversationList = (
    <div className={`flex flex-col h-full border-r border-base-300 bg-base-100 ${mobileShowThread ? 'hidden md:flex' : 'flex'} md:w-80 w-full flex-none`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-base-300 bg-base-200">
        <MessageSquare size={18} className="text-primary flex-none" />
        <span className="font-bold text-sm flex-1">Inbox</span>
        {totalUnread > 0 && (
          <span className="badge badge-primary badge-sm">{totalUnread}</span>
        )}
        <button onClick={loadConversations} className="btn btn-ghost btn-xs btn-square" title="Refresh">
          <RefreshCw size={13} />
        </button>
        <button onClick={openCompose} className="btn btn-primary btn-xs gap-1 rounded-lg">
          <Plus size={13} /> New
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-base-300 bg-base-200 px-2 gap-1 py-1.5 overflow-x-auto">
        {(['all', 'sms', 'whatsapp', 'email'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${tab === t ? 'bg-primary text-white' : 'text-base-content/60 hover:bg-base-300'}`}
          >
            {t === 'all' ? 'All' : t === 'sms' ? '📱 SMS' : t === 'whatsapp' ? '💬 WhatsApp' : '✉️ Email'}
            {t === 'whatsapp' && waCount > 0 && (
              <span className="ml-1 bg-green-500 text-white text-[9px] font-bold rounded-full px-1">{waCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-base-300">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            className="input input-bordered input-xs w-full pl-7 bg-base-100 text-sm"
            placeholder="Search conversations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-base-content/40">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-base-content/30 px-4 text-center">
            <MessageCircle size={32} />
            <div>
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="text-xs mt-1">Click "New" to send your first message</p>
            </div>
          </div>
        ) : (
          filtered.map(conv => {
            const active = selectedConv?.id === conv.id;
            return (
              <button
                key={conv.id}
                onClick={() => handleSelectConv(conv)}
                className={`w-full text-left px-4 py-3 border-b border-base-200 transition-colors hover:bg-base-50 ${active ? 'bg-primary/8 border-l-2 border-l-primary' : ''}`}
              >
                <div className="flex items-start gap-2.5">
                  <ChannelAvatar channel={conv.channel} name={conv.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className={`text-sm font-semibold truncate flex-1 ${conv.unread_count > 0 ? 'text-base-content' : 'text-base-content/80'}`}>
                        {conv.name}
                      </span>
                      {typeIcon(conv.type)}
                      <ChannelBadge channel={conv.channel} />
                      {conv.unread_count > 0 && (
                        <span className="bg-primary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center flex-none">
                          {conv.unread_count > 9 ? '9+' : conv.unread_count}
                        </span>
                      )}
                    </div>
                    {conv.deals && (
                      <div className="flex items-center gap-1 mb-0.5">
                        <Briefcase size={10} className="text-base-content/40 flex-none" />
                        <span className="text-[10px] text-base-content/50 truncate">
                          {conv.deals.property_address}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs truncate ${conv.unread_count > 0 ? 'text-base-content/70 font-medium' : 'text-base-content/45'}`}>
                        {conv.last_message_preview || 'No messages yet'}
                      </span>
                      {conv.last_message_at && (
                        <span className="text-[10px] text-base-content/35 flex-none">
                          {timeAgo(conv.last_message_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  // ── Thread Panel ─────────────────────────────────────────────────────────────
  const ThreadPanel = (
    <div className={`flex flex-col flex-1 min-w-0 h-full bg-base-100 ${!mobileShowThread && !selectedConv ? 'hidden md:flex' : 'flex'}`}>
      {!selectedConv ? (
        <div className="flex flex-col items-center justify-center h-full text-base-content/25 gap-4">
          <MessageSquare size={48} />
          <div className="text-center">
            <p className="font-medium text-base-content/40">Select a conversation</p>
            <p className="text-sm mt-1">or click New to start one</p>
          </div>
        </div>
      ) : (
        <>
          {/* Thread Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-base-300 bg-base-200">
            <button className="md:hidden btn btn-ghost btn-xs btn-square" onClick={() => setMobileShowThread(false)}>
              <ChevronLeft size={16} />
            </button>
            <ChannelAvatar channel={selectedConv.channel} name={selectedConv.name} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{selectedConv.name}</span>
                <ChannelBadge channel={selectedConv.channel} />
                {selectedConv.type !== 'direct' && (
                  <span className="badge badge-xs badge-ghost">{selectedConv.type}</span>
                )}
              </div>
              {selectedConv.deals && (
                <button
                  onClick={() => onSelectDeal?.(selectedConv.deal_id!)}
                  className="text-[11px] text-primary hover:underline text-left"
                >
                  📍 {selectedConv.deals.property_address}, {selectedConv.deals.city}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {selectedConv.participants.map((p, i) => (
                <div key={i} title={p.name} className="w-7 h-7 bg-base-300 rounded-full flex items-center justify-center text-[10px] font-bold text-base-content/60">
                  {p.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgLoading ? (
              <div className="flex items-center justify-center h-20 gap-2 text-base-content/40">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Loading messages...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-24 text-base-content/30 gap-2">
                <MessageCircle size={24} />
                <p className="text-sm">No messages yet. Send the first one!</p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isOut = msg.direction === 'outbound';
                const prevMsg = idx > 0 ? messages[idx - 1] : null;
                const showDate = !prevMsg || new Date(msg.sent_at).toDateString() !== new Date(prevMsg.sent_at).toDateString();
                return (
                  <React.Fragment key={msg.id}>
                    {showDate && (
                      <div className="flex items-center justify-center my-3">
                        <span className="text-[10px] bg-base-200 text-base-content/40 px-3 py-1 rounded-full">
                          {new Date(msg.sent_at).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] ${isOut ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isOut
                            ? selectedConv.channel === 'whatsapp'
                              ? 'text-white rounded-br-sm'
                              : 'bg-primary text-primary-content rounded-br-sm'
                            : 'bg-base-200 text-base-content rounded-bl-sm'
                        }`}
                        style={isOut && selectedConv.channel === 'whatsapp' ? { backgroundColor: '#25D366' } : undefined}
                        >
                          {msg.body}
                        </div>
                        <div className={`flex items-center gap-1.5 px-1 ${isOut ? 'flex-row-reverse' : 'flex-row'}`}>
                          <span className="text-[10px] text-base-content/35">{formatTime(msg.sent_at)}</span>
                          {isOut && (
                            <CheckCheck size={11} className={msg.status === 'delivered' ? 'text-primary' : 'text-base-content/30'} />
                          )}
                          {msg.auto_created_task_id && (
                            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">task created</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply Bar */}
          <div className="px-4 py-3 border-t border-base-300 bg-base-200">
            <div className="flex gap-2 items-end">
              <textarea
                className="textarea textarea-bordered flex-1 min-h-[44px] max-h-32 resize-none text-sm bg-base-100"
                placeholder={`Message ${selectedConv.name}...`}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); }
                }}
                rows={1}
              />
              <button
                onClick={handleSendReply}
                disabled={!replyText.trim() || sending}
                className="btn btn-sm px-3 self-end rounded-xl text-white"
                style={selectedConv.channel === 'whatsapp' ? { backgroundColor: '#25D366', borderColor: '#25D366' } : undefined}
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
            <p className="text-[10px] text-base-content/30 mt-1.5 text-center">
              {selectedConv.channel === 'whatsapp'
                ? '💬 Sending via WhatsApp'
                : selectedConv.channel === 'sms'
                ? '📱 Sending via SMS from (464) 733-3257'
                : '✉️ Email thread'}
              {selectedConv.type === 'broadcast' && ' · Broadcast (recipients can\'t see each other)'}
              {selectedConv.type === 'group' && ` · Group (${selectedConv.participants.length} participants)`}
            </p>
          </div>
        </>
      )}
    </div>
  );

  // ── Compose Modal ────────────────────────────────────────────────────────────
  const ComposeModal = showCompose && (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowCompose(false)} />
      <div className="relative z-10 bg-base-100 rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-lg md:w-full flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-base-300">
          <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center">
            <MessageSquare size={15} className="text-primary" />
          </div>
          <span className="font-bold flex-1">New Message</span>
          <button onClick={() => setShowCompose(false)} className="btn btn-ghost btn-xs btn-square">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Channel Toggle */}
          <div>
            <label className="text-xs font-semibold text-base-content/60 mb-2 block">SEND VIA</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setComposeChannel('sms'); setShowWaSandboxInfo(false); }}
                className={`p-3 rounded-xl border-2 text-left transition-all ${composeChannel === 'sms' ? 'border-blue-400 bg-blue-50' : 'border-base-300 hover:border-base-400'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">📱</span>
                  <div>
                    <div className="text-xs font-bold">SMS</div>
                    <div className="text-[10px] text-base-content/50">(464) 733-3257</div>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { setComposeChannel('whatsapp'); setShowWaSandboxInfo(true); }}
                className={`p-3 rounded-xl border-2 text-left transition-all ${composeChannel === 'whatsapp' ? 'border-green-400 bg-green-50' : 'border-base-300 hover:border-base-400'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">💬</span>
                  <div>
                    <div className="text-xs font-bold">WhatsApp</div>
                    <div className="text-[10px] text-base-content/50">Sandbox</div>
                  </div>
                </div>
              </button>
            </div>

            {/* WhatsApp Sandbox Instructions */}
            {showWaSandboxInfo && composeChannel === 'whatsapp' && (
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-xl text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-green-800">
                  <Info size={12} /> WhatsApp Sandbox — Recipient must opt in first
                </div>
                <p className="text-green-700">Ask them to text <strong>"join &lt;your-keyword&gt;"</strong> to <strong>+1 (415) 523-8886</strong></p>
                <p className="text-green-600 text-[10px]">Find your keyword at: twilio.com/console → Messaging → Try it out → WhatsApp</p>
              </div>
            )}
          </div>

          {/* Recipients */}
          <div>
            <label className="text-xs font-semibold text-base-content/60 mb-1.5 block">
              TO: RECIPIENTS {selectedRecipients.length > 0 && `(${selectedRecipients.length} selected)`}
            </label>
            {selectedRecipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedRecipients.map(c => (
                  <span key={c.id} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full font-medium">
                    {c.first_name} {c.last_name}
                    <button onClick={() => setSelectedRecipients(prev => prev.filter(r => r.id !== c.id))}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
              <input
                className="input input-bordered input-sm w-full pl-7 text-sm"
                placeholder="Search contacts with phone numbers..."
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
              />
            </div>
            {contactSearch && (
              <div className="mt-1.5 border border-base-300 rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-sm">
                {filteredContacts.slice(0, 8).map(c => {
                  const selected = selectedRecipients.some(r => r.id === c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        if (selected) {
                          setSelectedRecipients(prev => prev.filter(r => r.id !== c.id));
                        } else {
                          setSelectedRecipients(prev => [...prev, c]);
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-base-200 transition-colors border-b border-base-100 last:border-0 ${selected ? 'bg-primary/5' : ''}`}
                    >
                      <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-primary flex-none">
                        {c.first_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{c.first_name} {c.last_name}</div>
                        <div className="text-xs text-base-content/50">{c.role} · {c.phone}</div>
                      </div>
                      {selected && <CheckCheck size={14} className="text-primary flex-none" />}
                    </button>
                  );
                })}
                {filteredContacts.length === 0 && (
                  <div className="px-3 py-3 text-sm text-base-content/40 text-center">No contacts found</div>
                )}
              </div>
            )}
          </div>

          {/* Group type (only show if >1 recipient) */}
          {selectedRecipients.length > 1 && (
            <div>
              <label className="text-xs font-semibold text-base-content/60 mb-2 block">GROUP TYPE</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setGroupType('broadcast')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${groupType === 'broadcast' ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-base-400'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Users size={14} className={groupType === 'broadcast' ? 'text-primary' : 'text-base-content/50'} />
                    <span className="text-xs font-semibold">Broadcast</span>
                  </div>
                  <p className="text-[10px] text-base-content/50">Each person gets individual message. Replies only come to you.</p>
                </button>
                <button
                  onClick={() => setGroupType('group')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${groupType === 'group' ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-base-400'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Hash size={14} className={groupType === 'group' ? 'text-primary' : 'text-base-content/50'} />
                    <span className="text-xs font-semibold">Group Thread</span>
                  </div>
                  <p className="text-[10px] text-base-content/50">Everyone in one thread. All can see and reply to each other.</p>
                </button>
              </div>
            </div>
          )}

          {/* Link to Deal */}
          <div>
            <label className="text-xs font-semibold text-base-content/60 mb-1.5 block">LINK TO DEAL (OPTIONAL)</label>
            <select
              className="select select-bordered select-sm w-full text-sm"
              value={selectedDeal?.id || ''}
              onChange={e => {
                const d = composeDeals.find(x => x.id === e.target.value);
                setSelectedDeal(d || null);
              }}
            >
              <option value="">-- No deal --</option>
              {composeDeals.map(d => (
                <option key={d.id} value={d.id}>{d.property_address}, {d.city} {d.state}</option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="text-xs font-semibold text-base-content/60 mb-1.5 block">MESSAGE</label>
            <textarea
              className="textarea textarea-bordered w-full text-sm resize-none"
              rows={4}
              placeholder="Type your message..."
              value={composeBody}
              onChange={e => setComposeBody(e.target.value)}
            />
            <div className="flex justify-between items-center mt-1">
              <span className="text-[10px] text-base-content/35">
                {composeChannel === 'whatsapp' ? '💬 Sending via WhatsApp Sandbox' : '📱 Sending from (464) 733-3257'}
              </span>
              <span className={`text-[10px] ${composeBody.length > 160 ? 'text-warning' : 'text-base-content/35'}`}>
                {composeBody.length} chars {composeBody.length > 160 && composeChannel === 'sms' && '(2 SMS segments)'}
              </span>
            </div>
          </div>

          {composeError && (
            <div className="flex items-center gap-2 text-error text-xs bg-error/10 px-3 py-2.5 rounded-xl">
              <AlertCircle size={13} />
              {composeError}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-base-300 flex items-center justify-between gap-3">
          <button onClick={() => setShowCompose(false)} className="btn btn-ghost btn-sm">Cancel</button>
          <button
            onClick={handleComposeSend}
            disabled={!selectedRecipients.length || !composeBody.trim() || composeSending}
            className="btn btn-sm gap-2 rounded-xl text-white"
            style={composeChannel === 'whatsapp' ? { backgroundColor: '#25D366', borderColor: '#25D366' } : undefined}
          >
            {composeSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {composeSending ? 'Sending...' : `Send${selectedRecipients.length > 1 ? ` to ${selectedRecipients.length}` : ''} via ${composeChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-base-100">
      {ConversationList}
      {ThreadPanel}
      {ComposeModal}
    </div>
  );
};
