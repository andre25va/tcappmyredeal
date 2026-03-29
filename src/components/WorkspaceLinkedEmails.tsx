import React, { useState } from 'react';
import { Mail, Paperclip, Zap, User, Sparkles, RefreshCw, Inbox, ChevronDown, ChevronUp } from 'lucide-react';
import { useLinkedEmails, LinkedEmailThread } from '../hooks/useLinkedEmails';
import { Deal } from '../types';
import { EmptyState } from './ui/EmptyState';
import { Button } from '@/components/ui/Button';

interface Props {
  deal: Deal;
  onUnreadCount?: (count: number) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (hours < 48) return 'Yesterday';
  if (hours < 168) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function senderName(from: string | null): string {
  if (!from) return 'Unknown';
  const match = from.match(/^"?([^"<]+)"?\s*<?/);
  if (match) return match[1].trim();
  return from.split('@')[0];
}

function senderDomain(from: string | null): string {
  if (!from) return '';
  const match = from.match(/@([^>]+)/);
  return match ? match[1].trim() : '';
}

function linkMethodBadge(method: LinkedEmailThread['link_method']) {
  switch (method) {
    case 'auto':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Zap size={9} /> Auto
        </span>
      );
    case 'ai_suggested':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200">
          <Sparkles size={9} /> AI
        </span>
      );
    case 'manual':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <User size={9} /> Manual
        </span>
      );
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 35) return 'text-amber-600';
  return 'text-gray-400';
}

interface ThreadRowProps {
  thread: LinkedEmailThread;
  onMarkRead: (id: string) => void;
}

const ThreadRow: React.FC<ThreadRowProps> = ({ thread, onMarkRead }) => {
  const [expanded, setExpanded] = useState(false);

  const handleClick = () => {
    if (thread.is_unread) onMarkRead(thread.gmail_thread_id);
    setExpanded(e => !e);
  };

  const breakdown = thread.score_breakdown ?? {};
  const signals = Object.entries(breakdown).filter(([, v]) => v !== 0);

  return (
    <div
      className={`border border-base-200 rounded-xl overflow-hidden transition-shadow hover:shadow-md ${
        thread.is_unread ? 'bg-blue-50/40 border-blue-200' : 'bg-white'
      }`}
    >
      {/* Main row */}
      <button
        onClick={handleClick}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
      >
        {/* Unread dot */}
        <div className="flex-none mt-1.5">
          {thread.is_unread
            ? <span className="block w-2 h-2 rounded-full bg-blue-500" />
            : <span className="block w-2 h-2 rounded-full bg-transparent" />
          }
        </div>

        {/* Mail icon */}
        <div className={`flex-none mt-0.5 ${thread.is_unread ? 'text-blue-500' : 'text-base-content/30'}`}>
          <Mail size={16} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className={`text-sm ${thread.is_unread ? 'font-bold text-base-content' : 'font-medium text-base-content/80'}`}>
              {senderName(thread.thread_from)}
              {senderDomain(thread.thread_from) && (
                <span className="text-xs text-base-content/40 font-normal ml-1">@{senderDomain(thread.thread_from)}</span>
              )}
            </span>
            <div className="flex items-center gap-2 flex-none">
              {thread.has_attachment && <Paperclip size={12} className="text-base-content/40" />}
              {linkMethodBadge(thread.link_method)}
              <span className={`text-[10px] font-bold ${scoreColor(thread.score)}`}>{thread.score}pts</span>
              <span className="text-xs text-base-content/40">{formatDate(thread.thread_date)}</span>
            </div>
          </div>
          <p className={`text-xs mt-0.5 truncate ${thread.is_unread ? 'text-base-content font-medium' : 'text-base-content/60'}`}>
            {thread.thread_subject || '(no subject)'}
          </p>
          {!expanded && thread.thread_snippet && (
            <p className="text-xs text-base-content/40 truncate mt-0.5">{thread.thread_snippet}</p>
          )}
        </div>

        {/* Expand toggle */}
        <div className="flex-none text-base-content/30 mt-1">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-base-200 pt-3 space-y-3">
          {/* Snippet */}
          {thread.thread_snippet && (
            <p className="text-sm text-base-content/70 leading-relaxed">{thread.thread_snippet}</p>
          )}

          {/* Score breakdown */}
          {signals.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1.5">Score Breakdown</p>
              <div className="flex flex-wrap gap-1.5">
                {signals.map(([key, val]) => (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      (val as number) > 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    {(val as number) > 0 ? '+' : ''}{val as number} {key.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Thread link */}
          <a
            href={`https://mail.google.com/mail/u/0/#inbox/${thread.gmail_thread_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            onClick={e => e.stopPropagation()}
          >
            <Mail size={11} /> Open in Gmail &rarr;
          </a>
        </div>
      )}
    </div>
  );
};

export const WorkspaceLinkedEmails: React.FC<Props> = ({ deal, onUnreadCount }) => {
  const { threads, loading, error, unreadCount, markRead, refetch } = useLinkedEmails(deal.id);

  // Bubble unread count up to parent for tab badge
  React.useEffect(() => { onUnreadCount?.(unreadCount); }, [unreadCount, onUnreadCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="loading loading-spinner loading-md text-primary" />
        <span className="ml-3 text-sm text-base-content/60">Loading linked emails…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm text-error">Failed to load emails: {error}</p>
        <Button variant="outline" onClick={refetch}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-base-content">Linked Emails</h2>
          {unreadCount > 0 && (
            <span className="badge badge-primary badge-sm">{unreadCount} new</span>
          )}
        </div>
        <button
          onClick={refetch}
          className="btn btn-ghost btn-xs gap-1.5 text-base-content/50 hover:text-base-content"
          title="Refresh"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Stats bar */}
      {threads.length > 0 && (
        <div className="flex items-center gap-4 px-3 py-2 bg-base-200 rounded-lg text-xs text-base-content/60">
          <span><strong className="text-base-content">{threads.length}</strong> thread{threads.length !== 1 ? 's' : ''}</span>
          <span><strong className="text-emerald-600">{threads.filter(t => t.link_method === 'auto').length}</strong> auto-linked</span>
          <span><strong className="text-violet-600">{threads.filter(t => t.link_method === 'ai_suggested').length}</strong> AI-suggested</span>
          <span><strong className="text-blue-600">{threads.filter(t => t.link_method === 'manual').length}</strong> manual</span>
        </div>
      )}

      {/* Thread list */}
      {threads.length === 0 ? (
        <EmptyState
          icon={<Mail size={20} />}
          title="No linked emails yet"
          message="Emails sent to tc@myredeal.com that mention this deal's address will automatically appear here."
        />
      ) : (
        <div className="space-y-2">
          {threads.map(thread => (
            <ThreadRow
              key={thread.gmail_thread_id}
              thread={thread}
              onMarkRead={markRead}
            />
          ))}
        </div>
      )}
    </div>
  );
};
