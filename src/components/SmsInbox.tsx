import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toE164 } from '../lib/sms/phone.ts';
import type { ContactCardState, SmsContactCard, SmsConversation, SmsMessage } from '../lib/sms/types.ts';
import { SmsInboxView } from './sms/SmsInboxView';

interface ThreadResponse {
  conversation: SmsConversation;
  messages: SmsMessage[];
  contact: SmsContactCard | null;
  contact_state: ContactCardState;
  contact_fetched_at: string | null;
}

async function inboxRequest(token: string, path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed') as Error & { code?: string };
    error.code = data.code;
    throw error;
  }
  return data;
}

export const SmsInbox: React.FC<{ onUnreadChange?: (count: number) => void }> = ({ onUnreadChange }) => {
  const { token } = useAuth();
  const [conversations, setConversations] = useState<SmsConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [contact, setContact] = useState<SmsContactCard | null>(null);
  const [contactState, setContactState] = useState<ContactCardState | null>(null);
  const [contactFetchedAt, setContactFetchedAt] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [newDraft, setNewDraft] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showContact, setShowContact] = useState(false);

  const reportUnread = useCallback((rows: SmsConversation[]) => {
    const total = rows.reduce((sum, row) => sum + (row.unread_count || 0), 0);
    onUnreadChange?.(total);
  }, [onUnreadChange]);

  const loadList = useCallback(async () => {
    if (!token) return;
    try {
      const data = await inboxRequest(token, '/api/sms-inbox');
      const rows = (data.conversations || []) as SmsConversation[];
      setConversations(rows);
      reportUnread(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load texts');
    } finally {
      setLoadingList(false);
    }
  }, [token, reportUnread]);

  const loadThread = useCallback(async (conversationId: string, refreshContact = false) => {
    if (!token) return;
    setLoadingThread(true);
    try {
      const query = refreshContact ? '&refresh_contact=1' : '';
      const data = await inboxRequest(token, `/api/sms-inbox?conversation_id=${encodeURIComponent(conversationId)}${query}`) as ThreadResponse;
      setMessages(data.messages || []);
      setContact(data.contact);
      setContactState(data.contact_state);
      setContactFetchedAt(data.contact_fetched_at);
      setConversations(current => {
        const next = current.map(row => row.id === data.conversation.id ? { ...row, ...data.conversation, unread_count: 0 } : row);
        const exists = next.some(row => row.id === data.conversation.id);
        const rows = exists ? next : [data.conversation, ...next];
        reportUnread(rows);
        return rows;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the conversation');
    } finally {
      setLoadingThread(false);
    }
  }, [token, reportUnread]);

  useEffect(() => {
    loadList();
    const timer = setInterval(loadList, 10000);
    return () => clearInterval(timer);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    loadThread(selectedId);
    const timer = setInterval(() => loadThread(selectedId), 10000);
    return () => clearInterval(timer);
  }, [selectedId, loadThread]);

  const sendPayload = async (payload: { body: string; conversation_id?: string; to?: string }, mode: 'reply' | 'new') => {
    if (!token || sending) return;
    setError(null);
    setSending(true);
    try {
      const data = await inboxRequest(token, '/api/sms-inbox', { method: 'POST', body: JSON.stringify(payload) });
      if (mode === 'new') {
        setNewDraft('');
        setNewPhone('');
        setShowNew(false);
      } else {
        setDraft('');
      }
      const conversationId = data.conversation_id as string;
      setSelectedId(conversationId);
      await loadList();
      await loadThread(conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The text could not be sent.');
      if ((err as { code?: string }).code === 'opted_out' && payload.conversation_id) {
        setConversations(current => current.map(row => row.id === payload.conversation_id ? { ...row, consent: 'opted_out' } : row));
      }
    } finally {
      setSending(false);
    }
  };

  const sendReply = () => {
    const body = draft.trim();
    if (!selectedId || !body) return;
    const selected = conversations.find(row => row.id === selectedId);
    if (selected?.consent === 'opted_out') return;
    void sendPayload({ body, conversation_id: selectedId }, 'reply');
  };

  const sendNew = () => {
    const body = newDraft.trim();
    if (!body) return;
    if (!toE164(newPhone)) {
      setError('Enter a valid phone number.');
      return;
    }
    void sendPayload({ body, to: newPhone }, 'new');
  };

  return (
    <SmsInboxView
      conversations={conversations}
      selectedId={selectedId}
      messages={messages}
      contact={contact}
      contactState={contactState}
      contactFetchedAt={contactFetchedAt}
      loadingList={loadingList}
      loadingThread={loadingThread}
      sending={sending}
      error={error}
      search={search}
      draft={draft}
      newDraft={newDraft}
      newPhone={newPhone}
      showNew={showNew}
      showContact={showContact}
      onSearch={setSearch}
      onSelect={id => { setError(null); setShowNew(false); setSelectedId(id); setShowContact(false); }}
      onBack={() => setSelectedId(null)}
      onDraft={setDraft}
      onNewDraft={setNewDraft}
      onSend={sendReply}
      onSendNew={sendNew}
      onToggleNew={() => { setShowNew(value => !value); setError(null); }}
      onNewPhone={setNewPhone}
      onRefreshContact={() => { if (selectedId) loadThread(selectedId, true); }}
      onToggleContact={() => setShowContact(value => !value)}
    />
  );
};
