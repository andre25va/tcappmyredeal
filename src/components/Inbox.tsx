import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, Send, Plus, Search, X, Users,
  ChevronLeft, Clock, CheckCheck, AlertCircle, RefreshCw,
  Briefcase, MessageCircle, Mail, Loader2, Hash, Info,
  Reply, ReplyAll, Forward, ExternalLink, Inbox as InboxIcon, Paperclip, Zap
} from 'lucide-react';
import { CallButton } from './CallButton';

// ── Types ────────────────────────────────────────────────────────────────────

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
  waiting_for_reply?: boolean;
  waiting_since?: string | null;
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
  need_reply?: boolean;
  auto_created_task_id: string | null;
  contacts?: { first_name: string; last_name: string; phone: string; contact_type: string } | null;
}

interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  downloadUrl: string;
}

interface EmailThread {
  id: string;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  internalDate: string;
  messageCount: number;
  isUnread: boolean;
  hasAttachment?: boolean;
  labelIds: string[];
  waitingForReply?: boolean;
  priority?: boolean;
}

interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  internalDate: string;
  body: string;
  bodyHtml?: string;
  snippet: string;
  attachments?: EmailAttachment[];
}

interface DBContact {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  contact_type: string;
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
  onWaitingCountChange?: (count: number) => void;
  initialConversationId?: string;
  initialChannel?: 'sms' | 'email' | 'whatsapp';
  onInitHandled?: () => void;
  onCallStarted?: (callData: { contactName: string; contactPhone: string; callSid?: string; startedAt: string }) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function timeAgoMs(ms: string | number) {
  return timeAgo(new Date(Number(ms)).toISOString());
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatEmailDate(ms: string | number) {
  const d = new Date(Number(ms));
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.getFullYear() === today.getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
}

function parseFromName(from: string): string {
  const match = from.match(/^(.+?)\s*</);
  if (match) return match[1].trim().replace(/^"|"$/g, '');
  return from.replace(/<.*>/, '').trim() || from;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(contentType: string): string {
  if (contentType.includes('pdf')) return '📄';
  if (contentType.includes('image')) return '🖼️';
  if (contentType.includes('word') || contentType.includes('document')) return '📝';
  if (contentType.includes('sheet') || contentType.includes('excel') || contentType.includes('csv')) return '📊';
  if (contentType.includes('zip') || contentType.includes('compressed')) return '🗜️';
  return '📎';
}

function waitingDuration(since: string): string {
  const diff = Date.now() - new Date(since).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return 'just sent';
  if (hrs < 24) return `${hrs}h waiting`;
  const days = Math.floor(hrs / 24);
  return `${days}d waiting`;
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

// ── Attachment Chips ──────────────────────────────────────────────────────────

function AttachmentChips({ attachments, onPreviewPdf }: { 
  attachments: EmailAttachment[];
  onPreviewPdf?: (url: string, name: string) => void;
}) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-base-200 bg-base-50">
      <div className="w-full text-[10px] text-base-content/40 font-semibold uppercase tracking-wide mb-0.5">
        <Paperclip size={10} className="inline mr-1" />{attachments.length} attachment{attachments.length > 1 ? 's' : ''}
      </div>
      {attachments.map((att, i) => {
        const isPdf = att.contentType.includes('pdf');
        if (isPdf && onPreviewPdf) {
          return (
            <button
              key={i}
              onClick={() => onPreviewPdf(att.downloadUrl, att.filename)}
              className="flex items-center gap-2 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl px-3 py-2 transition-colors group"
              title={`Preview ${att.filename}`}
            >
              <span className="text-base">📄</span>
              <div className="min-w-0 text-left">
                <div className="text-xs font-medium text-base-content truncate max-w-[140px]">{att.filename}</div>
                <div className="text-[10px] text-red-400 font-medium">Click to preview</div>
              </div>
            </button>
          );
        }
        return (
          <a
            key={i}
            href={att.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-base-200 hover:bg-base-300 border border-base-300 rounded-xl px-3 py-2 transition-colors group"
            title={`Open ${att.filename} in new tab`}
          >
            <span className="text-base">{getFileIcon(att.contentType)}</span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-base-content truncate max-w-[140px]">{att.filename}</div>
              <div className="text-[10px] text-base-content/40">{formatFileSize(att.size)}</div>
            </div>
            <ExternalLink size={11} className="text-base-content/30 group-hover:text-primary flex-none" />
          </a>
        );
      })}
    </div>
  );
}

// ── Email Body Renderer ───────────────────────────────────────────────────────

function EmailBodyRenderer({ msg }: { msg: EmailMessage }) {
  const [showHtml, setShowHtml] = useState(true);
  const hasHtml = !!msg.bodyHtml;

  if (hasHtml && showHtml) {
    return (
      <div>
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <div />
          <button
            onClick={() => setShowHtml(false)}
            className="text-[10px] text-base-content/35 hover:text-base-content/60 transition-colors"
          >
            View plain text
          </button>
        </div>
        <iframe
          srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#374151;margin:0;padding:12px;word-wrap:break-word;}img{max-width:100%;height:auto;}a{color:#2563eb;}*{box-sizing:border-box;}</style></head><body>${msg.bodyHtml}</body></html>`}
          className="w-full border-0 min-h-[120px]"
          style={{ height: '300px', maxHeight: '400px' }}
          sandbox="allow-same-origin"
          title="Email content"
          onLoad={(e) => {
            try {
              const iframe = e.currentTarget;
              const height = iframe.contentDocument?.body?.scrollHeight;
              if (height) iframe.style.height = Math.min(height + 24, 500) + 'px';
            } catch {}
          }}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      {hasHtml && (
        <button
          onClick={() => setShowHtml(true)}
          className="text-[10px] text-base-content/35 hover:text-primary transition-colors mb-2 block"
        >
          View formatted email
        </button>
      )}
      <pre className="text-sm text-base-content/80 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
        {msg.body || msg.snippet || '(no content)'}
      </pre>
    </div>
  );
}

// ── Need Reply Checkbox ───────────────────────────────────────────────────────

function NeedReplyCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className="flex items-center gap-1.5 cursor-pointer group select-none"
      onClick={() => onChange(!checked)}
    >
      <div
        className="flex items-center justify-center flex-none transition-all"
        style={{
          width: '14px',
          height: '14px',
          border: '2px solid #1f2937',
          borderRadius: '3px',
          backgroundColor: 'white',
          boxShadow: checked ? '0 0 0 1px #1f2937' : 'none',
        }}
      >
        {checked && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="#1f2937" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className={`text-[11px] font-medium transition-colors ${checked ? 'text-amber-600' : 'text-base-content/50 group-hover:text-base-content/70'}`}>
        Reply Needed
      </span>
      {checked && <Clock size={11} className="text-amber-500 animate-pulse" />}
    </label>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const TC_LABEL_LINKED = 'Label_29';
const TC_LABEL_NEEDS_REVIEW = 'Label_30';
const TC_LABEL_UNMATCHED = 'Label_31';

export const Inbox: React.FC<InboxProps> = ({ onSelectDeal, onWaitingCountChange, initialConversationId, initialChannel, onInitHandled, onCallStarted }) => {
  // SMS / WhatsApp state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [needReply, setNeedReply] = useState(false);

  // Email state
  const [emailThreads, setEmailThreads] = useState<EmailThread[]>([]);
  const [emailReplyFlags, setEmailReplyFlags] = useState<Record<string, boolean>>({});
  const [selectedEmailThread, setSelectedEmailThread] = useState<EmailThread | null>(null);
  const [emailMessages, setEmailMessages] = useState<EmailMessage[]>([]);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsgLoading, setEmailMsgLoading] = useState(false);
  const [emailReplyText, setEmailReplyText] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [emailNeedReply, setEmailNeedReply] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(true);
  const [othersOpen, setOthersOpen] = useState(true);
  const [emailSubTab, setEmailSubTab] = useState<'all' | 'linked' | 'needs_review' | 'unmatched'>('all');
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewName, setPdfPreviewName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<Record<string, { value: string; confidence: string }> | null>(null);
  const [showExtractionModal, setShowExtractionModal] = useState(false);
  const [extractDealId, setExtractDealId] = useState<string | null>(null);
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [linkedDealId, setLinkedDealId] = useState<string | null>(null);
  const [applyingExtraction, setApplyingExtraction] = useState(false);
  const [extractionError, setExtractionError] = useState('');

  // Compose email state
  const [showEmailCompose, setShowEmailCompose] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const [emailComposeError, setEmailComposeError] = useState('');
  const [emailComposeSending, setEmailComposeSending] = useState(false);
  const [composeNeedReply, setComposeNeedReply] = useState(false);

  // Common state
  const [tab, setTab] = useState<'all' | 'sms' | 'whatsapp' | 'email' | 'waiting'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  // Compose SMS/WA state
  const [showCompose, setShowCompose] = useState(false);
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
  const [smsNeedReply, setSmsNeedReply] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const emailEndRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Loaders ─────────────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    try {
      const resp = await fetch('/api/sms?action=conversations');
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

  const loadEmailReplyFlags = useCallback(async () => {
    // reply_tracking table removed — email reply flags now managed in local state only
    // Future: could store in conversations table with channel=email
  }, []);

  const loadEmailThreads = useCallback(async () => {
    setEmailLoading(true);
    setEmailError('');
    try {
      const resp = await fetch('/api/email/threads?max_results=30');
      if (resp.ok) {
        const data = await resp.json();
        setEmailThreads(data.threads || []);
        setGmailConnected(true);
        loadEmailReplyFlags();
      } else {
        const err = await resp.json();
        setGmailConnected(false);
        setEmailError(err.error || 'Failed to load email');
      }
    } catch (e: any) {
      setGmailConnected(false);
      setEmailError(e.message || 'Failed to connect to Gmail');
    } finally {
      setEmailLoading(false);
    }
  }, [loadEmailReplyFlags]);

  useEffect(() => {
    loadConversations();
    refreshRef.current = setInterval(loadConversations, 30000);
    return () => clearInterval(refreshRef.current);
  }, [loadConversations]);

  useEffect(() => {
    if (tab === 'email' && gmailConnected === null) {
      loadEmailThreads();
    }
  }, [tab, gmailConnected, loadEmailThreads]);

  const loadMessages = useCallback(async (convId: string) => {
    setMsgLoading(true);
    try {
      const resp = await fetch(`/api/sms?action=conversations&conversation_id=${convId}`);
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

  const loadEmailMessages = useCallback(async (threadId: string) => {
    setEmailMsgLoading(true);
    try {
      const resp = await fetch(`/api/email/threads?thread_id=${threadId}`);
      if (resp.ok) {
        const data = await resp.json();
        setEmailMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Failed to load email messages:', e);
    } finally {
      setEmailMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedConv) {
      loadMessages(selectedConv.id);
      setConversations(prev => prev.map(c =>
        c.id === selectedConv.id ? { ...c, unread_count: 0 } : c
      ));
      setNeedReply(false);
    }
  }, [selectedConv, loadMessages]);

  useEffect(() => {
    if (selectedEmailThread) {
      loadEmailMessages(selectedEmailThread.id);
      setEmailNeedReply(false);
    }
  }, [selectedEmailThread, loadEmailMessages]);

  // Auto-select conversation from notification click
  useEffect(() => {
    if (!initialConversationId) return;
    // If conversations are loaded, find and select it
    if (conversations.length > 0) {
      const target = conversations.find(c => c.id === initialConversationId);
      if (target) {
        setSelectedConv(target);
        setTab('all'); // switch to all tab so conversation is visible
        onInitHandled?.();
      }
    }
  }, [initialConversationId, conversations]);

  // Auto-switch to email tab from notification click
  useEffect(() => {
    if (!initialChannel) return;
    if (initialChannel === 'email') {
      setTab('email');
      onInitHandled?.();
    }
  }, [initialChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    emailEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [emailMessages]);

  // Report waiting count to parent (for sidebar badge)
  useEffect(() => {
    const smsWaiting = conversations.filter(c => c.waiting_for_reply).length;
    const emailWaiting = Object.keys(emailReplyFlags).length;
    onWaitingCountChange?.(smsWaiting + emailWaiting);
  }, [conversations, emailReplyFlags, onWaitingCountChange]);

  // ── Load linked deal when email thread changes ───────────────────────────────
  useEffect(() => {
    if (!selectedEmailThread) { setLinkedDealId(null); setExtractDealId(null); return; }
    const sbUrl = import.meta.env.VITE_SUPABASE_URL;
    const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    fetch(`${sbUrl}/rest/v1/email_thread_links?gmail_thread_id=eq.${selectedEmailThread.id}&select=deal_id&limit=1`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.length > 0) {
          setLinkedDealId(data[0].deal_id);
          setExtractDealId(data[0].deal_id);
        } else {
          setLinkedDealId(null);
          setExtractDealId(null);
        }
      })
      .catch(() => { setLinkedDealId(null); setExtractDealId(null); });
  }, [selectedEmailThread]);

  // Load all deals when PDF preview opens (for picker)
  useEffect(() => {
    if (pdfPreviewUrl && allDeals.length === 0) loadAllDeals();
  }, [pdfPreviewUrl]);

  // ── SMS / WA Actions ─────────────────────────────────────────────────────────

  const handleSelectConv = (conv: Conversation) => {
    setSelectedConv(conv);
    setSelectedEmailThread(null);
    setMobileShowThread(true);
  };

  const handleSelectEmailThread = (thread: EmailThread) => {
    setSelectedEmailThread(thread);
    setSelectedConv(null);
    setMobileShowThread(true);
    setEmailThreads(prev => prev.map(t => t.id === thread.id ? { ...t, isUnread: false } : t));
    setPdfPreviewUrl(null);
    setPdfPreviewName(null);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConv || sending) return;
    setSending(true);
    try {
      const resp = await fetch('/api/sms?action=send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: selectedConv.id,
          deal_id: selectedConv.deal_id,
          recipients: selectedConv.participants,
          body: replyText,
          type: selectedConv.type,
          channel: selectedConv.channel,
          need_reply: needReply,
        }),
      });
      if (resp.ok) {
        setReplyText('');
        setNeedReply(false);
        // Optimistically update waiting status
        if (needReply) {
          setConversations(prev => prev.map(c =>
            c.id === selectedConv.id
              ? { ...c, waiting_for_reply: true, waiting_since: new Date().toISOString() }
              : c
          ));
          setSelectedConv(prev => prev ? { ...prev, waiting_for_reply: true, waiting_since: new Date().toISOString() } : prev);
        }
        await loadMessages(selectedConv.id);
        await loadConversations();
      }
    } catch (e) {
      console.error('Send failed:', e);
    } finally {
      setSending(false);
    }
  };

  const handleEmailReply = async () => {
    if (!emailReplyText.trim() || !selectedEmailThread || emailSending) return;
    setEmailSending(true);
    try {
      const lastMsg = emailMessages[emailMessages.length - 1];
      const replyTo = lastMsg?.from || selectedEmailThread.from;
      const subj = selectedEmailThread.subject.startsWith('Re:')
        ? selectedEmailThread.subject
        : `Re: ${selectedEmailThread.subject}`;

      const resp = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: replyTo,
          subject: subj,
          body: emailReplyText,
          thread_id: selectedEmailThread.id,
          in_reply_to: lastMsg?.id,
        }),
      });
      if (resp.ok) {
        setEmailReplyText('');

        // Track reply-needed flag in local state (reply_tracking table removed)
        if (emailNeedReply) {
          setEmailReplyFlags(prev => ({ ...prev, [selectedEmailThread.id]: true }));
          setEmailNeedReply(false);
        }

        await loadEmailMessages(selectedEmailThread.id);
      }
    } catch (e) {
      console.error('Email reply failed:', e);
    } finally {
      setEmailSending(false);
    }
  };

  const handleComposeEmail = async () => {
    if (!emailTo.trim() || !emailSubject.trim() || !emailBody.trim()) {
      setEmailComposeError('Please fill in To, Subject, and Message.');
      return;
    }
    setEmailComposeSending(true);
    setEmailComposeError('');
    try {
      const resp = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailTo, cc: emailCc, subject: emailSubject, body: emailBody }),
      });
      if (resp.ok) {
        if (composeNeedReply) {
          // reply_tracking table removed — flag managed locally
          setComposeNeedReply(false);
        }
        setShowEmailCompose(false);
        setEmailTo(''); setEmailSubject(''); setEmailBody(''); setEmailCc('');
        setComposeNeedReply(false);
        await loadEmailThreads();
      } else {
        const err = await resp.json();
        setEmailComposeError(err.error || 'Failed to send email');
      }
    } catch (e: any) {
      setEmailComposeError(e.message || 'Failed to send');
    } finally {
      setEmailComposeSending(false);
    }
  };

  const clearEmailWaiting = async (threadId: string) => {
    // reply_tracking table removed — clear flag from local state
    setEmailReplyFlags(prev => {
      const next = { ...prev };
      delete next[threadId];
      return next;
    });
  };

  const loadComposeData = async () => {
    try {
      const sbUrl = import.meta.env.VITE_SUPABASE_URL;
      const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const [cResp, dResp] = await Promise.all([
        fetch(`${sbUrl}/rest/v1/contacts?select=id,first_name,last_name,phone,email,contact_type,company&phone=not.is.null&order=first_name`, {
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
        }),
        fetch(`${sbUrl}/rest/v1/deals?select=id,property_address,city,state&pipeline_stage=neq.archived&order=property_address`, {
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
        }),
      ]);
      if (cResp.ok) setComposeContacts(await cResp.json());
      if (dResp.ok) setComposeDeals(await dResp.json());
    } catch (e) {
      console.error('Failed to load compose data:', e);
    }
  };

  const loadAllDeals = useCallback(async () => {
    try {
      const sbUrl = import.meta.env.VITE_SUPABASE_URL;
      const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(
        `${sbUrl}/rest/v1/deals?select=id,property_address,city,state&pipeline_stage=neq.archived&order=property_address`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
      );
      if (resp.ok) setAllDeals(await resp.json());
    } catch (e) {
      console.error('Failed to load deals:', e);
    }
  }, []);

  const handleExtractContract = async () => {
    if (!pdfPreviewUrl) return;
    setExtracting(true);
    setExtractionError('');
    try {
      const resp = await fetch('https://daring-radiance-production.up.railway.app/extract-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_url: pdfPreviewUrl }),
      });
      if (!resp.ok) throw new Error(`Extraction failed (${resp.status})`);
      const data = await resp.json();
      setExtractionResult(data.fields || data);
      if (allDeals.length === 0) await loadAllDeals();
      setShowExtractionModal(true);
    } catch (e: any) {
      setExtractionError(e.message || 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const handleApplyExtraction = async () => {
    if (!extractDealId || !extractionResult) return;
    setApplyingExtraction(true);
    try {
      const sbUrl = import.meta.env.VITE_SUPABASE_URL;
      const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const FIELD_MAP: Record<string, string> = {
        property_address: 'property_address',
        city: 'city',
        state: 'state',
        purchase_price: 'purchase_price',
        close_of_escrow: 'close_of_escrow',
        buyer_name: 'buyer_name',
        seller_name: 'seller_name',
        earnest_money: 'earnest_money',
        earnest_money_due_date: 'earnest_money_due_date',
        loan_amount: 'loan_amount',
        loan_type: 'loan_type',
        down_payment_dollars: 'down_payment_dollars',
        down_payment_percent: 'down_payment_percent',
        title_company: 'title_company',
        loan_officer: 'loan_officer',
        inspection_deadline: 'inspection_deadline',
        loan_commitment_date: 'loan_commitment_date',
        possession_date: 'possession_date',
        seller_concessions: 'seller_concessions',
        listing_commission_percent: 'listing_commission_percent',
        buyer_commission_percent: 'buyer_commission_percent',
      };
      const patch: Record<string, any> = {};
      for (const [extractKey, dbKey] of Object.entries(FIELD_MAP)) {
        const val = extractionResult[extractKey]?.value;
        if (val !== undefined && val !== null && val !== '') patch[dbKey] = val;
      }
      const resp = await fetch(`${sbUrl}/rest/v1/deals?id=eq.${extractDealId}`, {
        method: 'PATCH',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(patch),
      });
      if (!resp.ok) throw new Error('Failed to apply to deal');
      setShowExtractionModal(false);
      setExtractionResult(null);
      // Navigate user to the deal
      if (onSelectDeal && extractDealId) onSelectDeal(extractDealId);
    } catch (e: any) {
      console.error('Apply failed:', e);
    } finally {
      setApplyingExtraction(false);
    }
  };

  const openCompose = () => {
    if (tab === 'email') {
      setShowEmailCompose(true);
      setEmailTo(''); setEmailSubject(''); setEmailBody(''); setEmailCc('');
      setEmailComposeError('');
      setComposeNeedReply(false);
      return;
    }
    setShowCompose(true);
    setSelectedRecipients([]);
    setSelectedDeal(null);
    setComposeBody('');
    setComposeChannel('sms');
    setGroupType('direct');
    setContactSearch('');
    setComposeError('');
    setShowWaSandboxInfo(false);
    setSmsNeedReply(false);
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
      const resp = await fetch('/api/sms?action=send', {
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
          need_reply: smsNeedReply,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setShowCompose(false);
        setSmsNeedReply(false);
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

  // ── Filtered Lists ───────────────────────────────────────────────────────────

  const filteredConvs = conversations.filter(c => {
    if (tab === 'email') return false;
    if (tab === 'waiting') return c.waiting_for_reply === true;
    if (tab !== 'all' && c.channel !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.last_message_preview?.toLowerCase().includes(q) ||
      c.deals?.property_address?.toLowerCase().includes(q)
    );
  });

  const filteredEmails = (tab === 'waiting'
    ? emailThreads.filter(t => emailReplyFlags[t.id])
    : emailThreads
  ).filter(t => {
    if (tab === 'email' && emailSubTab !== 'all') {
      const targetLabel = emailSubTab === 'linked' ? TC_LABEL_LINKED : emailSubTab === 'needs_review' ? TC_LABEL_NEEDS_REVIEW : TC_LABEL_UNMATCHED;
      if (!t.labelIds?.includes(targetLabel)) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return t.subject.toLowerCase().includes(q) || t.from.toLowerCase().includes(q) || t.snippet.toLowerCase().includes(q);
  });

  const totalUnread = conversations.reduce((a, c) => a + (c.unread_count || 0), 0);
  const waCount = conversations.filter(c => c.channel === 'whatsapp' && c.unread_count > 0).length;
  const emailUnread = emailThreads.filter(t => t.isUnread).length;
  const smsWaiting = conversations.filter(c => c.waiting_for_reply).length;
  const emailWaiting = Object.keys(emailReplyFlags).length;
  const totalWaiting = smsWaiting + emailWaiting;

  const filteredContacts = composeContacts.filter(c => {
    if (!contactSearch) return true;
    const q = contactSearch.toLowerCase();
    return `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q) || (c.contact_type || '').toLowerCase().includes(q);
  });

  const typeIcon = (type: string) => {
    if (type === 'group') return <Hash size={11} />;
    if (type === 'broadcast') return <Users size={11} />;
    return null;
  };

  // ── Conversation List Panel ──────────────────────────────────────────────────

  const showEmailList = tab === 'email' || tab === 'waiting';

  const renderEmailRow = (thread: EmailThread) => {
    const active = selectedEmailThread?.id === thread.id;
    const senderName = parseFromName(thread.from);
    const isWaiting = emailReplyFlags[thread.id];
    return (
      <button
        key={thread.id}
        onClick={() => handleSelectEmailThread(thread)}
        className={`w-full text-left px-4 py-3 border-b border-base-200 transition-colors hover:bg-base-50 ${active ? 'bg-primary/8 border-l-2 border-l-primary' : ''} ${isWaiting ? 'bg-amber-50/50' : ''}`}
      >
        <div className="flex items-start gap-2.5">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-none text-sm font-bold ${thread.isUnread ? 'bg-green-100 text-green-700' : isWaiting ? 'bg-amber-100 text-amber-700' : 'bg-base-200 text-base-content/50'}`}>
            {isWaiting ? <Clock size={16} /> : senderName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-0.5">
              <span className={`text-sm truncate flex-1 ${thread.isUnread ? 'font-bold text-base-content' : 'font-medium text-base-content/75'}`}>
                {senderName}
              </span>
              {isWaiting && (
                <span className="badge badge-xs bg-amber-100 text-amber-700 border-amber-200 gap-0.5">
                  <Clock size={8} /> waiting
                </span>
              )}
              {thread.hasAttachment && <Paperclip size={11} className="text-base-content/30 flex-none" />}
              {thread.isUnread && (
                <span className="bg-primary text-white text-[9px] font-bold rounded-full w-2 h-2 flex-none" />
              )}
              <span className="text-[10px] text-base-content/35 flex-none">
                {formatEmailDate(thread.internalDate)}
              </span>
            </div>
            <p className={`text-xs truncate mb-0.5 ${thread.isUnread ? 'text-base-content font-semibold' : 'text-base-content/65'}`}>
              {thread.subject}
            </p>
            <p className="text-xs text-base-content/40 truncate">{thread.snippet}</p>
          </div>
        </div>
      </button>
    );
  };

  const ConversationList = (
    <div className={`flex flex-col h-full border-r border-base-300 bg-base-100 ${mobileShowThread ? 'hidden md:flex' : 'flex'} md:w-80 w-full flex-none`}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-base-300 bg-base-200">
        <MessageSquare size={18} className="text-primary flex-none" />
        <span className="font-bold text-sm flex-1">Inbox</span>
        {totalUnread > 0 && (
          <span className="badge badge-primary badge-sm">{totalUnread}</span>
        )}
        <button onClick={tab === 'email' ? loadEmailThreads : loadConversations} className="btn btn-ghost btn-xs btn-square" title="Refresh">
          <RefreshCw size={13} />
        </button>
        <button onClick={openCompose} className="btn btn-primary btn-xs gap-1 rounded-lg">
          <Plus size={13} /> New
        </button>
      </div>

      <div className="flex border-b border-base-300 bg-base-200 px-2 gap-1 py-1.5 overflow-x-auto">
        {(['all', 'sms', 'whatsapp', 'email', 'waiting'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${tab === t ? 'bg-primary text-white' : 'text-base-content/60 hover:bg-base-300'}`}
          >
            {t === 'all' ? 'All' : t === 'sms' ? '📱 SMS' : t === 'whatsapp' ? '💬 WhatsApp' : t === 'email' ? '✉️ Email' : '⏳ Waiting'}
            {t === 'whatsapp' && waCount > 0 && (
              <span className="ml-1 bg-green-500 text-white text-[9px] font-bold rounded-full px-1">{waCount}</span>
            )}
            {t === 'email' && emailUnread > 0 && (
              <span className="ml-1 bg-primary text-white text-[9px] font-bold rounded-full px-1">{emailUnread}</span>
            )}
            {t === 'waiting' && totalWaiting > 0 && (
              <span className="ml-1 bg-amber-500 text-white text-[9px] font-bold rounded-full px-1">{totalWaiting}</span>
            )}
          </button>
        ))}
      </div>

      <div className="px-3 py-2 border-b border-base-300">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            className="input input-bordered input-xs w-full pl-7 bg-base-100 text-sm"
            placeholder={tab === 'email' ? 'Search emails...' : tab === 'waiting' ? 'Search waiting...' : 'Search conversations...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {tab === 'email' && (
        <div className="flex border-b border-base-300 bg-base-100 px-2 gap-1 py-1.5 overflow-x-auto">
          {([
            { key: 'all' as const, label: '📬 All' },
            { key: 'linked' as const, label: '🔗 Linked' },
            { key: 'needs_review' as const, label: '⚠️ Review' },
            { key: 'unmatched' as const, label: '❓ Unmatched' },
          ]).map(st => {
            const count = st.key === 'linked' ? emailThreads.filter(t => t.labelIds?.includes(TC_LABEL_LINKED)).length
              : st.key === 'needs_review' ? emailThreads.filter(t => t.labelIds?.includes(TC_LABEL_NEEDS_REVIEW)).length
              : st.key === 'unmatched' ? emailThreads.filter(t => t.labelIds?.includes(TC_LABEL_UNMATCHED)).length
              : undefined;
            return (
              <button
                key={st.key}
                onClick={() => setEmailSubTab(st.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1 ${emailSubTab === st.key ? 'bg-primary text-white' : 'text-base-content/60 hover:bg-base-200'}`}
              >
                {st.label}
                {count !== undefined && count > 0 && (
                  <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 ${emailSubTab === st.key ? 'bg-white/20 text-white' : st.key === 'needs_review' ? 'bg-amber-500 text-white' : st.key === 'unmatched' ? 'bg-red-500 text-white' : 'bg-primary/20 text-primary'}`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {/* Waiting banner */}
      {tab === 'waiting' && totalWaiting === 0 && (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-base-content/30 px-4 text-center">
          <Clock size={32} />
          <div>
            <p className="text-sm font-medium">No pending replies</p>
            <p className="text-xs mt-1">Check "Reply Needed" when sending to track responses</p>
          </div>
        </div>
      )}

      {(tab === 'email' || (tab === 'waiting' && emailWaiting > 0)) && (
        <div className="flex-1 overflow-y-auto">
          {emailLoading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-base-content/40">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading Gmail...</span>
            </div>
          ) : gmailConnected === false ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 px-4 text-center">
              <Mail size={32} className="text-base-content/20" />
              <div>
                <p className="text-sm font-semibold text-base-content/50">Gmail not connected</p>
                <p className="text-xs text-base-content/35 mt-1">{emailError}</p>
              </div>
              <button onClick={loadEmailThreads} className="btn btn-xs btn-outline gap-1">
                <RefreshCw size={11} /> Retry
              </button>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-base-content/30 px-4 text-center">
              <InboxIcon size={32} />
              <p className="text-sm font-medium">No emails found</p>
            </div>
          ) : emailSubTab !== 'all' ? (
            filteredEmails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-base-content/30 px-4 text-center">
                <InboxIcon size={32} />
                <p className="text-sm font-medium">
                  No {emailSubTab === 'linked' ? 'linked' : emailSubTab === 'needs_review' ? 'needs review' : 'unmatched'} emails
                </p>
              </div>
            ) : (
              <>{filteredEmails.map(t => renderEmailRow(t))}</>
            )
          ) : (() => {
            const priorityEmails = filteredEmails.filter(t => t.priority === true);
            const otherEmails = filteredEmails.filter(t => t.priority !== true);

            return (
              <>
                {/* Priority Section */}
                <button
                  onClick={() => setPriorityOpen(o => !o)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-100 hover:bg-red-100/60 transition-colors sticky top-0 z-10"
                >
                  <span className="text-[10px] font-bold text-red-600 uppercase tracking-wide flex-1 text-left">
                    🔴 Priority
                  </span>
                  {priorityEmails.length > 0 && (
                    <span className="bg-red-500 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {priorityEmails.length}
                    </span>
                  )}
                  <ChevronLeft
                    size={13}
                    className={`text-red-400 transition-transform ${priorityOpen ? '-rotate-90' : 'rotate-0'}`}
                  />
                </button>
                {priorityOpen && (
                  priorityEmails.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-base-content/35 italic border-b border-base-200">
                      No priority emails right now ✓
                    </div>
                  ) : (
                    priorityEmails.map(renderEmailRow)
                  )
                )}

                {/* Others Section */}
                <button
                  onClick={() => setOthersOpen(o => !o)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-base-200 border-b border-base-300 hover:bg-base-300/60 transition-colors sticky top-0 z-10"
                >
                  <span className="text-[10px] font-bold text-base-content/50 uppercase tracking-wide flex-1 text-left">
                    📂 Others
                  </span>
                  {otherEmails.length > 0 && (
                    <span className="bg-base-content/20 text-base-content/60 text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {otherEmails.length}
                    </span>
                  )}
                  <ChevronLeft
                    size={13}
                    className={`text-base-content/30 transition-transform ${othersOpen ? '-rotate-90' : 'rotate-0'}`}
                  />
                </button>
                {othersOpen && (
                  otherEmails.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-base-content/35 italic border-b border-base-200">
                      No other emails
                    </div>
                  ) : (
                    otherEmails.map(renderEmailRow)
                  )
                )}
              </>
            );
          })()
          }
        </div>
      )}

      {tab !== 'email' && (
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-base-content/40">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : filteredConvs.length === 0 && tab !== 'waiting' ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-base-content/30 px-4 text-center">
              <MessageCircle size={32} />
              <div>
                <p className="text-sm font-medium">No conversations yet</p>
                <p className="text-xs mt-1">Click "New" to send your first message</p>
              </div>
            </div>
          ) : (
            filteredConvs.map(conv => {
              const active = selectedConv?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConv(conv)}
                  className={`w-full text-left px-4 py-3 border-b border-base-200 transition-colors hover:bg-base-50 ${active ? 'bg-primary/8 border-l-2 border-l-primary' : ''} ${conv.waiting_for_reply ? 'bg-amber-50/40' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`relative`}>
                      <ChannelAvatar channel={conv.channel} name={conv.name} />
                      {conv.waiting_for_reply && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
                          <Clock size={9} className="text-white" />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className={`text-sm font-semibold truncate flex-1 ${conv.unread_count > 0 ? 'text-base-content' : 'text-base-content/80'}`}>
                          {conv.name}
                        </span>
                        {typeIcon(conv.type)}
                        <ChannelBadge channel={conv.channel} />
                        {conv.waiting_for_reply && (
                          <span className="badge badge-xs bg-amber-100 text-amber-700 border-amber-200 gap-0.5">
                            <Clock size={8} />
                            {conv.waiting_since ? waitingDuration(conv.waiting_since) : 'waiting'}
                          </span>
                        )}
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
      )}
    </div>
  );

  // ── Email Thread Panel ───────────────────────────────────────────────────────

  const isCurrentEmailWaiting = selectedEmailThread ? emailReplyFlags[selectedEmailThread.id] : false;

  const EmailThreadPanel = selectedEmailThread && (
    <>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-base-300 bg-base-200">
        <button className="md:hidden btn btn-ghost btn-xs btn-square" onClick={() => setMobileShowThread(false)}>
          <ChevronLeft size={16} />
        </button>
        <div className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-bold flex-none">
          {parseFromName(selectedEmailThread.from).charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm truncate">{selectedEmailThread.subject}</span>
            <span className="badge badge-xs badge-success">EMAIL</span>
            {isCurrentEmailWaiting && (
              <span className="badge badge-xs bg-amber-100 text-amber-700 border-amber-200 gap-0.5">
                <Clock size={8} /> waiting
              </span>
            )}
          </div>
          <p className="text-[11px] text-base-content/50 truncate">{parseFromName(selectedEmailThread.from)}</p>
        </div>
        {isCurrentEmailWaiting && (
          <button
            onClick={() => clearEmailWaiting(selectedEmailThread.id)}
            className="btn btn-xs btn-ghost text-amber-600 gap-1"
            title="Mark as replied"
          >
            <CheckCheck size={12} /> Got reply
          </button>
        )}
        {/* Reply */}
        <button
          onClick={() => {
            setShowEmailCompose(true);
            setEmailTo(selectedEmailThread.from);
            setEmailCc('');
            setEmailSubject(selectedEmailThread.subject.startsWith('Re:') ? selectedEmailThread.subject : `Re: ${selectedEmailThread.subject}`);
            setEmailBody('');
            setEmailComposeError('');
          }}
          className="btn btn-ghost btn-xs gap-1"
          title="Reply"
        >
          <Reply size={13} />
        </button>

        {/* Reply All */}
        <button
          onClick={() => {
            setShowEmailCompose(true);
            setEmailTo(selectedEmailThread.from);
            // CC everyone else: original To recipients minus our own address
            const originalTo = selectedEmailThread.to || '';
            const ccList = originalTo
              .split(',')
              .map((e: string) => e.trim())
              .filter((e: string) => e && !e.toLowerCase().includes('tc@myredeal.com'))
              .join(', ');
            setEmailCc(ccList);
            setEmailSubject(selectedEmailThread.subject.startsWith('Re:') ? selectedEmailThread.subject : `Re: ${selectedEmailThread.subject}`);
            setEmailBody('');
            setEmailComposeError('');
          }}
          className="btn btn-ghost btn-xs gap-1"
          title="Reply All"
        >
          <ReplyAll size={13} />
        </button>

        {/* Forward */}
        <button
          onClick={() => {
            setShowEmailCompose(true);
            setEmailTo('');
            setEmailCc('');
            setEmailSubject(selectedEmailThread.subject.startsWith('Fwd:') ? selectedEmailThread.subject : `Fwd: ${selectedEmailThread.subject}`);
            // Build quoted forward body from last loaded message
            const lastMsg = emailMessages.length > 0 ? emailMessages[emailMessages.length - 1] : null;
            const quotedBody = lastMsg
              ? `\n\n---------- Forwarded message ----------\nFrom: ${lastMsg.from}\nDate: ${new Date(Number(lastMsg.internalDate)).toLocaleString()}\nSubject: ${lastMsg.subject}\nTo: ${lastMsg.to}\n\n${lastMsg.body || selectedEmailThread.snippet || ''}`
              : `\n\n---------- Forwarded message ----------\nFrom: ${selectedEmailThread.from}\nSubject: ${selectedEmailThread.subject}\n\n${selectedEmailThread.snippet || ''}`;
            setEmailBody(quotedBody);
            setEmailComposeError('');
          }}
          className="btn btn-ghost btn-xs gap-1"
          title="Forward"
        >
          <Forward size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {emailMsgLoading ? (
          <div className="flex items-center justify-center h-20 gap-2 text-base-content/40">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading messages...</span>
          </div>
        ) : emailMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-base-content/30 gap-2">
            <Mail size={24} />
            <p className="text-sm">No messages loaded</p>
          </div>
        ) : (
          emailMessages.map((msg, idx) => {
            const isMe = msg.from.includes('tc@myredeal.com');
            const senderName = parseFromName(msg.from);
            const prevMsg = idx > 0 ? emailMessages[idx - 1] : null;
            const msgDate = new Date(Number(msg.internalDate));
            const prevDate = prevMsg ? new Date(Number(prevMsg.internalDate)) : null;
            const showDate = !prevDate || msgDate.toDateString() !== prevDate.toDateString();
            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="flex items-center justify-center my-2">
                    <span className="text-[10px] bg-base-200 text-base-content/40 px-3 py-1 rounded-full">
                      {msgDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}
                <div className="rounded-xl border border-base-300 bg-base-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-base-200 border-b border-base-300">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-none ${isMe ? 'bg-primary text-primary-content' : 'bg-green-100 text-green-700'}`}>
                      {senderName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{isMe ? 'You' : senderName}</span>
                        <span className="text-[10px] text-base-content/40">→ {msg.to}</span>
                      </div>
                      {msg.cc && <p className="text-[10px] text-base-content/35">cc: {msg.cc}</p>}
                    </div>
                    <span className="text-[10px] text-base-content/35 flex-none">
                      {msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <EmailBodyRenderer msg={msg} />
                  {msg.attachments && msg.attachments.length > 0 && (
                    <AttachmentChips
                      attachments={msg.attachments}
                      onPreviewPdf={(url, name) => { setPdfPreviewUrl(url); setPdfPreviewName(name); }}
                    />
                  )}
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={emailEndRef} />
      </div>

      <div className="px-4 py-3 border-t border-base-300 bg-base-200">
        <div className="flex gap-2 items-end">
          <textarea
            className="textarea textarea-bordered flex-1 min-h-[44px] max-h-32 resize-none text-sm bg-base-100"
            placeholder={`Reply to ${parseFromName(selectedEmailThread.from)}...`}
            value={emailReplyText}
            onChange={e => setEmailReplyText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleEmailReply(); }
            }}
            rows={1}
          />
          <button
            onClick={handleEmailReply}
            disabled={!emailReplyText.trim() || emailSending}
            className={`btn btn-sm px-4 rounded-xl font-semibold gap-1.5 transition-all ${emailNeedReply ? 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white' : 'bg-success hover:bg-success/85 text-success-content border-success'}`}
          >
            {emailSending ? <Loader2 size={14} className="animate-spin" /> : <><Send size={14} /><span className="text-xs">Send</span></>}
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          <p className="text-[10px] text-base-content/30">✉️ Replying from tc@myredeal.com · Ctrl+Enter to send</p>
          <NeedReplyCheckbox checked={emailNeedReply} onChange={setEmailNeedReply} />
        </div>
      </div>
    </>
  );

  // ── SMS Thread Panel ─────────────────────────────────────────────────────────

  const SmsThreadPanel = selectedConv && (
    <>
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
            {selectedConv.waiting_for_reply && (
              <span className="badge badge-xs bg-amber-100 text-amber-700 border-amber-200 gap-0.5">
                <Clock size={8} />
                {selectedConv.waiting_since ? waitingDuration(selectedConv.waiting_since) : 'waiting'}
              </span>
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
          {selectedConv.participants.length > 0 && selectedConv.participants[0].phone && (
            <CallButton
              phoneNumber={selectedConv.participants[0].phone}
              contactName={selectedConv.participants[0].name || selectedConv.participants[0].phone}
              size="sm"
              variant="icon"
              deals={[]}
              onCallStarted={(callId) => onCallStarted?.({
                contactName: selectedConv.participants[0].name || selectedConv.participants[0].phone,
                contactPhone: selectedConv.participants[0].phone,
                callSid: callId,
                startedAt: new Date().toISOString(),
              })}
            />
          )}
        </div>
      </div>

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
                      {isOut && msg.need_reply && (
                        <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                          <Clock size={8} /> reply needed
                        </span>
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
            className={`btn btn-sm px-4 rounded-xl font-semibold gap-1.5 transition-all ${needReply ? 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white' : selectedConv.channel === 'whatsapp' ? 'text-white border-0 hover:opacity-90' : 'bg-primary hover:bg-primary/85 text-primary-content border-primary'}`}
            style={selectedConv.channel === 'whatsapp' && !needReply ? { backgroundColor: '#25D366', borderColor: '#25D366' } : undefined}
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <><Send size={14} /><span className="text-xs">Send</span></>}
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          <p className="text-[10px] text-base-content/30">
            {selectedConv.channel === 'whatsapp'
              ? '💬 Sending via WhatsApp'
              : '📱 Sending via SMS from (464) 733-3257'}
            {selectedConv.type === 'broadcast' && ' · Broadcast'}
            {selectedConv.type === 'group' && ` · Group (${selectedConv.participants.length} participants)`}
          </p>
          <NeedReplyCheckbox checked={needReply} onChange={setNeedReply} />
        </div>
      </div>
    </>
  );

  // ── Thread Panel ─────────────────────────────────────────────────────────────

  const ThreadPanel = (
    <div className={`flex flex-col flex-1 min-w-0 h-full bg-base-100 ${!mobileShowThread && !selectedConv && !selectedEmailThread ? 'hidden md:flex' : 'flex'}`}>
      {!selectedConv && !selectedEmailThread ? (
        <div className="flex flex-col items-center justify-center h-full text-base-content/25 gap-4">
          <MessageSquare size={48} />
          <div className="text-center">
            <p className="font-medium text-base-content/40">Select a conversation</p>
            <p className="text-sm mt-1">or click New to start one</p>
          </div>
        </div>
      ) : selectedEmailThread ? EmailThreadPanel : SmsThreadPanel}
    </div>
  );

  // ── Email Compose Modal ──────────────────────────────────────────────────────

  const EmailComposeModal = showEmailCompose && (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowEmailCompose(false)} />
      <div className="relative z-10 bg-base-100 rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-lg md:w-full flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-base-300">
          <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center">
            <Mail size={15} className="text-green-600" />
          </div>
          <span className="font-bold flex-1">New Email</span>
          <button onClick={() => setShowEmailCompose(false)} className="btn btn-ghost btn-xs btn-square"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-base-content/60 mb-1 block">TO</label>
            <input className="input input-bordered input-sm w-full" placeholder="recipient@example.com" value={emailTo} onChange={e => setEmailTo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-base-content/60 mb-1 block">CC (optional)</label>
            <input className="input input-bordered input-sm w-full" placeholder="cc@example.com" value={emailCc} onChange={e => setEmailCc(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-base-content/60 mb-1 block">SUBJECT</label>
            <input className="input input-bordered input-sm w-full" placeholder="Subject..." value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-base-content/60 mb-1 block">MESSAGE</label>
            <textarea className="textarea textarea-bordered w-full text-sm resize-none" rows={6} placeholder="Type your email..." value={emailBody} onChange={e => setEmailBody(e.target.value)} />
          </div>
          {emailComposeError && (
            <div className="flex items-center gap-2 text-error text-xs bg-error/10 px-3 py-2.5 rounded-xl">
              <AlertCircle size={13} />{emailComposeError}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-base-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="text-xs text-base-content/40">✉️ From tc@myredeal.com</p>
            <NeedReplyCheckbox checked={composeNeedReply} onChange={setComposeNeedReply} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowEmailCompose(false)} className="btn btn-ghost btn-sm">Cancel</button>
            <button
              onClick={handleComposeEmail}
              disabled={!emailTo.trim() || !emailSubject.trim() || !emailBody.trim() || emailComposeSending}
              className={`btn btn-sm gap-2 rounded-xl ${composeNeedReply ? 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white' : 'btn-success'}`}
            >
              {emailComposeSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {emailComposeSending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── SMS Compose Modal ────────────────────────────────────────────────────────

  const ComposeModal = showCompose && (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setShowCompose(false)} />
      <div className="relative z-10 bg-base-100 rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-lg md:w-full flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-base-300">
          <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center">
            <MessageSquare size={15} className="text-primary" />
          </div>
          <span className="font-bold flex-1">New Message</span>
          <button onClick={() => setShowCompose(false)} className="btn btn-ghost btn-xs btn-square"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
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
            {showWaSandboxInfo && composeChannel === 'whatsapp' && (
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-xl text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-green-800">
                  <Info size={12} /> WhatsApp Sandbox — Recipient must opt in first
                </div>
                <p className="text-green-700">Ask them to text <strong>"join return-word"</strong> to <strong>+1 (415) 523-8886</strong></p>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-base-content/60 mb-1.5 block">
              TO: RECIPIENTS {selectedRecipients.length > 0 && `(${selectedRecipients.length} selected)`}
            </label>
            {selectedRecipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedRecipients.map(c => (
                  <span key={c.id} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full font-medium">
                    {c.first_name} {c.last_name}
                    <button onClick={() => setSelectedRecipients(prev => prev.filter(r => r.id !== c.id))}><X size={10} /></button>
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
                        if (selected) setSelectedRecipients(prev => prev.filter(r => r.id !== c.id));
                        else setSelectedRecipients(prev => [...prev, c]);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-base-200 transition-colors border-b border-base-100 last:border-0 ${selected ? 'bg-primary/5' : ''}`}
                    >
                      <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-primary flex-none">
                        {c.first_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{c.first_name} {c.last_name}</div>
                        <div className="text-xs text-base-content/50">{c.contact_type || 'contact'} · {c.phone}</div>
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

          <div>
            <label className="text-xs font-semibold text-base-content/60 mb-1.5 block">LINK TO DEAL (OPTIONAL)</label>
            <select
              className="select select-bordered select-sm w-full text-sm"
              value={selectedDeal?.id || ''}
              onChange={e => setSelectedDeal(composeDeals.find(x => x.id === e.target.value) || null)}
            >
              <option value="">-- No deal --</option>
              {composeDeals.map(d => (
                <option key={d.id} value={d.id}>{d.property_address}, {d.city} {d.state}</option>
              ))}
            </select>
          </div>

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
              <AlertCircle size={13} />{composeError}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-base-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowCompose(false)} className="btn btn-ghost btn-sm">Cancel</button>
            <NeedReplyCheckbox checked={smsNeedReply} onChange={setSmsNeedReply} />
          </div>
          <button
            onClick={handleComposeSend}
            disabled={!selectedRecipients.length || !composeBody.trim() || composeSending}
            className={`btn btn-sm gap-2 rounded-xl font-semibold ${smsNeedReply ? 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white' : composeChannel === 'whatsapp' ? 'text-white border-0' : 'btn-primary'}`}
            style={!smsNeedReply && composeChannel === 'whatsapp' ? { backgroundColor: '#25D366', borderColor: '#25D366' } : undefined}
          >
            {composeSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {composeSending ? 'Sending...' : `Send${selectedRecipients.length > 1 ? ` to ${selectedRecipients.length}` : ''} via ${composeChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
          </button>
        </div>
      </div>
    </div>
  );

  // ── PDF Preview Panel ───────────────────────────────────────────────────────

  const PDFPreviewPanel = pdfPreviewUrl ? (
    <div className="flex flex-col border-l border-base-300 bg-base-100 flex-none" style={{ width: '42%', minWidth: 280 }}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-base-300 bg-base-200 flex-none">
        <span className="text-sm font-semibold truncate flex-1 text-base-content/80">
          📄 {pdfPreviewName}
        </span>
        {extractionError && (
          <span className="text-[10px] text-error bg-error/10 px-2 py-1 rounded-lg flex items-center gap-1 flex-none">
            <AlertCircle size={10} /> {extractionError}
          </span>
        )}
        <button
          onClick={handleExtractContract}
          disabled={extracting}
          className="btn btn-xs gap-1 rounded-lg flex-none text-white border-violet-600"
          style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed' }}
          title="Extract contract data and apply to a deal"
        >
          {extracting ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
          {extracting ? 'Extracting...' : 'Extract to Deal'}
        </button>
        <a
          href={pdfPreviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-xs gap-1"
          title="Open in new tab"
        >
          <ExternalLink size={11} /> Open
        </a>
        <button
          onClick={() => { setPdfPreviewUrl(null); setPdfPreviewName(null); setExtractionError(''); }}
          className="btn btn-ghost btn-xs btn-square"
          title="Close preview"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          src={pdfPreviewUrl}
          className="w-full h-full border-0"
          title={pdfPreviewName || 'PDF Preview'}
        />
      </div>
    </div>
  ) : null;

  // ── Extraction Modal ──────────────────────────────────────────────────────────

  const FIELD_LABELS: Record<string, string> = {
    property_address: 'Property Address',
    city: 'City',
    state: 'State',
    purchase_price: 'Purchase Price',
    close_of_escrow: 'Close of Escrow',
    buyer_name: 'Buyer Name(s)',
    seller_name: 'Seller Name(s)',
    earnest_money: 'Earnest Money ($)',
    earnest_money_due_date: 'Earnest Money Due',
    loan_amount: 'Loan Amount',
    loan_type: 'Loan Type',
    down_payment_dollars: 'Down Payment ($)',
    down_payment_percent: 'Down Payment (%)',
    title_company: 'Title Company',
    loan_officer: 'Loan Officer',
    inspection_deadline: 'Inspection Deadline',
    loan_commitment_date: 'Loan Commitment Date',
    possession_date: 'Possession Date',
    seller_concessions: 'Seller Concessions',
    listing_commission_percent: 'Listing Commission %',
    buyer_commission_percent: 'Buyer Commission %',
  };

  const ExtractionModal = showExtractionModal && extractionResult ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => setShowExtractionModal(false)} />
      <div className="relative z-10 bg-base-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '90vw', maxWidth: 1100, height: '85vh' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-base-300 flex-none">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-none"
            style={{ backgroundColor: '#ede9fe' }}>
            <Zap size={16} style={{ color: '#7c3aed' }} />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-base">Contract Extraction</h2>
            <p className="text-xs text-base-content/50">
              Review extracted fields · {Object.keys(extractionResult).length} fields found
            </p>
          </div>
          <button onClick={() => setShowExtractionModal(false)} className="btn btn-ghost btn-sm btn-square">
            <X size={16} />
          </button>
        </div>
        {/* Body: two-column */}
        <div className="flex flex-1 min-h-0">
          {/* Left: PDF viewer */}
          <div className="flex-1 min-w-0 border-r border-base-300 bg-base-200">
            <iframe
              src={pdfPreviewUrl || ''}
              className="w-full h-full border-0"
              title="Contract PDF"
            />
          </div>
          {/* Right: Fields + deal picker */}
          <div className="flex flex-col flex-none" style={{ width: 320 }}>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {/* Deal picker */}
              <div>
                <label className="text-[10px] font-bold text-base-content/50 uppercase tracking-wide mb-1.5 block">
                  Apply to Deal
                </label>
                {linkedDealId ? (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                    <span className="text-base">🔗</span>
                    <span className="text-xs font-semibold text-green-800 flex-1 truncate">
                      {allDeals.find(d => d.id === linkedDealId)?.property_address || 'Linked deal'}
                    </span>
                    <button
                      onClick={() => { setLinkedDealId(null); setExtractDealId(null); }}
                      className="text-green-400 hover:text-green-700 transition-colors"
                      title="Choose a different deal"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <select
                    className="select select-bordered select-sm w-full text-sm"
                    value={extractDealId || ''}
                    onChange={e => setExtractDealId(e.target.value || null)}
                  >
                    <option value="">-- Select a deal --</option>
                    {allDeals.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.property_address}, {d.city} {d.state}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="divider text-[10px] text-base-content/40 my-0">Extracted Fields</div>

              {Object.entries(extractionResult).map(([key, field]) => {
                const label = FIELD_LABELS[key] || key.replace(/_/g, ' ');
                const confidence = (field.confidence || 'unknown').toLowerCase();
                const confColor = confidence === 'high' ? 'text-success' : confidence === 'medium' ? 'text-warning' : 'text-error';
                const confBg = confidence === 'high'
                  ? 'bg-green-50 border-green-200'
                  : confidence === 'medium'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-red-50 border-red-200';
                return (
                  <div key={key} className={`rounded-xl border px-3 py-2.5 ${confBg}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-semibold text-base-content/50 uppercase tracking-wide">{label}</span>
                      <span className={`text-[9px] font-bold uppercase ${confColor}`}>{confidence}</span>
                    </div>
                    <p className="text-sm font-medium text-base-content leading-snug">
                      {field.value || <span className="text-base-content/30 italic text-xs">not found</span>}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-4 border-t border-base-300 flex-none space-y-2">
              <button
                onClick={handleApplyExtraction}
                disabled={!extractDealId || applyingExtraction}
                className="btn w-full gap-2 rounded-xl font-semibold text-white border-0"
                style={{ backgroundColor: !extractDealId || applyingExtraction ? undefined : '#7c3aed' }}
              >
                {applyingExtraction ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {applyingExtraction ? 'Applying...' : 'Apply to Deal'}
              </button>
              <p className="text-[10px] text-base-content/35 text-center">
                Fields will update the deal. You can review in the deal's Overview tab.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-base-100">
      {ConversationList}
      {ThreadPanel}
      {PDFPreviewPanel}
      {ComposeModal}
      {EmailComposeModal}
      {ExtractionModal}
    </div>
  );
};
