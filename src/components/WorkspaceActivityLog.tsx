import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, Phone, ClipboardList, MessageSquare, Plus, RefreshCw,
  Activity, ChevronDown, ChevronUp, Smartphone, UserCheck,
} from 'lucide-react';
import { Deal, ActivityType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { generateId } from '../utils/helpers';
import { supabase } from '../lib/supabase';

interface ChangeDiff { field: string; old_value: string; new_value: string; }

interface ActivityItem {
  id: string;
  type: 'email' | 'call' | 'call_note' | 'request' | 'request_event' | 'note' | 'activity' | 'sms' | 'whatsapp' | 'contact_update';
  timestamp: string;
  title: string;
  body?: string;
  meta?: Record<string, any>;
}

interface Props { deal: Deal; onUpdate: (d: Deal) => void; }

const TYPE_ICON: Record<string, React.ReactNode> = {
  email:          <Mail size={13} className="text-blue-600" />,
  call:           <Phone size={13} className="text-green-600" />,
  call_note:      <MessageSquare size={13} className="text-purple-600" />,
  request:        <ClipboardList size={13} className="text-orange-600" />,
  request_event:  <ClipboardList size={13} className="text-orange-400" />,
  note:           <MessageSquare size={13} className="text-base-content/60" />,
  activity:       <Activity size={13} className="text-base-content/40" />,
  sms:            <Smartphone size={13} className="text-teal-600" />,
  whatsapp:       <Smartphone size={13} className="text-emerald-600" />,
  contact_update: <UserCheck size={13} className="text-amber-600" />,
};

const TYPE_BG: Record<string, string> = {
  email:          'bg-blue-50',
  call:           'bg-green-50',
  call_note:      'bg-purple-50',
  request:        'bg-orange-50',
  request_event:  'bg-orange-50/60',
  note:           'bg-base-300',
  activity:       'bg-base-200',
  sms:            'bg-teal-50',
  whatsapp:       'bg-emerald-50',
  contact_update: 'bg-amber-50',
};

const FILTERS = [
  { value: 'all',            label: 'All' },
  { value: 'email',          label: '📧 Emails' },
  { value: 'call',           label: '📞 Calls' },
  { value: 'sms',            label: '💬 SMS/Chat' },
  { value: 'request',        label: '📋 Requests' },
  { value: 'note',           label: '📝 Notes' },
  { value: 'contact_update', label: '👤 Contact Updates' },
];

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

const fmtDuration = (secs?: number) => {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

export const WorkspaceActivityLog: React.FC<Props> = ({ deal, onUpdate }) => {
  const { profile } = useAuth();
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems]           = useState<ActivityItem[]>([]);
  const [filter, setFilter]         = useState<string>('all');
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({});
  const [note, setNote]             = useState('');
  const [staffName, setStaffName]   = useState(profile?.name || 'TC Staff');

  useEffect(() => { if (profile?.name) setStaffName(profile.name); }, [profile?.name]);

  const loadData = useCallback(async () => {
    try {
      // Parallel fetches
      const [emailRes, callRes, callNoteRes, requestRes, messagesRes, contactChangeRes] = await Promise.all([
        supabase
          .from('email_send_log')
          .select('id, subject, to_addresses, template_name, sent_by, sent_at')
          .eq('deal_id', deal.id)
          .order('sent_at', { ascending: false })
          .limit(100),
        supabase
          .from('call_logs')
          .select('id, direction, to_number, from_number, status, duration, dial_call_status, ai_summary, created_at, contacts:contact_id(first_name, last_name)')
          .eq('deal_id', deal.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('call_notes')
          .select('id, raw_notes, ai_summary, created_at')
          .eq('deal_id', deal.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('requests')
          .select('id, request_type, status, requested_from_name, notes, created_at')
          .eq('deal_id', deal.id)
          .order('created_at', { ascending: false })
          .limit(100),
        // SMS + WhatsApp messages tied to this deal
        supabase
          .from('messages')
          .select('id, direction, channel, body, status, sent_at, created_at, from_number, to_number, contact_id')
          .eq('deal_id', deal.id)
          .in('channel', ['sms', 'whatsapp'])
          .order('created_at', { ascending: false })
          .limit(100),
        // Contact change log
        supabase
          .from('contact_change_log')
          .select('*')
          .eq('deal_id', deal.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      // Request events
      const requestIds = (requestRes.data || []).map((r: any) => r.id);
      const requestEventRes = requestIds.length > 0
        ? await supabase
            .from('request_events')
            .select('id, event_type, description, actor, created_at, request_id')
            .in('request_id', requestIds)
            .order('created_at', { ascending: false })
            .limit(200)
        : { data: [] };

      const normalized: ActivityItem[] = [];

      // Emails
      for (const e of emailRes.data || []) {
        normalized.push({
          id: `email-${e.id}`,
          type: 'email',
          timestamp: e.sent_at,
          title: `Email sent: ${e.subject || '(no subject)'}`,
          body: [
            (e.to_addresses || []).join(', '),
            e.template_name ? `Template: ${e.template_name}` : '',
            e.sent_by ? `By: ${e.sent_by}` : '',
          ].filter(Boolean).join(' · '),
        });
      }

      // Calls
      for (const c of callRes.data || []) {
        const ct = c.contacts as any;
        const who = ct
          ? `${ct.first_name || ''} ${ct.last_name || ''}`.trim()
          : c.direction === 'inbound' ? c.from_number : c.to_number;
        const dur = fmtDuration(c.duration);
        const statusLabel = c.dial_call_status || c.status || '';
        normalized.push({
          id: `call-${c.id}`,
          type: 'call',
          timestamp: c.created_at,
          title: `${c.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'} call${who ? ` · ${who}` : ''}`,
          body: [statusLabel, dur].filter(Boolean).join(' · ') || undefined,
          meta: { ai_summary: c.ai_summary, callId: c.id },
        });
      }

      // Call Notes
      for (const n of callNoteRes.data || []) {
        normalized.push({
          id: `callnote-${n.id}`,
          type: 'call_note',
          timestamp: n.created_at,
          title: 'Call note',
          body: n.ai_summary || n.raw_notes || undefined,
        });
      }

      // Requests
      for (const r of requestRes.data || []) {
        normalized.push({
          id: `req-${r.id}`,
          type: 'request',
          timestamp: r.created_at,
          title: `Request: ${(r.request_type || '').replace(/_/g, ' ')}`,
          body: [
            r.requested_from_name,
            `Status: ${r.status}`,
            r.notes || '',
          ].filter(Boolean).join(' · ') || undefined,
        });
      }

      // Request Events
      for (const ev of requestEventRes.data || []) {
        normalized.push({
          id: `reqev-${ev.id}`,
          type: 'request_event',
          timestamp: ev.created_at,
          title: `Request ${(ev.event_type || '').replace(/_/g, ' ')}`,
          body: ev.description || undefined,
          meta: { actor: ev.actor },
        });
      }

      // SMS / WhatsApp messages
      for (const m of messagesRes.data || []) {
        const channel = m.channel === 'whatsapp' ? 'whatsapp' : 'sms';
        const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
        const dirLabel = m.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound';
        const contact = m.direction === 'inbound' ? m.from_number : m.to_number;
        normalized.push({
          id: `msg-${m.id}`,
          type: channel,
          timestamp: m.sent_at || m.created_at,
          title: `${dirLabel} ${channelLabel}${contact ? ` · ${contact}` : ''}`,
          body: m.body ? (m.body.length > 200 ? m.body.slice(0, 200) + '…' : m.body) : undefined,
          meta: { status: m.status, messageId: m.id },
        });
      }

      // Contact change log events
      for (const r of contactChangeRes.data || []) {
        normalized.push({
          id: `contactchange-${r.id}`,
          type: 'contact_update',
          timestamp: r.created_at,
          title: r.action_type === 'add'
            ? `${r.contact_name || 'Contact'} added to deal`
            : r.action_type === 'remove'
            ? `${r.contact_name || 'Contact'} removed from deal`
            : `${r.contact_name || 'Contact'} updated`,
          body: r.changed_by_name
            + (r.changes?.length ? ': ' + (r.changes as ChangeDiff[]).map(c => `${c.field} changed`).join(', ') : ''),
          meta: { changes: r.changes, action_type: r.action_type, changed_by_name: r.changed_by_name },
        });
      }

      // In-memory notes from deal.activityLog
      for (const entry of (deal.activityLog || [])) {
        normalized.push({
          id: `log-${entry.id}`,
          type: (entry.type === 'note' ? 'note' : 'activity') as ActivityItem['type'],
          timestamp: entry.timestamp,
          title: entry.action,
          body: entry.detail || undefined,
          meta: { user: entry.user },
        });
      }

      // Sort newest first
      normalized.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setItems(normalized);
    } catch (err) {
      console.error('WorkspaceActivityLog load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deal.id, deal.activityLog]);

  useEffect(() => { setLoading(true); loadData(); }, [loadData]);

  const addNote = () => {
    if (!note.trim()) return;
    const entry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      action: note.trim(),
      detail: '',
      user: staffName.trim() || 'TC Staff',
      type: 'note' as ActivityType,
    };
    onUpdate({ ...deal, activityLog: [entry, ...deal.activityLog], updatedAt: new Date().toISOString() });
    setNote('');
  };

  const filtered = filter === 'all'
    ? items
    : filter === 'call'
      ? items.filter(i => i.type === 'call' || i.type === 'call_note')
      : filter === 'request'
        ? items.filter(i => i.type === 'request' || i.type === 'request_event')
        : filter === 'sms'
          ? items.filter(i => i.type === 'sms' || i.type === 'whatsapp')
          : items.filter(i => i.type === filter);

  // Group by date
  const grouped: { date: string; entries: ActivityItem[] }[] = [];
  filtered.forEach(item => {
    const date = new Date(item.timestamp).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    const last = grouped[grouped.length - 1];
    if (last && last.date === date) last.entries.push(item);
    else grouped.push({ date, entries: [item] });
  });

  // Count SMS for filter badge
  const smsCount = items.filter(i => i.type === 'sms' || i.type === 'whatsapp').length;
  const contactUpdateCount = items.filter(i => i.type === 'contact_update').length;

  return (
    <div className="p-5 space-y-4">

      {/* Add note */}
      <div className="bg-base-200 rounded-xl border border-base-300 p-4">
        <p className="text-xs font-semibold text-base-content/50 mb-2 flex items-center gap-1.5">
          <MessageSquare size={12} /> Add Note to Log
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            className="input input-bordered input-sm flex-1 min-w-[180px]"
            placeholder="Add a note or update..."
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addNote()}
          />
          <input
            className="input input-bordered input-sm w-32"
            placeholder="Your name"
            value={staffName}
            onChange={e => setStaffName(e.target.value)}
          />
          <button onClick={addNote} className="btn btn-primary btn-sm gap-1">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`btn btn-xs ${filter === f.value ? 'btn-primary' : 'btn-ghost'}`}
          >
            {f.label}
            {f.value === 'sms' && smsCount > 0 && (
              <span className="ml-1 badge badge-xs badge-teal bg-teal-100 text-teal-700 border-teal-200">{smsCount}</span>
            )}
            {f.value === 'contact_update' && contactUpdateCount > 0 && (
              <span className="ml-1 badge badge-xs bg-amber-100 text-amber-700 border-amber-200">{contactUpdateCount}</span>
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-base-content/40">{filtered.length} events</span>
          <button
            onClick={() => { setRefreshing(true); loadData(); }}
            className={`btn btn-ghost btn-xs btn-square ${refreshing ? 'animate-spin' : ''}`}
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-md text-primary" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-base-content/30">
          <Activity size={32} className="mb-2 opacity-30" />
          <p className="text-sm">No activity recorded for this deal yet.</p>
        </div>
      ) : (
        grouped.map(group => (
          <div key={group.date}>
            {/* Date divider */}
            <div className="flex items-center gap-3 mb-2">
              <div className="h-px bg-base-300 flex-1" />
              <span className="text-xs text-base-content/40 font-medium">{group.date}</span>
              <div className="h-px bg-base-300 flex-1" />
            </div>

            <div className="space-y-2">
              {group.entries.map(entry => {
                const isExpanded = expanded[entry.id];
                const hasSummary = entry.meta?.ai_summary;
                const hasChanges = entry.type === 'contact_update' && (entry.meta?.changes?.length ?? 0) > 0;
                const isExpandable = hasSummary || hasChanges;
                return (
                  <div key={entry.id} className="flex gap-3 items-start">
                    {/* Icon */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-none mt-0.5 ${TYPE_BG[entry.type]}`}>
                      {TYPE_ICON[entry.type]}
                    </div>
                    {/* Card */}
                    <div className="flex-1 min-w-0 bg-base-200 rounded-xl border border-base-300 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-base-content leading-snug">{entry.title}</p>
                        <div className="flex items-center gap-1.5 flex-none">
                          {/* Channel badges */}
                          {entry.type === 'sms' && (
                            <span className="badge badge-xs bg-teal-100 text-teal-700 border-teal-200 font-medium">SMS</span>
                          )}
                          {entry.type === 'whatsapp' && (
                            <span className="badge badge-xs bg-emerald-100 text-emerald-700 border-emerald-200 font-medium">WhatsApp</span>
                          )}
                          {entry.type === 'contact_update' && (
                            <span className="badge badge-xs bg-amber-100 text-amber-700 border-amber-200 font-medium">
                              {entry.meta?.action_type === 'add' ? 'added' : entry.meta?.action_type === 'remove' ? 'removed' : 'updated'}
                            </span>
                          )}
                          <span className="text-xs text-base-content/40 whitespace-nowrap">
                            {fmtTime(entry.timestamp)}
                          </span>
                        </div>
                      </div>
                      {entry.body && (
                        <p className="text-xs text-base-content/60 mt-0.5 leading-relaxed whitespace-pre-wrap">{entry.body}</p>
                      )}
                      {/* AI summary or contact diff expand/collapse */}
                      {isExpandable && (
                        <div className="mt-1.5">
                          <button
                            onClick={() => setExpanded(s => ({ ...s, [entry.id]: !s[entry.id] }))}
                            className="flex items-center gap-1 text-xs font-medium text-primary/70 hover:text-primary"
                          >
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {hasSummary ? 'AI Summary' : 'View Changes'}
                          </button>
                          {isExpanded && hasSummary && (
                            <p className="text-xs text-base-content/60 mt-1 bg-base-100 rounded-lg p-2 whitespace-pre-wrap">
                              {entry.meta?.ai_summary}
                            </p>
                          )}
                          {isExpanded && hasChanges && (
                            <div className="mt-1.5 space-y-0.5">
                              {(entry.meta.changes as ChangeDiff[]).map((c, i) => (
                                <div key={i} className="text-[11px] text-base-content/60">
                                  <span className="font-medium">{c.field}:</span>{' '}
                                  <span className="line-through opacity-50">{c.old_value || '(empty)'}</span>
                                  {' → '}
                                  <span className="font-medium text-amber-700">{c.new_value || '(empty)'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Actor/user attribution */}
                      {(entry.meta?.user || entry.meta?.actor) && (
                        <p className="text-xs text-base-content/40 mt-1">
                          — {entry.meta.user || entry.meta.actor}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
