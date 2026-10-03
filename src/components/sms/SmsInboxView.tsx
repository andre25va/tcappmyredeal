import React from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw, Search, Send, Smartphone, UserRound, X } from 'lucide-react';
import { consentWarning } from '../../lib/sms/consent.ts';
import { formatMessageTime, formatPhoneDisplay } from '../../lib/sms/phone.ts';
import type { ContactCardState, SmsContactCard, SmsConversation, SmsMessage } from '../../lib/sms/types.ts';
import { Button } from '../ui/Button';

export interface SmsInboxViewProps {
  conversations: SmsConversation[];
  selectedId: string | null;
  messages: SmsMessage[];
  contact: SmsContactCard | null;
  contactState: ContactCardState | null;
  contactFetchedAt: string | null;
  loadingList: boolean;
  loadingThread: boolean;
  sending: boolean;
  error: string | null;
  search: string;
  draft: string;
  newDraft: string;
  newPhone: string;
  showNew: boolean;
  showContact: boolean;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onDraft: (value: string) => void;
  onNewDraft: (value: string) => void;
  onSend: () => void;
  onSendNew: () => void;
  onToggleNew: () => void;
  onNewPhone: (value: string) => void;
  onRefreshContact: () => void;
  onToggleContact: () => void;
}

function conversationTitle(conversation: SmsConversation): string {
  return conversation.display_name || formatPhoneDisplay(conversation.phone_e164);
}

function statusLabel(status: string): string {
  if (status === 'received') return '';
  return status;
}

export const SmsInboxView: React.FC<SmsInboxViewProps> = ({
  conversations, selectedId, messages, contact, contactState, contactFetchedAt,
  loadingList, loadingThread, sending, error, search, draft, newDraft, newPhone, showNew, showContact,
  onSearch, onSelect, onBack, onDraft, onNewDraft, onSend, onSendNew, onToggleNew, onNewPhone, onRefreshContact, onToggleContact,
}) => {
  const selected = conversations.find(conversation => conversation.id === selectedId) || null;
  const warning = selected ? consentWarning(selected.consent) : null;
  const blocked = selected?.consent === 'opted_out';
  const query = search.trim().toLowerCase();
  const visible = conversations.filter(conversation => {
    if (!query) return true;
    const haystack = `${conversation.display_name || ''} ${conversation.phone_e164} ${conversation.last_message_preview || ''}`.toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div className="relative flex h-full min-h-0 bg-base-100" data-testid="sms-inbox">
      <section className={`w-full md:w-80 md:flex-none border-r border-base-300 flex flex-col min-h-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-3 py-3 border-b border-base-300 flex items-center gap-2">
          <div className="flex-1">
            <h2 className="font-semibold text-sm">Texts</h2>
            <p className="text-[11px] text-base-content/50">Transaction updates only</p>
          </div>
          <Button size="xs" variant={showNew ? 'neutral' : 'outline'} onClick={onToggleNew}>
            {showNew ? 'Close' : 'New text'}
          </Button>
        </div>
        {showNew && (
          <form
            className="p-3 border-b border-base-300 bg-base-200/60 space-y-2"
            onSubmit={event => { event.preventDefault(); onSendNew(); }}
          >
            <label className="text-xs font-medium text-base-content/70" htmlFor="sms-new-phone">Phone number</label>
            <input
              id="sms-new-phone"
              className="input input-bordered input-sm w-full"
              placeholder="(816) 555-0100"
              value={newPhone}
              onChange={event => onNewPhone(event.target.value)}
            />
            <textarea
              className="textarea textarea-bordered textarea-sm w-full"
              rows={3}
              placeholder="Transaction update"
              value={newDraft}
              onChange={event => onNewDraft(event.target.value)}
            />
            <p className="text-[11px] text-warning">No opt-in on file until they text START or YES. Confirm you already have consent.</p>
            {error && <p className="text-xs text-error">{error}</p>}
            <Button type="submit" variant="primary" size="sm" loading={sending} disabled={!newPhone.trim() || !newDraft.trim()}>
              Send text
            </Button>
          </form>
        )}
        <div className="px-3 py-2 border-b border-base-300">
          <label className="input input-bordered input-sm flex items-center gap-2">
            <Search size={14} className="text-base-content/40" />
            <input
              className="grow bg-transparent outline-none"
              placeholder="Search name or number"
              value={search}
              onChange={event => onSearch(event.target.value)}
              aria-label="Search conversations"
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto" data-testid="sms-conversation-list">
          {loadingList && conversations.length === 0 && (
            <div className="p-6 text-sm text-base-content/50">Loading conversations…</div>
          )}
          {!loadingList && visible.length === 0 && (
            <div className="p-6 text-sm text-base-content/50">No texts yet. Inbound messages will show up here.</div>
          )}
          {visible.map(conversation => {
            const active = conversation.id === selectedId;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={`w-full text-left px-3 py-3 border-b border-base-200 ${active ? 'bg-primary/10' : 'hover:bg-base-200'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate flex-1">{conversationTitle(conversation)}</span>
                  <span className="text-[10px] text-base-content/40 flex-none">{formatMessageTime(conversation.last_message_at)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-base-content/60 truncate flex-1">{conversation.last_message_preview || formatPhoneDisplay(conversation.phone_e164)}</span>
                  {conversation.unread_count > 0 && (
                    <span className="badge badge-error badge-sm">{conversation.unread_count > 99 ? '99+' : conversation.unread_count}</span>
                  )}
                  {conversation.consent === 'opted_out' && (
                    <span className="badge badge-ghost badge-sm">Opted out</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className={`flex-1 min-w-0 flex-col min-h-0 ${selected ? 'flex' : 'hidden md:flex'}`} data-testid="sms-thread">
        {!selected && (
          <div className="flex-1 flex flex-col items-center justify-center text-base-content/40 gap-2">
            <Smartphone size={28} />
            <p className="text-sm">Select a conversation</p>
          </div>
        )}
        {selected && (
          <>
            <div className="px-3 py-3 border-b border-base-300 flex items-center gap-2">
              <button type="button" className="btn btn-ghost btn-sm btn-square md:hidden" onClick={onBack} aria-label="Back to conversations">
                <ArrowLeft size={16} />
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{conversationTitle(selected)}</p>
                <p className="text-[11px] text-base-content/50">{formatPhoneDisplay(selected.phone_e164)}</p>
              </div>
              <Button size="xs" variant="ghost" icon={<UserRound size={14} />} className="lg:hidden" onClick={onToggleContact}>
                Contact
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {loadingThread && messages.length === 0 && <p className="text-sm text-base-content/50">Loading messages…</p>}
              {messages.map(message => {
                const outbound = message.direction === 'outbound';
                return (
                  <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${outbound ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content'}`}>
                      <p>{message.body || '(no text)'}</p>
                      <p className={`text-[10px] mt-1 ${outbound ? 'text-primary-content/70' : 'text-base-content/40'}`}>
                        {formatMessageTime(message.created_at)}
                        {outbound && statusLabel(message.status) ? ` · ${statusLabel(message.status)}` : ''}
                        {message.error_code ? ` · error ${message.error_code}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <form
              className="border-t border-base-300 p-3 space-y-2"
              data-testid="sms-compose"
              onSubmit={event => { event.preventDefault(); if (!blocked) onSend(); }}
            >
              {error && <p className="text-xs text-error">{error}</p>}
              {blocked && (
                <p className="text-xs text-error flex items-start gap-1" data-testid="sms-opt-out-banner">
                  <AlertTriangle size={14} className="mt-0.5 flex-none" />
                  {warning}
                </p>
              )}
              {!blocked && warning && (
                <p className="text-xs text-warning flex items-start gap-1" data-testid="sms-consent-warning">
                  <AlertTriangle size={14} className="mt-0.5 flex-none" />
                  {warning}
                </p>
              )}
              <textarea
                className="textarea textarea-bordered w-full"
                rows={3}
                placeholder={blocked ? 'Sending is blocked' : 'Write a transaction update'}
                value={draft}
                disabled={blocked}
                maxLength={1600}
                onChange={event => onDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (!blocked) onSend();
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-base-content/40">{draft.length}/1600</span>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={<Send size={14} />}
                  loading={sending}
                  disabled={blocked || !draft.trim()}
                  data-testid="sms-send"
                >
                  Send
                </Button>
              </div>
            </form>
          </>
        )}
      </section>

      {selected && (
        <aside className={`w-full lg:w-72 lg:flex-none border-l border-base-300 bg-base-100 flex-col min-h-0 ${showContact ? 'flex absolute inset-0 z-20 lg:static' : 'hidden lg:flex'}`} data-testid="sms-contact-card">
          <div className="px-3 py-3 border-b border-base-300 flex items-center gap-2">
            <h3 className="font-semibold text-sm flex-1">Follow Up Boss</h3>
            <button type="button" className="btn btn-ghost btn-xs btn-square" onClick={onRefreshContact} aria-label="Refresh contact">
              <RefreshCw size={14} />
            </button>
            <button type="button" className="btn btn-ghost btn-xs btn-square lg:hidden" onClick={onToggleContact} aria-label="Close contact">
              <X size={14} />
            </button>
          </div>
          <div className="p-3 overflow-y-auto text-sm space-y-3">
            {contactState === 'unconfigured' && <p className="text-base-content/60">Follow Up Boss is not configured.</p>}
            {contactState === 'error' && <p className="text-error">Could not load this contact. Try refresh.</p>}
            {contactState === 'not_found' && <p className="text-base-content/60">No Follow Up Boss person matches this number.</p>}
            {contact && (
              <>
                <div>
                  <p className="font-semibold">{contact.name}</p>
                  {contact.stage && <span className="badge badge-outline badge-sm mt-1">{contact.stage}</span>}
                </div>
                {contact.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map(tag => <span key={tag} className="badge badge-ghost badge-sm">{tag}</span>)}
                  </div>
                )}
                {contact.phones.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-base-content/40 mb-1">Phones</p>
                    {contact.phones.map(phone => (
                      <p key={phone.value} className="text-xs">{phone.value}{phone.type ? ` · ${phone.type}` : ''}</p>
                    ))}
                  </div>
                )}
                {contact.emails.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-base-content/40 mb-1">Emails</p>
                    {contact.emails.map(email => (
                      <p key={email.value} className="text-xs break-all">{email.value}{email.type ? ` · ${email.type}` : ''}</p>
                    ))}
                  </div>
                )}
              </>
            )}
            {contactFetchedAt && (
              <p className="text-[11px] text-base-content/40">Looked up {formatMessageTime(contactFetchedAt)}</p>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};
