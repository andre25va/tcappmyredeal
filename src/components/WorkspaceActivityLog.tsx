import React, { useState, useEffect } from 'react';
import { useActivityLog, useInvalidateActivityLog, type ActivityItem } from '../hooks/useActivityLog';
import {
  Mail, Phone, ClipboardList, MessageSquare, Plus, RefreshCw,
  Activity, ChevronDown, ChevronUp, Smartphone, UserCheck,
  CheckSquare, ArrowRightLeft, Brain, Home,
} from 'lucide-react';
import { Deal, ActivityType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { generateId } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import { EmptyState } from './ui/EmptyState';

interface ChangeDiff { field: string; old_value: string; new_value: string; }

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
  portal:         <Home size={13} className="text-[#1B2C5E]" />,
  contact_update: <UserCheck size={13} className="text-amber-600" />,
  task_event:     <CheckSquare size={13} className="text-indigo-600" />,
  status_change:  <ArrowRightLeft size={13} className="text-rose-500" />,
  ai_summary:     <Brain size={13} className="text-violet-600" />,
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
  portal:         'bg-blue-50',
  contact_update: 'bg-amber-50',
  task_event:     'bg-indigo-50',
  status_change:  'bg-rose-50',
  ai_summary:     'bg-violet-50',
};

const FILTERS = [
  { value: 'all',            label: 'All' },
  { value: 'email',          label: '📧 Emails' },
  { value: 'call',           label: '📞 Calls' },
  { value: 'sms',            label: '💬 SMS/Chat' },
  { value: 'portal',        label: '🏠 Portal' },
  { value: 'request',        label: '📋 Requests' },
  { value: 'task_event',     label: '✅ Tasks' },
  { value: 'status_change',  label: '🔀 Status' },
  { value: 'ai_summary',     label: '🧠 AI Summaries' },
  { value: 'note',           label: '📝 Notes' },
  { value: 'contact_update', label: '👤 Contacts' },
];

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export const WorkspaceActivityLog: React.FC<Props> = ({ deal, onUpdate }) => {
  const { profile } = useAuth();
  const { data: items = [], isLoading: loading } = useActivityLog(deal.id, deal.activityLog);
  const invalidateActivityLog = useInvalidateActivityLog();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState<string>('all');
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({});
  const [note, setNote]             = useState('');
  const [staffName, setStaffName]   = useState(profile?.name || 'TC Staff');

  useEffect(() => { if (profile?.name) setStaffName(profile.name); }, [profile?.name]);

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
          : filter === 'portal'
            ? items.filter(i => i.type === 'portal')
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

  // Filter badge counts
  const smsCount          = items.filter(i => i.type === 'sms' || i.type === 'whatsapp').length;
  const portalCount       = items.filter(i => i.type === 'portal').length;
  const contactUpdateCount = items.filter(i => i.type === 'contact_update').length;
  const taskEventCount    = items.filter(i => i.type === 'task_event').length;
  const statusChangeCount = items.filter(i => i.type === 'status_change').length;
  const aiSummaryCount    = items.filter(i => i.type === 'ai_summary').length;

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
              <span className="ml-1 badge badge-xs bg-teal-100 text-teal-700 border-teal-200">{smsCount}</span>
            )}
            {f.value === 'portal' && portalCount > 0 && (
              <span className="ml-1 badge badge-xs bg-blue-100 text-[#1B2C5E] border-blue-200">{portalCount}</span>
            )}
            {f.value === 'contact_update' && contactUpdateCount > 0 && (
              <span className="ml-1 badge badge-xs bg-amber-100 text-amber-700 border-amber-200">{contactUpdateCount}</span>
            )}
            {f.value === 'task_event' && taskEventCount > 0 && (
              <span className="ml-1 badge badge-xs bg-indigo-100 text-indigo-700 border-indigo-200">{taskEventCount}</span>
            )}
            {f.value === 'status_change' && statusChangeCount > 0 && (
              <span className="ml-1 badge badge-xs bg-rose-100 text-rose-700 border-rose-200">{statusChangeCount}</span>
            )}
            {f.value === 'ai_summary' && aiSummaryCount > 0 && (
              <span className="ml-1 badge badge-xs bg-violet-100 text-violet-700 border-violet-200">{aiSummaryCount}</span>
            )}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-base-content/40">{filtered.length} events</span>
          <button
            onClick={() => { setRefreshing(true); invalidateActivityLog(deal.id); setRefreshing(false); }}
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
        <EmptyState
          icon={<Activity size={32} className="opacity-30" />}
          title="No activity recorded for this deal yet."
        />
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
                const iconBg = TYPE_BG[entry.type] ?? 'bg-base-200';
                const icon = TYPE_ICON[entry.type] ?? <Activity size={13} className="text-base-content/40" />;
                return (
                  <div key={entry.id} className="flex gap-3 items-start">
                    {/* Icon */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-none mt-0.5 ${iconBg}`}>
                      {icon}
                    </div>
                    {/* Card */}
                    <div className="flex-1 min-w-0 bg-base-200 rounded-xl border border-base-300 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-base-content leading-snug">{entry.title}</p>
                        <div className="flex items-center gap-1.5 flex-none">
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
                          {entry.type === 'task_event' && (
                            <span className="badge badge-xs bg-indigo-100 text-indigo-700 border-indigo-200 font-medium">
                              {entry.meta?.action === 'task_completed' ? 'completed' : entry.meta?.action === 'task_reopened' ? 'reopened' : 'created'}
                            </span>
                          )}
                          {entry.type === 'status_change' && (
                            <span className="badge badge-xs bg-rose-100 text-rose-700 border-rose-200 font-medium">status</span>
                          )}
                          {entry.type === 'ai_summary' && (
                            <span className="badge badge-xs bg-violet-100 text-violet-700 border-violet-200 font-medium">AI</span>
                          )}
                          <span className="text-xs text-base-content/40 whitespace-nowrap">
                            {fmtTime(entry.timestamp)}
                          </span>
                        </div>
                      </div>
                      {entry.body && (
                        <p className="text-xs text-base-content/60 mt-0.5 leading-relaxed whitespace-pre-wrap">{entry.body}</p>
                      )}
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
                              {(entry.meta?.changes as ChangeDiff[]).map((c, i) => (
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
