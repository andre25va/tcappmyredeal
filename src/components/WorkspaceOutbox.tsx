import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Send, X, ChevronDown, ChevronUp, CheckCircle2, XCircle, Inbox, Clock, RefreshCw } from 'lucide-react';

interface PendingNotification {
  id: string;
  deal_id: string;
  milestone_type_key: string;
  milestone_label: string;
  due_date: string;
  days_before: number;
  recipient_type: 'agent' | 'client';
  recipient_name: string;
  recipient_email: string;
  subject: string;
  body: string;
  status: 'pending' | 'sent' | 'dismissed';
  created_at: string;
  sent_at?: string;
  dismissed_at?: string;
}

interface Props {
  deal: { id: string };
}

export const WorkspaceOutbox: React.FC<Props> = ({ deal }) => {
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading: loading, refetch: load } = useQuery<PendingNotification[]>({
    queryKey: ['pending-notifications', deal.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('pending_notifications')
        .select('*')
        .eq('deal_id', deal.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    staleTime: 30_000,
  });
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState<Record<string, { subject: string; body: string }>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [dismissing, setDismissing] = useState<Record<string, boolean>>({});

  const pending = notifications.filter(n => n.status === 'pending');
  const history = notifications.filter(n => n.status !== 'pending');

  const getEdit = (n: PendingNotification) =>
    editing[n.id] ?? { subject: n.subject, body: n.body };

  const updateEdit = (id: string, field: 'subject' | 'body', value: string) => {
    setEditing(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? notifications.find(n => n.id === id) ?? { subject: '', body: '' }), [field]: value },
    }));
  };

  const handleSend = async (n: PendingNotification) => {
    setSending(prev => ({ ...prev, [n.id]: true }));
    const edit = getEdit(n);
    try {
      const { data: result, error } = await supabase.functions.invoke('approve-notification', {
        body: {
          notificationId: n.id,
          subject: edit.subject,
          body: edit.body,
        },
      });
      if (error || !result?.success) {
        alert(`Send failed: ${error?.message || result?.error || 'Unknown error'}`);
      } else {
        await queryClient.invalidateQueries({ queryKey: ['pending-notifications', deal.id] });
        // Clear edits for sent item
        setEditing(prev => { const next = { ...prev }; delete next[n.id]; return next; });
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setSending(prev => ({ ...prev, [n.id]: false }));
    }
  };

  const handleDismiss = async (n: PendingNotification) => {
    setDismissing(prev => ({ ...prev, [n.id]: true }));
    await supabase
      .from('pending_notifications')
      .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
      .eq('id', n.id);
    await queryClient.invalidateQueries({ queryKey: ['pending-notifications', deal.id] });
    setDismissing(prev => ({ ...prev, [n.id]: false }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base-content">Pending Outbox</h3>
          <p className="text-xs text-base-content/50 mt-0.5">
            Review and approve milestone notifications before they go out
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <span className="badge badge-warning gap-1">
              <Clock size={11} /> {pending.length} pending
            </span>
          )}
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => void load()}
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Pending cards */}
      {pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-base-content/40 gap-2">
          <Inbox size={36} className="opacity-20" />
          <p className="text-sm font-medium">Pending Outbox is empty</p>
          <p className="text-xs text-center max-w-xs">
            Milestone reminders will appear here for your review when they're triggered by the daily schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map(n => {
            const edit = getEdit(n);
            const isDirty = edit.subject !== n.subject || edit.body !== n.body;

            return (
              <div key={n.id} className="card bg-base-100 border border-base-200 shadow-sm">
                <div className="card-body p-4 gap-3">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{n.milestone_label}</span>
                        <span className="badge badge-outline badge-xs opacity-60">
                          {n.days_before === 1 ? '1 day before' : `${n.days_before} days before`}
                        </span>
                        <span className={`badge badge-xs ${n.recipient_type === 'agent' ? 'badge-primary' : 'badge-secondary'}`}>
                          {n.recipient_type}
                        </span>
                      </div>
                      <p className="text-xs text-base-content/50">
                        Due: <strong>{n.due_date}</strong> · To: {n.recipient_name} &lt;{n.recipient_email}&gt;
                      </p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        className="btn btn-primary btn-sm gap-1"
                        onClick={() => handleSend(n)}
                        disabled={sending[n.id] || dismissing[n.id]}
                      >
                        {sending[n.id]
                          ? <span className="loading loading-spinner loading-xs" />
                          : <Send size={12} />
                        }
                        Send
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-square text-base-content/30 hover:text-error"
                        onClick={() => handleDismiss(n)}
                        disabled={sending[n.id] || dismissing[n.id]}
                        title="Dismiss"
                      >
                        {dismissing[n.id]
                          ? <span className="loading loading-spinner loading-xs" />
                          : <X size={14} />
                        }
                      </button>
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="text-xs font-medium text-base-content/50 mb-1 block">Subject</label>
                    <input
                      type="text"
                      className="input input-bordered input-sm w-full"
                      value={edit.subject}
                      onChange={e => updateEdit(n.id, 'subject', e.target.value)}
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <label className="text-xs font-medium text-base-content/50 mb-1 block">Message</label>
                    <textarea
                      className="textarea textarea-bordered w-full text-sm leading-relaxed resize-none"
                      rows={7}
                      value={edit.body}
                      onChange={e => updateEdit(n.id, 'body', e.target.value)}
                    />
                  </div>

                  {isDirty && (
                    <p className="text-xs text-warning font-medium">
                      ✎ Edited — your changes will be sent as-is.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* History section */}
      {history.length > 0 && (
        <div className="border-t border-base-200 pt-4">
          <button
            className="flex items-center gap-1.5 text-xs text-base-content/50 hover:text-base-content transition-colors mb-3"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showHistory ? 'Hide' : 'Show'} history ({history.length})
          </button>

          {showHistory && (
            <div className="space-y-1.5">
              {history.map(n => (
                <div
                  key={n.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-base-200/40 text-xs"
                >
                  {n.status === 'sent'
                    ? <CheckCircle2 size={13} className="text-success flex-shrink-0" />
                    : <XCircle size={13} className="text-base-content/25 flex-shrink-0" />
                  }
                  <span className="font-medium text-base-content/70 truncate">{n.milestone_label}</span>
                  <span className="text-base-content/30">·</span>
                  <span className="text-base-content/50 truncate">{n.recipient_name}</span>
                  <span className="ml-auto flex-shrink-0">
                    {n.status === 'sent'
                      ? <span className="text-success">{n.sent_at ? `Sent ${n.sent_at.split('T')[0]}` : 'Sent'}</span>
                      : <span className="text-base-content/30">Dismissed</span>
                    }
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
